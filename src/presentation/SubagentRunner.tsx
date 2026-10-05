import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProxy } from '@llmnative/react';
import type { AIConversationTurn } from '@llmnative/react';
import { useAgent, type AgentActivityEntry } from './useAgent';
import { useAgentico } from './AgenticoContext';
import type { SubagentManifest } from '../domain/subagentManifest';
import { getDestinationRegistry } from '../domain/destinationRegistry';
import type { ResultDestination } from '../domain/resultDestination';
import { ResultDestinationPicker } from './ResultDestinationPicker';
import { getSubagentReport, type SubagentSelection } from './reports/subagentReportRegistry';
import { GenericResultPreview } from './reports/GenericResultPreview';
import { deriveHistoryTitle } from './deriveHistoryTitle';
import { buildLiveAnchorDestination } from './liveAnchorDestination';

/** Monta il vero subagent (useAgent(manifest.definition)) e lo esegue una volta al mount con i
 * parametri già raccolti dall'orchestratore Agentico — nessun passo utente aggiuntivo, la
 * conversazione di raccolta parametri è già avvenuta a monte (vedi Agentico.tsx). Si registra
 * nel pannello Agentico con id stabile via useRef + cleanup closeTask allo smontaggio, con il
 * transcript dell'orchestratore (`precedingActivity`) prepeso al proprio log — l'utente vede
 * UNA chat continua, mai due task distinti da switchare (vedi OrchestratorRunner).
 *
 * Con `resumeSeed` valorizzato, il primo giro chiama `agent.resume(...)` invece di
 * `agent.run(...)` — riprende una chat già salvata (vedi entityChatStore/
 * AgenticoContext.resumeEntityChat) invece di avviarne una nuova. Tutto il resto (consegna del
 * risultato ai componentAnchors, ResultDestinationPicker di riserva, registrazione del task) è
 * IDENTICO a un run normale — un follow-up dopo un resume produce un risultato esattamente come
 * un follow-up dopo un run, nessuna duplicazione di logica per il caso "ripreso". */
export function SubagentRunner({
    manifest, params, extraDestinations, precedingActivity, taskId: taskIdProp, resumeSeed, model,
}: {
    manifest: SubagentManifest<any, any, any>;
    params: Record<string, unknown>;
    /** Destinazioni scoped alla pagina che ha avviato questo run (es. "Applica a questo Site
     * aperto") — inoltrate tale e quali a ResultDestinationPicker, vedi quel file. */
    extraDestinations?: ResultDestination[];
    /** Transcript dell'orchestratore all'handoff — vedi AgenticoTask.precedingActivity. Non ha
     * senso insieme a `resumeSeed` (una chat ripresa non ha un orchestratore a monte in questo
     * giro) — semplicemente non passato dal chiamante in quel caso. */
    precedingActivity?: AgentActivityEntry[];
    /** Id di tab da RIUSARE invece di generarne uno fresco — vedi PendingCarryOver
     * (AgenticoContext.tsx)/OrchestratorRunner.tsx: quando presente, questo run "continua" una
     * tab già esistente (stessa posizione, stesso id) invece di aprirne una seconda per lo
     * stesso subagent. Assente = comportamento invariato, id fresco per ogni run. */
    taskId?: string;
    /** Presente = riprendi una chat già salvata invece di avviarne una nuova (vedi
     * AgenticoContext.resumeEntityChat) — `params` deve comunque essere la stessa forma raccolta
     * originariamente (manifest.toParams(params) viene chiamato in entrambi i casi). */
    resumeSeed?: { history: AIConversationTurn[]; activity: AgentActivityEntry[] };
    /** Modello scelto nel composer "starter" a monte (OrchestratorRunner.tsx's modelRef) — questo
     * componente monta la sua PROPRIA istanza di useAgent/useAIModelCatalog, indipendente da
     * quella dell'orchestratore che ha appena fatto l'handoff, quindi senza propagarlo qui
     * esplicitamente `agent.selectedModel` si auto-inizializzerebbe al default del provider
     * invece di continuare con la scelta dell'utente (stesso bug, stessa causa, di
     * OrchestratorRunner — vedi il commento lì). Non passato per un `resumeSeed` — lì non c'è una
     * scelta "di questo giro" da propagare, si continua semplicemente la chat salvata così com'era. */
    model?: string;
}) {
    const agent = useAgent(manifest.definition, { defaultEnabled: true });
    const sidebar = useAgentico();
    const scope = sidebar.scope;
    const proxyFetch = useProxy();
    const taskId = useRef(taskIdProp ?? `subagent-${manifest.id}-${crypto.randomUUID()}`).current;
    const [result, setResult] = useState<unknown>(null);
    const [appliedIds, setAppliedIds] = useState<string[]>([]);
    const [autoApplyError, setAutoApplyError] = useState<string | null>(null);
    const reportModule = getSubagentReport(manifest.id);
    const selectionModule = reportModule?.kind === 'selection' ? reportModule : null;
    const [selection, setSelection] = useState<SubagentSelection | null>(null);
    const startedRef = useRef(false);
    // Punto della timeline (precedingActivity + agent.activity, stesso ordine di Agentico.tsx) in
    // cui è arrivato l'ULTIMO risultato NUOVO — passato come panelExtraAnchorIndex a openTask
    // sotto, cosi un follow-up successivo (retry finito in errore, nuovo messaggio) appare
    // SOTTO il pannello risultati invece di scavalcarlo (bug segnalato: il pannello sembrava
    // "risalire" sopra conversazione più recente perché veniva sempre reso in fondo al log,
    // indipendentemente da quando il risultato che mostra fosse realmente arrivato).
    const panelExtraAnchorIndexRef = useRef(0);
    const anchoredResultRef = useRef<unknown>(null);
    if (result && result !== anchoredResultRef.current) {
        anchoredResultRef.current = result;
        panelExtraAnchorIndexRef.current = (precedingActivity?.length ?? 0) + agent.activity.length;
    }
    // Stesso guard di OrchestratorRunner — vedi il commento lì per il perché è necessario
    // (senza, la tab chiusa dall'utente riapparirebbe da sola al prossimo aggiornamento di
    // agent.activity/running, es. l'abort innescato dalla chiusura stessa).
    const dismissedRef = useRef(false);

    // Aspetta che il catalogo modelli sia risolto (async, vedi useAgent.ts) prima di lanciare
    // run() — altrimenti run() partirebbe con selectedModel ancora vuoto e cadrebbe sempre sul
    // fallback deterministico, anche quando un provider è configurato. Se non c'è nessun
    // provider (`!hasProviders`), non arriverà mai un selectedModel: si parte comunque subito,
    // run() userà il fallback come previsto.
    const readyToStart = !agent.hasProviders || agent.selectedModel !== '';

    useEffect(() => {
        if (startedRef.current || !readyToStart) return;
        startedRef.current = true;
        if (resumeSeed) {
            void agent.resume(manifest.toParams(params), resumeSeed);
        } else {
            // Same reasoning as OrchestratorRunner.tsx: `model` overrides `selectedModel` for
            // this run() call only, so setSelectedModel() also needs calling here for every
            // later interaction (a follow-up message, a retry) to keep reading the user's actual
            // choice instead of this instance's own just-resolved default.
            if (model) agent.setSelectedModel(model);
            void agent.run(manifest.toParams(params), { model }).then((r) => { if (r) setResult(r); });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readyToStart]);

    // Auto-apply — per un subagent come redirects il risultato STESSO è il dato definitivo
    // (docs/30-redirects-system.md), non un export opzionale: ogni volta che `result` cambia
    // (run iniziale o un edit successivo in RedirectMappingReport), le destinazioni elencate in
    // `autoApplyDestinationIds` vengono applicate da sole, senza che l'utente clicchi nulla in
    // ResultDestinationPicker (che resta comunque disponibile per un secondo apply esplicito,
    // es. ri-esportare un CSV). Richiede uno `scope` (AgenticoProvider) — nessun apply silenzioso
    // verso un provider ancora placeholder.
    useEffect(() => {
        if (!result || !scope) return;
        const autoIds = manifest.autoApplyDestinationIds ?? [];
        // Se un componente vivo per QUESTO subagent dichiara un `pinnedEntityId` (es.
        // RedirectsEditor, aperto su un host specifico — vedi ComponentAnchor.pinnedEntityId),
        // lo si inoltra alla destinazione: una destinazione con logica di identità propria (es.
        // redirectsSaveDestination) può rifiutare un salvataggio il cui id risolto non combacia,
        // invece di scrivere silenziosamente sull'entità sbagliata perché il modello ha ignorato
        // il vincolo nel prompt. Nessun anchor pinnato (es. run partito da un contesto senza
        // componente vivo) → `undefined`, nessun controllo aggiuntivo.
        const pinnedEntityId = sidebar.componentAnchors.find((a) => a.subagentId === manifest.id && a.pinnedEntityId)?.pinnedEntityId;
        const registry = getDestinationRegistry();
        autoIds.forEach((id) => {
            const destination = registry[id];
            if (!destination) return;
            setAutoApplyError(null);
            destination.apply(result, {
                scopeId: scope.id,
                dataProvider: scope.dataProvider,
                storageProvider: scope.storageProvider,
                proxyFetch,
            }, { ...params, pinnedEntityId })
                // Un auto-apply riuscito CON un id (es. redirects: {id: hostId}) è, per
                // definizione, l'entità che questo giro ha scritto — commitEntityChat generico
                // qui invece che duplicato nel componente di ogni subagent (a differenza di
                // theme, che non ha auto-apply e deve chiamarlo lui stesso dal proprio Save):
                // qualunque futuro subagent con autoApplyDestinationIds ottiene la persistenza
                // chat gratis, senza scriverne una riga in più.
                .then((outcome) => {
                    if (outcome?.id) {
                        sidebar.commitEntityChat(manifest.id, outcome.id, taskId, scope.id, params, deriveHistoryTitle(manifest, params));
                    }
                })
                // Un auto-apply fallito (es. hostname non risolvibile) non deve restare
                // invisibile solo perché non l'ha innescato un click esplicito — bug osservato:
                // "Tools > Redirects" restava vuoto dopo un'elaborazione riuscita, senza alcun
                // segnale che il salvataggio non fosse mai avvenuto.
                .catch((err) => setAutoApplyError(err instanceof Error ? err.message : String(err)));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, agent.activity, scope]);

    // Inizializza la selezione (tutti i campi opzionali spuntati) non appena arriva un risultato
    // per un subagent con report registrato — si resetta anche se `result` cambia riferimento
    // (es. un refinement successivo produce un nuovo oggetto), così l'utente rivede sempre uno
    // stato "tutto incluso" di fronte a un risultato nuovo invece di ereditare vecchie esclusioni.
    useEffect(() => {
        if (result && selectionModule) setSelection(selectionModule.defaultSelection(result));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, selectionModule]);

    const handleSelectionChange = (key: string, value: boolean | string) => {
        setSelection((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    // Un report "editabile" (redirects) rimpiazza direttamente `result` — l'effect di auto-apply
    // sopra reagisce a `result` e ripropaga da solo, nessun secondo canale da aggiungere qui.
    const handleResultChange = (next: unknown) => setResult(next);

    // Memoizzato: applySelection ritorna sempre un oggetto NUOVO (spread), quindi senza
    // useMemo ogni render di questo componente produrrebbe un filteredResult diverso — ed
    // essendo nelle dipendenze dell'effect di sidebar.openTask sotto, l'effect non si sarebbe
    // mai stabilizzato: openTask cambia il task nel context → il context re-renderizza i
    // consumer (anche questo componente) → filteredResult ricalcolato con un nuovo riferimento
    // → l'effect riparte da capo. Loop infinito osservato in console ("Maximum update depth
    // exceeded"), corretto memoizzando sulle dipendenze effettive.
    const filteredResult = useMemo(
        () => (result && selectionModule && selection ? selectionModule.applySelection(result, selection) : result),
        [result, selectionModule, selection],
    );

    // Un componentAnchor live (vedi useSubagentComponentContext) per QUESTO subagent è trattato
    // come UNA destinazione qualunque — MAI più una consegna automatica silenziosa appena
    // arriva il risultato (bug segnalato: l'utente non vedeva nessuna anteprima prima che il
    // componente si popolasse da solo). Più anchor possono ascoltare lo STESSO subagentId (es.
    // ThemeEditor per i campi tema + SiteEditorPage per i soli campi di site-branding) — tutti
    // ricevuti insieme da un solo click su "Applica al componente aperto" (vedi
    // liveAnchorDestination.ts). Nessun anchor combacia (es. run partito da un contesto senza
    // componente vivo) → quella destinazione semplicemente non compare tra le altre.
    // Memoizzati per lo stesso motivo di filteredResult sopra — non sono nelle dipendenze
    // dell'effect sotto, ma restano comunque props di ResultDestinationPicker dentro
    // `panelExtra`: un riferimento nuovo a ogni render sarebbe fragile (basterebbe aggiungerli
    // un giorno alle dipendenze per riaprire lo stesso loop).
    const matchingAnchors = useMemo(
        () => sidebar.componentAnchors.filter((a) => a.subagentId === manifest.id && a.onResult),
        [sidebar.componentAnchors, manifest.id],
    );
    const liveAnchorDestination = useMemo(
        () => buildLiveAnchorDestination(matchingAnchors, params, taskId),
        [matchingAnchors, params, taskId],
    );
    const pickerExtraDestinations = useMemo(
        () => (liveAnchorDestination ? [liveAnchorDestination, ...(extraDestinations ?? [])] : extraDestinations),
        [liveAnchorDestination, extraDestinations],
    );

    const handleDestinationApplied = (destinationId: string) => {
        setAppliedIds((prev) => (prev.includes(destinationId) ? prev : [...prev, destinationId]));
    };

    // Nessun gate su agent.canContinue — Agentico è l'unica UI per qualunque subagent (nessuna
    // modale con una propria UI indipendente esiste più), quindi il task va registrato subito,
    // altrimenti senza provider AI configurato (o prima che il catalogo modelli si risolva) non
    // comparirebbe mai, e il pannello sembrerebbe non aver reagito.
    //
    // `panelExtra` (non il return JSX di questo componente!) è come il ResultDestinationPicker
    // arriva dentro il pannello Agentico — questo componente è montato come sibling PRIMA del
    // pannello visibile (vedi Agentico.tsx, per sopravvivere al toggle di isOpen), quindi il
    // suo return finirebbe renderizzato FUORI dal pannello, come una colonna a sé — bug osservato
    // e corretto passando il picker attraverso lo slot esplicito del task invece che nel JSX.
    // `result`/`appliedIds` sono nelle dipendenze apposta: senza, il task registrato al primo
    // giro non includerebbe mai il picker (o i suoi aggiornamenti) una volta arrivato il risultato.
    useEffect(() => {
        if (dismissedRef.current) return;
        sidebar.openTask({
            // Titolo specifico (es. "consul-etica.it", non "Theme extractor") invece del nome
            // generico del subagent — più utile nell'header di Agentico.
            id: taskId, title: deriveHistoryTitle(manifest, params), icon: manifest.icon, agent, onApplied: (r: unknown) => setResult(r), precedingActivity,
            panelExtraAnchorIndex: panelExtraAnchorIndexRef.current,
            onDismiss: () => {
                dismissedRef.current = true;
                if (agent.running) agent.stop();
                sidebar.closeTask(taskId);
            },
            panelExtra: result ? (
                <>
                    {selectionModule && selection ? (
                        <selectionModule.Report result={result} selection={selection} onChange={handleSelectionChange} />
                    ) : reportModule?.kind === 'editable' ? (
                        <reportModule.Report result={result} onResultChange={handleResultChange} />
                    ) : (
                        // Nessun report registrato per questo subagent (oggi: theme, redirects) —
                        // anteprima generica, mai un apply diretto senza che l'utente veda prima
                        // cosa sta per applicare (vedi GenericResultPreview.tsx).
                        <GenericResultPreview result={filteredResult} />
                    )}
                    {autoApplyError && (
                        <p className="text-xs text-destructive">Salvataggio automatico non riuscito: {autoApplyError}</p>
                    )}
                    <ResultDestinationPicker
                        manifest={manifest} result={filteredResult} meta={params} taskId={taskId}
                        initiallyApplied={appliedIds} onApplied={handleDestinationApplied}
                        extraDestinations={pickerExtraDestinations}
                    />
                </>
            ) : undefined,
        });
        // BUG FISSATO: stesso problema di OrchestratorRunner.tsx — `agent.modelsByProvider`/
        // `agent.hasProviders` mancavano qui, quindi il catalogo modelli risolto in modo
        // asincrono non faceva mai ri-registrare l'`agent` fresco in sidebar.openTask, e la
        // tendina di selezione modello restava vuota per l'intera durata del task.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent.activity, agent.running, agent.error, agent.canContinue, agent.selectedModel, agent.modelsByProvider, agent.hasProviders, sidebar.openTask, sidebar.componentAnchors, taskId, manifest, params, result, filteredResult, selection, appliedIds, extraDestinations, precedingActivity, autoApplyError]);

    useEffect(() => {
        return () => { sidebar.closeTask(taskId); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sidebar.closeTask, taskId]);

    return null;
}
