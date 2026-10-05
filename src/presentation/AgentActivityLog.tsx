import React, { useLayoutEffect, useRef, useState } from 'react';
import { Code, Icon } from '@llmnative/react';
import type { AgentActivityEntry } from './useAgent';
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

/** Un pezzo di testo inline riconosciuto dal mini-markdown qui sotto. */
type InlineToken =
    | { type: 'text'; content: string }
    | { type: 'bold'; content: string }
    | { type: 'code'; content: string }
    | { type: 'link'; content: string; href: string };

/** Markdown inline minimo — **bold**, `code`, [link](url) — non un parser markdown completo
 * (stesso spirito di parseDetailSegments sopra): il modello a volte scrive prosa con questa
 * sintassi (riepiloghi, nomi di campo in bold, link alle fonti) e mostrarla letterale coi
 * simboli è peggio che non gestirla affatto. Niente liste/heading/tabelle: non servono in una
 * riga di log/riepilogo breve. */
function parseInlineMarkdown(text: string): InlineToken[] {
    const tokens: InlineToken[] = [];
    const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
        if (match.index > lastIndex) tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
        if (match[1] !== undefined) tokens.push({ type: 'bold', content: match[1] });
        else if (match[2] !== undefined) tokens.push({ type: 'code', content: match[2] });
        else if (match[3] !== undefined) tokens.push({ type: 'link', content: match[3], href: match[4] });
        lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) tokens.push({ type: 'text', content: text.slice(lastIndex) });
    return tokens;
}

function InlineMarkdown({ text }: { text: string }) {
    return (
        <>
            {parseInlineMarkdown(text).map((tok, i) => {
                if (tok.type === 'bold') return <strong key={i} className="font-semibold text-foreground">{tok.content}</strong>;
                if (tok.type === 'code') return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] break-words">{tok.content}</code>;
                if (tok.type === 'link') {
                    return (
                        <a key={i} href={tok.href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                            {tok.content}
                        </a>
                    );
                }
                return <React.Fragment key={i}>{tok.content}</React.Fragment>;
            })}
        </>
    );
}

/** Il contenuto di `detail` — testo semplice più eventuali blocchi di codice, ciascuno reso
 * col syntax-highlighter del framework invece che coi backtick grezzi in un <p>. */
function DetailContent({ text }: { text: string }) {
    const segments = parseDetailSegments(text);
    return (
        <>
            {segments.map((seg, i) => seg.type === 'code'
                ? <DetailCodeBlock key={i} content={seg.content} language={seg.language} />
                : (seg.content.trim() && <p key={i} className="whitespace-pre-wrap break-words"><InlineMarkdown text={seg.content} /></p>)
            )}
        </>
    );
}

/** Icona di stato di una voce di attività — icon-system del framework (Lucide), mai emoji.
 * "running" resta lo spinner a bordo rotante già usato da LoadingButton in tutto il CMS,
 * non un'icona Lucide: stessa identica animazione di ogni altro stato di caricamento. */
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

/** Una voce del log — le tool call sono una riga sola (etichetta già breve, niente da
 * espandere). I turni "sto pensando": codice E prosa (se presenti) sono SEMPRE visibili,
 * subito, mai dietro un click — nessun collapse a livello di riga. Due motivi, non uno solo:
 * (1) un dump JSON grezzo non ha "ragionamento" da nascondere; (2) il riepilogo del
 * micro-prompt "closing-summary" esiste PROPRIO perché l'utente lo legga — nasconderlo dietro
 * un chevron ne vanificherebbe lo scopo (il difetto segnalato: appariva un'etichetta
 * "Riepilogo:" da cliccare, che poi mostrava di nuovo "Riepilogo: …" per intero — la stessa
 * frase due volte, un click di troppo per qualcosa che dovrebbe essere già lì). La prosa vive
 * in un riquadro delimitato (bordo + sfondo, come un box di testo/uno "snippet"), con un
 * tetto di altezza e scroll interno solo se davvero molto lunga — mai nascosta, mai flottante
 * senza contenitore. I messaggi utente sono una bolla di chat allineata a destra — sempre per
 * intero — e "sticky" in cima allo scroll (stile IDE agentici: il prompt corrente resta
 * visibile mentre l'attività che genera scorre sotto). `sticky` su OGNI bolla utente, non solo
 * sull'ultima: è il normale comportamento a cascata degli elementi sticky (ogni bolla
 * successiva spinge via quella precedente non appena la raggiunge scorrendo) a garantire che
 * sia sempre e solo l'ultima a restare agganciata in un dato momento — nessuno stato/ref da
 * tracciare a mano. */
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
 * chatbot conversazionali per i turni utente lunghi. */
function UserMessageBubble({ entry }: { entry: AgentActivityEntry }) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);

    useLayoutEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        setOverflowing(el.scrollHeight > USER_BUBBLE_COLLAPSED_MAX_HEIGHT + 1);
    }, [entry.detail, entry.attachmentNames]);

    const collapsed = overflowing && !expanded;

    return (
        <li className="sticky top-0 z-10 flex justify-end border-b border-border/40 bg-background py-1.5">
            <div className="max-w-[85%] rounded-lg bg-primary/10 text-xs text-foreground">
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
        </li>
    );
}

function ActivityRow({ entry }: { entry: AgentActivityEntry }) {
    const t = useAgenticoI18n();
    if (entry.kind === 'user') return <UserMessageBubble entry={entry} />;

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
                // lo scroll principale del pannello, non con un secondo scroll interno.
                <div className="mt-1 ml-[18px] space-y-2">
                    {textSegments.map((seg, i) => (
                        <p key={i} className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                            <InlineMarkdown text={seg.content.trim()} />
                        </p>
                    ))}
                </div>
            )}
        </li>
    );
}

/** Il log di attività di un agente, usato dal pannello globale (Agentico) — ogni agente ora
 * ci passa attraverso, il pannello embedded legacy (AgentFollowUp) è stato ritirato una volta
 * migrato anche l'ultimo consumer (import HTML/JSX, vedi ComponentEditPage.tsx). Un solo posto
 * per l'icon-system e la logica "sto pensando" transitorio/collassabile. */
export function AgentActivityLog({ activity }: { activity: AgentActivityEntry[] }) {
    if (activity.length === 0) return null;
    return (
        <ul className="space-y-0.5">
            {activity.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
        </ul>
    );
}
