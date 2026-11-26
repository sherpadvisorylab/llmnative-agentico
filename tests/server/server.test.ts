// @vitest-environment node
// CR-025: the server of Agentico end to end on `handle(Request)`, with the providers, the runner and the memory faked.
import { describe, expect, it } from 'vitest';
import type { AIProviderAdapter } from '@llmnative/react/server';
import { createAgenticoServer, memoryStores, type AgenticoIdentity, type RunnerConnection } from '../../src/server';

const ana: AgenticoIdentity = { user: { id: 'ana' }, role: 'member', project: 'cms', tenant: 'acme' };
const admin: AgenticoIdentity = { user: { id: 'adele' }, role: 'admin', project: 'cms', tenant: 'acme' };
const boss: AgenticoIdentity = { user: { id: 'bea' }, role: 'platform', project: 'cms' };

/** A runner that remembers what the fleet asked of it. */
function fakeRunner() {
    const calls: Array<{ what: string; args: unknown[] }> = [];
    const tenants: Array<{ id: string; name: string; createdAt: string }> = [];
    let approved = false;
    const connection = (url: string, key?: string): RunnerConnection => ({
        async pair(code, name, project) {
            calls.push({ what: 'pair', args: [url, code, name, project] });
            return { key: 'rk_platform_secret_cms', record: { id: 'pk1', kind: 'platform', name: name ?? '', permissions: [], createdAt: '', expiresAt: null, ...(project ? { project } : {}) }, version: '1.2.0' };
        },
        async requestPairing(name, project) {
            calls.push({ what: 'requestPairing', args: [url, name, project] });
            return { request: 'pr_secret_request', code: 'ABCD-EFGH', approveUrl: `${url}/console/?approve=ABCD-EFGH`, expiresAt: new Date(Date.now() + 600_000).toISOString(), interval: 2 };
        },
        async pollPairing(request) {
            calls.push({ what: 'pollPairing', args: [request] });
            return approved ? { status: 'approved', key: 'rk_platform_secret_cms', record: { id: 'pk1', kind: 'platform', name: 'x', permissions: [], createdAt: '', expiresAt: null }, version: '1.2.0' } : { status: 'pending' };
        },
        platform: {
            async status() {
                calls.push({ what: 'status', args: [key] });
                return { version: '1.2.0', agentImage: 'x', load: { chats: 0, answering: 0, completions: 0, maxChats: 4 }, machine: { totalBytes: 1, availableBytes: 1, cpus: 2 }, tenants };
            },
            async tenants() { return tenants; },
            async createTenant(id, options) {
                calls.push({ what: 'createTenant', args: [id, options?.keyPermissions] });
                tenants.push({ id, name: options?.name ?? id, createdAt: '' });
                return { tenant: tenants.at(-1)!, key: `rk_secret_key_of_${id}`, keyRecord: { id: `k-${id}`, kind: 'project', tenant: id, name: 'x', permissions: [], createdAt: '', expiresAt: null } };
            },
            async createKey(tenant) { return { key: `rk_secret_key2_of_${tenant}`, record: { id: `k2-${tenant}`, kind: 'project', tenant, name: 'x', permissions: [], createdAt: '', expiresAt: null } }; },
            async revokeKey() { return true; },
            async revokePlatformKey(id) { calls.push({ what: 'revokePlatformKey', args: [id] }); return true; },
        },
    });
    return { connection, calls, approve: () => { approved = true; } };
}

/** A provider adapter that accepts the key `good-key` only. */
const fakeAdapter = async (provider: string, fields: Record<string, string>): Promise<AIProviderAdapter> => ({
    id: provider,
    label: provider,
    defaultModel: 'm',
    async validateApiKey() { return fields.apiKey === 'good-key' ? { valid: true } : { valid: false, error: 'rejected by the provider' }; },
    async getCapabilities() { return { models: [{ id: 'm1', name: 'Model 1' }] } as never; },
    async complete(request: unknown) { return { type: 'text', text: `answer to ${String((request as { prompt?: string }).prompt)}` } as never; },
} as unknown as AIProviderAdapter);

function setup() {
    const stores = memoryStores();
    const runner = fakeRunner();
    const fetched: Array<{ url: string; init: RequestInit }> = [];
    const lines: string[] = [];
    let who: AgenticoIdentity | null = ana;
    const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
        const url = String(input);
        fetched.push({ url, init });
        if (url.startsWith('https://memory.test/')) {
            const key = new Headers(init.headers).get('x-api-key');
            if (key !== 'mem-key') return new Response('{}', { status: 401 });
            if (url.endsWith('/search')) return Response.json({ results: [{ id: 'd1', chunk: 'a passage', similarity: 0.9, metadata: { title: 'Decision' } }] });
            if (init.method === 'PATCH') return new Response('{}', { status: 404 });
            return Response.json({ id: 'doc-1' });
        }
        if (url.startsWith('https://runner.test/v1/')) return new Response('{"type":"done"}\n', { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
        if (url.startsWith('https://api.openai.com/')) return Response.json({ ok: true });
        return new Response('{}', { status: 404 });
    }) as typeof fetch;
    const server = createAgenticoServer({
        identity: async () => who,
        records: stores.records,
        secrets: stores.secrets,
        platformName: 'Test CMS',
        basePath: '/api/agentico',
        adapter: fakeAdapter,
        fetch: fetchImpl,
        connectRunner: runner.connection,
        tenants: async () => [{ id: 'acme', name: 'Acme' }, { id: 'beta', name: 'Beta' }],
        sessionHeaders: ['x-session'],
        log: (event, details) => lines.push(JSON.stringify({ event, ...details })),
    });
    const call = async (as: AgenticoIdentity | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
        who = as;
        const response = await server.handle(new Request(`https://host.test/api/agentico${path}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
        const text = await response.text();
        let json: any = text;
        try { json = JSON.parse(text); } catch { /* a stream */ }
        return { status: response.status, json, text };
    };
    return { server, call, stores, runner, fetched, lines };
}

describe('the server of Agentico', () => {
    it('knows who asks: the namespace is <project>-<tenant>; nobody signed in gets nothing', async () => {
        const { call } = setup();
        expect((await call(null, 'GET', '/me')).status).toBe(401);
        expect((await call(ana, 'GET', '/me')).json).toMatchObject({ namespace: 'cms-acme', role: 'member' });
        expect((await call(boss, 'GET', '/me')).json.namespace).toBe('cms');
    });

    it('cloud connections: an admin connects a key the provider accepts; nobody ever reads it back', async () => {
        const { call, stores, lines } = setup();
        expect((await call(ana, 'POST', '/connections/openai', { fields: { apiKey: 'good-key' } })).status).toBe(403);
        expect((await call(admin, 'POST', '/connections/openai', { fields: { apiKey: 'bad-key' } })).json).toEqual({ ok: false, error: 'rejected by the provider' });
        expect((await call(admin, 'POST', '/connections/openai', { fields: { apiKey: 'good-key' } })).json).toEqual({ ok: true });
        const seen = await call(ana, 'GET', '/connections');
        expect(seen.json.providers.map((p: { id: string }) => p.id)).toEqual(['openai']);
        expect(seen.text).not.toContain('good-key');
        expect(lines.join('\n')).not.toContain('good-key');
        // Another namespace of the project: only the platform reaches it.
        expect((await call(admin, 'GET', '/connections?namespace=cms-beta')).status).toBe(403);
        expect((await call(boss, 'GET', '/connections?namespace=cms-beta')).json.providers).toEqual([]);
        expect((await call(boss, 'GET', '/connections?namespace=crm-x')).status).toBe(404);
        expect(JSON.stringify(await stores.records.list('agentico_connections'))).not.toContain('good-key');
        expect((await call(ana, 'GET', '/connections/openai/models')).json.models[0].id).toBe('m1');
        expect((await call(ana, 'POST', '/ai/complete', { provider: 'openai', request: { model: 'm1', prompt: 'hi' } })).json.result.text).toBe('answer to hi');
        expect((await call(ana, 'POST', '/ai/complete', { provider: 'mistral', request: { model: 'x', prompt: 'hi' } })).status).toBe(409);
    });

    it('the proxy puts the key of the namespace in only towards its provider', async () => {
        const { call, fetched } = setup();
        await call(admin, 'POST', '/connections/openai', { fields: { apiKey: 'good-key' } });
        const placeholder = 'llmnative-server-credential:cms-acme:openai';
        const proxy = (target: string, auth: string) => call(ana, 'GET', `/ai/proxy?url=${encodeURIComponent(target)}`, undefined, { authorization: auth, 'x-session': 'host-session', 'x-llmnative-proxy': '1' });
        const ok = await proxy('https://api.openai.com/v1/models', `Bearer ${placeholder}`);
        expect(ok.status).toBe(200);
        const sent = new Headers(fetched.at(-1)!.init.headers);
        expect([sent.get('authorization'), sent.get('x-session'), sent.get('x-llmnative-proxy')]).toEqual(['Bearer good-key', null, null]);
        expect((await proxy('https://evil.test/steal', `Bearer ${placeholder}`)).status).toBe(403);
        expect((await proxy('https://api.openai.com/v1/models', 'Bearer llmnative-server-credential:cms-beta:openai')).status).toBe(404);
    });

    it('runners: the platform connects one by asking it, with its project; a namespace goes on it; people reach it as themselves', async () => {
        const { call, runner, fetched, lines } = setup();
        expect((await call(admin, 'GET', '/runners')).status).toBe(403);
        const started = await call(boss, 'POST', '/runners/pairings', { url: 'https://runner.test' });
        expect(started.json).toMatchObject({ code: 'ABCD-EFGH' });
        expect(started.text).not.toContain('pr_secret_request');
        expect(runner.calls.find((c) => c.what === 'requestPairing')!.args).toEqual(['https://runner.test', 'Test CMS', 'cms']);
        expect((await call(boss, 'GET', `/runners/pairings/${started.json.id}`)).json).toEqual({ status: 'pending' });
        runner.approve();
        const approved = await call(boss, 'GET', `/runners/pairings/${started.json.id}`);
        expect(approved.json).toMatchObject({ status: 'approved', runner: { url: 'https://runner.test', name: 'runner.test', isDefault: true } });
        expect(approved.text).not.toContain('rk_platform');
        expect((await call(boss, 'GET', '/runners')).json.runners).toHaveLength(1);

        // A person's first request puts the namespace on the default runner: tenant cms-acme, a key of its own.
        const reply = await call(ana, 'POST', '/runner/v1/chats', { id: 'abcdef12', tools: [] });
        expect(reply.status).toBe(200);
        expect(runner.calls.find((c) => c.what === 'createTenant')!.args[0]).toBe('cms-acme');
        const sent = fetched.at(-1)!;
        expect(sent.url).toBe('https://runner.test/v1/chats');
        expect(new Headers(sent.init.headers).get('authorization')).toBe('Bearer rk_secret_key_of_cms-acme');
        expect(new Headers(sent.init.headers).get('x-runner-user')).toBe('ana');
        expect((await call(ana, 'GET', '/runner/v1/platform/status')).status).toBe(404);
        // The accounts of the namespace itself: its admins only, without a person.
        expect((await call(ana, 'GET', '/runner-namespace/v1/accounts')).status).toBe(403);
        await call(admin, 'GET', '/runner-namespace/v1/accounts');
        expect(new Headers(fetched.at(-1)!.init.headers).get('x-runner-user')).toBeNull();
        expect((await call(admin, 'POST', '/runner-namespace/v1/chats', {})).status).toBe(404);

        // Projects: each namespace of the project, the tenants the host knows included.
        const projects = await call(boss, 'GET', '/projects');
        expect(projects.json.namespaces.map((n: { namespace: string }) => n.namespace)).toEqual(['cms', 'cms-acme', 'cms-beta']);
        expect(projects.json.namespaces.find((n: { namespace: string }) => n.namespace === 'cms-acme')).toMatchObject({ name: 'Acme', runner: { name: 'runner.test' } });
        // A runner a namespace uses is not removed.
        const id = (await call(boss, 'GET', '/runners')).json.runners[0].id;
        expect((await call(boss, 'DELETE', `/runners/${id}`)).status).toBe(409);
        expect(lines.join('\n')).not.toMatch(/rk_|pr_secret/);
    });

    it('memories: the platform adds one that answers with its key; each namespace reads and writes its own container', async () => {
        const { call, fetched } = setup();
        expect((await call(boss, 'POST', '/memories', { apiUrl: 'https://memory.test', key: 'wrong' })).status).toBe(422);
        const added = await call(boss, 'POST', '/memories', { name: 'Sherpa', apiUrl: 'https://memory.test/', mcpUrl: 'https://memory.test/mcp', key: 'mem-key' });
        expect(added.json.memory).toMatchObject({ name: 'Sherpa', apiUrl: 'https://memory.test', mcpUrl: 'https://memory.test/mcp' });
        expect(added.text).not.toContain('mem-key');
        expect((await call(ana, 'GET', '/memory')).json).toEqual({ configured: false });
        expect((await call(ana, 'POST', '/memory/search', { query: 'x' })).status).toBe(409);
        // A memory of the project is not the admin's: to it, it does not exist (CR-027).
        expect((await call(admin, 'PUT', '/namespaces/cms-acme', { memoryId: added.json.memory.id })).status).toBe(404);
        expect((await call(boss, 'PUT', '/namespaces/cms-acme', { memoryId: added.json.memory.id })).status).toBe(200);
        expect((await call(boss, 'PUT', '/namespaces/crm-acme', { memoryId: added.json.memory.id })).status).toBe(404);
        expect((await call(ana, 'GET', '/memory')).json).toEqual({ configured: true, apiUrl: 'https://memory.test', mcpUrl: 'https://memory.test/mcp', namespace: 'cms-acme' });
        const found = await call(ana, 'POST', '/memory/search', { query: 'decisions' });
        expect(found.json.results).toEqual([{ id: 'd1', title: 'Decision', content: 'a passage', score: 0.9, metadata: { title: 'Decision' } }]);
        expect(fetched.at(-1)!.url).toBe('https://memory.test/ns/cms-acme/search');
        const written = await call(ana, 'POST', '/memory/write', { title: 'A decision', content: 'We chose X.', documentId: 'decision-x' });
        expect(written.json).toEqual({ id: 'doc-1' });
        expect(fetched.at(-1)!.url).toBe('https://memory.test/ns/cms-acme/document');
        expect(JSON.parse(String(fetched.at(-1)!.init.body))).toMatchObject({ id: 'decision-x', metadata: { title: 'A decision', tags: 'cms-acme' } });
        expect((await call(boss, 'DELETE', `/memories/${added.json.memory.id}`)).status).toBe(409);
    });
    it('memories owned by namespaces: each admin administers its own, a shared one is left, not removed (CR-027)', async () => {
        const { call, stores } = setup();
        const beta: AgenticoIdentity = { user: { id: 'bob' }, role: 'admin', project: 'cms', tenant: 'beta' };
        const own = await call(admin, 'POST', '/memories', { name: 'Acme memory', apiUrl: 'https://memory.test', key: 'mem-key' });
        expect(own.status).toBe(201);
        expect((await stores.records.get<{ id: string; owners?: string[] }>('agentico_memories', own.json.memory.id))?.owners).toEqual(['cms-acme']);
        // The same address under another tenant: its own memory, its own key.
        expect((await call(beta, 'POST', '/memories', { name: 'Beta memory', apiUrl: 'https://memory.test', key: 'mem-key' })).status).toBe(201);
        expect((await call(beta, 'POST', '/memories', { apiUrl: 'https://memory.test', key: 'mem-key' })).status).toBe(409);
        expect((await call(admin, 'GET', '/memories')).json.memories.map((m: { name: string }) => m.name)).toEqual(['Acme memory']);
        expect((await call(boss, 'GET', '/memories')).json.memories.map((m: { name: string }) => m.name)).toEqual(['Acme memory', 'Beta memory']);
        expect((await call(ana, 'GET', '/memories')).status).toBe(403);
        // The admin puts its own namespace on its own memory, never another namespace nor another's memory.
        expect((await call(admin, 'PUT', '/namespaces/cms-acme', { memoryId: own.json.memory.id })).status).toBe(200);
        expect((await call(admin, 'PUT', '/namespaces/cms-beta', { memoryId: own.json.memory.id })).status).toBe(403);
        const betaId = (await call(beta, 'GET', '/memories')).json.memories[0].id;
        expect((await call(admin, 'PUT', '/namespaces/cms-acme', { memoryId: betaId })).status).toBe(404);
        expect((await call(admin, 'PATCH', `/memories/${betaId}`, { name: 'Mine now' })).status).toBe(404);
        expect((await call(admin, 'PUT', '/namespaces/cms-acme', { runnerId: 'r1' })).status).toBe(403);
        expect((await call(ana, 'GET', '/memory')).json).toMatchObject({ configured: true, namespace: 'cms-acme' });
        // A memory shared by two tenants (as the memory of a runner): one owner leaves it, the other keeps it.
        const shared = { id: 'shared', name: 'Runner memory', apiUrl: 'https://memory.test', owners: ['cms-acme', 'cms-beta'], createdAt: 1 };
        await stores.records.put('agentico_memories', shared);
        await stores.secrets.set('memory/shared/key', 'mem-key');
        await call(admin, 'PUT', '/namespaces/cms-acme', { memoryId: 'shared' });
        expect((await call(admin, 'DELETE', '/memories/shared')).status).toBe(200);
        expect((await stores.records.get<{ id: string; owners?: string[] }>('agentico_memories', 'shared'))?.owners).toEqual(['cms-beta']);
        expect((await call(ana, 'GET', '/memory')).json).toEqual({ configured: false });
        // The last owner removes it, unless a namespace uses it.
        expect((await call(admin, 'DELETE', `/memories/${own.json.memory.id}`)).status).toBe(200);
        expect(await stores.records.get('agentico_memories', own.json.memory.id)).toBeNull();
    });
});
