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
import { useEffect, useRef, useState } from 'react';
import { parseAIModelRef, PromptUtils, useAIProviderRegistry } from '@llmnative/react';
import type { AIAttachment, AIConversationTurn, AIModelDescriptor, AIProviderAdapter, AIToolResult } from '@llmnative/react';
import type { AgentDefinition, AgentTool, LatestAttachmentsRef } from '../domain/agentDefinition';
import { extractErrorMessage } from '../domain/extractErrorMessage';
import { applyMicroPrompts } from '../domain/microPrompts';
import { toJsonSchema } from '../domain/mcpTool';
import { useAIModelCatalog } from './useAIModelCatalog';
import { getAgenticoPrompts } from '../domain/prompts';
import { useAgenticoI18n } from '../i18n';

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
    sendMessage: (text: string, opts?: { attachments?: File[]; model?: string }) => Promise<TResult | null>;
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
}

/** Solo la fetta di UseAgentResult che serve a un consumer del pannello globale (Agentico.tsx)
 * per continuare una conversazione già avviata da run() — TParams non compare in nessuno dei
 * membri qui sotto, quindi `never` è innocuo. */
export type AgentConversation<TResult> = Pick<UseAgentResult<never, TResult>, 'canContinue' | 'running' | 'error' | 'activity' | 'sendMessage' | 'stop' | 'runFallback' | 'snapshot'>;

export function useAgent<TParams, TContext, TResult>(
    definition: AgentDefinition<TParams, TContext, TResult>,
    options: { defaultEnabled?: boolean } = {},
): UseAgentResult<TParams, TResult> {
    const { defaultEnabled = false } = options;
    const [enabled, setEnabled]     = useState(defaultEnabled);
    const { hasProviders, modelsByProvider, modelsLoading, selectedModel, setSelectedModel } = useAIModelCatalog();
    const [running, setRunning]     = useState(false);
    const [error, setError]         = useState<string | null>(null);
    const [canContinue, setCanContinue] = useState(false);
    const [activity, setActivity] = useState<AgentActivityEntry[]>([]);
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
    // Il turno in corso (se c'è) — stop() lo annulla. Un ref, non state: creato e distrutto
    // dentro runTurn, mai il motivo di un render.
    const abortControllerRef = useRef<AbortController | null>(null);
    const stop = () => { abortControllerRef.current?.abort(); };

    // Il catalogo modelli (fetch, selezione di default) vive in useAIModelCatalog — condiviso
    // con AgenticoStarterComposer (Agentico.tsx), che ne ha bisogno PRIMA che esista una
    // sessione useAgent. Qui serve solo il registry grezzo per risolvere provider/ref.
    const registry: Record<string, AIProviderAdapter> = useAIProviderRegistry()?.registry ?? {};

    const ref = enabled && selectedModel ? parseAIModelRef(selectedModel) : null;
    const provider = ref ? registry[ref.provider] : null;

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
    const runTurn = async (userText: string, aiAttachments?: AIAttachment[], overrideModel?: string): Promise<TResult | null> => {
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

                const toolResults: AIToolResult[] = await Promise.all(result.toolCalls.map(async (call) => {
                    const tool = toolsByName.get(call.name);
                    const label = tool?.describeInvocation?.(call.input) ?? `Chiamata: ${call.name}`;
                    setActivity((prev) => [...prev, { id: call.id, kind: 'tool', label, status: 'running' }]);

                    if (!tool) {
                        setEntryStatus(call.id, 'error');
                        return { toolCallId: call.id, name: call.name, output: `Tool sconosciuto: ${call.name}`, isError: true };
                    }
                    try {
                        const output = await tool.execute(call.input);
                        setEntryStatus(call.id, 'done');
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
                ...(opts.attachments?.length ? { attachmentNames: opts.attachments.map((f) => f.name) } : {}),
              }]
            : []);
        setRunning(true);
        try {
            const context = await definition.buildContext(params);
            const attachmentsRef: LatestAttachmentsRef = { current: undefined };
            const tools = definition.getTools?.(params, context, attachmentsRef) ?? [];
            sessionRef.current = { params, context, tools, history: [], logId: crypto.randomUUID(), attachmentsRef };

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
        setActivity(seed.activity);
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
            setCanContinue(enabled && Boolean(provider));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            runningRef.current = false;
            setRunning(false);
        }
    };

    const sendMessage = async (text: string, opts?: { attachments?: File[]; model?: string }): Promise<TResult | null> => {
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
        setActivity((prev) => [...prev, {
            id: crypto.randomUUID(), kind: 'user', label: 'Tu', status: 'done', detail: text,
            ...(opts?.attachments?.length ? { attachmentNames: opts.attachments.map((f) => f.name) } : {}),
        }]);
        try {
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
        enabled, setEnabled, hasProviders, selectedModel, setSelectedModel,
        modelsByProvider, modelsLoading, running, error, canContinue, activity, run, resume, sendMessage, stop, runFallback, snapshot,
    };
}
