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
    savedAt:    number;
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

function writeAll(entries: EntityChatSnapshot[]): void {
    try {
        localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch { /* quota superata o localStorage non disponibile — non fatale, è un extra */ }
}

const key = (scopeId: string, subagentId: string, entityId: string) => `${scopeId}:${subagentId}:${entityId}`;

/** La chat attualmente associata a un'entità — `null` se non ne è mai stata salvata una (o è
 * stata rimossa, vedi removeEntityChat). */
export function getEntityChat(scopeId: string, subagentId: string, entityId: string): EntityChatSnapshot | null {
    const k = key(scopeId, subagentId, entityId);
    return readAll().find((e) => key(e.scopeId, e.subagentId, e.entityId) === k) ?? null;
}

/** Sovrascrive (o crea) la chat associata a questa entità — vedi il commento in testa al file
 * per perché è sempre un overwrite, mai un accumulo. */
export function saveEntityChat(snapshot: Omit<EntityChatSnapshot, 'savedAt'>): void {
    const k = key(snapshot.scopeId, snapshot.subagentId, snapshot.entityId);
    const next = readAll().filter((e) => key(e.scopeId, e.subagentId, e.entityId) !== k);
    next.push({ ...snapshot, savedAt: Date.now() });
    writeAll(next);
}

/** Rimuove la chat di un'entità — chiamata quando l'entità stessa viene eliminata, altrimenti
 * resterebbe un'entry orfana senza nulla a cui riattaccarsi. */
export function removeEntityChat(scopeId: string, subagentId: string, entityId: string): void {
    const k = key(scopeId, subagentId, entityId);
    writeAll(readAll().filter((e) => key(e.scopeId, e.subagentId, e.entityId) !== k));
}

/** Tutte le chat salvate di uno scope, più recenti prima — per lo storico di Agentico
 * (Agentico.tsx), che le mescola across subagent (theme, redirects, html-to-liquid) in un'unica
 * lista ordinata per data. */
export function listEntityChats(scopeId: string): EntityChatSnapshot[] {
    return readAll().filter((e) => e.scopeId === scopeId).sort((a, b) => b.savedAt - a.savedAt);
}
