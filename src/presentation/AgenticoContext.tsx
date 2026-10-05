import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AIModelDescriptor, DataProviderAdapter, StorageProviderAdapter } from '@llmnative/react';
import type { AgentActivityEntry, AgentConversation } from './useAgent';
import type { ResultDestination } from '../domain/resultDestination';
import type { SubagentUsageCard } from '../domain/subagentUsageCard';
import { findSubagentManifest } from '../domain/subagentRegistry';
import { saveEntityChat, type EntityChatSnapshot } from '../domain/entityChatStore';
import { getAgenticoPrompts } from '../domain/prompts';

/** Where results are saved and chats are kept: the host's current tenant, company, workspace…
 * `null` while the host has none selected — destinations then refuse to save. */
export interface AgenticoScope {
    id: string;
    dataProvider: DataProviderAdapter;
    storageProvider: StorageProviderAdapter | null;
}

/** Cattura la conversazione di un task subagent già esistente da "continuare" invece di forkare
 * — vedi startOrchestrator sotto. `taskId` viene riusato dal nuovo SubagentRunner (invece di un
 * uuid fresco) cosi il task esistente si aggiorna in place; `activity` (precedingActivity +
 * agent.activity del vecchio task, già concatenati) viene prepesa al transcript del nuovo giro —
 * l'utente legge tutto come UNA chat continua, mai due sessioni scollegate per lo stesso
 * subagent. */
export interface PendingCarryOver {
    taskId: string;
    activity: AgentActivityEntry[];
}

/** Id fisso del task dell'orchestratore Agentico — al massimo UNA conversazione orchestratore
 * per volta, come per qualunque altro task (vedi AgenticoTask sotto: un solo task alla volta in
 * tutta l'app, mai una tab bar da switchare). Un id fisso permette a startOrchestrator() di
 * riconoscere "ce n'è già uno aperto" senza dover tenere un riferimento separato. */
export const ORCHESTRATOR_TASK_ID = 'agentico-orchestrator';

/** Una sessione agente aperta nel pannello globale — riferimento vivo all'oggetto restituito
 * da useAgent() nel componente che l'ha avviata (NON una copia: quel componente deve restare
 * montato perché questo riferimento resti valido, vedi Agentico.tsx). Solo le sessioni aperte in
 * questa sessione browser — nessuna persistenza su Firestore (Fase 3, deferita).
 *
 * Al massimo UN task alla volta in tutta l'app (decisione esplicita: "una chat unica", niente
 * tab multiple per run paralleli) — avviarne uno nuovo mentre un altro è in corso lo sostituisce
 * (vedi openTask sotto), mai lo affianca. */
export interface AgenticoTask<TResult = unknown> {
    id: string;
    /** Titolo mostrato nell'header del pannello — es. l'URL importato, il nome del componente. */
    title: string;
    /** Nome icona (@llmnative/react Icon) mostrata nell'header — 'bot' per l'orchestratore
     * (OrchestratorRunner, stessa identità di AgenticoToggle), manifest.icon per un subagent
     * (SubagentRunner). */
    icon: string;
    /** SOLO sul task dell'orchestratore — id del subagent verso cui la pagina/componente che ha
     * avviato questa conversazione era scoped (catturato da OrchestratorRunner al mount, da
     * sidebar.scopedSubagentId). Permette a un indice come redirects/IndexList.tsx di mostrare
     * "in corso" per QUESTO subagent anche prima dell'handoff (mentre l'orchestratore sta ancora
     * raccogliendo parametri/chiamando tool di raccolta dati). Assente sui task dei subagent
     * stessi (quelli sono già inequivocabilmente scoped dal proprio id
     * `subagent-${subagentId}-...`). */
    scopedSubagentId?: string;
    /** Presente SOLO dopo un commitEntityChat riuscito su questo task — questa conversazione è
     * genuinamente su disco (vedi entityChatStore), non solo in memoria. Usato dal bottone
     * "nuova chat" (vedi Agentico.tsx) per decidere se avvertire l'utente prima di scartarla:
     * senza salvataggio andrebbe persa per sempre (nessun "torna indietro", scelta esplicita). */
    savedToDisk?: boolean;
    agent: AgentConversation<TResult> & {
        hasProviders: boolean;
        selectedModel: string;
        setSelectedModel: (id: string) => void;
        modelsByProvider: Record<string, AIModelDescriptor[]>;
    };
    onApplied: (result: TResult) => void;
    /** Transcript di UNA conversazione precedente da mostrare "prima" di `agent.activity` nello
     * stesso log, senza soluzione di continuità — usato dal task del subagent per prependere la
     * conversazione dell'orchestratore che lo ha invocato (vedi OrchestratorRunner/SubagentRunner):
     * l'utente deve vivere Agentico come UNA chat discorsiva unica, mai accorgersi che ci sono
     * due "attori" distinti dietro le quinte. */
    precedingActivity?: AgentActivityEntry[];
    /** Contenuto extra renderizzato nel body del pannello, sotto il log di attività (es.
     * ResultDestinationPicker una volta che un subagent ha prodotto un risultato senza un
     * componente vivo ad ascoltarlo — vedi SubagentRunner). Deve restare dentro il pannello
     * Agentico, non un elemento reso altrove nell'albero: chi possiede il task
     * (SubagentRunner/OrchestratorRunner) è montato come sibling PRIMA del pannello visibile in
     * Agentico.tsx (per sopravvivere al toggle di isOpen), quindi il proprio JSX di ritorno
     * finirebbe fuori dal pannello se non passato tramite questo slot esplicito. */
    panelExtra?: React.ReactNode;
    /** Presente SOLO sul task di un ManualEntryRunner — quando impostato, AgenticoComposer
     * (Agentico.tsx) instrada il testo digitato QUI invece che ad `agent.sendMessage`: niente
     * chiamata AI, `onSubmit` costruisce i TParams dal testo grezzo e avvia il subagent con
     * l'AI disabilitata (vedi SubagentManifest.manualEntry). `prompt` è il messaggio statico
     * mostrato quando non c'è ancora nessuna attività (invece del solito pageContext/hint). */
    manualEntry?: { prompt: string; onSubmit: (rawText: string) => void };
    /** Quante voci di `precedingActivity + agent.activity` (in ordine, vedi Agentico.tsx)
     * precedono `panelExtra` nella timeline — cioè QUANTE erano già maturate quando il
     * risultato mostrato in panelExtra è stato prodotto. Senza questo indice, panelExtra veniva
     * sempre reso dopo l'INTERO log corrente, quindi ogni messaggio di follow-up successivo
     * (es. un retry finito in errore) appariva SOPRA un risultato che in realtà era arrivato
     * PRIMA — invertendo la cronologia di una chat che l'utente si aspetta scorra
     * top=vecchio/bottom=nuovo (bug segnalato). Assente = comportamento invariato, sempre in
     * fondo (equivalente a passare la lunghezza corrente del log). */
    panelExtraAnchorIndex?: number;
    /** Chiamato quando questo task viene sostituito da uno nuovo (vedi openTask) o quando
     * l'utente lo interrompe — SEMPRE definito da chi possiede il task
     * (OrchestratorRunner/SubagentRunner), mai un fallback generico su closeTask: quel
     * componente resta montato anche a task chiuso, quindi il proprio effect che ri-registra il
     * task a ogni cambiamento di agent.activity/running lo RIAPRIREBBE da solo (es.
     * l'aggiornamento "Interrotto dall'utente" dopo uno stop()) se non gli si dice
     * esplicitamente di smettere — vedi il ref `dismissedRef` in entrambi i chiamanti. */
    onDismiss: () => void;
}

/** Un punto di ancoraggio semantico subagent↔componente attivo in questo momento — vedi
 * useSubagentComponentContext (presentation/hooks) per come si registra, e
 * SubagentManifest.componentContexts per dove vivono i testi (agenticoHint/userMessage). */
export interface ComponentAnchor {
    subagentId: string;
    componentKey: string;
    /** Chiamato da SubagentRunner quando arriva un risultato per `subagentId` mentre questo
     * anchor è montato — il componente/pagina popola se stesso, mai un salvataggio automatico.
     * `meta` è il TParams con cui il subagent è stato lanciato (es. `{ url }` per theme).
     * `taskId` è l'id del task Agentico che ha prodotto questo risultato — un componente che
     * vuole poter persistere la chat al proprio salvataggio (vedi commitEntityChat sotto) lo
     * tiene da parte, altrimenti può ignorarlo. */
    onResult?: (result: unknown, meta: Record<string, unknown>, taskId: string) => void;
    /** Fatti live su QUESTA istanza dell'entità aperta (es. "Il tema aperto si chiama
     * ducatimilano.it"), aggiunti in coda all'`agenticoHint` statico del manifest (vedi
     * anchorTexts) — l'`agenticoHint` è prosa fissa scritta una volta nel manifest, non può
     * sapere quale entità specifica è aperta ORA. Assente = comportamento invariato (solo il
     * testo statico). Vedi useSubagentComponentContext per come un componente lo valorizza. */
    contextInfo?: string;
    /** Id dell'entità a cui QUESTA istanza è vincolata (es. l'hostId di RedirectsEditor) — a
     * differenza di `contextInfo` (prosa, solo per il prompt), è un valore STRUTTURATO che
     * SubagentRunner inoltra a `ResultDestination.apply()` (vedi `meta.pinnedEntityId`) perché una
     * destinazione con logica di identità propria (es. redirectsSaveDestination, che calcola
     * l'hostId di destinazione dal risultato) possa rifiutare un salvataggio il cui hostId
     * risolto NON combacia — un backstop deterministico, non affidato solo all'istruzione nel
     * prompt (che può comunque essere ignorata dal modello). Assente = nessun controllo
     * aggiuntivo, comportamento invariato (es. RedirectsIndexList, che non è vincolato a un solo
     * host). */
    pinnedEntityId?: string;
}

interface AgenticoContextValue {
    /** The host scope passed to <AgenticoProvider scope>. */
    scope: AgenticoScope | null;
    task: AgenticoTask | null;
    /** Visibilità del pannello — completamente indipendente dal task (vedi AgenticoToggle:
     * icona persistente stile "estensione del browser"). Nessuna chiamata a `openTask` la forza
     * mai a true: un fetch/run() NON apre da solo il pannello (solo l'icona anima per segnalare
     * che l'agente sta lavorando) — solo l'utente, cliccando il toggle, decide di vederlo. */
    isOpen: boolean;
    /** Crea o sostituisce il task attivo (upsert idempotente se stesso id, altrimenti sostituisce:
     * un task con un id DIVERSO da quello corrente ne causa la chiusura esplicita via
     * `onDismiss()` prima di installare il nuovo — mai due conversazioni vive insieme, vedi
     * AgenticoTask). Richiamalo a ogni render, l'oggetto `agent` è nuovo a ogni render dell'hook
     * useAgent. */
    openTask: <TResult>(task: AgenticoTask<TResult>) => void;
    closeTask: (id: string) => void;
    /** Mostra/nasconde il pannello — l'unica azione che tocca `isOpen` insieme a `openPanel`
     * (vedi commento su `isOpen`). Usato da AgenticoToggle. */
    toggleOpen: () => void;
    /** Goal in attesa che un OrchestratorRunner catturi al mount e lanci — settato SOLO se non
     * esiste già un task orchestratore (vedi startOrchestrator). `null` quando non c'è nessun
     * avvio in sospeso. */
    pendingGoal: string | null;
    /** Cambia a ogni conversazione orchestratore avviata per davvero — usato solo come React
     * `key` sull'elemento <OrchestratorRunner>, mai letto per altro. */
    orchestratorRunId: string | null;
    /** Chiamato da ToolsPage ("Usa agent" su una card), dall'input vuoto del pannello Agentico, o
     * da una pagina che vuole avviare una conversazione già scoped (es. SiteEditorPage) — apre il
     * pannello e, se non c'è già una conversazione orchestratore in corso, la avvia con questo
     * goal. Se ce n'è già una, la porta semplicemente a fuoco: NON inietta il nuovo goal in
     * quella conversazione (limite noto, accettato per l'MVP).
     * `options.scopedSubagentId` — presente quando il chiamante sa GIÀ, senza bisogno di AI,
     * quale subagent servirà (es. il bottone "Importa HTML/JSX", sempre `html-to-liquid`) — a
     * differenza dello scoping derivato da un componentAnchor (vedi `scopedSubagentId` sotto,
     * che richiede un ancoraggio live), questo vale per un click one-shot che non monta alcun
     * anchor. Usato SOLO per abilitare il percorso "Continua senza AI" → manuale (vedi
     * startManualEntry/ManualEntryRunner) quando l'orchestratore stesso non riesce a partire:
     * senza sapere il target, quel bottone non potrebbe offrire altro che il messaggio generico
     * di fallback dell'orchestratore (non un vero handoff, non può indovinare l'intento). */
    startOrchestrator: (goal: string, options?: { extraDestinations?: ResultDestination[]; attachments?: File[]; model?: string; scopedSubagentId?: string }) => void;
    /** Destinazioni scoped alla pagina che ha avviato l'ultimo startOrchestrator() con
     * `options.extraDestinations` — catturate da OrchestratorRunner al momento dell'handoff e
     * inoltrate al SubagentRunner che monta, insieme a `pendingGoal`. `undefined` per i
     * chiamanti che non ne passano. */
    pendingExtraDestinations: ResultDestination[] | undefined;
    /** File allegati al messaggio che ha avviato l'ultima conversazione orchestratore — catturati
     * da OrchestratorRunner al mount, insieme a `pendingGoal`. */
    pendingAttachments: File[] | undefined;
    /** Modello scelto dall'utente nel composer "starter", prima ancora che esista una sessione
     * useAgent — catturato da OrchestratorRunner al mount, insieme a `pendingGoal`. */
    pendingModel: string | undefined;
    /** Vedi PendingCarryOver — catturato da OrchestratorRunner al mount insieme a pendingGoal,
     * `null` quando startOrchestrator() non ha trovato nessun task da continuare. */
    pendingCarryOver: PendingCarryOver | null;
    /** Vedi `options.scopedSubagentId` di startOrchestrator sopra — catturato da OrchestratorRunner
     * al mount, insieme agli altri pending*. `undefined` = nessun target esplicito (comportamento
     * invariato, l'orchestratore deriva lo scope SOLO da un componentAnchor live, se presente). */
    pendingScopedSubagentId: string | undefined;
    /** Testo "dove si trova l'utente adesso" per contestualizzare l'orchestratore — se ci sono
     * ancoraggi componente↔subagent attivi (vedi componentAnchors sotto) deriva da quelli
     * (agenticoHint, combinato se ne sono attivi più di uno di subagent diversi), altrimenti
     * ripiega sul vecchio meccanismo a stack per-pagina (useAgenticoPageContext, ancora usato da
     * pagine non migrate a componentContexts). Letto una sola volta da OrchestratorRunner al
     * momento di run(). */
    pageContext: string | null;
    /** Card strutturata (campi richiesti/opzionali) — SOLO dal vecchio meccanismo a stack
     * per-pagina (mai per un anchor component-based, che usa invece `anchoredUserMessages` sotto,
     * un semplice messaggio invece di un modulo a campi). `null` quando non applicabile. */
    pageContextCard: SubagentUsageCard | null;
    /** Registra/rimuove (text === null) il contesto di UNA pagina/pannello identificata da `id`
     * — usare tramite l'hook useAgenticoPageContext, non direttamente. Vedi pageContext sopra per
     * come si combina con componentAnchors. */
    setPageContext: (id: string, text: string | null, card?: SubagentUsageCard | null) => void;
    /** Id del subagent a cui l'orchestratore deve restare scoped — deriva da componentAnchors
     * quando esattamente UN subagent è ancorato, altrimenti (0 o >1 subagent distinti) ripiega
     * sul vecchio pageContextCard/`null`. Sostituisce il vecchio `pageContextCard?.subagentId`
     * come UNICA fonte per OrchestratorRunner/startOrchestrator. */
    scopedSubagentId: string | null;
    /** Ancoraggi componente↔subagent attualmente montati, deduplicati per subagentId (l'ultimo
     * registrato per uno stesso subagent vince) — usato da SubagentRunner per instradare un
     * risultato al componente vivo invece di mostrare sempre ResultDestinationPicker. */
    componentAnchors: ComponentAnchor[];
    /** Messaggi utente (SubagentComponentContext.userMessage) per gli anchor attivi — mostrati
     * da Agentico.tsx al posto della vecchia card a campi quando ci sono anchor component-based.
     * Vuoto se nessun anchor attivo, o se un anchor non ha un componentContexts corrispondente
     * (es. SiteEditorPage, che ascolta un risultato senza fornire un proprio messaggio). */
    anchoredUserMessages: string[];
    /** Registra/rimuove (anchor === null) un ancoraggio componente↔subagent identificato da `id`
     * — usare tramite l'hook useSubagentComponentContext, non direttamente. */
    registerComponentAnchor: (id: string, anchor: ComponentAnchor | null) => void;
    /** Apre il pannello incondizionatamente — a differenza di toggleOpen(), non dipende dal
     * valore corrente di isOpen. */
    openPanel: () => void;
    /** Persiste (sovrascrivendo un'eventuale chat già salvata per la STESSA entità, vedi
     * entityChatStore) la conversazione del task `taskId`, keyed su `${scopeId}:${subagentId}:
     * ${entityId}` — chiamato da un componente (es. ThemeEditor) subito dopo un salvataggio
     * riuscito. No-op se `taskId` è assente (nessuna estrazione coinvolta in questo salvataggio,
     * es. edit manuale — un'eventuale chat già salvata in precedenza per questa entità resta
     * intatta) o se il task `taskId` non è più quello corrente (l'utente ha aperto un'altra
     * conversazione nel frattempo — niente si salva, per non attaccare a un'entità la chat
     * sbagliata). */
    commitEntityChat: (subagentId: string, entityId: string, taskId: string | null | undefined, scopeId: string | undefined, params: Record<string, unknown>, title: string) => void;
    /** Riprende una chat salvata (vedi entityChatStore) — apre il pannello e monta un
     * SubagentRunner con `resumeSeed` valorizzato invece di un run/handoff dall'orchestratore
     * (vedi Agentico.tsx). Sostituisce (mai affianca) qualunque task corrente, stesso principio
     * di startOrchestrator/openTask — una chat unica alla volta in tutta l'app. */
    resumeEntityChat: (subagentId: string, entityId: string, snapshot: EntityChatSnapshot) => void;
    /** Presente = un resumeEntityChat() è in sospeso, letto da Agentico.tsx per montare il
     * SubagentRunner col resumeSeed giusto — analogo a pendingGoal per l'orchestratore. */
    pendingResume: { subagentId: string; entityId: string; snapshot: EntityChatSnapshot } | null;
    /** Cambia a ogni resumeEntityChat() — usato solo come React `key` sul SubagentRunner di
     * resume (vedi Agentico.tsx), stesso principio di orchestratorRunId. */
    resumeRunId: string | null;
    /** Presente = un startManualEntry() è in sospeso, letto da Agentico.tsx per montare un
     * ManualEntryRunner per QUESTO subagent — percorso "senza AI" per quando l'orchestratore
     * stesso non riesce a partire ma il target è già noto (vedi
     * SubagentManifest.manualEntry/pendingScopedSubagentId). Analogo a pendingGoal/pendingResume. */
    pendingManualEntry: { subagentId: string; extraDestinations?: ResultDestination[] } | null;
    /** Cambia a ogni startManualEntry() — React `key` sul ManualEntryRunner, stesso principio di
     * orchestratorRunId/resumeRunId. */
    manualEntryRunId: string | null;
    /** Avvia il percorso "senza AI" per un subagent già noto — chiamato dal bottone "Continua
     * senza AI" quando la conversazione orchestratore è scoped e non può proseguire (vedi
     * Agentico.tsx). Congeda subito il task orchestratore corrente, stesso principio di un vero
     * handoff AI-driven (OrchestratorRunner.handleResult). */
    startManualEntry: (subagentId: string, extraDestinations?: ResultDestination[]) => void;
    /** Presente = un resumeWithAI() è in sospeso, letto da Agentico.tsx per montare un vero
     * SubagentRunner (AI abilitata) per QUESTO subagent con QUESTI parametri — il "contrario" di
     * startManualEntry: dopo aver lavorato nel percorso senza AI, l'utente può far raffinare
     * dall'AI lo stesso input, invece di restare bloccato lì per sempre. */
    pendingResumeWithAI: { subagentId: string; params: Record<string, unknown>; extraDestinations?: ResultDestination[] } | null;
    /** Cambia a ogni resumeWithAI() — React `key` sul SubagentRunner risultante, stesso principio
     * di manualEntryRunId. */
    resumeWithAIRunId: string | null;
    /** Passa da un task ManualEntryRunner (senza AI) a un vero SubagentRunner (AI abilitata) per
     * lo STESSO subagent, riusando `params` (gli ultimi usati con successo nel percorso senza
     * AI) come punto di partenza — mai una conversazione persa, solo il canale che cambia.
     * Generico per costruzione: nessuna conoscenza di QUALE subagent, funziona per ogni
     * manifest con `manualEntry` dichiarato, non solo html-to-liquid. */
    resumeWithAI: (subagentId: string, params: Record<string, unknown>, extraDestinations?: ResultDestination[]) => void;
    /** Congeda il task corrente — usato da un componente che ha già stabilito (in base al
     * proprio subagentId/entità) che il task visibile non è il suo (vedi ThemeEditor/
     * ThemeIndexList). Regola unica, nessuna eccezione: quale chat si vede dipende SOLO dal
     * componente/entità a cui si è agganciati in questo momento — niente puntatori "torna
     * indietro", niente eccezione per un task ancora in corso (deliberatamente semplice,
     * raffinabile in seguito). No-op se non c'è alcun task. */
    dismissForeignTask: () => void;
}

const AgenticoContext = createContext<AgenticoContextValue | null>(null);

export function AgenticoProvider({ children, scope = null }: { children: React.ReactNode; scope?: AgenticoScope | null }) {
    const [task, setTaskState] = useState<AgenticoTask | null>(null);
    // Stabile per tutta la vita del provider (vedi openTask sotto) — leggere `task` da una ref
    // invece che dalle dipendenze di useCallback evita che openTask cambi identità ogni volta che
    // il task cambia, che altrimenti farebbe ripartire in loop gli effect di registrazione di
    // OrchestratorRunner/SubagentRunner (le cui dipendenze includono sidebar.openTask) — stesso
    // bug class già osservato altrove in questo file (vedi filteredResult in SubagentRunner.tsx).
    const taskRef = useRef<AgenticoTask | null>(null);
    useEffect(() => { taskRef.current = task; }, [task]);
    const [isOpen, setIsOpen] = useState(false);

    const openTask = useCallback(<TResult,>(next: AgenticoTask<TResult>) => {
        const current = taskRef.current;
        if (current && current.id !== next.id) current.onDismiss();
        // Chi possiede il task (SubagentRunner) ricostruisce l'intero oggetto a ogni
        // ri-registrazione (un cambio qualunque di agent.activity/running/...) SENZA sapere
        // nulla di `savedToDisk` (settato altrove, da commitEntityChat) — senza questo merge,
        // un follow-up in chat DOPO il salvataggio cancellerebbe silenziosamente il flag appena
        // impostato (bug osservato: il dialogo "nuova chat" tornava a chiedere conferma per una
        // chat già salvata). Preservato SOLO quando è genuinamente lo STESSO task (stesso id) —
        // un vero task nuovo riparte da zero, correttamente non salvato.
        const merged = (current && current.id === next.id && current.savedToDisk && next.savedToDisk === undefined)
            ? { ...next, savedToDisk: true }
            : next;
        setTaskState(merged as AgenticoTask);
    }, []);

    // Chiudere il task NON nasconde il pannello — il pannello è un "posto persistente", come
    // l'icona di un'estensione del browser: resta dov'è (magari vuoto) finché non è l'utente
    // stesso a nasconderlo col toggle globale.
    const closeTask = useCallback((id: string) => {
        setTaskState((prev) => (prev && prev.id === id ? null : prev));
    }, []);

    const toggleOpen = useCallback(() => setIsOpen((v) => !v), []);
    const openPanel = useCallback(() => setIsOpen(true), []);

    const [pendingGoal, setPendingGoal] = useState<string | null>(null);
    const [pendingExtraDestinations, setPendingExtraDestinations] = useState<ResultDestination[] | undefined>(undefined);
    const [pendingAttachments, setPendingAttachments] = useState<File[] | undefined>(undefined);
    const [pendingModel, setPendingModel] = useState<string | undefined>(undefined);
    // Cambia a ogni conversazione orchestratore avviata per davvero (ramo "else" sotto) — usato
    // come React `key` sull'elemento <OrchestratorRunner> (vedi Agentico.tsx), cosi un nuovo
    // startOrchestrator() smonta e rimonta un'istanza FRESCA invece di riusare quella precedente.
    const [orchestratorRunId, setOrchestratorRunId] = useState<string | null>(null);
    const [pendingCarryOver, setPendingCarryOver] = useState<PendingCarryOver | null>(null);
    const [pendingScopedSubagentId, setPendingScopedSubagentId] = useState<string | undefined>(undefined);

    // ── Contesto pagina, vecchio meccanismo a stack (useAgenticoPageContext) ──────────────────
    const [pageContextEntries, setPageContextEntries] = useState<Array<{ id: string; text: string; card: SubagentUsageCard | null }>>([]);
    const setPageContext = useCallback((id: string, text: string | null, card: SubagentUsageCard | null = null) => {
        setPageContextEntries((prev) => {
            const next = prev.filter((e) => e.id !== id);
            return text ? [...next, { id, text, card }] : next;
        });
    }, []);
    const lastPageContextEntry = pageContextEntries.length > 0 ? pageContextEntries[pageContextEntries.length - 1] : null;

    // ── Ancoraggi componente↔subagent, nuovo meccanismo (useSubagentComponentContext) ────────
    const [componentAnchorEntries, setComponentAnchorEntries] = useState<Array<{ id: string } & ComponentAnchor>>([]);
    const registerComponentAnchor = useCallback((id: string, anchor: ComponentAnchor | null) => {
        setComponentAnchorEntries((prev) => {
            const next = prev.filter((e) => e.id !== id);
            return anchor ? [...next, { id, ...anchor }] : next;
        });
    }, []);
    // NON deduplicato per subagentId — a differenza del vecchio stack pageContextEntries, QUI
    // più anchor per lo STESSO subagentId sono un caso reale e voluto (es. ThemeEditor, per i
    // campi tema, e SiteEditorPage, per i soli campi di site-branding, entrambi ancorati a
    // 'theme' mentre la modale è aperta — vedi SiteEditorPage.tsx): ognuno deve ricevere il
    // risultato, mai solo "l'ultimo registrato" (bug corretto: un dedup qui faceva sparire in
    // silenzio uno dei due listener). Il dedup per hint/scoping (sotto) resta separato.
    const componentAnchors = useMemo(
        () => componentAnchorEntries.map((e) => ({ subagentId: e.subagentId, componentKey: e.componentKey, onResult: e.onResult, pinnedEntityId: e.pinnedEntityId })),
        [componentAnchorEntries],
    );

    // QUI sì, deduplicato per subagentId — un hint/messaggio per subagent ancorato, non uno per
    // OGNI componente che lo ascolta (altrimenti un anchor "solo ascolto" senza propri
    // agenticoHint/userMessage, come SiteEditorPage, o due componenti sullo stesso subagent
    // produrrebbero hint duplicati/nessuno). L'ultimo registrato vince, stesso principio del
    // vecchio stack pageContextEntries.
    const uniqueAnchors = useMemo(() => {
        const bySubagent = new Map<string, ComponentAnchor>();
        for (const e of componentAnchorEntries) bySubagent.set(e.subagentId, { subagentId: e.subagentId, componentKey: e.componentKey, onResult: e.onResult, contextInfo: e.contextInfo });
        return [...bySubagent.values()];
    }, [componentAnchorEntries]);

    // Testi (agenticoHint/userMessage) per ogni anchor attivo il cui manifest dichiara davvero un
    // componentContexts per quella chiave — un anchor "solo ascolto" (es. SiteEditorPage, che
    // ascolta 'theme' senza essere uno dei suoi componenti dichiarati) non produce testo qui, ma
    // resta comunque nella lista `componentAnchors` sopra per il routing di onResult.
    const anchorTexts = useMemo(() => {
        return uniqueAnchors
            .map((a) => {
                const manifest = findSubagentManifest(a.subagentId);
                const ctx = manifest?.componentContexts?.[a.componentKey];
                if (!ctx) return null;
                // `contextInfo` (fatti live sull'entità aperta ORA, es. "il tema aperto si
                // chiama ducatimilano.it") in coda al testo statico del manifest — mai al posto
                // suo: l'hint spiega COSA fare, contextInfo COSA sa già il componente.
                const agenticoHint = a.contextInfo ? `${ctx.agenticoHint}\n${a.contextInfo}` : ctx.agenticoHint;
                return { subagentId: a.subagentId, agenticoHint, userMessage: ctx.userMessage };
            })
            .filter((x): x is { subagentId: string; agenticoHint: string; userMessage: string } => x !== null);
    }, [uniqueAnchors]);

    const anchoredUserMessages = useMemo(() => anchorTexts.map((t) => t.userMessage), [anchorTexts]);

    // Testo combinato per il prompt dell'orchestratore — un solo hint se un solo subagent è
    // ancorato, altrimenti una premessa esplicita che elenca tutti i candidati e istruisce il
    // modello a chiedere all'utente quale intende prima di procedere (mai un tentativo silenzioso
    // di indovinare quale dei due l'utente vuole davvero).
    const anchoredPageContextText = useMemo(() => {
        if (anchorTexts.length === 0) return null;
        if (anchorTexts.length === 1) return anchorTexts[0].agenticoHint;
        const list = anchorTexts.map((t, i) => `${i + 1}. ${t.agenticoHint}`).join('\n');
        return `${getAgenticoPrompts().multipleCandidates}\n\n${list}`;
    }, [anchorTexts]);

    const pageContext = anchoredPageContextText ?? lastPageContextEntry?.text ?? null;
    // Una card a campi (SubagentUsageCardView) ha senso solo per il vecchio meccanismo — un
    // anchor component-based mostra invece `anchoredUserMessages` (una frase, non un modulo).
    const pageContextCard = anchorTexts.length > 0 ? null : (lastPageContextEntry?.card ?? null);
    // Un solo subagent ancorato → scope diretto; zero o più di uno (ambiguo, l'LLM deve chiedere)
    // → ripiega sul vecchio pageContextCard (pagine non ancora migrate) o null.
    const uniqueAnchoredSubagentIds = useMemo(() => [...new Set(componentAnchors.map((a) => a.subagentId))], [componentAnchors]);
    const scopedSubagentId = uniqueAnchoredSubagentIds.length === 1
        ? uniqueAnchoredSubagentIds[0]
        : (uniqueAnchoredSubagentIds.length === 0 ? (lastPageContextEntry?.card?.subagentId ?? null) : null);

    const startOrchestrator = useCallback((goal: string, options?: { extraDestinations?: ResultDestination[]; attachments?: File[]; model?: string; scopedSubagentId?: string }) => {
        openPanel();
        const current = taskRef.current;
        if (current?.id === ORCHESTRATOR_TASK_ID) return; // già in corso, la porta a fuoco basta aprire il pannello

        // "Stesso contesto" = la pagina che ha invocato questa richiesta è scoped allo stesso
        // subagent del task già esistente (es. richiedi di nuovo "estrai tema" mentre il task
        // precedente per lo stesso subagent è ancora aperto) — in quel caso continua QUELLA
        // conversazione (stesso id, transcript prepeso) invece di aprirne una scollegata.
        const existingTask = (scopedSubagentId && current?.id.startsWith(`subagent-${scopedSubagentId}-`)) ? current : undefined;
        setPendingCarryOver(existingTask ? {
            taskId: existingTask.id,
            activity: [...(existingTask.precedingActivity ?? []), ...existingTask.agent.activity],
        } : null);
        setPendingGoal(goal);
        setPendingExtraDestinations(options?.extraDestinations);
        setPendingAttachments(options?.attachments);
        setPendingModel(options?.model);
        setPendingScopedSubagentId(options?.scopedSubagentId);
        setOrchestratorRunId(crypto.randomUUID());
    }, [openPanel, scopedSubagentId]);

    const commitEntityChat = useCallback((subagentId: string, entityId: string, taskId: string | null | undefined, scopeId: string | undefined, params: Record<string, unknown>, title: string) => {
        if (!taskId || !scopeId) return; // nessuna estrazione coinvolta in questo salvataggio
        const current = taskRef.current;
        if (!current || current.id !== taskId) return; // il task che ha popolato il draft non è più quello vivo
        const snap = current.agent.snapshot();
        if (!snap) return;
        // `current.precedingActivity` (vedi PendingCarryOver/orchestrator→subagent handoff) è il
        // trascritto prepeso SOLO per la visualizzazione (displayedActivity in Agentico.tsx) —
        // l'`activity` salvata qui deve includerlo esplicitamente, altrimenti un salvataggio dopo
        // aver continuato una conversazione già in corso perderebbe comunque la parte precedente.
        saveEntityChat({
            scopeId, subagentId, entityId, params, title,
            history: snap.history,
            activity: [...(current.precedingActivity ?? []), ...snap.activity],
        });
        setTaskState((prev) => (prev && prev.id === taskId ? { ...prev, savedToDisk: true } : prev));
    }, []);

    const [pendingResume, setPendingResume] = useState<{ subagentId: string; entityId: string; snapshot: EntityChatSnapshot } | null>(null);
    const [resumeRunId, setResumeRunId] = useState<string | null>(null);

    const resumeEntityChat = useCallback((subagentId: string, entityId: string, snapshot: EntityChatSnapshot) => {
        openPanel();
        setPendingResume({ subagentId, entityId, snapshot });
        setResumeRunId(crypto.randomUUID());
    }, [openPanel]);

    const [pendingManualEntry, setPendingManualEntry] = useState<{ subagentId: string; extraDestinations?: ResultDestination[] } | null>(null);
    const [manualEntryRunId, setManualEntryRunId] = useState<string | null>(null);

    const startManualEntry = useCallback((subagentId: string, extraDestinations?: ResultDestination[]) => {
        openPanel();
        // Stesso identico trattamento di un vero handoff AI-driven (OrchestratorRunner.
        // handleResult, ramo 'handoff'): closeTask diretto, MAI onDismiss — quando il
        // ManualEntryRunner monta ed esegue il proprio openTask, `taskRef.current` è già `null`
        // (svuotato qui), quindi il ramo "sostituisci il task precedente" di openTask non scatta
        // nemmeno: nessun problema, l'agent dell'orchestratore semplicemente non produce più
        // attività dopo questo punto, quindi il suo effect di registrazione non riparte da solo.
        closeTask(ORCHESTRATOR_TASK_ID);
        setPendingManualEntry({ subagentId, extraDestinations });
        setManualEntryRunId(crypto.randomUUID());
    }, [openPanel, closeTask]);

    const [pendingResumeWithAI, setPendingResumeWithAI] = useState<{ subagentId: string; params: Record<string, unknown>; extraDestinations?: ResultDestination[] } | null>(null);
    const [resumeWithAIRunId, setResumeWithAIRunId] = useState<string | null>(null);

    const resumeWithAI = useCallback((subagentId: string, params: Record<string, unknown>, extraDestinations?: ResultDestination[]) => {
        // Smonta SUBITO il ManualEntryRunner corrente (invece di un closeTask diretto, come in
        // startManualEntry sopra) — a differenza dell'orchestratore dopo un handoff,
        // ManualEntryRunner resta un componente vivo che si ri-registra a ogni cambio del proprio
        // stato (result/applyLabel/...): un semplice closeTask() qui verrebbe subito vanificato
        // dal suo prossimo re-render. Smontarlo (pendingManualEntry → null) fa scattare il suo
        // effect di cleanup (closeTask sul PROPRIO id) prima che il nuovo SubagentRunner monti e
        // si registri — nessuna corsa tra i due task.
        setPendingManualEntry(null);
        setPendingResumeWithAI({ subagentId, params, extraDestinations });
        setResumeWithAIRunId(crypto.randomUUID());
    }, []);

    const dismissForeignTask = useCallback(() => {
        const current = taskRef.current;
        if (!current) return;
        current.onDismiss();
    }, []);

    const value = useMemo(
        () => ({
            scope, task, isOpen, openTask, closeTask, toggleOpen, pendingGoal, startOrchestrator,
            pageContext, pageContextCard, setPageContext, scopedSubagentId, pendingScopedSubagentId,
            componentAnchors, anchoredUserMessages, registerComponentAnchor,
            openPanel, pendingExtraDestinations,
            pendingAttachments, pendingModel, orchestratorRunId, pendingCarryOver, commitEntityChat,
            resumeEntityChat, pendingResume, resumeRunId, dismissForeignTask,
            pendingManualEntry, manualEntryRunId, startManualEntry,
            pendingResumeWithAI, resumeWithAIRunId, resumeWithAI,
        }),
        [scope, task, isOpen, openTask, closeTask, toggleOpen, pendingGoal, startOrchestrator, pageContext, pageContextCard, setPageContext, scopedSubagentId, pendingScopedSubagentId, componentAnchors, anchoredUserMessages, registerComponentAnchor, openPanel, pendingExtraDestinations, pendingAttachments, pendingModel, orchestratorRunId, pendingCarryOver, commitEntityChat, resumeEntityChat, pendingResume, resumeRunId, dismissForeignTask, pendingManualEntry, manualEntryRunId, startManualEntry, pendingResumeWithAI, resumeWithAIRunId, resumeWithAI],
    );

    return (
        <AgenticoContext.Provider value={value}>
            {children}
        </AgenticoContext.Provider>
    );
}

export function useAgentico() {
    const context = useContext(AgenticoContext);

    if (!context) {
        throw new Error('useAgentico must be used inside AgenticoProvider');
    }

    return context;
}
