// CR-025: the browser side of the server of Agentico. Over HTTP it gives what the screens want: the
// `AIConnectionStore` of the framework (Cloud), the `RunnerFleet` of @llmnative/runner/ui (the runners of the project),
// a client of the runner of the namespace (the person's chats and subscriptions), the memories and the projects.
// No key ever comes here: the server keeps them.
import type { AIConnectionResult, AIConnectionsSnapshot, AIConnectionStore, AIModelDescriptor } from '@llmnative/react';
import { RunnerClient, type RunnerStatus } from '@llmnative/runner/client';
import type { RunnerEntry, RunnerFleet, RunnerPairingStart, RunnerPairingState, RunnerSshAccess } from '@llmnative/runner/ui';

export type AgenticoRole = 'platform' | 'admin' | 'member';
export type AgenticoMe = { user: { id: string; name?: string }; role: AgenticoRole; project: string; tenant?: string; namespace: string };
export type AgenticoMemory = { id: string; name: string; apiUrl: string; mcpUrl?: string };
export type AgenticoMemoryCheck = { ok: true } | { ok: false; error: 'rejected' | 'unreachable' | 'invalid'; status?: number };
export type AgenticoNamespaceRow = { namespace: string; tenant?: string; name?: string; runner?: { id: string; name?: string }; memory?: { id: string; name?: string } };
export type AgenticoMemoryHit = { id?: string; title?: string; content: string; score?: number };

export class AgenticoBackendError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string) {
        super(code);
        this.name = 'AgenticoBackendError';
        this.status = status;
        this.code = code;
    }
}

export type AgenticoBackendOptions = {
    /** Where the host mounted the server (e.g. `/api/agentico`). */
    baseUrl: string;
    /** The session of the host for each request (e.g. a bearer token). */
    headers?: () => Record<string, string> | Promise<Record<string, string>>;
    fetch?: typeof fetch;
    /** How often an installation reads its log. */
    pollMs?: number;
};

export interface AgenticoBackend {
    me(): Promise<AgenticoMe>;
    /** Cloud: the providers of the framework with the keys of the namespace (or of another, for the platform). */
    connections(namespace?: string): AIConnectionStore;
    /** The runners of the project: the store of the screens of @llmnative/runner/ui. */
    fleet: RunnerFleet;
    /** The runner of the namespace, as the person (their chats, models, subscriptions). */
    runner(): RunnerClient;
    /** The runner of the namespace, as the namespace itself: its own accounts (admins). */
    runnerOfNamespace(): RunnerClient;
    memories: {
        list(): Promise<AgenticoMemory[]>;
        check(input: { apiUrl: string; key: string }): Promise<AgenticoMemoryCheck>;
        add(input: { name?: string; apiUrl: string; mcpUrl?: string; key: string }): Promise<AgenticoMemory>;
        update(id: string, patch: { name?: string; mcpUrl?: string | null; key?: string }): Promise<AgenticoMemory>;
        remove(id: string): Promise<void>;
    };
    /** The memory of the namespace of the person. */
    memory: {
        get(): Promise<{ configured: false } | { configured: true; apiUrl: string; mcpUrl?: string; namespace: string }>;
        search(query: string, limit?: number): Promise<AgenticoMemoryHit[]>;
        write(input: { title: string; content: string; documentId?: string }): Promise<{ id?: string }>;
    };
    projects: {
        list(): Promise<{ project: string; namespaces: AgenticoNamespaceRow[] }>;
        set(namespace: string, patch: { runnerId?: string; memoryId?: string | null }): Promise<void>;
    };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createAgenticoBackend(options: AgenticoBackendOptions): AgenticoBackend {
    const base = options.baseUrl.replace(/\/+$/, '');
    const fetchImpl = (...args: Parameters<typeof fetch>) => (options.fetch ?? fetch)(...args);
    const pollMs = options.pollMs ?? 1500;

    async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
        const response = await fetchImpl(`${base}${path}`, {
            method,
            headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(await options.headers?.()) },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const text = await response.text();
        let parsed: unknown = {};
        try {
            parsed = text ? JSON.parse(text) : {};
        } catch {
            parsed = {};
        }
        if (!response.ok) {
            const code = parsed && typeof parsed === 'object' && 'error' in parsed ? String((parsed as { error: unknown }).error) : `http-${response.status}`;
            // A refused key is an outcome, not a failure: the caller reads it.
            if (response.status === 422 && parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed as T;
            throw new AgenticoBackendError(response.status, code);
        }
        return parsed as T;
    }

    const connections = (namespace?: string): AIConnectionStore => {
        const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';
        const provider = (id: string) => `/connections/${encodeURIComponent(id)}`;
        return {
            load: () => call<AIConnectionsSnapshot>('GET', `/connections${query}`),
            connect: (id, fields) => call<AIConnectionResult>('POST', `${provider(id)}${query}`, { fields }),
            disconnect: async (id) => { await call('DELETE', `${provider(id)}${query}`); },
            addAccount: (id, fields) => call<AIConnectionResult>('POST', `${provider(id)}/accounts${query}`, { fields }),
            removeAccount: async (id, accountId) => { await call('DELETE', `${provider(id)}/accounts/${encodeURIComponent(accountId)}${query}`); },
            orderAccounts: async (id, ids) => { await call('PUT', `${provider(id)}/accounts/order${query}`, { ids }); },
            setOrder: async (order) => { await call('PUT', `/connections/order${query}`, { order }); },
            models: async (id) => (await call<{ models: AIModelDescriptor[] }>('GET', `${provider(id)}/models${query}`)).models,
        };
    };

    let namespaces: AgenticoNamespaceRow[] = [];
    const fleet: RunnerFleet = {
        list: async () => {
            const [runners, projects] = await Promise.all([
                call<{ runners: RunnerEntry[] }>('GET', '/runners'),
                call<{ namespaces: AgenticoNamespaceRow[] }>('GET', '/projects').catch(() => ({ namespaces: [] })),
            ]);
            namespaces = projects.namespaces;
            return runners.runners;
        },
        add: async (input) => (await call<{ runner: RunnerEntry }>('POST', '/runners', input)).runner,
        update: async (id, patch) => { await call('PATCH', `/runners/${encodeURIComponent(id)}`, patch); },
        remove: async (id) => { await call('DELETE', `/runners/${encodeURIComponent(id)}`); },
        status: (id) => call<RunnerStatus>('GET', `/runners/${encodeURIComponent(id)}/status`),
        startPairing: (input) => call<RunnerPairingStart>('POST', '/runners/pairings', input),
        pairingStatus: (id) => call<RunnerPairingState>('GET', `/runners/pairings/${encodeURIComponent(id)}`),
        install: async (input: { name: string; domain: string; access: RunnerSshAccess }, onProgress) => {
            const { installId } = await call<{ installId: string }>('POST', '/runners/installs', input);
            let next = 0;
            for (;;) {
                await wait(pollMs);
                const state = await call<{ status: 'running' | 'done' | 'error'; lines: string[]; next: number; runnerId?: string; error?: string }>('GET', `/runners/installs/${encodeURIComponent(installId)}?from=${next}`);
                for (const line of state.lines) onProgress({ line });
                next = state.next;
                if (state.status === 'error') throw new Error(state.error ?? 'installation failed');
                if (state.status === 'done') {
                    const runners = await fleet.list();
                    const runner = runners.find((item) => item.id === state.runnerId);
                    if (!runner) throw new Error('installation failed');
                    return runner;
                }
            }
        },
        tenants: {
            list: async () => namespaces.map((row) => ({ id: row.namespace, name: row.name ?? row.namespace, ...(row.runner ? { runnerId: row.runner.id } : {}) })),
            assign: async (namespace, runnerId) => { await call('PUT', `/namespaces/${encodeURIComponent(namespace)}`, { runnerId }); },
        },
    };

    const runnerClient = (path: string) => new RunnerClient({ url: `${base}/${path}`, ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.headers ? { headers: options.headers } : {}) });

    return {
        me: () => call<AgenticoMe>('GET', '/me'),
        connections,
        fleet,
        runner: () => runnerClient('runner'),
        runnerOfNamespace: () => runnerClient('runner-namespace'),
        memories: {
            list: async () => (await call<{ memories: AgenticoMemory[] }>('GET', '/memories')).memories,
            check: (input) => call<AgenticoMemoryCheck>('POST', '/memories/check', input),
            add: async (input) => (await call<{ memory: AgenticoMemory }>('POST', '/memories', input)).memory,
            update: async (id, patch) => (await call<{ memory: AgenticoMemory }>('PATCH', `/memories/${encodeURIComponent(id)}`, patch)).memory,
            remove: async (id) => { await call('DELETE', `/memories/${encodeURIComponent(id)}`); },
        },
        memory: {
            get: () => call('GET', '/memory'),
            search: async (query, limit) => (await call<{ results: AgenticoMemoryHit[] }>('POST', '/memory/search', { query, ...(limit ? { limit } : {}) })).results,
            write: (input) => call('POST', '/memory/write', input),
        },
        projects: {
            list: () => call('GET', '/projects'),
            set: async (namespace, patch) => { await call('PUT', `/namespaces/${encodeURIComponent(namespace)}`, patch); },
        },
    };
}
