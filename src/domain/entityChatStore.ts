// Chat Agentico legata a UN'entità salvata (es. un tema) — scrive SOLO al salvataggio riuscito
// dell'entità che quella conversazione ha popolato (vedi AgenticoContext.commitEntityChat), e la
// persiste per intero: `history` (AIConversationTurn[], dato puro) permette un resume vero — il
// modello può continuare da lì — non solo un replay in sola lettura.
//
// Nessuna scrittura = nessuna chat mai salvata per quell'entità (creazione manuale, o
// un'estrazione abbandonata senza salvare — sparisce da sola, mai persistita). Una sola chat per
// entità: un nuovo salvataggio con una nuova estrazione associata SOVRASCRIVE quella precedente
// (decisione esplicita — non una cronologia di tentativi). Un salvataggio SENZA nessuna
// estrazione coinvolta (edit manuale) non tocca lo store — vedi commitEntityChat, che è un no-op
// quando non c'è un taskId da cui pescare uno snapshot.
import type { AIConversationTurn } from '@llmnative/react';
import type { AgentMessagePart } from './messageParts';

/** Stessa forma di AgentActivityEntry (agentico/presentation/useAgent.ts) — ridefinita qui invece
 * di importata: il domain layer non dipende dal presentation layer, e questi campi sono
 * semplici dati (mai funzioni), quindi TypeScript accetta un AgentActivityEntry[] ovunque sia
 * richiesto questo tipo per compatibilità strutturale, senza bisogno di un cast esplicito. */
export interface EntityChatActivityEntry {
    id:      string;
    kind:    'user' | 'thinking' | 'tool';
    label:   string;
    status:  'running' | 'done' | 'error' | 'stopped';
    detail?: string;
    toolNames?: string[];
    attachmentNames?: string[];
    /** The message in parts (CR-004): saved and reloaded as they are. Absent in chats saved before
     * 0.3.0, which show `detail` as before. */
    parts?: AgentMessagePart[];
}

export interface EntityChatSnapshot {
    /** Host scope (tenant, company…) the chat belongs to — see AgenticoScope. */
    scopeId:    string;
    subagentId: string;
    entityId:   string;
    /** TParams grezzo (pre-manifest.toParams, es. `{ url }` per theme) con cui la sessione
     * originale era stata avviata — necessario per ricostruire context/tools al resume (vedi
     * useAgent.resume/SubagentRunner.resumeSeed): senza, `manifest.toParams` non avrebbe nulla
     * da validare/convertire per riavviare la sessione. */
    params:     Record<string, unknown>;
    history:    AIConversationTurn[];
    activity:   EntityChatActivityEntry[];
    /** When it was last saved: its last message. */
    savedAt:    number;
    /** CR-010: when it started (its first save), kept by every later save. Absent on a chat saved
     * before 0.9.0: read it with `chatStartedAt`. */
    startedAt?: number;
    /** CR-011: its own title, written by the model from the chat or by the person; kept by every
     * later save. Absent: `title` (from its params). Read it with `chatTitle`. */
    name?: string;
    /** Who wrote `name`: a title of the person is never replaced by one of the model. */
    namedBy?: 'model' | 'person';
    /** Etichetta human-friendly dell'entità (es. il nome del tema) — usata dallo storico chat
     * di Agentico (vedi Agentico.tsx) per mostrare "cosa" senza dover rileggere l'entità stessa
     * dal suo DataProviderAdapter (che questo store, domain-side, non possiede). */
    title:      string;
}

let storageKey = 'llmnative.agentico.entityChat';

/** Sets the localStorage key of the chat store — call once at startup, before any read. */
export function configureEntityChatStore(options: { storageKey: string }): void {
    storageKey = options.storageKey;
}

// Snapshots written before the scope rename carry `tenantId`: read them as `scopeId`.
function normalize(entry: unknown): EntityChatSnapshot | null {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Partial<EntityChatSnapshot> & { tenantId?: string };
    if (typeof record.entityId !== 'string') return null;
    const scopeId = record.scopeId ?? record.tenantId;
    if (typeof scopeId !== 'string') return null;
    const { tenantId: _legacy, ...rest } = record;
    return { ...rest, scopeId } as EntityChatSnapshot;
}

function readAll(): EntityChatSnapshot[] {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(normalize).filter((e): e is EntityChatSnapshot => e !== null) : [];
    } catch {
        return [];
    }
}

const listeners = new Set<() => void>();

/** CR-011: called when a chat is saved, renamed or removed (e.g. a list of the host reads them again). */
export function onEntityChatsChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function writeAll(entries: EntityChatSnapshot[]): void {
    try {
        localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch { /* quota superata o localStorage non disponibile — non fatale, è un extra */ }
    for (const listener of [...listeners]) listener();
}

const key = (scopeId: string, subagentId: string, entityId: string) => `${scopeId}:${subagentId}:${entityId}`;

/** La chat attualmente associata a un'entità — `null` se non ne è mai stata salvata una (o è
 * stata rimossa, vedi removeEntityChat). */
export function getEntityChat(scopeId: string, subagentId: string, entityId: string): EntityChatSnapshot | null {
    const k = key(scopeId, subagentId, entityId);
    return readAll().find((e) => key(e.scopeId, e.subagentId, e.entityId) === k) ?? null;
}

/** Sovrascrive (o crea) la chat associata a questa entità — vedi il commento in testa al file
 * per perché è sempre un overwrite, mai un accumulo. Its start (CR-010) stays the one of its first save. */
export function saveEntityChat(snapshot: Omit<EntityChatSnapshot, 'savedAt' | 'startedAt' | 'name' | 'namedBy'>): void {
    const k = key(snapshot.scopeId, snapshot.subagentId, snapshot.entityId);
    const all = readAll();
    const previous = all.find((e) => key(e.scopeId, e.subagentId, e.entityId) === k);
    const now = Date.now();
    const next = all.filter((e) => e !== previous);
    next.push({
        ...snapshot, savedAt: now, startedAt: previous ? chatStartedAt(previous) : now,
        // CR-011: its own title stays.
        ...(previous?.name ? { name: previous.name, namedBy: previous.namedBy } : {}),
    });
    writeAll(next);
}

/** The first message of the person in a chat, on one line; empty when they never wrote. */
const firstMessage = (snapshot: Pick<EntityChatSnapshot, 'activity'>): string => {
    const text = snapshot.activity.find((entry) => entry.kind === 'user' && entry.detail?.trim())?.detail ?? '';
    const line = text.trim().split('\n')[0].trim();
    return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line;
};

/**
 * CR-011: the title of a chat: its own (of the model or of the person), else the first message of the
 * person (no model could write one, e.g. none the chat may use), else the one of its params.
 */
export const chatTitle = (snapshot: Pick<EntityChatSnapshot, 'title' | 'name' | 'entityId' | 'activity'>): string =>
    snapshot.name || firstMessage(snapshot) || snapshot.title || snapshot.entityId;

/** CR-011: whether the person wrote in a chat (an opening message counts). */
export const chatHasPersonMessage = (snapshot: Pick<EntityChatSnapshot, 'activity'>): boolean =>
    snapshot.activity.some((entry) => entry.kind === 'user' && Boolean(entry.detail?.trim()));

/**
 * CR-011: gives a chat its own title. The person's (`by: 'person'`) replaces any, and an empty one gives
 * it back the automatic title; the model's never replaces the person's. False when the chat is gone or
 * the title was not taken. Its last save (`savedAt`) does not change: a rename is no message.
 */
export function renameEntityChat(scopeId: string, subagentId: string, entityId: string, title: string, by: 'model' | 'person' = 'person'): boolean {
    const k = key(scopeId, subagentId, entityId);
    const all = readAll();
    const chat = all.find((e) => key(e.scopeId, e.subagentId, e.entityId) === k);
    if (!chat || (by === 'model' && chat.namedBy === 'person')) return false;
    const name = title.trim().replace(/\s+/g, ' ').slice(0, 120);
    const { name: _name, namedBy: _namedBy, ...rest } = chat;
    const renamed: EntityChatSnapshot = name ? { ...rest, name, namedBy: by } : rest;
    writeAll(all.map((e) => (e === chat ? renamed : e)));
    return true;
}

/** CR-010: when a chat started; a chat saved before 0.9.0, which does not know it: its last save. */
export const chatStartedAt = (snapshot: Pick<EntityChatSnapshot, 'savedAt' | 'startedAt'>): number => snapshot.startedAt ?? snapshot.savedAt;

/** Rimuove la chat di un'entità — chiamata quando l'entità stessa viene eliminata, altrimenti
 * resterebbe un'entry orfana senza nulla a cui riattaccarsi. */
export function removeEntityChat(scopeId: string, subagentId: string, entityId: string): void {
    const k = key(scopeId, subagentId, entityId);
    writeAll(readAll().filter((e) => key(e.scopeId, e.subagentId, e.entityId) !== k));
}

/** Tutte le chat salvate di uno scope, le ultime iniziate prima (CR-010: riaprirne una non la sposta)
 * — per lo storico di Agentico (Agentico.tsx), che le mescola across subagent in un'unica lista. */
export function listEntityChats(scopeId: string): EntityChatSnapshot[] {
    return readAll().filter((e) => e.scopeId === scopeId).sort((a, b) => chatStartedAt(b) - chatStartedAt(a));
}

/** The id of the Agentico task of the chat of an entity: the same when the chat is resumed from
 * the history and when a page starts it again (AgenticoContext.startSubagent), so it stays one
 * task (CR-003). */
export const entityChatTaskId = (subagentId: string, entityId: string) => `entitychat-${subagentId}-${entityId}`;
