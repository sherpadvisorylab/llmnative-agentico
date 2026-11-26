// CR-025: the memories of a project (supermemory self-hosted): where its API is, its MCP server, and the key that
// writes, kept as a secret. Each namespace reads and writes its own container (`/ns/<namespace>`), so tenants and
// projects never mix.
import type { AgenticoRecords, AgenticoSecrets } from './ports';

export const MEMORIES = 'agentico_memories';

export interface MemoryRecord {
    id: string;
    name: string;
    /** The API: `<apiUrl>/ns/<namespace>/search`, `/document`. */
    apiUrl: string;
    /** The MCP server the agents and the IDE connect to. */
    mcpUrl?: string;
    /**
     * CR-027: the namespaces that administer it (a tenant's own memory; several: shared, e.g. the memory of a runner
     * its organizations use). None: a memory of the project, administered by the platform.
     */
    owners?: string[];
    createdAt: number;
}

export type MemoryEntry = Omit<MemoryRecord, 'createdAt'>;

/** Who looks at the memories: the platform (all of them), or the admin of a namespace (its own). */
export type MemoryViewer = { platform: true } | { platform: false; namespace: string };

/** Whether a viewer administers a memory. */
export const administers = (viewer: MemoryViewer, record: Pick<MemoryRecord, 'owners'>) => viewer.platform || !!record.owners?.includes(viewer.namespace);
export type MemoryCheck = { ok: true } | { ok: false; error: 'rejected' | 'unreachable' | 'invalid'; status?: number };
export type MemoryHit = { id?: string; title?: string; content: string; score?: number; metadata?: Record<string, unknown> };

export class MemoryError extends Error {
    readonly code: 'invalid' | 'not-found' | 'conflict' | 'unreachable' | 'rejected';

    constructor(code: MemoryError['code'], reason: string) {
        super(reason);
        this.name = 'MemoryError';
        this.code = code;
    }
}

const keySecret = (id: string) => `memory/${id}/key`;
const DOCUMENT_ID = /^[A-Za-z0-9_.:-]{1,120}$/;

function httpsUrl(value: string | undefined, required: boolean): string | undefined {
    const text = String(value ?? '').trim().replace(/\/+$/, '');
    if (!text) {
        if (required) throw new MemoryError('invalid', 'URL_REQUIRED');
        return undefined;
    }
    let parsed: URL;
    try {
        parsed = new URL(text);
    } catch {
        throw new MemoryError('invalid', 'INVALID_URL');
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new MemoryError('invalid', 'INVALID_URL');
    return text;
}

export type MemoriesDeps = { records: AgenticoRecords; secrets: AgenticoSecrets; fetch?: typeof fetch; newId?: () => string; now?: () => number };

export function createMemories(deps: MemoriesDeps) {
    const { records, secrets } = deps;
    const fetchImpl = deps.fetch ?? fetch;
    const newId = deps.newId ?? (() => crypto.randomUUID().replace(/-/g, '').slice(0, 12));
    const now = deps.now ?? Date.now;

    const recordOf = async (id: string) => {
        const record = await records.get<MemoryRecord>(MEMORIES, id);
        if (!record) throw new MemoryError('not-found', 'MEMORY_NOT_FOUND');
        return record;
    };
    const call = async (apiUrl: string, key: string, method: string, path: string, body?: unknown) => {
        try {
            return await fetchImpl(`${apiUrl}${path}`, {
                method,
                headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-api-key': key },
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
                signal: AbortSignal.timeout(20_000),
            });
        } catch {
            throw new MemoryError('unreachable', 'MEMORY_UNREACHABLE');
        }
    };
    const ns = (namespace: string) => `/ns/${encodeURIComponent(namespace)}`;
    const ofNamespace = async (id: string) => {
        const record = await recordOf(id);
        const key = await secrets.get(keySecret(id));
        if (!key) throw new MemoryError('not-found', 'KEY_NOT_FOUND');
        return { record, key };
    };

    const memories = {
        /** The memories a viewer administers (all of them without a viewer). */
        async list(viewer?: MemoryViewer): Promise<MemoryEntry[]> {
            return (await records.list<MemoryRecord>(MEMORIES))
                .filter((record) => !viewer || administers(viewer, record))
                .map(({ createdAt: _at, ...entry }) => entry)
                .sort((a, b) => a.name.localeCompare(b.name));
        },

        /** A memory the viewer administers, or not found (another tenant's looks the same as none). */
        async of(id: string, viewer?: MemoryViewer): Promise<MemoryRecord> {
            const record = await recordOf(id);
            if (viewer && !administers(viewer, record)) throw new MemoryError('not-found', 'MEMORY_NOT_FOUND');
            return record;
        },

        /** Whether a memory answers with these credentials: a search that finds nothing is fine. */
        async check(input: { apiUrl: string; key: string }): Promise<MemoryCheck> {
            let apiUrl: string;
            try {
                apiUrl = httpsUrl(input.apiUrl, true)!;
            } catch {
                return { ok: false, error: 'invalid' };
            }
            if (!String(input.key ?? '').trim()) return { ok: false, error: 'invalid' };
            try {
                const response = await call(apiUrl, input.key.trim(), 'POST', `${ns('agentico-connection-check')}/search`, { query: 'connection check', limit: 1 });
                if (response.ok) return { ok: true };
                return { ok: false, error: response.status === 401 || response.status === 403 ? 'rejected' : 'unreachable', status: response.status };
            } catch {
                return { ok: false, error: 'unreachable' };
            }
        },

        /**
         * Adds a memory once it answers with its key; `owner`: the namespace of the admin who adds it (a memory of the
         * project without). The same address twice only under different owners (each tenant its own key).
         */
        async add(input: { name?: string; apiUrl: string; mcpUrl?: string; key: string }, owner?: string): Promise<MemoryEntry> {
            const apiUrl = httpsUrl(input.apiUrl, true)!;
            const mcpUrl = httpsUrl(input.mcpUrl, false);
            const sameOwners = (record: MemoryRecord) => (owner ? !!record.owners?.includes(owner) : !record.owners?.length);
            if ((await records.list<MemoryRecord>(MEMORIES)).some((record) => record.apiUrl === apiUrl && sameOwners(record))) throw new MemoryError('conflict', 'MEMORY_ALREADY_CONNECTED');
            const checked = await memories.check({ apiUrl, key: input.key });
            if (!checked.ok) throw new MemoryError(checked.error === 'invalid' ? 'invalid' : checked.error, checked.error.toUpperCase());
            const id = newId();
            await secrets.set(keySecret(id), input.key.trim());
            const record: MemoryRecord = { id, name: String(input.name ?? '').trim().slice(0, 100) || new URL(apiUrl).hostname, apiUrl, ...(mcpUrl ? { mcpUrl } : {}), ...(owner ? { owners: [owner] } : {}), createdAt: now() };
            await records.put(MEMORIES, record);
            const { createdAt: _at, ...entry } = record;
            return entry;
        },

        /** Name and MCP address; a new key only when given (it is checked first). */
        async update(id: string, patch: { name?: string; mcpUrl?: string | null; key?: string }, viewer?: MemoryViewer): Promise<MemoryEntry> {
            const record = await memories.of(id, viewer);
            if (patch.key?.trim()) {
                const checked = await memories.check({ apiUrl: record.apiUrl, key: patch.key });
                if (!checked.ok) throw new MemoryError(checked.error === 'invalid' ? 'invalid' : checked.error, checked.error.toUpperCase());
                await secrets.set(keySecret(id), patch.key.trim());
            }
            const next: MemoryRecord = { ...record };
            if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim().slice(0, 100);
            if (patch.mcpUrl === null || patch.mcpUrl === '') delete next.mcpUrl;
            else if (typeof patch.mcpUrl === 'string') next.mcpUrl = httpsUrl(patch.mcpUrl, false);
            await records.put(MEMORIES, next);
            const { createdAt: _at, ...entry } = next;
            return entry;
        },

        /**
         * Removes a memory no namespace uses. An admin of one of several owners only leaves it to the others; the last
         * owner (or the platform) removes it.
         */
        async remove(id: string, inUse: boolean, viewer?: MemoryViewer): Promise<void> {
            const record = await memories.of(id, viewer);
            if (viewer && !viewer.platform && (record.owners?.length ?? 0) > 1) {
                await records.put<MemoryRecord>(MEMORIES, { ...record, owners: record.owners!.filter((owner) => owner !== viewer.namespace) });
                return;
            }
            if (inUse) throw new MemoryError('conflict', 'MEMORY_IN_USE');
            await secrets.delete(keySecret(id));
            await records.delete(MEMORIES, id);
        },

        /** A namespace becomes an owner of a memory (a memory shared, e.g. the one of a runner its tenants use). */
        async share(id: string, namespace: string): Promise<void> {
            const record = await recordOf(id);
            if (record.owners?.includes(namespace)) return;
            await records.put<MemoryRecord>(MEMORIES, { ...record, owners: [...(record.owners ?? []), namespace] });
        },

        /** A namespace stops owning a memory; the memory stays for its other owners (or the platform). */
        async unshare(id: string, namespace: string): Promise<void> {
            const record = await recordOf(id);
            if (!record.owners?.includes(namespace)) return;
            await records.put<MemoryRecord>(MEMORIES, { ...record, owners: record.owners.filter((owner) => owner !== namespace) });
        },

        /** Keeps a memory as given (a host taking over its memories): its key as a secret, its record as it is. */
        async put(record: Omit<MemoryRecord, 'createdAt'> & { createdAt?: number }, key?: string): Promise<void> {
            if (key) await secrets.set(keySecret(record.id), key.trim());
            await records.put<MemoryRecord>(MEMORIES, { ...record, apiUrl: httpsUrl(record.apiUrl, true)!, createdAt: record.createdAt ?? now() });
        },

        /** The key of a memory, for the host's own use on the server (a package of the IDE): never for a browser. */
        async keyOf(id: string): Promise<string | null> {
            return secrets.get(keySecret(id));
        },

        /** The passages of a namespace that answer a query, best first. */
        async search(id: string, namespace: string, query: string, limit = 10): Promise<MemoryHit[]> {
            if (!String(query ?? '').trim()) throw new MemoryError('invalid', 'QUERY_REQUIRED');
            const { record, key } = await ofNamespace(id);
            const response = await call(record.apiUrl, key, 'POST', `${ns(namespace)}/search`, { query: query.trim().slice(0, 2000), limit: Math.min(Math.max(Math.trunc(limit) || 10, 1), 50) });
            if (!response.ok) throw new MemoryError(response.status === 401 || response.status === 403 ? 'rejected' : 'unreachable', `MEMORY_${response.status}`);
            const body = await response.json().catch(() => ({})) as { results?: Array<Record<string, unknown>> };
            return (body.results ?? []).map((item) => {
                const metadata = (item.metadata && typeof item.metadata === 'object' ? item.metadata : undefined) as Record<string, unknown> | undefined;
                return {
                    ...(typeof item.id === 'string' ? { id: item.id } : {}),
                    ...(typeof metadata?.title === 'string' ? { title: metadata.title } : {}),
                    content: String(item.chunk ?? item.content ?? ''),
                    ...(typeof item.similarity === 'number' ? { score: item.similarity } : typeof item.score === 'number' ? { score: item.score } : {}),
                    ...(metadata ? { metadata } : {}),
                };
            });
        },

        /** Writes a document in a namespace; the same `documentId` replaces it. */
        async write(id: string, namespace: string, input: { title: string; content: string; documentId?: string }): Promise<{ id?: string }> {
            const title = String(input.title ?? '').trim().slice(0, 200);
            const content = String(input.content ?? '').trim();
            if (!title || !content || content.length > 200_000) throw new MemoryError('invalid', 'DOCUMENT_INVALID');
            if (input.documentId !== undefined && !DOCUMENT_ID.test(input.documentId)) throw new MemoryError('invalid', 'DOCUMENT_ID_INVALID');
            const { record, key } = await ofNamespace(id);
            const document = { content: `# ${title}\n\n${content}`, metadata: { title, tags: namespace } };
            if (input.documentId) {
                const updated = await call(record.apiUrl, key, 'PATCH', `${ns(namespace)}/document/${encodeURIComponent(input.documentId)}`, document);
                if (updated.ok) return { id: input.documentId };
                if (updated.status !== 404) throw new MemoryError(updated.status === 401 || updated.status === 403 ? 'rejected' : 'unreachable', `MEMORY_${updated.status}`);
            }
            const created = await call(record.apiUrl, key, 'POST', `${ns(namespace)}/document`, { ...document, ...(input.documentId ? { id: input.documentId } : {}) });
            if (!created.ok) throw new MemoryError(created.status === 401 || created.status === 403 ? 'rejected' : 'unreachable', `MEMORY_${created.status}`);
            const body = await created.json().catch(() => ({})) as { id?: unknown };
            return typeof body.id === 'string' ? { id: body.id } : {};
        },

        /** What an agent or an IDE needs to reach the memory of a namespace: never the key (asked apart, once). */
        async coordinates(id: string, namespace: string): Promise<{ apiUrl: string; mcpUrl?: string; namespace: string }> {
            const record = await recordOf(id);
            return { apiUrl: record.apiUrl, ...(record.mcpUrl ? { mcpUrl: record.mcpUrl } : {}), namespace };
        },
    };
    return memories;
}

export type Memories = ReturnType<typeof createMemories>;
