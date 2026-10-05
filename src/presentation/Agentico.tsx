import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton, Badge, Chatbot, Dropdown, DropdownItem, Icon, interpolate } from '@llmnative/react';
import type { AIModelDescriptor, ChatbotModelOption } from '@llmnative/react';
import { useAgentico } from './AgenticoContext';
import { AgentActivityLog } from './AgentActivityLog';
import { AgenticoToggle } from './AgenticoToggle';
import { OrchestratorRunner } from './OrchestratorRunner';
import { SubagentRunner } from './SubagentRunner';
import { ManualEntryRunner } from './ManualEntryRunner';
import { ORCHESTRATOR_TASK_ID } from './AgenticoContext';
import type { AgenticoTask } from './AgenticoContext';
import { useAgenticoI18n } from '../i18n';
import { useAIModelCatalog } from './useAIModelCatalog';
import type { SubagentUsageCard } from '../domain/subagentUsageCard';
import { findSubagentManifest } from '../domain/subagentRegistry';
import { listEntityChats } from '../domain/entityChatStore';

/** Larghezza fissa del pannello — passata anche come `rightInset` alle Modal che devono
 * lasciargli spazio invece di sovrapporlo (vedi Modal.rightInset nel framework). */
export const AGENTICO_WIDTH = 420;

/** `modelsByProvider` di useAgent è raggruppato per provider — Chatbot vuole una lista
 * piatta `{label, value, pricing, group}`, stesso appiattimento che il framework fa internamente
 * in usePromptCapabilities per il proprio model picker (Prompt.tsx). `group` = nome del provider
 * (header sticky nel picker), quindi `label` è solo il modello. `pricing: null` = prezzo
 * cercato ma non trovato: il picker lo segnala sulla riga invece di tacere. */
function flattenModelOptions(modelsByProvider: Record<string, AIModelDescriptor[]>): ChatbotModelOption[] {
    return Object.values(modelsByProvider).flat().map((m) => ({
        label: m.model,
        value: m.id,
        pricing: m.pricing ?? null,
        group: m.providerLabel ?? m.provider,
    }));
}

/** Composer del follow-up — monta `Chatbot` (CR-071, `@llmnative/react`): stesso widget di
 * `Prompt` in modalità RUN, ma qui il testo digitato è esattamente quello inviato a ogni
 * turno (nessun template autorato/campo risultato separato — quella semantica resta
 * specifica di Prompt). Chatbot si limita a raccogliere testo/allegati/modello e a
 * restituirli via `onSubmit`; la "politica" di cosa farne — chiamare `agent.sendMessage`,
 * accodare il risultato alla history — resta qui, mai responsabilità di Chatbot. */
function AgenticoComposer({ task }: { task: AgenticoTask }) {
    const t = useAgenticoI18n();
    const [text, setText] = useState('');
    const { agent, onApplied, manualEntry } = task;
    const running = agent.running;

    const handleSubmit = (payload: { text: string; files: File[]; model: string }) => {
        setText('');
        // Percorso "senza AI" (vedi ManualEntryRunner/SubagentManifest.manualEntry) — il testo
        // costruisce i parametri DIRETTAMENTE, mai una chiamata al modello: niente
        // agent.sendMessage qui, `manualEntry.onSubmit` gestisce tutto (run con AI disabilitata,
        // auto-apply, log). Allegati/modello ignorati in questo ramo — non c'è alcuna chiamata
        // AI a cui passarli.
        if (manualEntry) { manualEntry.onSubmit(payload.text); return; }
        void agent.sendMessage(payload.text, { attachments: payload.files, model: payload.model }).then((result) => {
            if (result) onApplied(result);
        });
    };

    // BUG FISSATO: senza questa condizione, `selectedModel === ''` (nessun default automatico
    // più, vedi useAIModelCatalog.ts) non impediva comunque l'invio — il messaggio partiva con
    // `model: ''`, e `AIProvider.complete()` (framework, shared.ts:242, `request.model ||
    // this.defaultModel`) rimetteva dentro il default hardcoded silenziosamente, vanificando la
    // scelta esplicita richiesta all'utente. Bloccare qui l'invio finché un provider esiste ma
    // nessun modello è ancora selezionato è l'unico modo per far sì che quel fallback non scatti
    // mai più nei flussi Agentico. Nessuna chiamata AI in un task `manualEntry` (vedi handleSubmit
    // sopra): la scelta modello non ha senso qui, non deve mai bloccare l'invio.
    const modelRequired = !manualEntry && agent.hasProviders && !agent.selectedModel;

    return (
        <Chatbot
            value={text}
            onChange={setText}
            placeholder={manualEntry?.prompt ?? t.messagePlaceholder}
            running={running}
            onStop={agent.stop}
            disabled={!text.trim() || modelRequired}
            onSubmit={handleSubmit}
            attachments={!manualEntry}
            models={manualEntry ? [] : flattenModelOptions(agent.modelsByProvider)}
            selectedModel={manualEntry ? '' : agent.selectedModel}
            onModelChange={agent.setSelectedModel}
            modelPlaceholder={t.selectModelPlaceholder}
            minHeight={44}
            maxHeight={220}
        />
    );
}

/** Il composer quando non c'è ancora un task attivo — il testo AVVIA una conversazione
 * (useAgentico().startOrchestrator) invece di proseguirla, quindi non c'è ancora un `agent`
 * da cui leggere il catalogo modelli: usa useAIModelCatalog direttamente (stessa fonte dati
 * di useAgent, vedi quel file) cosi la scelta del modello è possibile ANCHE prima che
 * l'orchestratore parta, non solo nei turni di follow-up. */
function AgenticoStarterComposer() {
    const { startOrchestrator } = useAgentico();
    const t = useAgenticoI18n();
    const [text, setText] = useState('');
    const { hasProviders, modelsByProvider, selectedModel, setSelectedModel } = useAIModelCatalog();

    const handleSubmit = (payload: { text: string; files: File[]; model: string }) => {
        if (!payload.text.trim()) return;
        startOrchestrator(payload.text.trim(), {
            attachments: payload.files.length > 0 ? payload.files : undefined,
            model: payload.model || undefined,
        });
        setText('');
    };

    // Stesso motivo di AgenticoComposer sopra: senza questo, l'avvio partirebbe con
    // `model: undefined` e farebbe scattare comunque il default hardcoded del provider dentro
    // AIProvider.complete().
    const modelRequired = hasProviders && !selectedModel;

    return (
        <Chatbot
            value={text}
            onChange={setText}
            placeholder={t.orchestratorStarterPlaceholder}
            disabled={!text.trim() || modelRequired}
            onSubmit={handleSubmit}
            attachments
            models={flattenModelOptions(modelsByProvider)}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            modelPlaceholder={t.selectModelPlaceholder}
            minHeight={44}
            maxHeight={220}
        />
    );
}

/** Card "pronto per una nuova istanza di X" — render deterministico della stessa
 * SubagentUsageCard passata al modello via pageContext (vedi useAgenticoPageContext, usata da
 * pagine come redirects/ToolPage.tsx), qui come lista scansionabile di campi invece che come
 * frase di prosa: un
 * badge required/optional per campo, non un paragrafo da cui l'utente (o un LLM) deve dedurre
 * cosa serve davvero. Sostituisce il vecchio `<p>{pageContext}</p>` SOLO quando c'è una card —
 * altrove resta il testo semplice (vedi il chiamante). */
function SubagentUsageCardView({ card }: { card: SubagentUsageCard }) {
    const t = useAgenticoI18n();
    // humanSummaryOnly (vedi SubagentCommand.humanSummaryOnly): un comando i cui campi tecnici
    // non rispecchiano come un umano pensa l'input (es. redirects: 4 campi separati ma un umano
    // ragiona in termini di "cosa mando", con una fonte sola spesso sufficiente per più campi)
    // mostra SOLO il racconto in prosa — l'elenco a badge richiesto/opzionale e l'esempio in
    // sintassi CLI implicherebbero erroneamente un modulo da compilare campo per campo.
    if (card.humanSummaryOnly) {
        return (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-xs font-medium text-foreground">"{card.label}"</p>
                <p className="text-xs text-muted-foreground">{card.humanSummary}</p>
            </div>
        );
    }

    return (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <p className="text-xs font-medium text-foreground">{interpolate(t.newInstance, { label: card.label })}</p>
            <p className="text-xs text-muted-foreground">{card.humanSummary}</p>
            {card.fields.length > 0 && (
                <ul className="space-y-1">
                    {card.fields.map((f) => (
                        <li key={f.key} className="flex items-start gap-1.5 text-xs">
                            <Badge variant={f.required ? 'primary' : 'secondary'} className="mt-px shrink-0">
                                {f.required ? 'richiesto' : 'opzionale'}
                            </Badge>
                            <span className="min-w-0">
                                <span className="font-mono text-foreground">{f.key}</span>
                                {f.humanDescription ? <span className="text-muted-foreground"> — {f.humanDescription}</span> : null}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {card.example && (
                <p className="text-xs text-muted-foreground">Esempio: <span className="font-mono">{card.example}</span></p>
            )}
        </div>
    );
}

/** Messaggio semplice per un anchor componente↔subagent (SubagentComponentContext.userMessage) —
 * sostituisce la card a campi per QUESTO meccanismo: niente badge required/opzionale, il
 * componente vivo si popola da solo quando arriva un risultato (vedi SubagentRunner), non c'è un
 * modulo di parametri da compilare a vista. Più righe se sono ancorati più subagent
 * contemporaneamente (vedi AgenticoContext.anchoredUserMessages). */
function AnchoredUserMessageView({ messages }: { messages: string[] }) {
    return (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
            {messages.map((m, i) => (
                <p key={i} className="text-xs text-muted-foreground">{m}</p>
            ))}
        </div>
    );
}

/** Dropdown dello storico chat — TUTTE le chat salvate del tenant, mescolate across subagent
 * (theme, redirects, html-to-liquid: la label del subagent nella riga distingue da quale
 * viene), più recenti prima (vedi entityChatStore.listEntityChats). Un semplice filtro
 * testuale locale, non una ricerca full-text: basta per il volume atteso (una entry per
 * entità, non per esecuzione).
 *
 * `Dropdown`/`DropdownItem` del framework, non un overlay scritto a mano — posizionamento,
 * chiusura al click fuori/Escape, portal: tutto già risolto lì, riscriverlo qui sarebbe stato
 * puro doppione (bug corretto: la prima versione di questo pannello aveva un backdrop e un
 * `<button>` grezzi invece di riusare questi componenti). */
function AgenticoHistoryDropdown({
    scopeId, open, onOpenChange, onSelect, onNewChat,
}: {
    scopeId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (subagentId: string, entityId: string, snapshot: ReturnType<typeof listEntityChats>[number]) => void;
    onNewChat: () => void;
}) {
    const t = useAgenticoI18n();
    const [search, setSearch] = useState('');
    const entries = useMemo(() => (open ? listEntityChats(scopeId) : []), [scopeId, open]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter((e) => {
            const label = findSubagentManifest(e.subagentId)?.label ?? e.subagentId;
            return e.title.toLowerCase().includes(q) || label.toLowerCase().includes(q);
        });
    }, [entries, search]);

    return (
        <Dropdown
            trigger={{ icon: 'history', title: t.chatHistory }}
            // Il default del tema per un trigger Dropdown è pensato per un select-like button
            // (bordo, sfondo) — questo è un'icona isolata nell'header, stesso trattamento di
            // AgenticoToggle qui accanto: nessun bordo, solo hover.
            triggerClassName="!h-9 !w-9 !p-0 rounded-md bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
            open={open}
            onOpenChange={onOpenChange}
            position="end"
            strategy="absolute"
            menuClassName="w-[380px] max-h-[70vh] overflow-y-auto"
            header={
                <div className="flex items-center gap-2 px-1 pb-1.5">
                    <Icon name="search" size={14} className="shrink-0 text-muted-foreground" />
                    <input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.searchChats}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <ActionButton icon="square-pen" ariaLabel={t.newChat} title={t.newChat} variant="link" className="shrink-0" onClick={onNewChat} />
                </div>
            }
        >
            {filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {entries.length === 0 ? t.noSavedChats : t.noResults}
                </p>
            ) : (
                filtered.map((entry) => {
                    const manifest = findSubagentManifest(entry.subagentId);
                    return (
                        <DropdownItem
                            key={`${entry.subagentId}:${entry.entityId}`}
                            icon={manifest?.icon ?? 'bot'}
                            onClick={() => onSelect(entry.subagentId, entry.entityId, entry)}
                        >
                            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                <span className="min-w-0 truncate">
                                    {/* `entry.title` è assente su una chat salvata PRIMA che questo campo esistesse
                                        (localStorage non si aggiorna da solo con lo schema — bug segnalato: la riga
                                        mostrava "Theme extractor ·" senza nulla dopo) — ripiega sull'id dell'entità
                                        invece di un vuoto silenzioso. */}
                                    <span className="text-muted-foreground">{manifest?.label ?? entry.subagentId}</span> · {entry.title || entry.entityId}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">{new Date(entry.savedAt).toLocaleString()}</span>
                            </span>
                        </DropdownItem>
                    );
                })
            )}
        </Dropdown>
    );
}

/** Agentico — il pannello globale, persistente e non-overlay per le sessioni agente — affianca
 * il CMS (che si stringe) invece di coprirlo, cosi la modale che ha avviato l'agente resta
 * aperta e utilizzabile accanto. Header: titolo dell'UNICO task attivo (mai una tab bar — "una
 * chat unica", decisione esplicita: avviarne uno nuovo sostituisce quello in corso, vedi
 * AgenticoContext.openTask) — NESSUNA ×: si apre/chiude solo con AgenticoToggle (nell'Header del
 * CMS, o come `closeSlot` di una Modal right), la stessa icona ovunque, mai una propria qui.
 * Body: lo stesso log di attività del pannello embedded (AgentActivityLog), o un placeholder
 * neutro se non c'è ancora nessun task — il pannello può restare aperto vuoto, non sparisce da
 * solo quando il task finisce. Footer: il composer di follow-up (vedi AgenticoComposer sopra),
 * nascosto quando non c'è un task attivo.
 *
 * Solo la sessione aperta in questa sessione browser (registry in memoria via AgenticoContext)
 * — nessuna persistenza cross-sessione (Fase 3, deferita).
 *
 * Nota sul naming: "Agentico" è il nome dell'orchestratore — questo pannello, il suo contesto
 * (AgenticoContext), il suo toggle (AgenticoToggle) — non degli agenti verticali che esegue
 * (theme-import, html-to-liquid, ...), che restano nel proprio dominio senza questo
 * prefisso: sono contenuto che Agentico orchestra, non parte della sua identità. */
export function Agentico() {
    const {
        task, isOpen, pendingGoal, orchestratorRunId, pageContext, pageContextCard,
        anchoredUserMessages, pendingResume, resumeRunId, dismissForeignTask, resumeEntityChat,
        pendingManualEntry, manualEntryRunId, startManualEntry, pendingExtraDestinations,
        pendingResumeWithAI, resumeWithAIRunId,
        scope,
    } = useAgentico();

    const t = useAgenticoI18n();
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);

    // "Nuova chat" — congeda il task corrente (se c'è) e torna al composer "starter" del
    // contesto attuale, che già riflette dove ci si trova (vedi anchoredUserMessages/
    // pageContext) — nessun significato fisso, cambia da solo in base a dove si è. Un avviso
    // SOLO se la conversazione lasciata indietro non è mai stata salvata (vedi
    // AgenticoTask.savedToDisk): senza salvataggio andrebbe persa per sempre, nessun "torna
    // indietro" per scelta esplicita — una già salvata resta comunque recuperabile dallo
    // storico, quindi scartarla senza chiedere è sicuro.
    const handleNewChat = () => {
        if (task && !task.agent.running && !task.savedToDisk) {
            if (!window.confirm(t.unsavedConversationConfirm)) return;
        }
        dismissForeignTask();
        setHistoryOpen(false);
    };

    // Il transcript dell'orchestratore (se presente) viene PRIMA del log del subagent — vedi
    // AgenticoTask.precedingActivity: una chat unica e continua, mai due task da switchare.
    const displayedActivity = task ? [...(task.precedingActivity ?? []), ...task.agent.activity] : [];
    const activityCount = displayedActivity.length;
    // Punto della timeline in cui interlacciare `panelExtra` (vedi AgenticoTask.panelExtraAnchorIndex)
    // — assente = comportamento invariato, sempre in fondo. Clamp difensivo: un indice ricevuto
    // da un giro precedente potrebbe restare più corto/lungo del log corrente per un frame
    // (es. subito dopo che `stop()`/un nuovo run tronca `agent.activity`).
    const panelExtraAnchorIndex = Math.max(0, Math.min(task?.panelExtraAnchorIndex ?? activityCount, activityCount));
    const activityBeforePanelExtra = displayedActivity.slice(0, panelExtraAnchorIndex);
    const activityAfterPanelExtra = displayedActivity.slice(panelExtraAnchorIndex);
    const hasError = !!(task && !task.agent.running && task.agent.error);
    // Il fallback dell'orchestratore (agenticoOrchestratorAgent.ts) non è mai un vero handoff —
    // solo un messaggio da leggere, non può indovinare l'intento senza AI. Quando invece il
    // target è già noto (scopedSubagentId esplicito, vedi startOrchestrator/TemplateImportButton)
    // e quel subagent dichiara un manualEntry, "Continua senza AI" può fare MEGLIO che mostrare
    // un messaggio generico: salta dritto al percorso manuale (vedi ManualEntryRunner) invece di
    // chiamare runFallback() sull'agent dell'orchestratore stesso.
    const scopedManifestForError = task?.id === ORCHESTRATOR_TASK_ID && task.scopedSubagentId
        ? findSubagentManifest(task.scopedSubagentId)
        : undefined;
    const manualEntryManifestForError = scopedManifestForError?.manualEntry ? scopedManifestForError : null;
    // Se l'utente è vicino al fondo (entro una tolleranza) o no — aggiornato da un listener di
    // scroll vero, non ricalcolato dentro l'effect sotto: lì il DOM ha GIÀ la nuova voce quando
    // gira, quindi "distanza dal fondo" rifletterebbe la nuova altezza invece della posizione in
    // cui si trovava l'utente PRIMA che arrivasse (bug segnalato: durante "sto pensando..." non
    // si riusciva a scrollare in alto per rileggere una chat ripresa — l'auto-scroll ririportava
    // giù a ogni singola voce d'attività, decine al secondo mentre l'agente lavora).
    const isNearBottomRef = useRef(true);
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        const handleScroll = () => {
            isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        };
        el.addEventListener('scroll', handleScroll);
        return () => el.removeEventListener('scroll', handleScroll);
    }, [task?.id]);

    // Nuovo task selezionato/ripreso — sempre in fondo, a prescindere da dove si era scrollati
    // nel task PRECEDENTE (se ce n'era uno).
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        isNearBottomRef.current = true;
        el.scrollTop = el.scrollHeight;
    }, [task?.id]);

    // Scende in fondo ogni volta che compare una nuova voce (nuovo messaggio utente, nuovo
    // turno "sto pensando", nuova tool call) o l'errore finale — cosi l'ultimo messaggio è
    // sempre a vista senza dover scrollare a mano, come una normale chat. SOLO se l'utente era
    // già vicino al fondo: chi ha scrollato in alto per rileggere (es. la cronologia ripresa)
    // non viene più riportato giù a forza mentre l'agente genera ancora.
    useEffect(() => {
        const el = bodyRef.current;
        if (!el || !isNearBottomRef.current) return;
        el.scrollTop = el.scrollHeight;
    }, [activityCount, hasError]);

    // Montato SEMPRE quando c'è un goal in sospeso, indipendentemente da `isOpen` — se lo
    // gatassimo dietro `!isOpen return null` sotto, chiudere il pannello smonterebbe
    // OrchestratorRunner (e a cascata l'eventuale SubagentRunner), perdendo il riferimento vivo
    // all'agent in corso — stesso motivo per cui AgenticoContext (vedi commento su
    // AgenticoTask.agent) richiede che il componente proprietario resti montato.
    // `key={orchestratorRunId}` forza React a smontare/rimontare un'istanza FRESCA a ogni nuova
    // conversazione avviata per davvero (vedi AgenticoContext) — senza, un secondo
    // startOrchestrator() riuserebbe l'istanza precedente (il cui `handoff` interno è già
    // impostato), ignorando silenziosamente il nuovo goal.
    const orchestrator = pendingGoal ? <OrchestratorRunner key={orchestratorRunId} userGoal={pendingGoal} /> : null;

    // Stesso principio di `orchestrator` sopra — montato SEMPRE quando c'è un resume in
    // sospeso, indipendentemente da `isOpen`, per non perdere il riferimento vivo all'agent non
    // appena il pannello si richiude. `taskId` stabile per entità (non un uuid fresco): riaprire
    // il resume della STESSA entità aggiorna la stessa tab invece di duplicarla.
    const resumeManifest = pendingResume ? findSubagentManifest(pendingResume.subagentId) : undefined;
    const resumeRunner = pendingResume && resumeManifest ? (
        <SubagentRunner
            key={resumeRunId}
            manifest={resumeManifest}
            params={pendingResume.snapshot.params}
            taskId={`entitychat-${pendingResume.subagentId}-${pendingResume.entityId}`}
            resumeSeed={{ history: pendingResume.snapshot.history, activity: pendingResume.snapshot.activity }}
        />
    ) : null;

    // Stesso principio di `orchestrator`/`resumeRunner` sopra — percorso "senza AI" per un
    // subagent già noto (vedi AgenticoContext.startManualEntry/ManualEntryRunner), montato SEMPRE
    // indipendentemente da `isOpen`.
    const manualEntryManifest = pendingManualEntry ? findSubagentManifest(pendingManualEntry.subagentId) : undefined;
    const manualEntryRunner = pendingManualEntry && manualEntryManifest ? (
        <ManualEntryRunner
            key={manualEntryRunId}
            manifest={manualEntryManifest}
            extraDestinations={pendingManualEntry.extraDestinations}
        />
    ) : null;

    // "Riprendi con AI" (vedi AgenticoContext.resumeWithAI) — il contrario di manualEntryRunner:
    // un vero SubagentRunner (AI abilitata di default), avviato con gli ultimi parametri usati
    // nel percorso senza AI. Stesso identico trattamento "montato sempre, indipendentemente da
    // isOpen" di tutti gli altri runner sopra.
    const resumeWithAIManifest = pendingResumeWithAI ? findSubagentManifest(pendingResumeWithAI.subagentId) : undefined;
    const resumeWithAIRunner = pendingResumeWithAI && resumeWithAIManifest ? (
        <SubagentRunner
            key={resumeWithAIRunId}
            manifest={resumeWithAIManifest}
            params={pendingResumeWithAI.params}
            extraDestinations={pendingResumeWithAI.extraDestinations}
        />
    ) : null;

    if (!isOpen) return <>{orchestrator}{resumeRunner}{manualEntryRunner}{resumeWithAIRunner}</>;

    return (
        <>
        {orchestrator}
        {resumeRunner}
        {manualEntryRunner}
        {resumeWithAIRunner}
        <div
            style={{ width: AGENTICO_WIDTH }}
            className="relative flex h-full shrink-0 flex-col border-l border-border bg-background"
        >
            {/* Stessi `px-4 py-3` + `border-b/60` dell'header di Modal.tsx (framework) — la
                modale di import tema è affiancata a questo pannello, deve avere
                esattamente la stessa altezza di testata, non una vicina. L'icona robot è ORA
                sempre presente qui (non più solo nell'Header generale/come closeSlot delle
                modali) — il pannello "sembra" un sidebar/modale a sé, quindi deve avere la sua
                stessa affordance di apertura/chiusura sul proprio header, indipendentemente da
                cosa gli sta affianco (decisione esplicita, corregge l'asimmetria precedente). */}
            <div className="flex min-h-[60px] items-center gap-1 border-b border-border/60 px-4 py-3">
                {/* `leading-tight` (1.25), non `leading-none` (1): line-height 1 ritagliava il
                    discendente della "g" di "Agentico" su alcuni font — l'altezza della riga è
                    comunque garantita da `items-center` sul flex padre, non serve forzarla a 1.
                    Un solo task alla volta in tutta l'app (mai una tab bar, decisione esplicita:
                    "una chat unica") — il titolo mostra semplicemente cosa sta facendo ora
                    l'unica conversazione viva, o "Agentico" quando non ce n'è nessuna. */}
                <span className="min-w-0 flex-1 truncate text-lg font-semibold leading-tight">
                    {task ? task.title : 'Agentico'}
                </span>
                {/* Storico — TUTTE le chat salvate dello scope (vedi AgenticoHistoryDropdown),
                    mescolate across subagent, più recenti prima. Nessuna dipendenza da
                    `isOpen`/task: uno stato locale a sé, sempre disponibile col pannello aperto. */}
                {scope && (
                    <AgenticoHistoryDropdown
                        scopeId={scope.id}
                        open={historyOpen}
                        onOpenChange={setHistoryOpen}
                        onNewChat={handleNewChat}
                        onSelect={(subagentId, entityId, snapshot) => resumeEntityChat(subagentId, entityId, snapshot)}
                    />
                )}
                <AgenticoToggle />
            </div>

            {/* Niente `pt-*` qui — un padding-top sul contenitore di scroll resterebbe SEMPRE
                visibile sopra un elemento sticky `top-0` (lo spazio di offset per lo sticky è
                misurato dentro il padding-box di questo contenitore), lasciando lo spazietto tra
                header e bolla utente segnalato dall'utente. Lo spazio in alto si ottiene invece
                dentro il contenuto stesso (vedi il `pt-2` di AgentActivityLog), che scorre via
                normalmente invece di restare incollato all'header. */}
            <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 pb-2">
                {/* `pt-2` qui, non sul contenitore di scroll sopra — questo div scorre via
                    normalmente coi contenuti, cosi la bolla sticky dell'utente (dentro
                    AgentActivityLog) può incollarsi davvero a filo con l'header una volta
                    superato, invece di lasciare sempre visibile lo spazio di questo padding. */}
                <div className="pt-2">
                    {task ? (
                        <>
                            {/* Prompt statico del percorso "senza AI" (vedi
                                SubagentManifest.manualEntry) — mostrato SOLO finché non c'è
                                ancora attività: una volta inviato il primo testo, la bolla utente
                                + il risultato raccontano da soli cosa sta succedendo, questo testo
                                diventerebbe solo rumore duplicato. */}
                            {task.manualEntry && displayedActivity.length === 0 && (
                                <p className="text-xs text-muted-foreground">{task.manualEntry.prompt}</p>
                            )}
                            <AgentActivityLog activity={activityBeforePanelExtra} />
                            {task.panelExtra && <div className="mt-3">{task.panelExtra}</div>}
                            {/* Conversazione successiva a `panelExtra` (retry, follow-up) — un
                                secondo <ul> (AgentActivityLog ne apre uno suo), non un problema:
                                lo sticky delle bolle utente è per-<li> rispetto allo scroll
                                container di questo pannello, non al singolo <ul> che le contiene. */}
                            {activityAfterPanelExtra.length > 0 && <AgentActivityLog activity={activityAfterPanelExtra} />}
                            {!task.agent.running && task.agent.error && (
                                <div className="mt-2 flex items-center gap-2">
                                    <p className="flex-1 text-xs text-destructive">{task.agent.error}</p>
                                    {/* Nessun "retry dell'ultimo turno" nativo in useAgent — un
                                        nuovo messaggio "Riprova." nella STESSA conversazione
                                        (history/tool-result già raccolti restano disponibili al
                                        modello) è l'approssimazione più semplice, stesso
                                        percorso di chi ridigita a mano in chat. */}
                                    <ActionButton
                                        label={t.retry}
                                        variant="secondary"
                                        className="shrink-0"
                                        onClick={() => { void task.agent.sendMessage(t.retryMessage).then((r) => { if (r) task.onApplied(r); }); }}
                                    />
                                    {/* Ogni subagent ha un fallback deterministico a costo zero
                                        (vedi AgentDefinition.fallback) — quando la chiamata al
                                        modello fallisce (rete/provider giù, non solo AI
                                        disabilitata) l'utente non deve restare bloccato dietro
                                        "Riprova": può proseguire subito col risultato
                                        deterministico, generico per costruzione a QUALUNQUE
                                        subagent (nessuna label/logica specifica qui). */}
                                    <ActionButton
                                        label={t.continueWithoutAi}
                                        variant="secondary"
                                        className="shrink-0"
                                        onClick={() => {
                                            if (manualEntryManifestForError) {
                                                startManualEntry(manualEntryManifestForError.id, pendingExtraDestinations);
                                                return;
                                            }
                                            const r = task.agent.runFallback();
                                            if (r) task.onApplied(r);
                                        }}
                                    />
                                </div>
                            )}
                        </>
                    ) : anchoredUserMessages.length > 0 ? (
                        // Uno o più componenti vivi sono ancorati a un subagent (vedi
                        // useSubagentComponentContext) — un semplice messaggio per l'utente, non
                        // un modulo di campi: il componente si popola da solo quando arriva un
                        // risultato, non c'è nulla da compilare a vista qui.
                        <AnchoredUserMessageView messages={anchoredUserMessages} />
                    ) : pageContextCard ? (
                        // Card strutturata (vedi SubagentUsageCardView sopra) quando il pageContext
                        // registrato riguarda un singolo subagent-comando (es. redirects/ToolPage.tsx)
                        // — zero costo/nessuna chiamata AI, e a differenza del vecchio paragrafo di prosa non
                        // lascia all'utente il compito di dedurre quali campi servono per partire.
                        <SubagentUsageCardView card={pageContextCard} />
                    ) : (
                        // Nessuna card disponibile (es. ToolsPage/RedirectsPage, pagine senza un
                        // singolo subagent-comando a cui riferirsi) — resta il testo semplice del
                        // pageContext, o il generico "dimmi cosa vuoi fare" se non c'è nemmeno quello.
                        <p className="text-xs text-muted-foreground">{pageContext ?? t.orchestratorStarterHint}</p>
                    )}
                </div>
            </div>

            {/* Stessi `px-4 py-3` + `border-t/60` del footer di Modal.tsx — stessa altezza di
                partenza del footer della modale adiacente (textarea a una riga, vedi sopra).
                Sempre presente col pannello aperto (non solo quando c'è un task attivo, a
                differenza di prima): il composer resta "stuck to bottom" identico in entrambi i
                casi — solo il body sopra cambia (log live o l'hint), mai il composer
                stesso a spostarsi al centro del pannello. */}
            <div className="border-t border-border/60 px-4 py-3">
                {task
                    ? <AgenticoComposer key={task.id} task={task} />
                    : <AgenticoStarterComposer />}
            </div>
        </div>
        </>
    );
}
