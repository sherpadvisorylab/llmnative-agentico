// Hook condiviso per ogni feature "opt-in AI" del CMS (import tema, import HTML/JSX, e i
// prossimi) — un solo posto da correggere se il meccanismo cambia (vedi il bug del registry
// sempre popolato risolto in react/src/providers/manifest.ts — prima avrebbe dovuto essere
// corretto in due punti diversi di questo repo).
//
// `useAgent` è l'UNICO esecutore: consuma un `AgentDefinition` (../domain/agentDefinition) — il
// chiamante non costruisce mai il prompt né chiama il provider direttamente. Il controller
// dell'agente (`buildContext`) gira sempre, con o senza AI abilitata; `run()` ritorna il
// fallback deterministico quando l'AI è spenta, non disponibile, o la sua risposta non è
// valida — mai un errore non gestito per il chiamante.
//
// Conversazione multi-turno: `run()` avvia una sessione (controller + primo prompt),
// `sendMessage()` la continua — l'utente affina la richiesta ("controlla anche /about",
// "riprova con questo markup") e il modello può invocare i tool dell'agente (getTools) con i
// parametri che l'utente ha suggerito, invece di dover essere ririchiamato da zero dal
// chiamante. Il loop tool_use → execute → continua è interamente interno a questo hook.
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseAIModelRef, PromptUtils, useAIProviderRegistry } from '@llmnative/react';
import type { AIAttachment, AIConversationTurn, AIModelDescriptor, AIProviderAdapter, AIToolResult } from '@llmnative/react';
import type { AgentDefinition, AgentExecutorModel, AgentExecutorPartOptions, AgentExecutorStep, AgentModelGroupBadge, AgentTool, LatestAttachmentsRef } from '../domain/agentDefinition';
import {
    DEFAULT_REASONING_PART_ID, DEFAULT_TEXT_PART_ID, formatQuestionAnswers, messagePartsText, upsertMessagePart,
    type AgentCard, type AgentCardOutcome, type AgentCardPart, type AgentMessagePart, type AgentQuestion, type AgentQuestionAnswer, type AgentQuestionsAnswers, type AgentReasoningPart,
} from '../domain/messageParts';
import { extractErrorMessage } from '../domain/extractErrorMessage';
import { applyMicroPrompts } from '../domain/microPrompts';
import { toJsonSchema } from '../domain/mcpTool';
import { useAIModelCatalog } from './useAIModelCatalog';
import { APPROVAL_PART_ID, approvalOf, needsApproval, type ApprovalDecision } from '../domain/approval';
import { getAgenticoPrompts } from '../domain/prompts';
import { useAgenticoI18n } from '../i18n';
import type { ChatAuthor } from '../domain/entityChatStore';

/** Numero massimo di round-trip tool_calls consecutivi in un singolo turno — argine contro
 * un modello che continua a invocare tool senza mai arrivare a una risposta testuale. Un
 * task legittimo (es. verificare 5-6 URL candidati per loghi/favicon) può richiederne
 * parecchi: il limite è un argine contro un loop infinito, non un tetto stretto al lavoro
 * reale — vedi il turno di chiusura forzata sotto per cosa succede quando lo si raggiunge
 * comunque con lavoro legittimo ancora in corso. */
const MAX_TOOL_ROUNDTRIPS = 20;

/** Soglia oltre la quale un allegato testuale NON viene più incollato nel messaggio al
 * provider (né persistito in history, vedi attachmentsHistoryText sotto) — solo esclusa dalla
 * chiamata AI, resta comunque raggiungibile per intero da un tool via LatestAttachmentsRef
 * (vedi agentDefinition.ts). ~260KB di base64 ≈ ~195KB di testo decodificato: un CSV di
 * migliaia di righe (bug osservato: un file da 7MB mandava in 400 l'upstream, ben oltre
 * qualunque finestra di contesto) resta gestibile SOLO se un tool lo legge direttamente,
 * mai incollandolo per intero nel prompt. */
const MAX_INLINE_TEXT_ATTACHMENT_BASE64_LENGTH = 260_000;

/** Allegati non testuali (immagini, ecc.) passano sempre — solo i testuali oltre soglia
 * vengono esclusi dal prompt/dalla history (vedi sopra), mai dal ref grezzo per i tool. */
function filterInlineAttachments(attachments: AIAttachment[]): AIAttachment[] {
    return attachments.filter((a) => !PromptUtils.isTextAttachment(a.mimeType) || a.base64.length <= MAX_INLINE_TEXT_ATTACHMENT_BASE64_LENGTH);
}

/** Una voce del log di attività — o un messaggio dell'utente (il testo di sendMessage(),
 * mostrato subito com'è, mai "sto pensando" perché non è il modello a scriverlo), o una tool
 * call (etichetta SEMPRE deterministica/locale, vedi AgentTool.describeInvocation: mai testo
 * generato chiedendo al modello di narrare se stesso, name+input sono già strutturati nella
 * risposta del provider — stesso approccio degli IDE agentici, che renderizzano le tool call
 * dal client, non dal testo del modello), o un turno "sto pensando" (una chiamata al modello,
 * testo libero in `detail` — QUESTO è l'unico testo scritto davvero dal modello nel log,
 * collassato a una riga dal chiamante). */
export interface AgentActivityEntry {
    id: string;
    /** 'user' = il testo passato a sendMessage(), mostrato come bolla di chat (vedi
     * AgentActivityLog). 'thinking' = una chiamata al modello (etichetta transitoria, vedi
     * AgentActivityLog: "Sto pensando…" mentre gira, sostituita da un'anteprima di `detail` a
     * risposta arrivata — mai testo che persiste invariato). 'tool' = una tool call,
     * etichetta sempre statica (AgentTool.describeInvocation). */
    kind: 'user' | 'thinking' | 'tool';
    label: string;
    status: 'running' | 'done' | 'error' | 'stopped';
    /** Sui turni "sto pensando" — il testo che il modello ha scritto in quel turno (commento
     * prima di un tool_calls, o la risposta finale). Sui messaggi utente — il testo inviato
     * a sendMessage(), integrale (non troncato, non collassabile: è già quello che l'utente
     * ha scritto, non c'è "ragionamento" da nascondere dietro un collapse). */
    detail?: string;
    /** Solo sui turni "sto pensando" che hanno richiesto tool_calls SENZA testo libero
     * (`detail` assente) — le frasi discorsive (deterministiche, vedi AgentTool.describeIntent)
     * sullo SCOPO GENERALE dei tool che quel turno sta per invocare (mai i parametri della
     * chiamata specifica, quelli sono già sulla riga della tool call sotto — vedi
     * describeIntent per il perché) cosi la UI dice qualcosa di concreto invece del generico
     * "Richiesta di eseguire dei tool" (vedi thinkingDisplayLabel in AgentActivityLog.tsx). */
    toolNames?: string[];
    /** Solo su 'user' — nomi dei file allegati a QUESTO messaggio (run()/sendMessage()
     * opts.attachments), mostrati come pillole sopra il testo (vedi AgentActivityLog) — senza,
     * l'utente non ha modo di verificare "ho davvero attaccato quel file?" scorrendo indietro,
     * doveva fidarsi a memoria (bug osservato: un allegato sembrava "sparito" perché non
     * c'era traccia visiva che fosse mai arrivato). */
    attachmentNames?: string[];
    /** A message the Retry button sent for the person (never the title of the chat). */
    retry?: boolean;
    /** CR-018: on a message of the person, who wrote it (the `author` of useAgent). */
    author?: ChatAuthor;
    /** CR-016: on a message of the person, how many turns the history of the model had when it was sent:
     * where the chat goes back to when the person retries or edits it. Absent on messages sent before
     * 0.15.0 (no Retry from here on them). */
    historyAt?: number;
    /** On the turns of a remote agent (CR-004): the message in parts (text, reasoning, steps,
     * questions), in the order they arrived. `detail` still holds its text. Absent on the turns of
     * the AI provider and on chats saved before 0.3.0, shown from `detail` as before. */
    parts?: AgentMessagePart[];
}

/** Stato di gating/selezione — non generico, condiviso dal componente <AgentControls />
 * (che non ha bisogno di conoscere TParams/TResult, solo di disegnare switch + select). */
export interface AgentControlState {
    enabled:          boolean;
    setEnabled:       (v: boolean) => void;
    hasProviders:     boolean;
    selectedModel:    string;
    setSelectedModel: (id: string) => void;
    modelsByProvider: Record<string, AIModelDescriptor[]>;
    modelsLoading:    boolean;
}

export interface UseAgentResult<TParams, TResult> extends AgentControlState {
    running: boolean;
    error:   string | null;
    /** true dopo che run() ha eseguito almeno un turno con AI abilitata — solo allora la
     * conversazione ha una history su cui sendMessage() può continuare. */
    canContinue: boolean;
    /** true when the turns go to `AgentDefinition.executor` (CR-003): no attachments, no
     * deterministic fallback; the models are the executor's (`remoteModels`), not the catalog. */
    remote: boolean;
    /** The models a remote executor offers (`AgentExecutor.models`); `selectedModel` is one of them. */
    remoteModels: AgentExecutorModel[];
    /** CR-009: the executor answers only the turns of its own models, next to the AI catalog. */
    alongside: boolean;
    /** CR-009: the group and badge of a model of the AI catalog, as the executor names them. */
    catalogGroup?: (provider: string, label: string) => { group: string; badge?: AgentModelGroupBadge };
    /** Log delle tool call della sessione corrente, più recenti in fondo — azzerato a ogni
     * run(), accumulato attraverso i sendMessage() successivi. */
    activity: AgentActivityEntry[];
    /** Esegue il controller (sempre) e, se abilitato e disponibile un provider, il prompt
     * dell'agente. Ritorna `null` solo se il controller stesso fallisce (es. fetch di rete) —
     * in ogni altro caso ritorna almeno il fallback deterministico dell'agente. Avvia una
     * nuova sessione conversazionale (azzera la history di eventuali run precedenti).
     * `opts.attachments` — file allegati dall'utente al messaggio di apertura, convertiti in
     * `AIAttachment` (`PromptUtils.fileToAttachment`) e passati al provider — è il provider
     * stesso (react/src/providers/ai/*) a decidere se un mimetype testuale va decodificato e
     * inserito come blocco di testo o trattato come documento nativo (CR-071bis): questo hook
     * non fa più quella distinzione, per non duplicare una logica che deve restare unica e
     * per-provider dentro il framework. `opts.model` — sovrascrive
     * `selectedModel` SOLO per questa chiamata (mai una `setSelectedModel` seguita subito da
     * `run()`: lo stato React non sarebbe ancora committato nello stesso tick — vedi Chatbot
     * in Agentico.tsx, che riporta il modello scelto nel payload di ogni submit invece di
     * affidarsi a un `setSelectedModel` sincrono). `opts.openingMessage` — testo da mostrare
     * SUBITO come bolla "Tu" in cima all'activity log (stesso trattamento del testo di
     * sendMessage(), vedi sotto): senza, il messaggio che ha avviato la conversazione (es. il
     * goal scritto nel composer "starter" di Agentico, magari con un allegato) non appariva mai
     * nel log — solo i turni di sendMessage() successivi lo facevano, rendendo il primo
     * messaggio "invisibile" e facile da dimenticare fosse mai stato inviato (bug osservato).
     * Opzionale perché non ogni chiamante di run() è una chat (es. i subagent lanciati da
     * modale/form come theme/html-to-liquid non hanno un "messaggio utente" testuale da
     * mostrare). */
    run: (params: TParams, opts?: { attachments?: File[]; model?: string; openingMessage?: string }) => Promise<TResult | null>;
    /** Continua la conversazione avviata da run() con un messaggio dell'utente — il modello
     * può invocare i tool dell'agente con i parametri suggeriti nel messaggio. Richiede che
     * run() sia già stato eseguito con AI abilitata (altrimenti `error` viene impostato).
     * `opts` — stesso trattamento di run(), vedi sopra. */
    sendMessage: (text: string, opts?: { attachments?: File[]; model?: string; retry?: boolean }) => Promise<TResult | null>;
    /** Interrompe il turno in corso (run() o sendMessage()) — annulla la chiamata AI
     * attualmente in volo. Nessun effetto se non c'è nulla in corso. Le tool call già in
     * esecuzione in quel momento completano comunque (sono fetch brevi); il turno si ferma
     * al prossimo checkpoint (subito se si stava aspettando il modello, altrimenti dopo che
     * il round di tool in corso ha finito). */
    stop: () => void;
    /** Ricarica una sessione già esistente (vedi entityChatStore/AgenticoContext.resumeEntityChat)
     * invece di iniziarne una nuova — NON invia alcun prompt al modello, si limita a ricostruire
     * context/tools (via buildContext/getTools, come run()) e a installare `seed.history`/
     * `seed.activity` cosi un sendMessage() successivo continui esattamente come se la
     * conversazione non fosse mai stata interrotta. `params` deve avere la stessa forma con cui
     * la sessione originale era stata avviata (lo stesso TParams grezzo salvato nello snapshot). */
    resume: (params: TParams, seed: { history: AIConversationTurn[]; activity: AgentActivityEntry[] }) => Promise<void>;
    /** Esegue direttamente il fallback deterministico dell'agente, bypassando l'AI — per il
     * bottone "Continua senza AI" mostrato accanto a "Riprova" quando la chiamata al modello
     * fallisce (rete/provider giù, non una risposta non valida: quel caso ricade già da solo
     * sul fallback dentro runTurn). Richiede che run() sia già stato eseguito almeno una volta
     * in questa sessione (altrimenti non c'è `params`/`context` da cui derivarlo) — `null` se
     * chiamato prima. Sincrono: `AgentDefinition.fallback` non è mai una Promise (è sempre
     * derivato da `buildContext`, già risolto a questo punto). */
    runFallback: () => TResult | null;
    /** Foto corrente, serializzabile, della conversazione — `history` (turni grezzi
     * `AIConversationTurn[]`, dato puro senza funzioni/riferimenti al provider) più `activity`
     * (lo stesso log mostrato in UI). Usata da AgenticoContext.commitEntityChat per persistere
     * la chat che ha prodotto un'entità appena salvata (vedi entityChatStore) — a differenza di
     * `activity` da solo, `history` è ciò che serve per un vero resume (un nuovo giro può
     * continuare la conversazione col modello, non solo mostrarne il transcript in sola
     * lettura). `null` se run() non è mai stato eseguito in questa sessione. Una funzione, non
     * un valore memoizzato: deve leggere `sessionRef`/`activity` correnti al momento della
     * chiamata (tipicamente un click su Salva, molto dopo l'ultimo turno), mai una chiusura
     * stantia catturata al mount. */
    snapshot: () => { history: AIConversationTurn[]; activity: AgentActivityEntry[] } | null;
    /** CR-016: back to a message of the person (by its entry id) and sent again, as it was or edited
     * (`text`). Everything after it goes, from the chat and from the history of the model. */
    rewind: (entryId: string, text?: string) => Promise<TResult | null>;
    /** CR-016: whether this agent offers going back (always on the AI catalog; with an executor, when it says so). */
    canRewind: boolean;
    /** CR-016: whether a message of the person can be gone back to (it knows, or the history shows, where it was). */
    rewindable: (entryId: string) => boolean;
    /** CR-017: whether the executor takes files with a message (the composer offers them on its models). */
    executorAttachments: boolean;
    /** Answers the questions part `partId` of the entry `entryId` (CR-004). If the turn that asked
     * is still waiting, its `onQuestions` promise resolves; otherwise a new turn of the executor
     * carries them (`AgentExecutorTurn.answers`, with empty `text`). Either way the part keeps the
     * answers and shows them read-only. Resolves with the result of that new turn, if any; rejects
     * (leaving the form open) when another turn is running or the entry is not of this conversation. */
    answerQuestions: (entryId: string, partId: string, answers: AgentQuestionAnswer[]) => Promise<TResult | null>;
    /** CR-015: the agent has a result of its own without a model ("Continue without AI"). */
    offersFallback: boolean;
    /** CR-014: an action of a card of the chat, run by the host; its outcome goes into the card. */
    cardAction: (entryId: string, partId: string, actionId: string) => Promise<void>;
}

/** Solo la fetta di UseAgentResult che serve a un consumer del pannello globale (Agentico.tsx)
 * per continuare una conversazione già avviata da run() — TParams non compare in nessuno dei
 * membri qui sotto, quindi `never` è innocuo. */
export type AgentConversation<TResult> = Pick<UseAgentResult<never, TResult>, 'canContinue' | 'remote' | 'remoteModels' | 'alongside' | 'catalogGroup' | 'running' | 'error' | 'activity' | 'sendMessage' | 'stop' | 'runFallback' | 'snapshot' | 'answerQuestions' | 'cardAction' | 'offersFallback' | 'rewind' | 'canRewind' | 'rewindable' | 'executorAttachments'>;

/** The entries of a reopened chat: what was still running stopped, what was streaming done. */
export function settleActivity(activity: AgentActivityEntry[]): AgentActivityEntry[] {
    return activity.map((entry) => (entry.status !== 'running' && !entry.parts?.some((part) => (part.type === 'tool' && part.status === 'running') || ((part.type === 'text' || part.type === 'reasoning') && part.streaming)) ? entry : {
        ...entry,
        status: entry.status === 'running' ? 'stopped' : entry.status,
        ...(entry.parts ? {
            parts: entry.parts.map((part) => (part.type === 'tool' && part.status === 'running' ? { ...part, status: 'stopped' as const }
                : (part.type === 'text' || part.type === 'reasoning') && part.streaming ? { ...part, streaming: false } : part)),
        } : {}),
    }));
}

export function useAgent<TParams, TContext, TResult>(
    definition: AgentDefinition<TParams, TContext, TResult>,
    options: {
        defaultEnabled?: boolean;
        /** CR-018: who writes the messages of the person (AgenticoProvider `person`), kept on each of them. */
        author?: ChatAuthor;
    } = {},
): UseAgentResult<TParams, TResult> {
    const { defaultEnabled = false } = options;
    const authorRef = useRef(options.author);
    authorRef.current = options.author;
    const [enabled, setEnabled]     = useState(defaultEnabled);
    const { hasProviders, modelsByProvider, modelsLoading, selectedModel, setSelectedModel } = useAIModelCatalog();
    const [running, setRunning]     = useState(false);
    const [error, setError]         = useState<string | null>(null);
    const [canContinue, setCanContinue] = useState(false);
    const [activity, setActivityState] = useState<AgentActivityEntry[]>([]);
    // The log as last set, readable outside a render (answerQuestions looks its entry up there).
    const activityRef = useRef<AgentActivityEntry[]>([]);
    const setActivity = (next: AgentActivityEntry[] | ((prev: AgentActivityEntry[]) => AgentActivityEntry[])) => {
        setActivityState((prev) => {
            const value = typeof next === 'function' ? next(prev) : next;
            activityRef.current = value;
            return value;
        });
    };
    // Questions asked by a turn still running, by `${entryId}:${partId}`: answering resolves them.
    const pendingQuestionsRef = useRef(new Map<string, { resolve: (answers: AgentQuestionAnswer[]) => void; reject: (reason: unknown) => void }>());
    const labels = useAgenticoI18n();
    const labelsRef = useRef(labels);
    labelsRef.current = labels;

    // Stato della sessione conversazionale corrente — non ricalcolabile dal render (params/
    // context/tools di run() devono sopravvivere invariati fino al prossimo run()), quindi
    // ref e non state: sendMessage() li legge senza dover essere lui stesso il motivo del
    // render che li ha popolati.
    // `logId` — generato una sola volta per sessione (run()), non per turno: è quello che
    // permette al proxy dev di accodare request/response di TUTTI i turni della stessa
    // conversazione (run() + ogni sendMessage() successivo) allo stesso file di log (vedi
    // AICompleteRequest.logId e react/src/providers/proxy/vite.ts).
    // `attachmentsRef` — LatestAttachmentsRef (vedi agentDefinition.ts), creato una volta per
    // sessione e passato a getTools(): un tool come extract_csv_column lo legge a ogni
    // esecuzione, sempre aggiornato con gli allegati grezzi del turno CORRENTE (vedi runTurn).
    const sessionRef = useRef<{ params: TParams; context: TContext; tools: AgentTool[]; history: AIConversationTurn[]; logId: string; attachmentsRef: LatestAttachmentsRef } | null>(null);
    // Guardia di rientranza — un ref, non lo state `running`: lo stato React è aggiornato in
    // batch e non è garantito visibile sincronamente a una seconda chiamata di run()/
    // sendMessage() scattata nello stesso tick (es. doppio click prima del re-render).
    const runningRef = useRef(false);
    // CR-016: the chat as it was when the person took it back to one of their messages, for the next turn
    // of the executor (it starts again from it); null once that turn has it.
    // `fresh`: no turn ran since, the chat is `activity`; else (a turn on the AI catalog came first) the log
    // before the message being sent.
    const rewoundRef = useRef<{ activity: AgentActivityEntry[]; fresh: boolean } | null>(null);
    // The id of the message of the person being sent: where the log is cut for a rewound executor.
    const sendingRef = useRef<string | null>(null);
    // Il turno in corso (se c'è) — stop() lo annulla. Un ref, non state: creato e distrutto
    // dentro runTurn, mai il motivo di un render.
    const abortControllerRef = useRef<AbortController | null>(null);
    const stop = () => { abortControllerRef.current?.abort(); };

    // Il catalogo modelli (fetch, selezione di default) vive in useAIModelCatalog — condiviso
    // con AgenticoStarterComposer (Agentico.tsx), che ne ha bisogno PRIMA che esista una
    // sessione useAgent. Qui serve solo il registry grezzo per risolvere provider/ref.
    const registry: Record<string, AIProviderAdapter> = useAIProviderRegistry()?.registry ?? {};

    // CR-010: the providers of the AI catalog the chat may run on (`executor.catalogProviders`); absent: all.
    // A ref too, so a turn reads them within the render that set them.
    const [catalogProviders, setCatalogProvidersState] = useState<readonly string[] | undefined>(undefined);
    const catalogProvidersRef = useRef<readonly string[] | undefined>(undefined);
    const allowedIn = (allowed: readonly string[] | undefined, model: string | undefined) => {
        if (!model) return false;
        if (!allowed) return true;
        const parsed = parseAIModelRef(model);
        return Boolean(parsed) && allowed.includes(parsed!.provider);
    };
    const offeredCatalog = useMemo((): Record<string, AIModelDescriptor[]> => (catalogProviders
        ? Object.fromEntries(Object.entries(modelsByProvider)
            .map(([key, models]) => [key, models.filter((model) => catalogProviders.includes(model.provider))] as const)
            .filter(([, models]) => models.length))
        : modelsByProvider), [catalogProviders, modelsByProvider]);
    // The model of the catalog a turn runs with: the one picked when the chat allows it, else its first allowed one.
    const catalogModel = allowedIn(catalogProviders, selectedModel) ? selectedModel : (Object.values(offeredCatalog).flat()[0]?.id ?? '');
    const ref = enabled && catalogModel ? parseAIModelRef(catalogModel) : null;
    const provider = ref ? registry[ref.provider] : null;
    const executor = definition.executor;
    // An executor alongside the AI catalog (CR-009) answers only the turns of its own models.
    const alongside = Boolean(executor?.alongside);
    const remote = Boolean(executor) && !alongside;
    // CR-016: going back is offered on an agent of the AI catalog, and with an executor that starts again from the chat.
    const canRewind = !executor || Boolean(executor.canRewind);
    // CR-017: files with a message on the models of the executor.
    const executorAttachments = Boolean(executor?.attachments);
    const filesFor = async (files?: File[]) => (executorAttachments && files?.length
        ? Promise.all(files.map((file) => PromptUtils.fileToAttachment(file)))
        : undefined);
    /** Whether a model is one of the executor's: its turn goes to the executor. */
    const remoteModelsRef = useRef<AgentExecutorModel[]>([]);
    const isRemoteModel = (model: string | undefined) => Boolean(model) && remoteModelsRef.current.some((option) => option.value === model);
    /** Whether the executor answered a turn of this chat already (`first` of its next turn). */
    const remoteStartedRef = useRef(false);
    // The model of a remote executor, picked among its own options: a ref too, so a turn reads the
    // last pick even within the same render.
    const [remoteModels, setRemoteModels] = useState<UseAgentResult<TParams, TResult>['remoteModels']>([]);
    const [remoteModel, setRemoteModelState] = useState('');
    const remoteModelRef = useRef('');
    const setRemoteModel = (model: string) => {
        remoteModelRef.current = model;
        setRemoteModelState(model);
    };
    const offerRemoteModels = (params: TParams) => {
        const offered = executor?.models?.(params) ?? [];
        remoteModelsRef.current = offered;
        setRemoteModels(offered);
        const allowed = executor?.catalogProviders?.(params);
        catalogProvidersRef.current = allowed;
        setCatalogProvidersState(allowed);
        // A model of the catalog the chat does not allow is not the one it starts with: the executor's first.
        const fallback = alongside && !allowedIn(allowed, selectedModel) ? offered[0]?.value : undefined;
        setRemoteModel(executor?.defaultModel?.(params) ?? fallback ?? '');
    };

    /** A turn of a remote agent (CR-003): the text of the person goes to the executor as typed and
     * its message grows in one "thinking" entry, in parts (CR-004): text, reasoning, steps and
     * questions, in the order they arrive. No provider, no tool loop, no fallback. `answers` = the
     * turn carries the answers to the questions of an earlier turn (`historyText` is how the history
     * of the chat records them). */
    const runRemoteTurn = async (
        text: string,
        first: boolean,
        model?: string,
        answers?: AgentQuestionsAnswers & { historyText: string },
        attachments?: AIAttachment[],
    ): Promise<TResult | null> => {
        const session = sessionRef.current;
        if (!session || !executor) { setError(labelsRef.current.noActiveSession); return null; }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const thinkingId = crypto.randomUUID();
        setActivity((prev) => [...prev, { id: thinkingId, kind: 'thinking', label: labelsRef.current.thinking, status: 'running', parts: [] }]);

        // When each reasoning part started, to say how long the model reasoned.
        const reasoningStarted = new Map<string, number>();
        const secondsSince = (id: string) => Math.max(1, Math.round((Date.now() - (reasoningStarted.get(id) ?? Date.now())) / 1000));
        const closeReasoning = (part: AgentReasoningPart): AgentReasoningPart => ({ ...part, streaming: false, duration: part.duration ?? secondsSince(part.id) });
        const updateParts = (change: (parts: AgentMessagePart[]) => AgentMessagePart[], status?: AgentActivityEntry['status']) =>
            setActivity((prev) => prev.map((a) => {
                if (a.id !== thinkingId) return a;
                const parts = change(a.parts ?? []);
                const detail = messagePartsText(parts);
                return { ...a, parts, ...(status ? { status } : {}), ...(detail ? { detail } : {}) };
            }));
        const upsert = (part: AgentMessagePart) => updateParts((parts) => upsertMessagePart(parts, part, closeReasoning));

        // A text part with an id of the host: the reply is then in its parts, not set again from reply.text.
        let textWithId = false;
        const onText = (partial: string, part?: AgentExecutorPartOptions) => {
            if (part?.id && part.id !== DEFAULT_TEXT_PART_ID) textWithId = true;
            upsert({ type: 'text', id: part?.id ?? DEFAULT_TEXT_PART_ID, text: partial, streaming: !part?.done });
        };
        const onReasoning = (partial: string, part?: AgentExecutorPartOptions & { duration?: number }) => {
            const id = part?.id ?? DEFAULT_REASONING_PART_ID;
            if (!reasoningStarted.has(id)) reasoningStarted.set(id, Date.now());
            upsert({
                type: 'reasoning', id, text: partial, streaming: !part?.done,
                ...(part?.duration !== undefined ? { duration: part.duration } : part?.done ? { duration: secondsSince(id) } : {}),
            });
        };
        const onStep = (step: AgentExecutorStep) => upsert({ type: 'tool', id: step.id, label: step.label, status: step.status });
        // CR-014: a card of the host in the message.
        const onCard = (card: AgentCard) => upsert({ ...card, type: 'card' });

        // The questions of this turn still waiting for their answers.
        const turnQuestions = new Set<string>();
        let questionsCount = 0;
        const rejectPendingQuestions = () => {
            for (const key of turnQuestions) {
                const pending = pendingQuestionsRef.current.get(key);
                pendingQuestionsRef.current.delete(key);
                pending?.reject(new DOMException('The turn was stopped.', 'AbortError'));
            }
            turnQuestions.clear();
        };
        controller.signal.addEventListener('abort', rejectPendingQuestions);
        const onQuestions = (questions: AgentQuestion[], part?: { id?: string }) => {
            questionsCount += 1;
            const id = part?.id ?? `questions-${questionsCount}`;
            upsert({ type: 'questions', id, questions });
            const key = `${thinkingId}:${id}`;
            if (controller.signal.aborted) return Promise.reject(new DOMException('The turn was stopped.', 'AbortError'));
            turnQuestions.add(key);
            return new Promise<AgentQuestionAnswer[]>((resolve, reject) => {
                pendingQuestionsRef.current.set(key, { resolve, reject });
            });
        };

        /** End of the turn: nothing streams any more, and answers to its questions now go to a new turn. */
        const finish = (status: AgentActivityEntry['status'], finalText?: string) => {
            updateParts((parts) => {
                const next = finalText && !textWithId
                    ? upsertMessagePart(parts, { type: 'text', id: DEFAULT_TEXT_PART_ID, text: finalText, streaming: false }, closeReasoning)
                    : parts;
                return next.map((p) => {
                    if (p.type === 'reasoning' && p.streaming) return closeReasoning(p);
                    if (p.type === 'text' && p.streaming) return { ...p, streaming: false };
                    if (p.type === 'tool' && p.status === 'running' && status !== 'done') return { ...p, status: 'stopped' as const };
                    return p;
                });
            }, status);
            controller.signal.removeEventListener('abort', rejectPendingQuestions);
            for (const key of turnQuestions) pendingQuestionsRef.current.delete(key);
            turnQuestions.clear();
        };

        const askedText = text || answers?.historyText || '';
        try {
            const back = rewoundRef.current;
            rewoundRef.current = null;
            const logNow = activityRef.current;
            const sendingAt = logNow.findIndex((entry) => entry.id === sendingRef.current);
            const rewound = back ? { activity: back.fresh ? back.activity : (sendingAt >= 0 ? logNow.slice(0, sendingAt) : logNow).filter((entry) => entry.id !== thinkingId) } : undefined;
            const reply = await executor.turn({
                params: session.params, context: session.context, text, first, signal: controller.signal,
                ...(rewound ? { rewound } : {}),
                ...(attachments?.length ? { attachments } : {}),
                ...((model || remoteModelRef.current) ? { model: model || remoteModelRef.current } : {}),
                ...(answers ? { answers: { id: answers.id, answers: answers.answers } } : {}),
                onText, onReasoning, onStep, onQuestions, onCard,
            });
            finish('done', reply.text);
            session.history = [
                ...session.history,
                ...(askedText ? [{ role: 'user' as const, content: askedText }] : []),
                { role: 'assistant' as const, content: reply.text },
            ];
            return reply.result ?? null;
        } catch (err) {
            session.history = [...session.history, ...(askedText ? [{ role: 'user' as const, content: askedText }] : [])];
            if (controller.signal.aborted) {
                finish('stopped');
                return null;
            }
            finish('error');
            setError(extractErrorMessage(err));
            return null;
        } finally {
            abortControllerRef.current = null;
        }
    };

    /**
     * CR-014: an action of a card, run by the host (`definition.onCardAction`); its outcome goes into the card
     * (saved with the chat). A rejection is the outcome `error` with its message.
     */
    const cardAction = async (entryId: string, partId: string, actionId: string): Promise<void> => {
        const entry = activityRef.current.find((a) => a.id === entryId);
        const part = entry?.parts?.find((p): p is AgentCardPart => p.type === 'card' && p.id === partId);
        const session = sessionRef.current;
        if (!part || !session || !definition.onCardAction) return;
        let outcome: AgentCardOutcome | undefined;
        try {
            outcome = await definition.onCardAction(session.params, part, actionId);
        } catch (err) {
            outcome = { status: 'error', text: extractErrorMessage(err) };
        }
        if (!outcome) return;
        setActivity((prev) => prev.map((a) => (a.id !== entryId ? a : {
            ...a, parts: a.parts?.map((p) => (p.type === 'card' && p.id === partId ? { ...p, outcome } : p)),
        })));
    };

    const answerQuestions = async (entryId: string, partId: string, answers: AgentQuestionAnswer[]): Promise<TResult | null> => {
        const entry = activityRef.current.find((a) => a.id === entryId);
        const part = entry?.parts?.find((p) => p.type === 'questions' && p.id === partId);
        if (!part || part.type !== 'questions') {
            setError(labelsRef.current.noActiveSession);
            throw new Error(labelsRef.current.noActiveSession);
        }
        const markAnswered = () => setActivity((prev) => prev.map((a) => (a.id !== entryId ? a : {
            ...a, parts: a.parts?.map((p) => (p.type === 'questions' && p.id === partId ? { ...p, answers } : p)),
        })));
        const key = `${entryId}:${partId}`;
        const pending = pendingQuestionsRef.current.get(key);
        if (pending) {
            pendingQuestionsRef.current.delete(key);
            markAnswered();
            pending.resolve(answers);
            return null;
        }
        if (runningRef.current) {
            setError(labelsRef.current.requestInProgress);
            throw new Error(labelsRef.current.requestInProgress);
        }
        if (!remote || !sessionRef.current) {
            setError(labelsRef.current.noActiveSession);
            throw new Error(labelsRef.current.noActiveSession);
        }
        runningRef.current = true;
        setRunning(true);
        setError(null);
        markAnswered();
        try {
            return await runRemoteTurn('', false, undefined, { id: partId, answers, historyText: formatQuestionAnswers(part.questions, answers) });
        } finally {
            runningRef.current = false;
            setRunning(false);
        }
    };

    /** Un turno: manda `userText` (eventualmente vuoto — vedi sotto) più la history/i tool
     * della sessione, esegue in loop i tool_calls richiesti dal modello finché non arriva un
     * turno testuale, poi ritorna il risultato parsato. `userText` vuoto significa "nessun
     * testo nuovo, si continua solo perché il turno precedente era un tool_result" — i
     * provider adapter (react/src/providers/ai/*) sanno omettere il turno finale in quel caso.
     * `aiAttachments` (allegati binari, già convertiti — vedi run()/sendMessage()) accompagna
     * SOLO la primissima chiamata al provider di questo turno: la history non ha un concetto
     * di allegato persistente per round-trip successivi, ed è comunque lì che vive il vero
     * messaggio dell'utente. `overrideModel` — vedi run()/sendMessage(): risolto localmente
     * qui (mai da `selectedModel` di stato, che potrebbe non aver ancora fatto commit). */
    const runTurn = async (userText: string, aiAttachments?: AIAttachment[], requestedModel?: string): Promise<TResult | null> => {
        // CR-010: a model of a provider the chat does not allow is never used: its first allowed one instead
        // (read from the ref: the first turn runs before the render that knows the providers of the chat).
        const allowed = catalogProvidersRef.current;
        const firstAllowed = Object.values(modelsByProvider).flat().find((model) => !allowed || allowed.includes(model.provider))?.id;
        const overrideModel = requestedModel && allowedIn(allowed, requestedModel) ? requestedModel
            : !allowedIn(allowed, catalogModel) ? firstAllowed : undefined;
        // CR-012: how much the model reasons on this provider, on every request of the turn.
        const turnRef = overrideModel ? parseAIModelRef(overrideModel) : ref;
        const level = turnRef && sessionRef.current ? executor?.catalogReasoning?.(sessionRef.current.params, turnRef.provider) : undefined;
        const reasoning = level ? { reasoning: level } : {};
        const session = sessionRef.current;
        if (!session) { setError(labelsRef.current.noActiveSession); return null; }
        const effectiveRef = overrideModel ? parseAIModelRef(overrideModel) : ref;
        const effectiveProvider = effectiveRef ? registry[effectiveRef.provider] : null;
        if (!effectiveProvider || !effectiveRef) { setError(labelsRef.current.noProviderAvailable); return null; }

        // Il ref grezzo per i tool (vedi LatestAttachmentsRef) ACCUMULA gli allegati di TUTTA
        // la conversazione, non solo del turno corrente — sovrascriverlo a ogni turno faceva
        // sparire un allegato grande (che non è mai incollato in history, vedi sotto) non
        // appena l'utente scriveva un messaggio successivo SENZA riallegare nulla: il modello si
        // ritrovava a dover chiedere "puoi riallegare il CSV?" anche se l'utente l'aveva già
        // fornito due turni prima (bug osservato). Aggiornato PRIMA di filtrare per il provider:
        // un tool deve poter leggere anche ciò che al modello non arriva mai.
        if (aiAttachments?.length) {
            session.attachmentsRef.current = [...(session.attachmentsRef.current ?? []), ...aiAttachments];
        }

        // Gli allegati binari (aiAttachments) accompagnano SOLO la chiamata live del primo
        // round-trip (vedi sotto) — il provider li traduce nel blocco nativo giusto (image/
        // document/text) per QUESTA chiamata, ma AIConversationTurn non ha un campo "allegato"
        // persistente: senza questo, il contenuto del file spariva dalla history non appena il
        // turno finiva, rendendolo irraggiungibile a qualunque sendMessage() successivo (bug
        // osservato: "gli old path sono quelli che ti ho allegato" in un turno 3 non trovava più
        // nulla). Per i mimetype testuali (CSV/TXT/JSON/...) sotto soglia, il fix è incorporare
        // lo stesso testo decodificato DENTRO il contenuto persistito in history — da lì in
        // avanti è testo normale, sopravvive a ogni turno futuro esattamente come se l'utente
        // l'avesse scritto a mano. Sopra soglia (vedi MAX_INLINE_TEXT_ATTACHMENT_BASE64_LENGTH),
        // MAI incollato: un CSV da alcuni MB manderebbe in errore l'upstream per dimensione della
        // richiesta (bug osservato) — resta raggiungibile SOLO da un tool via attachmentsRef. MA
        // un marker SENZA contenuto va comunque persistito in history anche per questi — senza,
        // il modello non ha alcuna traccia testuale che un file sia stato allegato (bug osservato:
        // un CSV di traffico reale, quasi sempre sopra soglia, veniva richiesto di nuovo
        // all'utente in un turno successivo perché "per il modello" non era mai arrivato nulla —
        // l'unico segnale della sua esistenza era la chip UI dell'allegato, che non raggiunge mai
        // il prompt). I binari (immagini, PDF) restano turn-scoped: non c'è un modo sensato di
        // "incorporarli come testo" nella history.
        const textAttachments = (aiAttachments ?? []).filter((a) => PromptUtils.isTextAttachment(a.mimeType));
        const attachmentsHistoryText = textAttachments
            .map((a) => (a.base64.length <= MAX_INLINE_TEXT_ATTACHMENT_BASE64_LENGTH
                ? `\n\n[File allegato: ${a.name}]\n${PromptUtils.decodeBase64Text(a.base64)}`
                : `\n\n[File allegato: ${a.name} — troppo grande per essere incollato qui. Usa uno dei tool di lettura file disponibili (es. list_csv_columns/extract_csv_column) per leggerne il contenuto prima di chiedere altro all'utente.]`))
            .join('');
        const inlineAttachments = filterInlineAttachments(aiAttachments ?? []);

        // t.inputSchema è Zod (sorgente unica) — il provider AI parla JSON Schema sul wire
        // come ogni function-calling API: questo è l'unico punto in cui la forma serializzata
        // serve davvero (vedi mcpTool.ts).
        const toolDefs = session.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: toJsonSchema(t.inputSchema) }));

        /** The approval of the person for one call (CR-008): a question in a message of its own, docked at
         * the bottom of the chat until they answer; a stop rejects it. */
        const askApproval = (callId: string, tool: AgentTool, input: Record<string, unknown>, signal: AbortSignal): Promise<ApprovalDecision> => {
            const t = labelsRef.current;
            const entryId = `approval-${callId}`;
            const action = tool.describeApproval?.(input) ?? tool.describeInvocation?.(input) ?? tool.name;
            setActivity((prev) => [...prev, {
                id: entryId, kind: 'thinking', label: t.approvalHeader, status: 'running',
                parts: [{ type: 'questions', id: APPROVAL_PART_ID, questions: [{ header: t.approvalHeader, question: t.approveQuestion.replace('{action}', action), options: [{ label: t.approve }, { label: t.reject }], custom: true }] }],
            }]);
            const key = `${entryId}:${APPROVAL_PART_ID}`;
            return new Promise<ApprovalDecision>((resolve, reject) => {
                const stopped = () => {
                    pendingQuestionsRef.current.delete(key);
                    setEntryStatus(entryId, 'stopped');
                    reject(new DOMException('The turn was stopped.', 'AbortError'));
                };
                if (signal.aborted) { stopped(); return; }
                signal.addEventListener('abort', stopped, { once: true });
                pendingQuestionsRef.current.set(key, {
                    resolve: (answers) => {
                        signal.removeEventListener('abort', stopped);
                        setEntryStatus(entryId, 'done');
                        resolve(approvalOf(answers, t.approve, t.reject));
                    },
                    reject,
                });
            });
        };
        const toolsByName = new Map(session.tools.map((t) => [t.name, t]));

        const controller = new AbortController();
        abortControllerRef.current = controller;

        /** Aggiorna una voce di activity per id — usata sia per il turno "sto pensando" di
         * ogni round sia per le singole tool call. */
        const setEntryStatus = (id: string, status: AgentActivityEntry['status'], detail?: string, toolNames?: string[]) =>
            setActivity((prev) => prev.map((a) => (a.id === id ? {
                ...a, status,
                ...(detail !== undefined ? { detail } : {}),
                ...(toolNames !== undefined ? { toolNames } : {}),
            } : a)));

        try {
            let history = session.history;
            let promptText = userText;

            for (let roundTrip = 0; roundTrip < MAX_TOOL_ROUNDTRIPS; roundTrip++) {
                // Un turno "sto pensando" per OGNI chiamata al modello, non solo per le tool
                // call — prima l'attesa della risposta AI (spesso la più lunga, specie tra un
                // round di tool e il successivo) non aveva nessun indicatore visibile.
                const thinkingId = crypto.randomUUID();
                setActivity((prev) => [...prev, { id: thinkingId, kind: 'thinking', label: labelsRef.current.thinking, status: 'running' }]);

                // provider.complete() può sia risolvere a `null` (fetch.ts inghiotte molti
                // errori di rete e li normalizza così) SIA rigettare (es. il dev-proxy
                // risponde con uno status non-ok quando la connessione a monte viene
                // interrotta da un abort — capita spesso con un errore "CORS"-shaped invece
                // di un pulito AbortError). Un try/catch qui è obbligatorio: senza, un throw
                // scavalca l'aggiornamento della voce "sto pensando", che resta bloccata su
                // "running" per sempre — esattamente il sintomo di un abort non gestito.
                let result;
                try {
                    result = await effectiveProvider.complete({
                        prompt: promptText,
                        model: effectiveRef.model,
                        ...reasoning,
                        history,
                        tools: toolDefs.length ? toolDefs : undefined,
                        signal: controller.signal,
                        attachments: roundTrip === 0 ? inlineAttachments : undefined,
                        logId: session.logId,
                    });
                } catch (err) {
                    // Must include the pending user turn, not just `history` as of the START of
                    // this round — otherwise a failure on round 0 (the common case: provider
                    // rate-limited/unavailable) leaves `session.history` at `[]`, and the next
                    // sendMessage('Riprova.') from Agentico.tsx's retry button finds no trace of
                    // the original goal or its orchestrator prompt. The model then sees only
                    // "Riprova." + the tool catalog, with nothing to retry — hence answering as
                    // a fresh, contextless assistant instead of resuming the actual request.
                    session.history = [
                        ...history,
                        ...(promptText ? [{ role: 'user' as const, content: promptText + attachmentsHistoryText }] : []),
                    ];
                    if (controller.signal.aborted) {
                        // Niente setError qui: la voce di activity già dice "Interrotto
                        // dall'utente." con l'icona giusta — un secondo messaggio identico
                        // sotto sarebbe una pura duplicazione.
                        setEntryStatus(thinkingId, 'stopped');
                        return definition.fallback(session.params, session.context);
                    }
                    setEntryStatus(thinkingId, 'error');
                    setError(extractErrorMessage(err));
                    return null;
                }
                // Persisti la history maturata FINORA (inclusi eventuali round-trip di tool già
                // eseguiti con effetti reali) prima di ritornare — altrimenti un sendMessage()
                // successivo riparte dalla history pre-turno, "dimenticando" tool call già
                // avvenute e rischiando di farle rieseguire dal modello. Include anche il turno
                // utente pendente di QUESTO round (stesso motivo del ramo catch sopra) — se
                // `result` risulta falsy sotto, questa è l'ultima history persistita prima del
                // return, e deve comunque contenere cosa l'utente ha chiesto in questo round.
                session.history = [
                    ...history,
                    ...(promptText ? [{ role: 'user' as const, content: promptText + attachmentsHistoryText }] : []),
                ];

                if (!result) {
                    if (controller.signal.aborted) {
                        setEntryStatus(thinkingId, 'stopped');
                        return definition.fallback(session.params, session.context);
                    }
                    setEntryStatus(thinkingId, 'error');
                    setError(labelsRef.current.noProviderResponse);
                    return null;
                }

                if (result.type === 'text') {
                    setEntryStatus(thinkingId, 'done', result.text);
                    // A conversational agent (CR-007): the reply is a message of the chat, a text
                    // part of the turn like that of a remote agent, not a detail under "response received".
                    if (definition.conversational && result.text.trim()) {
                        setActivity((prev) => prev.map((a) => (a.id === thinkingId ? { ...a, parts: [{ type: 'text', id: 'text', text: result.text }] } : a)));
                    }
                    session.history = [
                        ...history,
                        ...(promptText ? [{ role: 'user' as const, content: promptText + attachmentsHistoryText }] : []),
                        { role: 'assistant' as const, content: result.text },
                    ];
                    const parsed = definition.parseResponse(result.text, session.params, session.context);
                    if (!parsed) {
                        // `parseResponse` non riporta MAI il motivo esatto (ogni subagent ha il
                        // proprio parser/schema — vedi es. parseRedirectsResponse, che logga già
                        // l'errore di JSON.parse specifico prima di arrivare qui) — questo è il
                        // log generico, comune a QUALUNQUE subagent, che risponde alla domanda
                        // "cosa ha scritto davvero il modello?" senza dover riprodurre la
                        // conversazione. Preview head/tail (non il testo intero, potenzialmente
                        // enorme — es. centinaia di redirect) perché un troncamento upstream
                        // (limite di token in output) si vede quasi sempre alla FINE della
                        // risposta, non all'inizio.
                        console.error(
                            '[useAgent] parseResponse ha restituito null — la risposta del modello non è nel formato atteso da questo subagent. Uso il fallback deterministico.',
                            {
                                responseLength: result.text.length,
                                responsePreview: result.text.length > 2000
                                    ? `${result.text.slice(0, 1000)}\n…[troncato qui nel log, ${result.text.length} caratteri totali]…\n${result.text.slice(-1000)}`
                                    : result.text,
                                params: session.params,
                            },
                        );
                        setError(labelsRef.current.invalidResponse);
                        return definition.fallback(session.params, session.context);
                    }
                    return parsed;
                }

                // Etichette deterministiche (mai narrate dal modello) dei tool che sta per
                // invocare. Due testi distinti per due righe distinte, non lo stesso
                // riciclato — altrimenti il turno "sto pensando" e la tool call subito sotto
                // dicono LETTERALMENTE la stessa frase, una sopra l'altra (il difetto
                // segnalato: "Eseguo: Ricontrollo https://…" seguito da "Ricontrollo
                // https://…"): describeIntent (scopo generale, no parametri) per la riga "sto
                // pensando" quando non ha scritto testo libero; describeInvocation (con i
                // parametri della chiamata specifica) per la riga della singola tool call.
                const toolIntentLabels = result.toolCalls.map((call) => {
                    const tool = toolsByName.get(call.name);
                    return tool?.describeIntent ?? tool?.describeInvocation?.(call.input) ?? `Chiamata: ${call.name}`;
                });
                setEntryStatus(thinkingId, 'done', result.text || undefined, result.text ? undefined : toolIntentLabels);

                // The tools that need the approval of the person (CR-008): asked one at a time, before
                // any tool of this round runs. A stop while waiting ends the turn like any other.
                const decisions = new Map<string, ApprovalDecision>();
                for (const call of result.toolCalls) {
                    const tool = toolsByName.get(call.name);
                    if (!tool || !needsApproval(tool, call.input)) continue;
                    try {
                        decisions.set(call.id, await askApproval(call.id, tool, call.input, controller.signal));
                    } catch {
                        return definition.fallback(session.params, session.context);
                    }
                }

                const toolResults: AIToolResult[] = await Promise.all(result.toolCalls.map(async (call) => {
                    const tool = toolsByName.get(call.name);
                    const label = tool?.describeInvocation?.(call.input) ?? `Chiamata: ${call.name}`;
                    const decision = decisions.get(call.id);
                    if (decision && !decision.approved) {
                        setActivity((prev) => [...prev, { id: call.id, kind: 'tool', label, status: 'stopped' }]);
                        const output = getAgenticoPrompts().toolRejected.replace('{reason}', decision.reason ? ` (${decision.reason})` : '');
                        return { toolCallId: call.id, name: call.name, output, isError: true };
                    }
                    setActivity((prev) => [...prev, { id: call.id, kind: 'tool', label, status: 'running' }]);

                    if (!tool) {
                        setEntryStatus(call.id, 'error');
                        return { toolCallId: call.id, name: call.name, output: `Tool sconosciuto: ${call.name}`, isError: true };
                    }
                    try {
                        const output = await tool.execute(call.input);
                        setEntryStatus(call.id, 'done');
                        // CR-014: what the tool prepared, as a card of the chat with its actions.
                        const card = tool.card?.(call.input, output);
                        if (card) setActivity((prev) => [...prev, { id: `card-${call.id}`, kind: 'thinking', label: '', status: 'done', parts: [{ ...card, type: 'card' }] }]);
                        return { toolCallId: call.id, name: call.name, output };
                    } catch (err) {
                        setEntryStatus(call.id, 'error');
                        return { toolCallId: call.id, name: call.name, output: extractErrorMessage(err), isError: true };
                    }
                }));

                history = [
                    ...history,
                    ...(promptText ? [{ role: 'user' as const, content: promptText + attachmentsHistoryText }] : []),
                    { role: 'assistant' as const, content: result.text, toolCalls: result.toolCalls },
                    { role: 'tool_result' as const, results: toolResults },
                ];
                promptText = '';
            }

            // Budget esaurito ma il modello voleva ancora invocare tool: il lavoro fatto finora
            // (i risultati dei tool già eseguiti sono già in `history`) non va buttato via con
            // un errore secco — un ultimo turno SENZA tool disponibili forza una risposta
            // finale usando tutto quello raccolto fino a qui.
            const closingId = crypto.randomUUID();
            setActivity((prev) => [...prev, { id: closingId, kind: 'thinking', label: labelsRef.current.thinking, status: 'running' }]);
            let closingResult;
            try {
                closingResult = await effectiveProvider.complete({
                    ...reasoning,
                    // Anche questo turno passa dai micro-prompt (vedi run()/sendMessage() sopra)
                    // — altrimenti un run che esaurisce il budget di round-trip (tanti tool_calls
                    // di fila, es. molti URL di font/asset da ricontrollare) salta il riepilogo
                    // finale senza che nessuno se ne accorga: era esattamente questo il path che
                    // lo perdeva, non un rifiuto del modello.
                    prompt: applyMicroPrompts(
                        getAgenticoPrompts().stopCallingTools,
                        definition.microPromptIds,
                    ),
                    model: effectiveRef.model,
                    history,
                    signal: controller.signal,
                    logId: session.logId,
                });
            } catch {
                closingResult = null;
            }
            if (closingResult?.type === 'text') {
                setEntryStatus(closingId, 'done', closingResult.text);
                session.history = [...history, { role: 'assistant', content: closingResult.text }];
                const parsed = definition.parseResponse(closingResult.text, session.params, session.context);
                if (parsed) return parsed;
            } else {
                setEntryStatus(closingId, controller.signal.aborted ? 'stopped' : 'error');
                session.history = history;
            }

            // Niente setError se interrotto dall'utente: la voce di activity già dice
            // "Interrotto dall'utente." con l'icona giusta, un secondo messaggio sotto
            // sarebbe una pura duplicazione.
            if (!controller.signal.aborted) {
                setError(labelsRef.current.tooManyToolTurns);
            }
            return definition.fallback(session.params, session.context);
        } finally {
            abortControllerRef.current = null;
        }
    };

    const run = async (params: TParams, opts?: { attachments?: File[]; model?: string; openingMessage?: string }): Promise<TResult | null> => {
        if (runningRef.current) { setError(labelsRef.current.requestInProgress); return null; }
        runningRef.current = true;
        setError(null);
        // Stesso trattamento del testo di sendMessage() sotto — mostrato subito, prima di
        // aspettare la risposta, cosi il messaggio che ha avviato la conversazione non "scompare"
        // dal log (vedi il commento su opts.openingMessage in UseAgentResult.run).
        setActivity(opts?.openingMessage
            ? [{
                id: crypto.randomUUID(), kind: 'user', label: 'Tu', status: 'done', detail: opts.openingMessage,
                ...(authorRef.current ? { author: authorRef.current } : {}),
                ...(opts.attachments?.length ? { attachmentNames: opts.attachments.map((f) => f.name) } : {}),
              }]
            : []);
        setRunning(true);
        try {
            const context = await definition.buildContext(params);
            const attachmentsRef: LatestAttachmentsRef = { current: undefined };
            const tools = definition.getTools?.(params, context, attachmentsRef) ?? [];
            sessionRef.current = { params, context, tools, history: [], logId: crypto.randomUUID(), attachmentsRef };

            if (remote) {
                setCanContinue(true);
                offerRemoteModels(params);
                return await runRemoteTurn(opts?.openingMessage ?? '', true, undefined, undefined, await filesFor(opts?.attachments));
            }
            if (alongside) {
                offerRemoteModels(params);
                remoteStartedRef.current = false;
                const picked = opts?.model || remoteModelRef.current;
                if (isRemoteModel(picked)) {
                    setCanContinue(true);
                    remoteStartedRef.current = true;
                    return await runRemoteTurn(opts?.openingMessage ?? '', true, picked, undefined, await filesFor(opts?.attachments));
                }
            }

            const overrideModel = opts?.model || undefined;
            const hasProvider = overrideModel ? Boolean(registry[parseAIModelRef(overrideModel)?.provider ?? '']) : Boolean(provider);
            if (!enabled || !hasProvider) {
                setCanContinue(false);
                const fallbackResult = definition.fallback(params, context);
                // Stessa conferma di runFallback() (vedi describeFallback) — senza, un run con
                // AI disabilitata a priori (es. ManualEntryRunner) produrrebbe il risultato ma
                // zero riga di log a dirlo: indistinguibile da "non è successo niente" finché
                // non arriva panelExtra (bug della stessa famiglia di quello risolto in
                // runFallback, qui sul percorso "mai nemmeno tentato" invece che "fallito").
                setActivity((prev) => [...prev, {
                    id: crypto.randomUUID(), kind: 'tool', status: 'done',
                    label: definition.describeFallback?.(fallbackResult) ?? labelsRef.current.aiDisabledFallback,
                }]);
                return fallbackResult;
            }

            setCanContinue(true);
            const aiAttachments = opts?.attachments?.length
                ? await Promise.all(opts.attachments.map((file) => PromptUtils.fileToAttachment(file)))
                : undefined;
            const prompt = applyMicroPrompts(definition.buildPrompt(params, context), definition.microPromptIds);
            return await runTurn(prompt, aiAttachments, overrideModel);
        } catch (err) {
            setError(extractErrorMessage(err));
            return null;
        } finally {
            runningRef.current = false;
            setRunning(false);
        }
    };

    const resume = async (params: TParams, seed: { history: AIConversationTurn[]; activity: AgentActivityEntry[] }): Promise<void> => {
        if (runningRef.current) { setError(labelsRef.current.requestInProgress); return; }
        runningRef.current = true;
        setError(null);
        // A chat saved while a turn ran (and left: the page reloaded, the server went away) shows that turn as
        // stopped, not as one still at work: nothing runs it any more.
        setActivity(settleActivity(seed.activity));
        // `running`, come in run() — buildContext() per theme rifà una vera fetch di rete
        // (extractSiteSnapshot): senza, `task.agent.running` resterebbe falsamente `false` per
        // tutta quella finestra, e qualunque logica che vi si affida (spinner del composer,
        // un dismiss/replace concorrente che si fida di "running" per non interrompere un
        // lavoro in corso) lo leggerebbe come già inattivo mentre sta ancora lavorando.
        setRunning(true);
        try {
            const context = await definition.buildContext(params);
            const attachmentsRef: LatestAttachmentsRef = { current: undefined };
            const tools = definition.getTools?.(params, context, attachmentsRef) ?? [];
            sessionRef.current = { params, context, tools, history: seed.history, logId: crypto.randomUUID(), attachmentsRef };
            if (remote || alongside) offerRemoteModels(params);
            // A chat reopened: the executor of an alongside agent starts again at its next turn.
            remoteStartedRef.current = false;
            setCanContinue(remote || alongside || (enabled && Boolean(provider)));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            runningRef.current = false;
            setRunning(false);
        }
    };

    const sendMessage = async (text: string, opts?: { attachments?: File[]; model?: string; retry?: boolean }): Promise<TResult | null> => {
        if (runningRef.current) { setError(labelsRef.current.requestInProgress); return null; }
        setError(null);
        if (!text.trim()) { setError('Messaggio vuoto.'); return null; }
        const session = sessionRef.current;
        if (!session) { setError(labelsRef.current.noActiveSession); return null; }
        runningRef.current = true;
        setRunning(true);
        // Mostrato subito, prima di aspettare la risposta — è quello che l'utente ha appena
        // scritto, non c'è nulla da attendere per saperlo (a differenza del turno "sto
        // pensando" del modello, che invece parte vuoto e si riempie solo a risposta arrivata).
        const messageId = crypto.randomUUID();
        sendingRef.current = messageId;
        setActivity((prev) => [...prev, {
            id: messageId, kind: 'user', label: 'Tu', status: 'done', detail: text,
            ...(authorRef.current ? { author: authorRef.current } : {}),
            ...(opts?.attachments?.length ? { attachmentNames: opts.attachments.map((f) => f.name) } : {}),
            // Sent by the Retry button, not written by the person: never the title of the chat.
            ...(opts?.retry ? { retry: true } : {}),
            // CR-016: where the chat goes back to when the person retries or edits this message.
            historyAt: session.history.length,
        }]);
        try {
            if (remote) return await runRemoteTurn(text, false, opts?.model || undefined, undefined, await filesFor(opts?.attachments));
            // Alongside the AI catalog (CR-009): a model of the executor sends the turn to it.
            const picked = opts?.model || (alongside ? remoteModelRef.current : '');
            if (alongside && isRemoteModel(picked)) {
                const first = !remoteStartedRef.current;
                remoteStartedRef.current = true;
                return await runRemoteTurn(text, first, picked, undefined, await filesFor(opts?.attachments));
            }
            // A turn on the AI catalog after a rewind: the executor, when picked again, starts from the log as it is then.
            if (rewoundRef.current) rewoundRef.current = { ...rewoundRef.current, fresh: false };
            const aiAttachments = opts?.attachments?.length
                ? await Promise.all(opts.attachments.map((file) => PromptUtils.fileToAttachment(file)))
                : undefined;
            const prompt = applyMicroPrompts(definition.buildFollowUpPrompt(text, session.params, session.context), definition.microPromptIds);
            return await runTurn(prompt, aiAttachments, opts?.model || undefined);
        } catch (err) {
            setError(extractErrorMessage(err));
            return null;
        } finally {
            runningRef.current = false;
            setRunning(false);
        }
    };

    /** CR-016: takes the chat back to a message of the person and sends it again (`text`: edited). Whatever
     * came after it goes, from the chat and from the history of the model; an executor starts again from
     * the chat as it is then. Refused while a turn runs, or on a message without `historyAt`. */
    /** Where the history goes back to for a message of the person: its `historyAt`; on a message sent before
     * 0.15.0 (or the opening one), the turn of the person in the history with its text, the same occurrence.
     * None: no going back. */
    const rewindPoint = (entryId: string): number | undefined => {
        const session = sessionRef.current;
        const index = activity.findIndex((entry) => entry.id === entryId);
        const entry = activity[index];
        const text = entry?.detail?.trim();
        if (!canRewind || !session || !entry || entry.kind !== 'user' || !text) return undefined;
        if (entry.historyAt !== undefined) return entry.historyAt;
        const occurrence = activity.slice(0, index).filter((item) => item.kind === 'user' && item.detail?.trim() === text).length;
        let seen = 0;
        for (let at = 0; at < session.history.length; at += 1) {
            const turn = session.history[at];
            if (turn.role !== 'user' || !turn.content.includes(text)) continue;
            if (seen === occurrence) return at;
            seen += 1;
        }
        // The last message of the person, never recorded (the chat was saved while its turn ran, and the turn
        // was left): nothing after it is in the history either, so the chat goes back to the end of it.
        const last = activity.map((item) => item.kind === 'user').lastIndexOf(true);
        return index === last ? session.history.length : undefined;
    };
    const rewindable = (entryId: string) => rewindPoint(entryId) !== undefined;

    const rewind = async (entryId: string, text?: string): Promise<TResult | null> => {
        if (runningRef.current) { setError(labelsRef.current.requestInProgress); return null; }
        const session = sessionRef.current;
        const index = activity.findIndex((entry) => entry.id === entryId);
        const entry = activity[index];
        const point = rewindPoint(entryId);
        if (!session || !entry || point === undefined) return null;
        const message = (text ?? entry.detail ?? '').trim();
        if (!message) return null;
        const before = activity.slice(0, index);
        session.history = session.history.slice(0, point);
        rewoundRef.current = { activity: before, fresh: true };
        setActivity(before);
        // The same model as the message had: a chat on an executor stays there.
        return sendMessage(message);
    };

    const runFallback = (): TResult | null => {
        const session = sessionRef.current;
        if (!session) return null;
        setError(null);
        const result = definition.fallback(session.params, session.context);
        // kind 'tool', non 'thinking' — thinkingDisplayLabel (AgentActivityLog.tsx) ricalcola
        // sempre la sua etichetta da status/detail per i turni "sto pensando" (mai quella
        // passata qui), mentre le righe 'tool' mostrano `label` verbatim: esattamente la resa
        // semplice "icona + una frase" che serve per una singola riga di log deterministica.
        // `describeFallback` (se l'agente lo implementa) sostituisce l'etichetta generica con
        // una specifica al risultato appena prodotto — vedi il commento su
        // AgentDefinition.describeFallback per il perché serve DAVVERO per l'orchestratore
        // (senza, il suo messaggio di fallback sparirebbe senza che l'utente lo veda mai).
        setActivity((prev) => [...prev, {
            id: crypto.randomUUID(), kind: 'tool', status: 'done',
            label: definition.describeFallback?.(result) ?? labelsRef.current.continueWithoutAiFallback,
        }]);
        return result;
    };

    // Non un useCallback — deve chiudere sempre su `activity`/`sessionRef` del render CORRENTE,
    // letta però solo quando qualcuno la invoca davvero (un salvataggio, evento raro innescato
    // dall'utente, non un percorso caldo): niente da memoizzare, il costo di ricrearla ad ogni
    // render è trascurabile.
    const snapshot = (): { history: AIConversationTurn[]; activity: AgentActivityEntry[] } | null => (
        sessionRef.current ? { history: sessionRef.current.history, activity } : null
    );

    return {
        enabled, setEnabled, hasProviders,
        // A remote executor picks among its own models, not the AI catalog of the app; alongside the
        // catalog (CR-009), a model of either.
        selectedModel: remote ? remoteModel : alongside && remoteModel ? remoteModel : catalogModel,
        setSelectedModel: remote ? setRemoteModel : alongside
            ? (id: string) => {
                if (isRemoteModel(id)) setRemoteModel(id);
                else {
                    setRemoteModel('');
                    setSelectedModel(id);
                }
            }
            : setSelectedModel,
        modelsByProvider: offeredCatalog, modelsLoading, running, error, canContinue, remote, remoteModels, alongside,
        ...(executor?.catalogGroup ? { catalogGroup: executor.catalogGroup } : {}),
        activity, run, resume, sendMessage, stop, runFallback, snapshot, answerQuestions, cardAction, rewind, canRewind, rewindable, executorAttachments,
        // CR-015: whether "Continue without AI" is offered when the model fails.
        offersFallback: definition.offersFallback !== false,
    };
}
