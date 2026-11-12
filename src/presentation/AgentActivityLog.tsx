import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActionButton, Badge, Card, ChatMarkdown, ChatQuestions, ChatReasoning, Code, Icon, Identicon, ImageAvatar, LoadingButton, Modal, Tree, interpolate } from '@llmnative/react';
import type { ChatAuthor } from '../domain/entityChatStore';
import { placeEvents, type ThreadEvent } from '../domain/threadEvents';
import { ThreadEventCard } from './ThreadEvents';
import type { AgentActivityEntry } from './useAgent';
import type { AgentCardPart, AgentMessagePart, AgentQuestionAnswer, AgentQuestionsPart, AgentReasoningPart, AgentToolPart } from '../domain/messageParts';
import { useAgenticoI18n, type AgenticoDict } from '../i18n';

/** Un blocco ```lang ... ``` dentro al testo, o testo semplice attorno — il modello spesso
 * mescola un commento libero con un blocco di codice/JSON (vedi lo screenshot che ha portato
 * a questo componente: la risposta di un tool con un blocco ```json grezzo). */
type DetailSegment = { type: 'text'; content: string } | { type: 'code'; content: string; language?: string };

/** Individua un blob JSON bilanciato dentro un pezzo di testo SENZA fence attorno (il modello a
 * volte lo dimentica del tutto sui turni di follow-up, non solo sul primo — bug segnalato: un
 * `{"matches": [...]}` grezzo comparso come muro di testo in chat, niente collapse, niente
 * evidenziazione). Stesso algoritmo a conteggio graffe/parentesi di extractJsonBlock (ignora
 * quelle dentro le stringhe) — soglia di lunghezza minima per non trattare come "codice" un
 * oggetto minuscolo citato di sfuggita in una frase. */
function splitUnfencedJsonSegments(text: string): DetailSegment[] {
    const start = text.search(/[{[]/);
    if (start === -1) return [{ type: 'text', content: text }];

    const open = text[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === open) depth++;
        else if (ch === close) { depth--; if (depth === 0) { end = i; break; } }
    }

    const candidate = end === -1 ? null : text.slice(start, end + 1);
    if (!candidate || candidate.length < 60) return [{ type: 'text', content: text }];
    try { JSON.parse(candidate); } catch { return [{ type: 'text', content: text }]; }

    const segments: DetailSegment[] = [];
    if (start > 0) segments.push({ type: 'text', content: text.slice(0, start) });
    segments.push({ type: 'code', content: candidate, language: 'json' });
    const rest = text.slice(end + 1);
    if (rest.trim()) segments.push(...splitUnfencedJsonSegments(rest));
    return segments;
}

/** Divide `detail` in segmenti testo/codice sui fence ```lang\n...``` — non un parser
 * markdown completo, solo quel tanto che serve a non mostrare i backtick letterali all'utente
 * e a poter passare il contenuto del blocco al componente Code (evidenziazione + copia) del
 * framework invece che a un <p> piatto. Ogni segmento di testo risultante passa POI per
 * `splitUnfencedJsonSegments`, cosi un blob JSON senza fence attorno riceve comunque lo stesso
 * trattamento (collassato/espandibile) di uno fenced, invece di restare testo piatto. */
function parseDetailSegments(text: string): DetailSegment[] {
    const segments: DetailSegment[] = [];
    const fenceRe = /```(\w+)?\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fenceRe.exec(text))) {
        if (match.index > lastIndex) segments.push(...splitUnfencedJsonSegments(text.slice(lastIndex, match.index)));
        segments.push({ type: 'code', content: match[2].replace(/\n$/, ''), language: match[1] });
        lastIndex = fenceRe.lastIndex;
    }
    if (lastIndex < text.length) segments.push(...splitUnfencedJsonSegments(text.slice(lastIndex)));
    return segments;
}

/** Blocco di codice nel log — SEMPRE visibile non appena la riga che lo contiene lo è (niente
 * doppio collapse: non serve un primo click solo per farlo apparire, quello era il problema
 * del vecchio testo ```json grezzo in riga). Il collapse che resta è solo quello proprio del
 * blocco: parte alto ~3-4 righe (evidenziazione Prism del framework), un clic lo espande a
 * un'altezza maggiore con scroll interno se il contenuto non ci sta comunque. Copia solo da
 * espanso — da collassato il bottone verrebbe tagliato dal max-height comunque. */
function DetailCodeBlock({ content, language }: { content: string; language?: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div
            className={`relative cursor-pointer rounded-md ${expanded ? 'max-h-80 overflow-y-auto' : 'max-h-28 overflow-hidden'}`}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Clic per comprimere' : 'Clic per espandere'}
        >
            <Code language={language as never} showCopy={expanded} background="transparent" className="!text-[11px]">
                {content}
            </Code>
            {!expanded && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-muted/30 to-transparent" />
            )}
        </div>
    );
}

/** Il contenuto di `detail` — testo (Markdown, con `ChatMarkdown` del framework, CR-004) più
 * eventuali blocchi di codice, ciascuno reso col syntax-highlighter del framework (collassabile,
 * vedi DetailCodeBlock) invece che coi backtick grezzi. */
function DetailContent({ text, tone }: { text: string; tone?: 'default' | 'muted' }) {
    const segments = parseDetailSegments(text);
    return (
        <>
            {segments.map((seg, i) => seg.type === 'code'
                ? <DetailCodeBlock key={i} content={seg.content} language={seg.language} />
                : (seg.content.trim() && <ChatMarkdown key={i} content={seg.content.trim()} tone={tone} className="break-words text-xs leading-relaxed" />)
            )}
        </>
    );
}

/** Icona di stato di una voce di attività — icon-system del framework (Lucide), mai emoji.
 * "running" resta lo spinner a bordo rotante già usato da LoadingButton in tutto il CMS,
 * non un'icona Lucide: stessa identica animazione di ogni altro stato di caricamento. */
/** How long the turn has been running, from 10 s on (" · 1:05"), updated every second. */
function Elapsed() {
    const [started] = useState(() => Date.now());
    const [now, setNow] = useState(started);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    const seconds = Math.floor((now - started) / 1000);
    if (seconds < 10) return null;
    return <span className="tabular-nums"> · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>;
}

function ActivityStatusIcon({ status }: { status: AgentActivityEntry['status'] }) {
    if (status === 'running') {
        return <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />;
    }
    if (status === 'done') return <Icon name="check" size={12} className="shrink-0 text-green-600" />;
    if (status === 'stopped') return <Icon name="circle-slash" size={12} className="shrink-0 text-muted-foreground" />;
    return <Icon name="x" size={12} className="shrink-0 text-destructive" />;
}

/** "Sto pensando…" è transitorio — SOLO mentre quel turno è `running`. Appena arriva la
 * risposta, la riga smette di dire "sto pensando" (che a quel punto sarebbe falso: ha già
 * finito). Nessuna anteprima-prima-riga qui: la prosa (se c'è) è sempre mostrata per intero
 * subito sotto (vedi ActivityRow), quindi un'etichetta che ne anticipi un pezzo sarebbe solo
 * la stessa frase ripetuta due volte a distanza di un rigo — esattamente il riepilogo del
 * micro-prompt "closing-summary" che, prima di questa versione, veniva sia troncato in
 * etichetta SIA ripetuto per intero subito sotto una volta espanso. */
function thinkingDisplayLabel(entry: AgentActivityEntry, t: AgenticoDict): string {
    if (entry.status === 'running') return t.thinking;
    if (entry.status === 'error') return t.modelRequestError;
    if (entry.status === 'stopped') return t.stopped;
    if (!entry.detail) {
        // Il modello ha richiesto tool_calls senza scrivere testo libero — dice direttamente
        // lo scopo generale dell'azione (frasi già complete, vedi AgentTool.describeIntent)
        // invece del generico "Richiesta di eseguire dei tool". Nessun prefisso "Eseguo:"
        // aggiunto qui: ogni frase è già completa di suo, e i parametri della chiamata
        // specifica sono già sulla riga della tool call subito sotto — ripeterli qui sarebbe
        // di nuovo la stessa duplicazione che questo campo esiste per evitare.
        if (entry.toolNames && entry.toolNames.length > 0) return entry.toolNames.join(' · ');
        return t.toolRequest;
    }
    return t.responseReceived;
}

/** Altezza da collassato, in px — abbastanza per ~4 righe a text-xs. Sopra questa soglia la
 * bolla utente collassa di default (fade + maniglia "espandi" sotto, stesso pattern di
 * DetailCodeBlock) invece di occupare tutto lo spazio verticale disponibile: la bolla è
 * `sticky top-0`, quindi un messaggio lungo resterebbe agganciato in cima schiacciando via
 * la vista sull'attività/risposta dell'AI che scorre sotto — esattamente il problema segnalato. */
const USER_BUBBLE_COLLAPSED_MAX_HEIGHT = 96;

/** Bolla utente — collassabile SOLO se il testo eccede l'altezza di soglia (misurato via ref,
 * niente stima a priori sul numero di caratteri: dipende da wrap/allegati/lingua). L'unica zona
 * cliccabile per espandere/comprimere è la maniglia dedicata in fondo alla bolla (chevron),
 * MAI l'intera bolla — stesso motivo per cui ChatGPT/Claude fanno lo stesso: il testo dentro
 * deve restare selezionabile col mouse senza che un click/trascinamento apra o chiuda la bolla.
 * Non inventato da zero: è il pattern "show more/less con maniglia separata" già standard nei
 * chatbot conversazionali per i turni utente lunghi.
 *
 * Sticky in cima (CR-004) ma solo dentro il suo turno (vedi AgentActivityLog): quando il turno
 * finisce di scorrere, la bolla se ne va con lui invece di restare sotto quella del turno dopo
 * (prima tutte le bolle erano sticky nella stessa lista, e una bolla più alta spuntava sotto
 * una più bassa, sopra il testo). Sfondo pieno e `z-20`: il testo che scorre sotto (tabelle,
 * codice) non le passa sopra. */
/** CR-016: what the person can do on one of their messages: edit it, or send it again when its answer was cut. */
export interface UserMessageActions {
    /** Whether the message has them (a message of this conversation, with where the chat goes back to). */
    available: (entry: AgentActivityEntry) => boolean;
    /** Off while a turn runs. */
    disabled: boolean;
    onRetry: (entry: AgentActivityEntry) => void;
    onEdit: (entry: AgentActivityEntry) => void;
}

/** Whether the answer to a message of the person was cut: a step of its turn stopped or failed. */
const interrupted = (entries: readonly AgentActivityEntry[]) => entries.some((entry) => entry.status === 'stopped' || entry.status === 'error');

/** CR-018: the picture of who speaks: theirs, else an icon drawn from their name. */
export function ChatAvatar({ author, size = 20 }: { author: ChatAuthor; size?: number }) {
    return author.avatarUrl
        ? <ImageAvatar src={author.avatarUrl} title={author.name} alt={author.name} width={size} height={size} />
        : <Identicon value={author.name} size={size} title={author.name} />;
}

/** CR-018: the column on the left of a chat that shows who speaks: the same for people and agents. */
const GUTTER = 'w-6';

/** CR-018: the reasoning and steps an agent did before it wrote: shown closed, next to its name. */
function leadingParts(entry: AgentActivityEntry | undefined): AgentMessagePart[] {
    if (!entry || entry.kind !== 'thinking' || !entry.parts) return [];
    const lead: AgentMessagePart[] = [];
    for (const part of entry.parts) {
        if (part.type !== 'reasoning' && part.type !== 'tool') break;
        lead.push(part);
    }
    return lead;
}

/** CR-018: "reasoned for 4 s · 1 step", next to the name of the agent: opens what it sums up. */
function ProcessSummary({ parts, open, onToggle }: { parts: AgentMessagePart[]; open: boolean; onToggle: () => void }) {
    const t = useAgenticoI18n();
    const reasoning = parts.filter((p): p is AgentReasoningPart => p.type === 'reasoning');
    const steps = parts.filter((p): p is AgentToolPart => p.type === 'tool');
    const thinking = reasoning.some((p) => p.streaming);
    const runningStep = steps.filter((p) => p.status === 'running').at(-1);
    const seconds = Math.round(reasoning.reduce((total, p) => total + (p.duration ?? 0), 0));
    const pieces = [
        ...(reasoning.length ? [thinking ? t.reasoningNow : seconds > 0 ? interpolate(t.reasonedFor, { seconds }) : t.reasoned] : []),
        ...(steps.length ? [runningStep?.label ?? (steps.length === 1 ? t.oneStep : interpolate(t.steps, { count: steps.length }))] : []),
    ];
    const busy = thinking || Boolean(runningStep);
    const failed = steps.some((p) => p.status === 'error');
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            title={t.processDetails}
            className="inline-flex min-w-0 items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground"
        >
            <Icon name={busy ? 'loader-circle' : failed ? 'circle-alert' : reasoning.length ? 'brain' : 'list-checks'} size={12} className={`shrink-0 ${busy ? 'animate-spin' : ''}`} />
            <span className="truncate">{pieces.join(' · ')}</span>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} className="shrink-0" />
        </button>
    );
}

function UserMessageBubble({ entry, pinned = true, actions, cut = false, showAuthor = false }: {
    entry: AgentActivityEntry;
    /** CR-018: the picture of who wrote it, on the left (a chat that shows who speaks). */
    showAuthor?: boolean;
    pinned?: boolean;
    actions?: UserMessageActions;
    /** Its answer was cut (stopped, failed): Retry, always shown. */
    cut?: boolean;
}) {
    const t = useAgenticoI18n();
    const contentRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);

    useLayoutEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        setOverflowing(el.scrollHeight > USER_BUBBLE_COLLAPSED_MAX_HEIGHT + 1);
    }, [entry.detail, entry.attachmentNames]);

    const collapsed = overflowing && !expanded;

    const retryButton = actions?.available(entry) && cut
        ? <ActionButton icon="rotate-ccw" ariaLabel={t.retry} title={t.retry} variant="link" className="p-1 text-muted-foreground hover:text-foreground" disabled={actions.disabled} onClick={() => actions.onRetry(entry)} />
        : null;
    const editButton = actions?.available(entry)
        ? (
            <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <ActionButton icon="pencil" ariaLabel={t.editMessage} title={t.editMessage} variant="link" className="p-1 text-muted-foreground hover:text-foreground" disabled={actions.disabled} onClick={() => actions.onEdit(entry)} />
            </span>
        )
        : null;
    const bubble = (wide: boolean) => (
            <div className={`${wide ? 'w-full' : 'max-w-[85%]'} rounded-lg bg-primary/10 text-xs text-foreground`}>
                <div
                    ref={contentRef}
                    className={`space-y-1 px-2.5 pt-1.5 ${collapsed ? 'overflow-hidden' : ''}`}
                    style={collapsed ? { maxHeight: USER_BUBBLE_COLLAPSED_MAX_HEIGHT } : undefined}
                >
                    {entry.attachmentNames && entry.attachmentNames.length > 0 && (
                        // Pillole SOPRA il testo, non dentro DetailContent — sono metadati del
                        // messaggio (cosa era allegato), non parte del testo scritto dall'utente,
                        // niente markdown/segmenti codice da applicargli.
                        <div className="flex flex-wrap gap-1">
                            {entry.attachmentNames.map((name, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] text-foreground">
                                    <Icon name="paperclip" size={10} className="shrink-0" />
                                    <span className="max-w-[160px] truncate">{name}</span>
                                </span>
                            ))}
                        </div>
                    )}
                    <DetailContent text={entry.detail ?? ''} />
                </div>
                {overflowing && (
                    // Riquadro cliccabile a sé, non un overlay sopra il testo — un `padding`
                    // generoso (non un filo di 1px) rende la maniglia facile da colpire senza
                    // dover mirare con precisione, mantenendo comunque il testo sopra intoccato.
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="relative flex w-full items-center justify-center rounded-b-lg py-1 text-muted-foreground hover:bg-primary/15"
                        title={expanded ? 'Comprimi' : 'Espandi'}
                    >
                        {collapsed && (
                            <div className="pointer-events-none absolute inset-x-0 -top-4 h-4 bg-gradient-to-t from-primary/10 to-transparent" />
                        )}
                        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={12} />
                    </button>
                )}
            </div>
    );

    // CR-018: a chat that shows who speaks. Everyone in the same column on the left: the picture of who wrote it
    // (a person icon for a message saved without an author), its actions under it; the name above the message,
    // which takes the whole width.
    if (showAuthor) {
        return (
            <div className={`${pinned ? 'sticky top-0 z-20 border-b border-border/40' : ''} group flex items-start gap-2 bg-background py-1.5`}>
                <span className={`flex shrink-0 flex-col items-center ${GUTTER}`}>
                    {entry.author ? <ChatAvatar author={entry.author} /> : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                            <Icon name="user" size={12} />
                        </span>
                    )}
                    {retryButton}
                    {editButton}
                </span>
                <div className="min-w-0 flex-1">
                    {entry.author && <div className="pb-0.5 text-xs font-medium text-foreground">{entry.author.name}</div>}
                    {bubble(true)}
                </div>
            </div>
        );
    }

    return (
        // Not pinned while questions are docked at the bottom (CR-005): the thread gets the room.
        <div className={`${pinned ? 'sticky top-0 z-20 border-b border-border/40' : ''} group flex items-start justify-end gap-1 bg-background py-1.5`}>
            {/* CR-016: Edit on hover of the message (and to the keyboard); Retry always, when its answer was cut. */}
            {actions?.available(entry) && (
                <span className="flex shrink-0 items-center">
                    {retryButton}
                    {editButton}
                </span>
            )}
            {bubble(false)}
        </div>
    );
}

/** The icon of a step in its group: the framework Icon names, coloured by the Tree as muted. */
const STEP_ICONS: Record<AgentToolPart['status'], string> = {
    running: 'loader-circle',
    done: 'check',
    error: 'x',
    stopped: 'circle-slash',
};

/** Consecutive steps of a remote agent (CR-004), as one collapsible group: a `Tree` of the
 * framework with one branch, closed by default. Its line says the step running now, or how many
 * steps there were; open, it lists them with their status. */
function StepsGroup({ steps }: { steps: AgentToolPart[] }) {
    const t = useAgenticoI18n();
    const running = steps.filter((s) => s.status === 'running').at(-1);
    const failed = steps.some((s) => s.status === 'error');
    const summary = running?.label ?? (steps.length === 1 ? t.oneStep : interpolate(t.steps, { count: steps.length }));
    return (
        <Tree
            ariaLabel={t.stepsLabel}
            selectedId={null}
            itemClassName="py-0.5 text-xs text-muted-foreground"
            nodes={[{
                id: `steps-${steps[0]?.id ?? ''}`,
                label: summary,
                icon: running ? 'loader-circle' : failed ? 'circle-alert' : 'list-checks',
                children: steps.map((step) => ({
                    id: step.id,
                    label: <span className={step.status === 'error' ? 'text-destructive' : undefined}>{step.label}</span>,
                    icon: STEP_ICONS[step.status],
                })),
            }]}
        />
    );
}

/** What the log needs to let the person answer questions (CR-004): the entries of the live
 * conversation (`canAnswer`) and where the answers go. Without it, unanswered questions are shown
 * disabled. */
export interface AgentActivityLogQuestions {
    canAnswer: (entryId: string) => boolean;
    onAnswer: (entryId: string, partId: string, answers: AgentQuestionAnswer[]) => Promise<unknown>;
    /** CR-014: an action of a card, run by the host. Without it the actions of the cards are off. */
    onCardAction?: (entryId: string, partId: string, actionId: string) => Promise<unknown>;
}

/**
 * A card of the host in a message (CR-014): its title and badge, what to read at once, View for the whole text
 * (a side modal), the actions of the host in its footer; once one ran, what came of it and the buttons off.
 */
export function CardPart({ entry, part, questions }: { entry: AgentActivityEntry; part: AgentCardPart; questions?: AgentActivityLogQuestions }) {
    const t = useAgenticoI18n();
    const [viewing, setViewing] = useState(false);
    const actionable = Boolean(questions?.onCardAction && questions.canAnswer(entry.id) && !part.outcome);
    const outcomeVariant = part.outcome?.status === 'done' ? 'text-success' : part.outcome?.status === 'error' ? 'text-destructive' : 'text-muted-foreground';
    return (
        <Card
            headerClassName="flex items-center justify-between gap-2 px-3 py-2"
            bodyClassName="px-3 py-2"
            header={(
                <>
                    <span className="min-w-0 text-xs font-semibold text-foreground">{part.title}</span>
                    {part.badge && <Badge variant={part.badge.variant ?? 'info'}>{part.badge.label}</Badge>}
                </>
            )}
            footer={(
                <div className="space-y-1.5 px-3 py-2">
                    {/* One row: the secondary actions as icons (their name on hover and for screen readers),
                        the primary one with its label on the right; what came of an action under it. */}
                    <div className="flex items-center gap-1">
                        {part.details && <ActionButton icon="eye" ariaLabel={t.cardView} title={t.cardView} variant="outline-secondary" onClick={() => setViewing(true)} />}
                        {(part.actions ?? []).filter((action) => action.variant !== 'primary' && action.icon).map((action) => (
                            <LoadingButton
                                key={action.id}
                                icon={action.icon!}
                                ariaLabel={action.label}
                                title={action.label}
                                variant={action.variant ?? 'outline-secondary'}
                                disabled={!actionable}
                                onClick={() => questions!.onCardAction!(entry.id, part.id, action.id)}
                            />
                        ))}
                        <span className="ms-auto flex items-center gap-1">
                            {(part.actions ?? []).filter((action) => action.variant === 'primary' || !action.icon).map((action) => (
                                <LoadingButton
                                    key={action.id}
                                    {...(action.icon ? { icon: action.icon } : {})}
                                    label={action.label}
                                    variant={action.variant ?? 'outline-primary'}
                                    disabled={!actionable}
                                    onClick={() => questions!.onCardAction!(entry.id, part.id, action.id)}
                                />
                            ))}
                        </span>
                    </div>
                    {part.outcome && (
                        <p className={`text-xs ${outcomeVariant}`}>
                            {part.outcome.text}
                            {part.outcome.link && (
                                <> <a className="underline" href={part.outcome.link.url} target="_blank" rel="noopener noreferrer">{part.outcome.link.label}</a></>
                            )}
                        </p>
                    )}
                </div>
            )}
        >
            {part.body ? <ChatMarkdown content={part.body} className="break-words text-xs leading-relaxed text-foreground" /> : null}
            {viewing && part.details && (
                <Modal title={part.title} position="right" size="lg" onClose={() => setViewing(false)} footer={<ActionButton label={t.cardClose} variant="outline-secondary" onClick={() => setViewing(false)} />}>
                    <ChatMarkdown content={part.details} className="break-words text-sm leading-relaxed text-foreground" />
                </Modal>
            )}
        </Card>
    );
}

/** The questions part shown docked at the bottom of the panel instead of in the thread (CR-005). */
export interface DockedQuestions {
    entry: AgentActivityEntry;
    part: AgentQuestionsPart;
}

/** The questions waiting for an answer in the latest message of the agent (CR-005): the last
 * questions part without answers of the last entry, when that entry is a message in parts of a turn
 * that did not stop or fail, and the person can answer it. Otherwise nothing is docked and the
 * questions stay in the thread (read-only once answered). */
export function findDockedQuestions(activity: readonly AgentActivityEntry[], canAnswer: (entryId: string) => boolean): DockedQuestions | null {
    const entry = activity.at(-1);
    if (!entry || entry.kind !== 'thinking' || !entry.parts) return null;
    if (entry.status === 'stopped' || entry.status === 'error') return null;
    const part = [...entry.parts].reverse().find((p): p is AgentQuestionsPart => p.type === 'questions');
    if (!part || part.answers || !canAnswer(entry.id)) return null;
    return { entry, part };
}

/** A questions part of the agent with `ChatQuestions`: answerable while the entry is live and it has
 * no answers, read-only with its answers, disabled otherwise. */
export function QuestionsPart({ entry, part, questions, autoFocus, className }: {
    entry: AgentActivityEntry;
    part: AgentQuestionsPart;
    questions?: AgentActivityLogQuestions;
    autoFocus?: boolean;
    className?: string;
}) {
    const answerable = Boolean(questions?.canAnswer(entry.id));
    return (
        <ChatQuestions
            questions={part.questions}
            {...(part.answers ? { answers: part.answers } : {})}
            disabled={!part.answers && !answerable}
            onSubmit={questions && answerable ? (answers) => questions.onAnswer(entry.id, part.id, answers) : undefined}
            autoFocus={autoFocus}
            className={className ?? 'text-xs'}
        />
    );
}

/** A message in parts (CR-004), in the order the parts arrived: text with `ChatMarkdown`
 * (repaired while it streams), reasoning with `ChatReasoning`, consecutive steps as one group,
 * questions with `ChatQuestions` (read-only once answered). */
function MessageParts({ entry, questions, hiddenPartId, skip }: { entry: AgentActivityEntry; questions?: AgentActivityLogQuestions; hiddenPartId?: string; skip?: ReadonlySet<string> }) {
    // The questions docked at the bottom of the panel (CR-005) are not repeated in the thread; the parts summed
    // up next to the name of the agent (CR-018) neither.
    const parts = (entry.parts ?? []).filter((p) => !(p.type === 'questions' && p.id === hiddenPartId) && !skip?.has(p.id));
    const blocks: Array<{ key: string; part: Exclude<AgentMessagePart, AgentToolPart> } | { key: string; steps: AgentToolPart[] }> = [];
    for (const part of parts) {
        const last = blocks.at(-1);
        if (part.type === 'tool') {
            if (last && 'steps' in last) last.steps.push(part);
            else blocks.push({ key: `tool-${part.id}`, steps: [part] });
        } else {
            blocks.push({ key: `${part.type}-${part.id}`, part });
        }
    }
    return (
        <div className="space-y-2">
            {blocks.map((block) => {
                if ('steps' in block) return <StepsGroup key={block.key} steps={block.steps} />;
                const { part } = block;
                if (part.type === 'text') {
                    return part.text.trim()
                        ? <ChatMarkdown key={block.key} content={part.text} streaming={part.streaming} className="break-words text-xs leading-relaxed text-foreground" />
                        : null;
                }
                if (part.type === 'reasoning') {
                    return <ChatReasoning key={block.key} content={part.text} streaming={part.streaming} duration={part.duration} className="my-0" />;
                }
                if (part.type === 'card') return <CardPart key={block.key} entry={entry} part={part} questions={questions} />;
                return <QuestionsPart key={block.key} entry={entry} part={part} questions={questions} />;
            })}
        </div>
    );
}

function ActivityRow({ entry, questions, hiddenPartId, skip }: { entry: AgentActivityEntry; questions?: AgentActivityLogQuestions; hiddenPartId?: string; skip?: ReadonlySet<string> }) {
    const t = useAgenticoI18n();

    // A message in parts (remote agent, CR-004): the parts say it all; a status line only while
    // nothing arrived yet, or when the turn stopped or failed.
    if (entry.kind === 'thinking' && entry.parts) {
        // While the turn runs the spinner stays under what arrived, with the time it has been at it: a long
        // reasoning or a slow tool is seen to go on, not mistaken for a turn that stopped.
        const showStatus = entry.status === 'error' || entry.status === 'stopped' || entry.status === 'running';
        const shown = skip ? entry.parts.filter((p) => !skip.has(p.id)).length : entry.parts.length;
        return (
            <li className="text-xs text-muted-foreground">
                {shown > 0 && <MessageParts entry={entry} questions={questions} hiddenPartId={hiddenPartId} skip={skip} />}
                {showStatus && (
                    <div className={`flex items-start gap-1.5 ${shown > 0 ? 'mt-1' : ''}`}>
                        <span className="pt-px"><ActivityStatusIcon status={entry.status} /></span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{thinkingDisplayLabel(entry, t)}{entry.status === 'running' && <Elapsed />}</span>
                    </div>
                )}
            </li>
        );
    }

    const segments = entry.kind === 'thinking' && entry.detail ? parseDetailSegments(entry.detail) : [];
    const codeSegments = segments.filter((s): s is Extract<DetailSegment, { type: 'code' }> => s.type === 'code');
    const textSegments = segments.filter((s) => s.type === 'text' && s.content.trim());
    const label = entry.kind === 'thinking' ? thinkingDisplayLabel(entry, t) : entry.label;

    return (
        <li className="text-xs text-muted-foreground">
            {/* `items-start`, non `items-center`: l'etichetta va a capo invece di troncarsi
                (niente `truncate`/ellissi), e le righe successive devono restare allineate
                sotto la prima, non sotto l'icona di stato — l'icona (larghezza fissa via
                shrink-0) e il testo (flex-1) restano comunque due colonne separate qualunque
                sia l'altezza del testo. */}
            <div className="flex items-start gap-1.5">
                <span className="pt-px"><ActivityStatusIcon status={entry.status} /></span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{label}</span>
            </div>
            {codeSegments.length > 0 && (
                <div className="mt-1 ml-[18px] space-y-1">
                    {codeSegments.map((seg, i) => <DetailCodeBlock key={i} content={seg.content} language={seg.language} />)}
                </div>
            )}
            {textSegments.length > 0 && (
                // Testo libero, non incastonato in un box — stessa resa delle altre righe
                // ("Sto ricontrollando…" ecc.), niente bordo/sfondo/scroll proprio: scorre con
                // lo scroll principale del pannello, non con un secondo scroll interno. Markdown
                // GFM con `ChatMarkdown` del framework (CR-004: tabelle, elenchi, titoli).
                <div className="mt-1 ml-[18px] space-y-2">
                    {textSegments.map((seg, i) => (
                        <ChatMarkdown key={i} content={seg.content.trim()} tone="muted" className="break-words text-xs leading-relaxed" />
                    ))}
                </div>
            )}
        </li>
    );
}

/** CR-018: what the summary next to the name of the agent sums up, open: its reasoning and its steps as they are. */
function ProcessDetails({ parts }: { parts: AgentMessagePart[] }) {
    return (
        <div className="mb-1 space-y-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
            {parts.map((part) => part.type === 'reasoning'
                ? <ChatMarkdown key={part.id} content={part.text} tone="muted" streaming={part.streaming} className="break-words text-xs leading-relaxed" />
                : part.type === 'tool' ? (
                    <div key={part.id} className="flex items-start gap-1.5">
                        <Icon name={STEP_ICONS[part.status]} size={12} className={`mt-0.5 shrink-0 ${part.status === 'running' ? 'animate-spin' : ''}`} />
                        <span className={`min-w-0 break-words ${part.status === 'error' ? 'text-destructive' : ''}`}>{part.label}</span>
                    </div>
                ) : null)}
        </div>
    );
}

/**
 * CR-018: a turn of the agent in a chat that shows who speaks: its picture in the column on the left; next to it
 * its name and, closed, the reasoning and steps it did before it wrote; under them what it wrote, the whole width.
 */
function AgentTurn({ speaker, entries, questions, docked }: {
    speaker: ChatAuthor;
    entries: AgentActivityEntry[];
    questions?: AgentActivityLogQuestions;
    docked?: DockedQuestions | null;
}) {
    const lead = leadingParts(entries[0]);
    const skip = lead.length ? new Set(lead.map((p) => p.id)) : undefined;
    const [open, setOpen] = useState(false);
    return (
        <div className="flex items-start gap-2 pt-1.5">
            <span className={`flex shrink-0 justify-center pt-px ${GUTTER}`}><ChatAvatar author={speaker} /></span>
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 pb-0.5">
                    <span className="truncate text-xs font-medium text-foreground">{speaker.name}</span>
                    {lead.length > 0 && <ProcessSummary parts={lead} open={open} onToggle={() => setOpen((value) => !value)} />}
                </div>
                {open && lead.length > 0 && <ProcessDetails parts={lead} />}
                <ul className="space-y-0.5">
                    {entries.map((entry, index) => (
                        <ActivityRow
                            key={entry.id}
                            entry={entry}
                            questions={questions}
                            hiddenPartId={docked?.entry.id === entry.id ? docked.part.id : undefined}
                            {...(index === 0 && skip ? { skip } : {})}
                        />
                    ))}
                </ul>
            </div>
        </div>
    );
}

/** Il log di attività di un agente, usato dal pannello globale (Agentico) — ogni agente ora
 * ci passa attraverso, il pannello embedded legacy (AgentFollowUp) è stato ritirato una volta
 * migrato anche l'ultimo consumer (import HTML/JSX, vedi ComponentEditPage.tsx). Un solo posto
 * per l'icon-system e la logica "sto pensando" transitorio/collassabile.
 *
 * One `<li>` per turn (CR-004): the message of the person, sticky at the top while its turn
 * scrolls, then what the agent did and said. Entries before the first message of the person
 * (an opening without text) form a turn of their own, without a bubble. */
export function AgentActivityLog({ activity, questions, docked, pinUserMessages = true, messageActions, speaker, showAuthors, events }: {
    activity: AgentActivityEntry[];
    /** CR-018: who answers, shown at the start of each turn of the agent. */
    speaker?: ChatAuthor;
    /** CR-018: the picture of who wrote each message of a person, on its left. Default: when there is a
     * `speaker` or a message with an `author` (a chat that shows who speaks). */
    showAuthors?: boolean;
    /** CR-016: Retry from here and Edit on the messages of the person. */
    messageActions?: UserMessageActions;
    questions?: AgentActivityLogQuestions;
    /** Questions docked at the bottom of the panel (CR-005): left out of the thread. */
    docked?: DockedQuestions | null;
    /** The message of the person sticks at the top while its turn scrolls (default). Off while
     * questions are docked, so the thread has more room. */
    pinUserMessages?: boolean;
    /** CR-019: what happened around this chat, placed among its turns by time. */
    events?: readonly ThreadEvent[];
}) {
    if (activity.length === 0 && !events?.length) return null;
    const authors = showAuthors ?? (Boolean(speaker) || activity.some((entry) => entry.kind === 'user' && entry.author));
    const turns: Array<{ user?: AgentActivityEntry; entries: AgentActivityEntry[] }> = [];
    for (const entry of activity) {
        if (entry.kind === 'user' || turns.length === 0) turns.push(entry.kind === 'user' ? { user: entry, entries: [] } : { entries: [entry] });
        else turns[turns.length - 1].entries.push(entry);
    }
    // CR-019: the events of the host before the turn they came before, the later ones at the end.
    const slots = placeEvents(turns.map((turn) => (turn.user ?? turn.entries[0])?.at), events ?? []);
    return (
        <ul className="space-y-0.5">
            {turns.map((turn, index) => (
                <React.Fragment key={turn.user?.id ?? turn.entries[0]?.id}>
                {slots[index].map((event) => <ThreadEventCard key={event.id} event={event} />)}
                <li>
                    {turn.user && <UserMessageBubble entry={turn.user} pinned={pinUserMessages} actions={messageActions} cut={interrupted(turn.entries)} showAuthor={authors} />}
                    {speaker && turn.entries.length > 0 ? (
                        <AgentTurn speaker={speaker} entries={turn.entries} questions={questions} docked={docked} />
                    ) : turn.entries.length > 0 && (
                        <ul className="space-y-0.5">
                            {turn.entries.map((entry) => (
                                <ActivityRow key={entry.id} entry={entry} questions={questions} hiddenPartId={docked?.entry.id === entry.id ? docked.part.id : undefined} />
                            ))}
                        </ul>
                    )}
                </li>
                </React.Fragment>
            ))}
            {slots[turns.length].map((event) => <ThreadEventCard key={event.id} event={event} />)}
        </ul>
    );
}
