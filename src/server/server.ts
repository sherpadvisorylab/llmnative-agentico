// CR-025: the server of Agentico, one `handle(Request)` the host mounts under a path of its own (a route of Hono, a
// Cloud Function). Who asks comes from the host (`identity`); the namespace of the person is `<project>[-<tenant>]`.
// No answer and no log carries a key, a prompt or a reply.
import { RunnerError, type RunnerStatus } from '@llmnative/runner/client';
import { createConnections, type AdapterFactory } from './connections';
import { createMemories, MemoryError, type MemoryEntry, type MemoryViewer } from './memories';
import { inProject, namespaceOf, NamespaceError, tenantOf } from './namespace';
import type { AgenticoIdentity, AgenticoKnownTenant, AgenticoRecords, AgenticoRole, AgenticoSecrets } from './ports';
import { createFleet, FleetError, NAMESPACES, type NamespaceRecord, type RunnerConnection, type RunnerEntry, type RunnerViewer } from './runners';

export type AgenticoServerOptions = {
    /** Who asks, from the sign-in of the host; null: not signed in (401). */
    identity: (request: Request) => Promise<AgenticoIdentity | null>;
    records: AgenticoRecords;
    secrets: AgenticoSecrets;
    /** How the platform is named on the runners it connects (their console shows it), e.g. "Consuletica CRM". */
    platformName: string;
    /** The tenants of the project the host knows, listed in Projects even before they have a runner or a memory. */
    tenants?: (identity: AgenticoIdentity) => Promise<AgenticoKnownTenant[]>;
    /**
     * The headers that carry the session of the host (e.g. `x-session`): never forwarded by the proxy of the AI
     * requests. The session must not be in `authorization` there, which is the provider's.
     */
    sessionHeaders?: string[];
    /**
     * Whether the admin of a namespace connects and administers runners and memories of its own (CR-027, CR-028), as
     * in Playbook where every organization keeps its own. Absent: they are the platform's (the CMS, where assigning the
     * infrastructure to a tenant is a platform action), and an admin only uses them.
     */
    tenantOwned?: { runners?: boolean; memories?: boolean };
    /** The path the handler is mounted on (e.g. `/api/agentico`): stripped from every request. */
    basePath?: string;
    adapter?: AdapterFactory;
    fetch?: typeof fetch;
    connectRunner?: (url: string, key?: string) => RunnerConnection;
    install?: Parameters<typeof createFleet>[0]['install'];
    log?: (event: string, details?: Record<string, unknown>) => void;
    now?: () => number;
};

class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

const RANK: Record<AgenticoRole, number> = { member: 0, admin: 1, platform: 2 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The routes of a person on the runner (as forwardToRunner of the runner allows them). */
const PERSON_ROUTE = /^\/v1\/(info|models|complete|accounts(\/.*)?|chats(\/.*)?)$/;
const CHAT_ROUTE = /^\/v1\/chats\/([a-f0-9]{8})(\/.*)?$/;
/** Where the proxy of the browser may not go, whatever the placeholder says. */
const PROXY_HEADERS_DROPPED = new Set(['host', 'cookie', 'content-length', 'connection', 'origin', 'referer', 'x-llmnative-proxy']);

export function createAgenticoServer(options: AgenticoServerOptions) {
    const { records, secrets } = options;
    const log = options.log ?? (() => undefined);
    const fetchImpl = options.fetch ?? fetch;
    const connections = createConnections({ records, secrets, ...(options.adapter ? { adapter: options.adapter } : {}) });
    const memories = createMemories({ records, secrets, fetch: fetchImpl, ...(options.now ? { now: options.now } : {}) });
    const fleets = new Map<string, ReturnType<typeof createFleet>>();
    const fleetOf = (project: string) => {
        let fleet = fleets.get(project);
        if (!fleet) {
            fleet = createFleet({
                project,
                platformName: options.platformName,
                records,
                secrets,
                ...(options.connectRunner ? { connect: options.connectRunner } : {}),
                ...(options.install ? { install: options.install } : {}),
                ...(options.now ? { now: options.now } : {}),
            });
            fleets.set(project, fleet);
        }
        return fleet;
    };

    /** Who may administer runners (or memories): the platform, and the admins of a namespace when the host lets them. */
    const administrator = (kind: 'runners' | 'memories'): AgenticoRole => (options.tenantOwned?.[kind] ? 'admin' : 'platform');
    const need = (identity: AgenticoIdentity, role: AgenticoRole) => {
        if (RANK[identity.role] < RANK[role]) throw new HttpError(403, 'forbidden');
    };
    const body = async (request: Request): Promise<Record<string, unknown>> => {
        try {
            const value = await request.json();
            return value && typeof value === 'object' ? value as Record<string, unknown> : {};
        } catch {
            return {};
        }
    };
    /** The namespace a request is about: the person's own, or (for the platform) another of the project. */
    const namespaceFor = (identity: AgenticoIdentity, url: URL): string => {
        const own = namespaceOf(identity.project, identity.tenant);
        const asked = url.searchParams.get('namespace');
        if (!asked || asked === own) return own;
        need(identity, 'platform');
        if (!inProject(identity.project, asked)) throw new HttpError(404, 'not found');
        namespaceOf(identity.project, tenantOf(identity.project, asked));
        return asked;
    };
    const namespaces = async (project: string) => (await records.list<NamespaceRecord>(NAMESPACES)).filter((item) => inProject(project, item.id));
    const namespaceRecord = async (namespace: string) => (await records.get<NamespaceRecord>(NAMESPACES, namespace)) ?? { id: namespace };

    /** A request to the runner of the namespace, as a person (or as the namespace, for its own accounts). */
    async function toRunner(request: Request, identity: AgenticoIdentity, path: string, asNamespace: boolean): Promise<Response> {
        if (!PERSON_ROUTE.test(path) || (asNamespace && !path.startsWith('/v1/accounts'))) return json(404, { error: 'not found' });
        if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return json(404, { error: 'not found' });
        const namespace = namespaceOf(identity.project, identity.tenant);
        const fleet = fleetOf(identity.project);
        const chat = CHAT_ROUTE.exec(path)?.[1];
        const starting = path === '/v1/chats' && request.method === 'POST';
        const raw = request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.arrayBuffer();
        const newChat = starting && raw ? (() => {
            try {
                const parsed = JSON.parse(new TextDecoder().decode(raw)) as { id?: unknown };
                return typeof parsed.id === 'string' ? parsed.id : undefined;
            } catch {
                return undefined;
            }
        })() : undefined;
        const target = await fleet.route(namespace, { newChat: starting, ...(chat ? { chat, user: identity.user.id } : {}) }).catch(() => null);
        if (!target) return json(409, { error: 'no-runner' });
        const headers: Record<string, string> = { authorization: `Bearer ${target.key}` };
        if (!asNamespace) headers['x-runner-user'] = identity.user.id;
        const type = request.headers.get('content-type');
        if (type) headers['content-type'] = type;
        let answer: Response;
        try {
            answer = await fetchImpl(`${target.url}${path}${new URL(request.url).search}`, { method: request.method, headers, ...(raw ? { body: raw } : {}), signal: request.signal });
        } catch {
            return json(502, { error: 'unreachable' });
        }
        if (newChat && answer.ok) await fleet.chatStarted(namespace, identity.user.id, newChat, target.runnerId);
        if (chat && request.method === 'DELETE' && path === `/v1/chats/${chat}`) await fleet.chatClosed(namespace, identity.user.id, chat).catch(() => undefined);
        log('runner request', { namespace, user: identity.user.id, path: path.replace(/[a-f0-9]{8}/, ':chat'), status: answer.status });
        return new Response(answer.body, { status: answer.status, headers: { 'content-type': answer.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
    }

    async function route(request: Request, identity: AgenticoIdentity, path: string, url: URL): Promise<Response> {
        const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
        const [area, id, sub, subId] = parts;
        const method = request.method;
        const project = identity.project;

        if (area === 'me' && method === 'GET') {
            const namespace = namespaceOf(project, identity.tenant);
            // Whether the namespace has a runner (its own, or a runner of the project it would be put on).
            const hasRunner = await fleetOf(project).hasRunnerFor(namespace);
            const may = (kind: 'runners' | 'memories') => RANK[identity.role] >= RANK[administrator(kind)];
            return json(200, { user: identity.user, role: identity.role, project, ...(identity.tenant ? { tenant: identity.tenant } : {}), namespace, hasRunner, administers: { runners: may('runners'), memories: may('memories') } });
        }

        // ── Cloud connections of the namespace ──────────────────────────────────────────────────────────────
        if (area === 'connections') {
            const namespace = namespaceFor(identity, url);
            if (!id && method === 'GET') return json(200, await connections.snapshot(namespace));
            if (id === 'order' && !sub && method === 'PUT') {
                need(identity, 'admin');
                const given = (await body(request)).order;
                await connections.setOrder(namespace, Array.isArray(given) ? given.map(String) : null);
                return json(200, { ok: true });
            }
            if (id && !sub && method === 'GET') return json(404, { error: 'not found' });
            if (id && sub === 'models' && method === 'GET') return json(200, { models: await connections.models(namespace, id) });
            need(identity, 'admin');
            const fields = async () => {
                const given = (await body(request)).fields;
                return Object.fromEntries(Object.entries(given && typeof given === 'object' ? given as Record<string, unknown> : {}).map(([key, value]) => [key, String(value ?? '')]));
            };
            if (id && !sub && method === 'POST') {
                const result = await connections.connect(namespace, id, await fields());
                log('connection', { namespace, provider: id, ok: result.ok, by: identity.user.id });
                return json(result.ok ? 200 : 422, result);
            }
            if (id && !sub && method === 'DELETE') {
                await connections.disconnect(namespace, id);
                return json(200, { ok: true });
            }
            if (id && sub === 'accounts' && !subId && method === 'POST') {
                const result = await connections.addAccount(namespace, id, await fields());
                return json(result.ok ? 200 : 422, result);
            }
            if (id && sub === 'accounts' && subId === 'order' && method === 'PUT') {
                const ids = (await body(request)).ids;
                await connections.orderAccounts(namespace, id, Array.isArray(ids) ? ids.map(String) : []);
                return json(200, { ok: true });
            }
            if (id && sub === 'accounts' && subId && method === 'DELETE') {
                await connections.removeAccount(namespace, id, subId);
                return json(200, { ok: true });
            }
        }

        // ── AI with the keys of the namespace ───────────────────────────────────────────────────────────────
        if (area === 'ai' && id === 'complete' && method === 'POST') {
            const given = await body(request);
            const provider = String(given.provider ?? '');
            const answer = await connections.complete(namespaceOf(project, identity.tenant), provider, given.request as never).catch((error: unknown) => {
                throw new HttpError(error instanceof Error && error.message === 'no-provider' ? 409 : 502, error instanceof Error && error.message === 'no-provider' ? 'no-provider' : 'failed');
            });
            log('ai complete', { namespace: namespaceOf(project, identity.tenant), provider, user: identity.user.id });
            return json(200, { result: answer });
        }
        // The proxy of the framework (CR-102, `providers.proxy.route`): `?url=<target>`, the method, headers and body of
        // the request of the adapter; its placeholders become the keys of the namespace, only towards their provider.
        if (area === 'ai' && id === 'proxy') {
            const target = url.searchParams.get('url') ?? '';
            const dropped = new Set([...PROXY_HEADERS_DROPPED, ...(options.sessionHeaders ?? []).map((name) => name.toLowerCase())]);
            const headers: Record<string, string> = {};
            request.headers.forEach((value, name) => {
                if (!dropped.has(name.toLowerCase())) headers[name] = value;
            });
            const resolved = await connections.resolve(namespaceOf(project, identity.tenant), { url: target, headers });
            if (!resolved.ok) return json(resolved.status, { error: resolved.error });
            if (new URL(resolved.url).protocol !== 'https:') return json(403, { error: 'forbidden-target' });
            const raw = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
            const answer = await fetchImpl(resolved.url, { method, headers: resolved.headers, ...(raw && raw.byteLength ? { body: raw } : {}), signal: request.signal }).catch(() => null);
            if (!answer) return json(502, { error: 'unreachable' });
            return new Response(answer.body, { status: answer.status, headers: { 'content-type': answer.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' } });
        }

        // ── The runner of the namespace, for the person ─────────────────────────────────────────────────────
        if (area === 'runner') return toRunner(request, identity, `/${parts.slice(1).map(encodeURIComponent).join('/')}`, false);
        if (area === 'runner-namespace') {
            need(identity, 'admin');
            return toRunner(request, identity, `/${parts.slice(1).map(encodeURIComponent).join('/')}`, true);
        }

        // ── Runners: the platform administers them all, the admin of a namespace its own (CR-028) ────────────
        if (area === 'runners') {
            need(identity, administrator('runners'));
            const fleet = fleetOf(project);
            const viewer: RunnerViewer = identity.role === 'platform' ? { platform: true } : { platform: false, namespace: namespaceOf(project, identity.tenant) };
            const owner = viewer.platform ? undefined : viewer.namespace;
            if (!id && method === 'GET') return json(200, { runners: await fleet.list(viewer) });
            if (!id && method === 'POST') {
                const given = await body(request);
                const runner = await fleet.add({ url: String(given.url ?? ''), ...(typeof given.name === 'string' ? { name: given.name } : {}), ...(typeof given.code === 'string' ? { code: given.code } : {}), ...(typeof given.key === 'string' ? { key: given.key } : {}) }, {}, owner);
                log('runner connected', { project, runner: runner.id, by: identity.user.id });
                return json(201, { runner });
            }
            if (id === 'pairings' && !sub && method === 'POST') {
                const given = await body(request);
                return json(201, await fleet.startPairing({ url: String(given.url ?? ''), ...(typeof given.name === 'string' ? { name: given.name } : {}) }, identity.user.id, owner));
            }
            if (id === 'pairings' && sub && method === 'GET') return json(200, await fleet.pairingStatus(sub, identity.user.id));
            if (id === 'installs' && !sub && method === 'POST') {
                const given = await body(request);
                const started = await fleet.install({
                    domain: String(given.domain ?? ''),
                    access: (given.access ?? {}) as never,
                    ...(typeof given.name === 'string' ? { name: given.name } : {}),
                    ...(typeof given.version === 'string' ? { version: given.version } : {}),
                }, identity.user.id, undefined, owner);
                log('runner install', { project, install: started.installId, by: identity.user.id });
                return json(202, { installId: started.installId });
            }
            if (id === 'installs' && sub && method === 'GET') {
                const state = await fleet.installState(sub, identity.user.id, Number(url.searchParams.get('from')) || 0);
                return state ? json(200, state) : json(404, { error: 'not found' });
            }
            if (id && !sub && method === 'PATCH') {
                const given = await body(request);
                await fleet.update(id, {
                    ...(typeof given.name === 'string' ? { name: given.name } : {}),
                    ...(typeof given.isDefault === 'boolean' ? { isDefault: given.isDefault } : {}),
                    ...(typeof given.draining === 'boolean' ? { draining: given.draining } : {}),
                }, viewer);
                return json(200, { ok: true });
            }
            if (id && !sub && method === 'DELETE') {
                await fleet.remove(id, viewer);
                return json(200, { ok: true });
            }
            if (id && sub === 'status' && method === 'GET') return json(200, await fleet.status(id, viewer));
        }

        // ── Memories: the platform administers them all, the admin of a namespace its own (CR-027) ───────────
        if (area === 'memories') {
            need(identity, administrator('memories'));
            const viewer: MemoryViewer = identity.role === 'platform' ? { platform: true } : { platform: false, namespace: namespaceOf(project, identity.tenant) };
            if (!id && method === 'GET') return json(200, { memories: await memories.list(viewer) });
            if (id === 'check' && method === 'POST') {
                const given = await body(request);
                return json(200, await memories.check({ apiUrl: String(given.apiUrl ?? ''), key: String(given.key ?? '') }));
            }
            if (!id && method === 'POST') {
                const given = await body(request);
                const memory = await memories.add({ apiUrl: String(given.apiUrl ?? ''), key: String(given.key ?? ''), ...(typeof given.name === 'string' ? { name: given.name } : {}), ...(typeof given.mcpUrl === 'string' ? { mcpUrl: given.mcpUrl } : {}) }, viewer.platform ? undefined : viewer.namespace);
                log('memory connected', { project, memory: memory.id, by: identity.user.id });
                return json(201, { memory });
            }
            if (id && method === 'PATCH') {
                const given = await body(request);
                return json(200, { memory: await memories.update(id, {
                    ...(typeof given.name === 'string' ? { name: given.name } : {}),
                    ...(given.mcpUrl === null || typeof given.mcpUrl === 'string' ? { mcpUrl: given.mcpUrl as string | null } : {}),
                    ...(typeof given.key === 'string' ? { key: given.key } : {}),
                }, viewer) });
            }
            if (id && method === 'DELETE') {
                const record = await memories.of(id, viewer);
                const users = (await records.list<NamespaceRecord>(NAMESPACES)).filter((item) => item.memoryId === id);
                if (!viewer.platform && (record.owners?.length ?? 0) > 1) {
                    // One owner of a shared memory leaves it to the others; its own namespace stops using it.
                    await memories.remove(id, false, viewer);
                    for (const item of users.filter((user) => user.id === viewer.namespace)) {
                        const { memoryId: _gone, ...rest } = item;
                        await records.put(NAMESPACES, rest);
                    }
                } else {
                    await memories.remove(id, users.length > 0, viewer);
                }
                return json(200, { ok: true });
            }
        }
        if (area === 'memory') {
            const namespace = namespaceOf(project, identity.tenant);
            const memoryId = (await namespaceRecord(namespace)).memoryId;
            if (!id && method === 'GET') return json(200, memoryId ? { configured: true, ...(await memories.coordinates(memoryId, namespace)) } : { configured: false });
            if (!memoryId) return json(409, { error: 'no-memory' });
            const given = await body(request);
            if (id === 'search' && method === 'POST') return json(200, { results: await memories.search(memoryId, namespace, String(given.query ?? ''), Number(given.limit) || 10) });
            if (id === 'write' && method === 'POST') {
                const written = await memories.write(memoryId, namespace, { title: String(given.title ?? ''), content: String(given.content ?? ''), ...(typeof given.documentId === 'string' ? { documentId: given.documentId } : {}) });
                log('memory write', { namespace, user: identity.user.id });
                return json(200, written);
            }
        }

        // ── Projects: each namespace of the project, its runner and its memory ──────────────────────────────
        if (area === 'projects' && !id && method === 'GET') {
            need(identity, 'admin');
            const [runnerList, memoryList, saved, known] = await Promise.all([
                RANK[identity.role] >= RANK[administrator('runners')] ? fleetOf(project).list(identity.role === 'platform' ? { platform: true } : { platform: false, namespace: namespaceOf(project, identity.tenant) }) : Promise.resolve([] as RunnerEntry[]),
                RANK[identity.role] >= RANK[administrator('memories')] ? memories.list(identity.role === 'platform' ? { platform: true } : { platform: false, namespace: namespaceOf(project, identity.tenant) }) : Promise.resolve([] as MemoryEntry[]),
                namespaces(project),
                options.tenants && identity.role === 'platform' ? options.tenants(identity) : Promise.resolve([] as AgenticoKnownTenant[]),
            ]);
            const own = namespaceOf(project, identity.tenant);
            const names = new Map<string, string | undefined>();
            names.set(own, undefined);
            if (identity.role === 'platform') {
                for (const item of saved) names.set(item.id, undefined);
                for (const tenant of known) {
                    try {
                        names.set(namespaceOf(project, tenant.id), tenant.name);
                    } catch {
                        // a tenant whose id is no namespace: not listed
                    }
                }
            }
            const rows = [...names.entries()].map(([namespace, name]) => {
                const record = saved.find((item) => item.id === namespace);
                const runner = runnerList.find((item) => item.id === record?.runnerId);
                const memory = memoryList.find((item) => item.id === record?.memoryId);
                const tenant = tenantOf(project, namespace);
                return {
                    namespace,
                    ...(tenant ? { tenant } : {}),
                    ...(name ? { name } : {}),
                    ...(record?.runnerId ? { runner: { id: record.runnerId, ...(runner ? { name: runner.name } : {}) } } : {}),
                    ...(record?.memoryId ? { memory: { id: record.memoryId, ...(memory ? { name: memory.name } : {}) } } : {}),
                };
            }).sort((a, b) => a.namespace.localeCompare(b.namespace));
            return json(200, { project, namespaces: rows });
        }
        if (area === 'namespaces' && id && !sub && method === 'PUT') {
            need(identity, 'admin');
            if (!inProject(project, id)) throw new HttpError(404, 'not found');
            namespaceOf(project, tenantOf(project, id));
            // The admin of a namespace chooses its memory among its own (CR-027); the runner stays the platform's.
            const platform = identity.role === 'platform';
            if (!platform && id !== namespaceOf(project, identity.tenant)) throw new HttpError(403, 'forbidden');
            const given = await body(request);
            if (typeof given.runnerId === 'string' && given.runnerId) {
                need(identity, administrator('runners'));
                // The admin of a namespace puts it on a runner it owns (CR-028); the platform on any of the project.
                if (!platform && !(await fleetOf(project).list({ platform: false, namespace: id })).some((runner) => runner.id === given.runnerId)) throw new HttpError(404, 'runner not found');
                await fleetOf(project).assign(id, given.runnerId);
            }
            if (given.memoryId !== undefined) {
                need(identity, administrator('memories'));
                const record = await namespaceRecord(id);
                if (given.memoryId === null || given.memoryId === '') delete record.memoryId;
                else {
                    const viewer: MemoryViewer = platform ? { platform: true } : { platform: false, namespace: id };
                    if (!(await memories.list(viewer)).some((memory) => memory.id === given.memoryId)) throw new HttpError(404, 'memory not found');
                    record.memoryId = String(given.memoryId);
                }
                await records.put(NAMESPACES, record);
            }
            log('namespace set', { namespace: id, by: identity.user.id });
            return json(200, { ok: true });
        }
        return json(404, { error: 'not found' });
    }

    return {
        connections,
        memories,
        fleet: fleetOf,
        async handle(request: Request): Promise<Response> {
            const url = new URL(request.url);
            const base = (options.basePath ?? '').replace(/\/+$/, '');
            if (base && url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return json(404, { error: 'not found' });
            const path = url.pathname.slice(base.length) || '/';
            try {
                const identity = await options.identity(request);
                if (!identity) return json(401, { error: 'unauthenticated' });
                return await route(request, identity, path, url);
            } catch (error) {
                if (error instanceof HttpError) return json(error.status, { error: error.message });
                if (error instanceof NamespaceError) return json(400, { error: 'invalid namespace' });
                if (error instanceof FleetError) return json(error.code === 'invalid' ? 400 : error.code === 'not-found' ? 404 : 409, { error: error.message });
                if (error instanceof MemoryError) {
                    const status = { invalid: 400, 'not-found': 404, conflict: 409, unreachable: 502, rejected: 422 }[error.code];
                    return json(status, { error: error.message });
                }
                if (error instanceof RunnerError) return json(502, { error: error.code });
                log('agentico server error', { path, error: error instanceof Error ? error.name : 'error' });
                return json(500, { error: 'failed' });
            }
        },
    };
}

export type AgenticoServer = ReturnType<typeof createAgenticoServer>;
export type { RunnerStatus };
