import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAgenticoI18n } from '../i18n';
import { useAgent } from './useAgent';
import { useAgentico, ORCHESTRATOR_TASK_ID } from './AgenticoContext';
import { createOrchestratorAgentDefinition } from '../domain/orchestrator/agenticoOrchestratorAgent';
import { findSubagentManifest } from '../domain/subagentRegistry';
import type { OrchestratorHandoff } from '../domain/orchestrator/prompt';
import { SubagentRunner } from './SubagentRunner';

/** Monta la conversazione dell'orchestratore Agentico — il "meta-agente" che legge il catalogo
 * CLI dei subagent (deterministico, nessuna chiamata LLM, vedi createOrchestratorAgentDefinition
 * buildContext) e conversa con l'utente finché non ha raccolto abbastanza parametri per invocare
 * un subagent reale. Quando arriva un risultato `{ kind: 'handoff' }` monta un SubagentRunner per
 * quel subagent, gli passa il transcript dell'orchestratore com'era in quel momento
 * (`precedingActivity`) e chiude subito il proprio task — l'utente vede UNA chat continua che
 * scivola dalla raccolta parametri all'esecuzione del subagent, mai due task da switchare a
 * mano (decisione esplicita, vedi piano). */
export function OrchestratorRunner({ userGoal }: { userGoal: string }) {
    const t = useAgenticoI18n();
    // Built once per mount with the labels of the current locale (useAgent keeps the first definition).
    const definition = useMemo(() => createOrchestratorAgentDefinition({
        unavailable: t.orchestratorUnavailable,
        continueWithoutAi: t.orchestratorContinueWithoutAi,
        preparing: t.orchestratorPreparing,
        collecting: t.orchestratorCollecting,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);
    const agent = useAgent(definition, { defaultEnabled: true });
    const sidebar = useAgentico();
    const [handoff, setHandoff] = useState<OrchestratorHandoff | null>(null);
    const startedRef = useRef(false);
    const readyToStart = !agent.hasProviders || agent.selectedModel !== '';

    // Catturate una sola volta al mount (come userGoal, un prop) — non rilette live da
    // sidebar.pendingExtraDestinations più avanti: questo componente resta montato per tutta la
    // conversazione, che può durare più turni fino all'handoff, e nel frattempo un'altra
    // startOrchestrator() altrove potrebbe aver sovrascritto quel valore nel context.
    const extraDestinationsRef = useRef(sidebar.pendingExtraDestinations);
    // Stesso principio per gli allegati del messaggio di apertura (grezzi — la conversione ad
    // AIAttachment avviene in useAgent.ts) — servono solo al primissimo run(), mai riletti dopo.
    const attachmentsRef = useRef(sidebar.pendingAttachments);
    // Stesso principio per il modello scelto nel composer "starter" — passato come override a
    // run() (vedi useAgent.ts) invece di un setSelectedModel() che non farebbe in tempo a
    // committare prima della chiamata nello stesso effect.
    const modelRef = useRef(sidebar.pendingModel);
    // Id del subagent verso cui la pagina/componente che ha avviato questa conversazione era
    // scoped (es. ThemeIndexList ancorato a 'theme', o /tools/redirects col vecchio meccanismo a
    // pageContextCard) — catturato UNA VOLTA al mount, come gli altri ref sopra. Permette a
    // IndexList (redirects) di mostrare "in corso" per quel subagent già durante la raccolta
    // parametri, non solo dopo l'handoff (vedi AgenticoContext.AgenticoTask.scopedSubagentId).
    // Un target esplicito da startOrchestrator(goal, {scopedSubagentId}) vince su quello
    // derivato da un componentAnchor live (vedi AgenticoContext.pendingScopedSubagentId) — un
    // click one-shot (es. "Importa HTML/JSX") non monta alcun anchor, ma sa comunque già a
    // priori quale subagent servirà.
    const scopedSubagentIdRef = useRef(sidebar.pendingScopedSubagentId ?? sidebar.scopedSubagentId ?? undefined);
    // Vedi PendingCarryOver (AgenticoContext.tsx) — catturato una volta al mount come gli altri
    // ref sopra: se startOrchestrator() ha trovato un task esistente per lo stesso subagent,
    // questo giro deve CONTINUARE quella conversazione (stesso id di tab, transcript prepeso)
    // invece di aprirne una scollegata — vedi il return sotto.
    const carryOverRef = useRef(sidebar.pendingCarryOver);
    // true dopo che l'utente ha chiuso la tab di questo task dalla tab bar — impedisce
    // all'effect sotto di ri-registrarlo (sidebar.openTask) al prossimo cambiamento di
    // agent.activity/running (es. l'abort innescato dalla chiusura stessa produce un ultimo
    // aggiornamento "Interrotto dall'utente"): senza questo guard la tab riapparirebbe da sola
    // subito dopo essere stata chiusa (bug osservato in fase di sviluppo di questa feature).
    const dismissedRef = useRef(false);

    const handleResult = (r: unknown) => {
        if (r && typeof r === 'object' && (r as { kind?: string }).kind === 'handoff') {
            setHandoff(r as OrchestratorHandoff);
            // Il lavoro dell'orchestratore è finito qui — libera subito ORCHESTRATOR_TASK_ID
            // (invece di aspettare lo smontaggio, che con questo componente non avviene mai
            // finché pendingGoal resta impostato) cosi un futuro startOrchestrator() vede
            // correttamente "nessuna conversazione in corso" invece di restare bloccato per il
            // resto della sessione su questa, già conclusa (bug osservato, vedi piano). Il
            // SubagentRunner montato sotto non è toccato: ha un id/task proprio, indipendente.
            sidebar.closeTask(ORCHESTRATOR_TASK_ID);
        }
    };

    useEffect(() => {
        if (startedRef.current || !readyToStart) return;
        startedRef.current = true;
        // `model: modelRef.current` overrides `selectedModel` for THIS run() call only (see the
        // comment on modelRef above and useAgent.ts's own doc comment on `opts.model`) — a
        // setSelectedModel() here wouldn't commit in time for run() to read it in the same
        // effect. But that override is scoped to this one call: every later interaction — the
        // "Riprova" button, any follow-up sendMessage(), a later round-trip of a NEW run() — reads
        // `agent.selectedModel` fresh, which without this call still sits at whatever
        // useAIModelCatalog() picked as its own default (a separate instance from the starter
        // composer's, never told about the user's actual choice). Calling it too, alongside the
        // override, costs nothing now and fixes every call after this one — this was the bug: the
        // model the user picked silently reverted to the provider default the moment the
        // conversation needed a second API call (a retry, a tool round-trip, anything past the
        // opening message).
        if (modelRef.current) agent.setSelectedModel(modelRef.current);
        // pageContext letto QUI, non prima — "dove si trova l'utente" al momento in cui la
        // conversazione parte davvero, non a mount-time del componente (che potrebbe precedere
        // di un istante la registrazione del contesto da parte della pagina chiamante).
        void agent.run(
            { userGoal, pageContext: sidebar.pageContext, scopedSubagentId: scopedSubagentIdRef.current ?? null },
            { attachments: attachmentsRef.current, model: modelRef.current, openingMessage: userGoal },
        ).then((r) => { if (r) handleResult(r); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readyToStart]);

    // Il pannello Agentico è l'UNICA UI per qualunque subagent — se il gate fosse su
    // canContinue, senza un provider AI configurato (o prima che
    // il catalogo modelli si risolva) il task non comparirebbe MAI — il pannello si aprirebbe
    // vuoto, indistinguibile da "non è successo niente". Il task si registra quindi subito, a
    // ogni cambiamento rilevante di stato, e mostra il fallback deterministico se l'AI non è
    // disponibile invece di sparire.
    useEffect(() => {
        if (dismissedRef.current) return;
        sidebar.openTask({
            id: ORCHESTRATOR_TASK_ID, title: 'Agentico', icon: 'bot', agent, onApplied: handleResult,
            scopedSubagentId: scopedSubagentIdRef.current,
            // Il carry-over (vedi PendingCarryOver in AgenticoContext.tsx) va prepeso GIÀ QUI,
            // non solo sul SubagentRunner post-handoff
            // più sotto — altrimenti il trascritto precedente sparisce per tutta la durata del
            // turno di raccolta parametri dell'orchestratore stesso (il "Sto pensando..." che
            // parte SUBITO dopo l'invio) e riappare solo se/quando arriva un handoff, bug
            // segnalato: "appena premo invio la chat precedente non c'è più".
            precedingActivity: carryOverRef.current?.activity,
            onDismiss: () => {
                dismissedRef.current = true;
                if (agent.running) agent.stop();
                sidebar.closeTask(ORCHESTRATOR_TASK_ID);
            },
        });
        // BUG FISSATO: `agent.modelsByProvider`/`agent.hasProviders` mancavano da questo array —
        // il catalogo modelli si popola in modo asincrono (useAIModelCatalog dentro useAgent) e
        // quell'aggiornamento non faceva mai ri-registrare l'`agent` fresco in sidebar.openTask,
        // finché non cambiava anche uno degli altri campi osservati. Il task restava agganciato
        // per sempre allo snapshot di `agent` preso all'ultimo re-render "rilevante" precedente —
        // con `modelsByProvider` ancora vuoto se il catalogo non si era risolto in tempo — e la
        // tendina di selezione modello in Agentico spariva per l'intera durata della
        // conversazione, anche dopo che il catalogo (verificato via localStorage `ai.models.*`)
        // aveva correttamente 73 modelli disponibili.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent.activity, agent.running, agent.error, agent.canContinue, agent.selectedModel, agent.modelsByProvider, agent.hasProviders, sidebar.openTask]);

    useEffect(() => {
        return () => { sidebar.closeTask(ORCHESTRATOR_TASK_ID); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sidebar.closeTask]);

    // Ricalcolato SOLO quando agent.activity cambia davvero (carryOverRef.current è un ref,
    // stabile per tutta la vita del componente dopo il mount) — uno spread nudo qui creava un
    // array NUOVO a ogni render di questo componente, che SubagentRunner tiene nelle sue
    // dependency dell'effect di registrazione (sidebar.openTask): una reference sempre "diversa"
    // faceva ripartire quell'effect a ogni render, che aggiornando il context ri-renderizzava
    // anche questo componente, ricreando lo spread da capo — loop infinito ("Maximum update
    // depth exceeded", bug segnalato).
    const combinedPrecedingActivity = useMemo(
        () => [...(carryOverRef.current?.activity ?? []), ...agent.activity],
        [agent.activity],
    );

    if (!handoff) return null;
    const manifest = findSubagentManifest(handoff.subagentId);
    if (!manifest) return null;
    return (
        <SubagentRunner
            manifest={manifest} params={handoff.params}
            extraDestinations={extraDestinationsRef.current}
            model={modelRef.current || undefined}
            // Se c'è un carry-over (stesso subagent, tab precedente ancora aperta), riusa il
            // SUO id — il nuovo SubagentRunner aggiorna quella tab in place invece di aprirne
            // una seconda — e prepende la SUA intera conversazione (già comprensiva del suo
            // stesso precedingActivity) prima di quella di questo giro. Senza carry-over,
            // comportamento invariato: id fresco, solo il transcript di QUESTO orchestratore.
            taskId={carryOverRef.current?.taskId}
            precedingActivity={combinedPrecedingActivity}
        />
    );
}
