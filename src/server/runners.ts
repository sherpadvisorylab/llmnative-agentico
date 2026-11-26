// CR-025: the runners of a project (from the fleet of the CMS, docs/31-runners.md there). The platform key of each
// runner, paired with the project so that it owns only `<project>` and `<project>-…` there (runner 1.2), and the key
// of each namespace on its runner live only in the secrets; documents hold names, addresses and state.
import { RunnerClient, type RunnerKey, type RunnerPairingPoll, type RunnerPairingRequest, type RunnerPermission, type RunnerStatus, type RunnerTenant } from '@llmnative/runner/client';
import { installOverSsh, type InstallProgress, type SshTarget } from '@llmnative/runner/setup';
import type { AgenticoRecords, AgenticoSecrets } from './ports';

export const RUNNERS = 'agentico_runners';
export const PAIRINGS = 'agentico_runner_pairings';
export const NAMESPACES = 'agentico_namespaces';
export const RUNNER_CHATS = 'agentico_runner_chats';
export const INSTALLS = 'agentico_runner_installs';

export interface RunnerRecord {
    id: string;
    name: string;
    url: string;
    isDefault: boolean;
    draining: boolean;
    /** The id of the platform key on the runner, to revoke it when the runner is removed. */
    keyId?: string;
    hostFingerprint?: string;
    createdAt: number;
    updatedAt: number;
}

/** What the pages see of a runner: never its key. */
export type RunnerEntry = { id: string; name: string; url: string; isDefault: boolean; draining: boolean };

/** Which runner and memory a namespace uses. */
export interface NamespaceRecord {
    id: string;
    runnerId?: string;
    /** The id of the key of the namespace on its runner. */
    runnerKeyId?: string;
    memoryId?: string;
}

interface PairingRecord { id: string; name: string; url: string; startedBy: string; expiresAt: string }
interface ChatRecord { id: string; runnerId: string }
export interface InstallRecord { id: string; status: 'running' | 'done' | 'error'; lines: string[]; runnerId?: string; error?: string; startedBy: string }

/** The part of RunnerClient the fleet uses (a fake one in the tests). */
export interface RunnerConnection {
    pair(code: string, name?: string, project?: string): Promise<{ key: string; record: RunnerKey; version: string }>;
    requestPairing(name: string, project?: string): Promise<RunnerPairingRequest>;
    pollPairing(request: string): Promise<RunnerPairingPoll>;
    platform: {
        status(): Promise<RunnerStatus>;
        tenants(): Promise<RunnerTenant[]>;
        createTenant(id: string, options?: { name?: string; key?: boolean; keyPermissions?: RunnerPermission[] }): Promise<{ tenant: RunnerTenant; key?: string; keyRecord?: RunnerKey }>;
        createKey(tenant: string, input?: { name?: string; permissions?: RunnerPermission[] }): Promise<{ key: string; record: RunnerKey }>;
        revokeKey(tenant: string, id: string): Promise<boolean>;
        revokePlatformKey(id: string): Promise<boolean>;
    };
}

export type FleetErrorCode = 'invalid' | 'not-found' | 'conflict';

export class FleetError extends Error {
    readonly code: FleetErrorCode;

    constructor(code: FleetErrorCode, reason: string) {
        super(reason);
        this.name = 'FleetError';
        this.code = code;
    }
}

/** What the backend of the host does for the people of a namespace: always as one of them (act-as-user). */
export const NAMESPACE_KEY_PERMISSIONS: RunnerPermission[] = ['complete', 'chat', 'chat:tools', 'accounts', 'act-as-user'];
/** The same plus the accounts of the namespace itself, for who administers it. */
const ADMIN_KEY_PERMISSIONS: RunnerPermission[] = [...NAMESPACE_KEY_PERMISSIONS, 'accounts:tenant'];

const platformSecret = (runnerId: string) => `runner/${runnerId}/platform`;
const pairingSecret = (pairingId: string) => `runner-pairing/${pairingId}`;
const namespaceSecret = (namespace: string, runnerId: string) => `namespace/${namespace}/runner/${runnerId}`;

export function normalizeRunnerUrl(value: string): string {
    let parsed: URL;
    try {
        parsed = new URL(value.trim().replace(/\/+$/, ''));
    } catch {
        throw new FleetError('invalid', 'INVALID_URL');
    }
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new FleetError('invalid', 'INVALID_URL');
    return parsed.origin;
}

const entryOf = (record: RunnerRecord): RunnerEntry => ({ id: record.id, name: record.name, url: record.url, isDefault: record.isDefault, draining: record.draining });

export type FleetDeps = {
    project: string;
    /** How the platform is named on the runner (its console shows it): e.g. the name of the host. */
    platformName: string;
    records: AgenticoRecords;
    secrets: AgenticoSecrets;
    connect?: (url: string, key?: string) => RunnerConnection;
    install?: typeof installOverSsh;
    newId?: () => string;
    now?: () => number;
};

/** Where a request of a person goes. */
export type RunnerTarget = { runnerId: string; url: string; key: string };

export function createFleet(deps: FleetDeps) {
    const { project, records, secrets } = deps;
    const connect = deps.connect ?? ((url: string, key?: string) => new RunnerClient({ url, ...(key ? { key } : {}) }));
    const install = deps.install ?? installOverSsh;
    const newId = deps.newId ?? (() => crypto.randomUUID().replace(/-/g, '').slice(0, 12));
    const now = deps.now ?? Date.now;

    const runnerOf = async (id: string) => {
        const record = await records.get<RunnerRecord>(RUNNERS, id);
        if (!record) throw new FleetError('not-found', 'RUNNER_NOT_FOUND');
        return record;
    };
    const keyOf = async (name: string) => {
        const key = await secrets.get(name);
        if (!key) throw new FleetError('not-found', 'KEY_NOT_FOUND');
        return key;
    };
    const connectTo = async (record: RunnerRecord) => connect(record.url, await keyOf(platformSecret(record.id)));
    const newUrl = async (value: string) => {
        const url = normalizeRunnerUrl(value);
        if ((await records.list<RunnerRecord>(RUNNERS)).some((record) => record.url === url)) throw new FleetError('conflict', 'RUNNER_ALREADY_CONNECTED');
        return url;
    };
    const nameOf = (url: string, name?: string) => String(name ?? '').trim() || new URL(url).hostname;
    const keep = async (input: { name: string; url: string; key: string; keyId?: string; hostFingerprint?: string }): Promise<RunnerEntry> => {
        const id = newId();
        const at = now();
        await secrets.set(platformSecret(id), input.key);
        const record: RunnerRecord = {
            id,
            name: input.name,
            url: input.url,
            isDefault: (await records.list<RunnerRecord>(RUNNERS)).length === 0,
            draining: false,
            ...(input.keyId ? { keyId: input.keyId } : {}),
            ...(input.hostFingerprint ? { hostFingerprint: input.hostFingerprint } : {}),
            createdAt: at,
            updatedAt: at,
        };
        await records.put(RUNNERS, record);
        return entryOf(record);
    };
    const namespaceRecord = async (namespace: string) => (await records.get<NamespaceRecord>(NAMESPACES, namespace)) ?? { id: namespace };

    const fleet = {
        async list(): Promise<RunnerEntry[]> {
            return (await records.list<RunnerRecord>(RUNNERS)).map(entryOf).sort((a, b) => a.name.localeCompare(b.name));
        },

        /** Connects a runner with a pairing code (the key it gives, of this project, stays here). */
        async add(input: { name?: string; url: string; code?: string; key?: string }, extra: { hostFingerprint?: string } = {}): Promise<RunnerEntry> {
            const url = await newUrl(String(input.url ?? ''));
            const name = nameOf(url, input.name);
            if (input.code) {
                const paired = await connect(url).pair(String(input.code).trim(), deps.platformName, project);
                return keep({ name, url, key: paired.key, keyId: paired.record.id, ...extra });
            }
            if (input.key) {
                const key = String(input.key).trim();
                await connect(url, key).platform.status();
                return keep({ name, url, key, ...extra });
            }
            throw new FleetError('invalid', 'CODE_OR_KEY_REQUIRED');
        },

        /** Asks a runner to connect (device flow, with the project): its admin approves in its console. */
        async startPairing(input: { name?: string; url: string }, startedBy: string): Promise<{ id: string; code: string; approveUrl: string; expiresAt: string }> {
            const url = await newUrl(String(input.url ?? ''));
            const made = await connect(url).requestPairing(deps.platformName, project);
            const id = newId();
            await secrets.set(pairingSecret(id), made.request);
            await records.put<PairingRecord>(PAIRINGS, { id, name: nameOf(url, input.name), url, startedBy, expiresAt: made.expiresAt });
            return { id, code: made.code, approveUrl: made.approveUrl, expiresAt: made.expiresAt };
        },

        /** How a request goes; approved, the runner is connected with the key it gave (once). */
        async pairingStatus(id: string, startedBy: string): Promise<{ status: 'pending' | 'denied' | 'expired' } | { status: 'approved'; runner: RunnerEntry }> {
            const pending = await records.get<PairingRecord>(PAIRINGS, id);
            const request = await secrets.get(pairingSecret(id));
            const end = async () => {
                await records.delete(PAIRINGS, id);
                await secrets.delete(pairingSecret(id));
            };
            if (!pending || pending.startedBy !== startedBy || !request) return { status: 'expired' };
            if (Date.parse(pending.expiresAt) <= now()) {
                await end();
                return { status: 'expired' };
            }
            const polled = await connect(pending.url).pollPairing(request);
            if (polled.status === 'pending') return { status: 'pending' };
            await end();
            if (polled.status !== 'approved') return { status: polled.status };
            return { status: 'approved', runner: await keep({ name: pending.name, url: pending.url, key: polled.key, keyId: polled.record.id }) };
        },

        async update(id: string, patch: { name?: string; isDefault?: boolean; draining?: boolean }): Promise<void> {
            const record = await runnerOf(id);
            const next: RunnerRecord = { ...record, updatedAt: now() };
            if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim().slice(0, 100);
            if (typeof patch.draining === 'boolean') next.draining = patch.draining;
            if (typeof patch.isDefault === 'boolean') {
                next.isDefault = patch.isDefault;
                if (patch.isDefault) {
                    for (const other of await records.list<RunnerRecord>(RUNNERS)) {
                        if (other.id !== id && other.isDefault) await records.put(RUNNERS, { ...other, isDefault: false, updatedAt: now() });
                    }
                }
            }
            await records.put(RUNNERS, next);
        },

        /** Only a runner no namespace uses: its people would lose their chats and subscriptions there. */
        async remove(id: string): Promise<void> {
            const record = await runnerOf(id);
            if ((await records.list<NamespaceRecord>(NAMESPACES)).some((item) => item.runnerId === id)) throw new FleetError('conflict', 'RUNNER_HAS_NAMESPACES');
            if (record.keyId) await connectTo(record).then((runner) => runner.platform.revokePlatformKey(record.keyId!)).catch(() => false);
            await secrets.delete(platformSecret(id));
            await records.delete(RUNNERS, id);
        },

        async status(id: string): Promise<RunnerStatus> {
            return (await connectTo(await runnerOf(id))).platform.status();
        },

        /**
         * Puts a namespace on a runner: the tenant there (made if missing) and a key of its own, kept as a secret.
         * Moving it, the key on the runner before is revoked unless `keepBefore` (chats still going there).
         */
        async assign(namespace: string, runnerId: string, options: { keepBefore?: boolean; name?: string } = {}): Promise<void> {
            const current = await namespaceRecord(namespace);
            const record = await runnerOf(runnerId);
            if (current.runnerId === runnerId && await secrets.get(namespaceSecret(namespace, runnerId))) return;
            if (record.draining) throw new FleetError('conflict', 'RUNNER_DRAINING');
            const runner = await connectTo(record);
            const present = (await runner.platform.tenants()).some((item) => item.id === namespace);
            let key: string;
            let keyId: string;
            if (present) {
                const made = await runner.platform.createKey(namespace, { name: deps.platformName, permissions: ADMIN_KEY_PERMISSIONS });
                key = made.key;
                keyId = made.record.id;
            } else {
                const made = await runner.platform.createTenant(namespace, { ...(options.name ? { name: options.name } : {}), keyPermissions: ADMIN_KEY_PERMISSIONS });
                if (!made.key || !made.keyRecord) throw new Error('the runner made the tenant without a key');
                key = made.key;
                keyId = made.keyRecord.id;
            }
            await secrets.set(namespaceSecret(namespace, runnerId), key);
            if (!options.keepBefore && current.runnerId && current.runnerId !== runnerId && current.runnerKeyId) {
                const before = await records.get<RunnerRecord>(RUNNERS, current.runnerId);
                if (before) await connectTo(before).then((old) => old.platform.revokeKey(namespace, current.runnerKeyId!)).catch(() => false);
                await secrets.delete(namespaceSecret(namespace, current.runnerId));
            }
            await records.put<NamespaceRecord>(NAMESPACES, { ...current, runnerId, runnerKeyId: keyId });
        },

        /**
         * Where a request of a person of a namespace goes. A chat going stays on the runner it started on; a new chat
         * leaves a draining runner for the default one; a namespace without a runner is put on the default one.
         */
        async route(namespace: string, request: { newChat?: boolean; chat?: string; user?: string } = {}): Promise<RunnerTarget | null> {
            if (request.chat && request.user) {
                const started = await records.get<ChatRecord>(RUNNER_CHATS, `${namespace}_${request.user}_${request.chat}`);
                const record = started ? await records.get<RunnerRecord>(RUNNERS, started.runnerId) : null;
                const key = record ? await secrets.get(namespaceSecret(namespace, record.id)) : null;
                if (record && key) return { runnerId: record.id, url: record.url, key };
            }
            const runners = await records.list<RunnerRecord>(RUNNERS);
            let current = await namespaceRecord(namespace);
            const using = current.runnerId ? runners.find((record) => record.id === current.runnerId) : undefined;
            const fallback = runners.find((record) => record.isDefault && !record.draining && record.id !== using?.id)
                ?? (using ? undefined : runners.find((record) => !record.draining));
            if (!using) {
                if (!fallback) return null;
                await fleet.assign(namespace, fallback.id);
                current = await namespaceRecord(namespace);
            } else if (request.newChat && using.draining && fallback) {
                await fleet.assign(namespace, fallback.id, { keepBefore: true });
                current = await namespaceRecord(namespace);
            }
            const record = current.runnerId ? await records.get<RunnerRecord>(RUNNERS, current.runnerId) : null;
            const key = record ? await secrets.get(namespaceSecret(namespace, record.id)) : null;
            return record && key ? { runnerId: record.id, url: record.url, key } : null;
        },

        /** A chat started: where, so that its next messages go there too. */
        async chatStarted(namespace: string, user: string, chat: string, runnerId: string) {
            await records.put<ChatRecord>(RUNNER_CHATS, { id: `${namespace}_${user}_${chat}`, runnerId });
        },
        async chatClosed(namespace: string, user: string, chat: string) {
            await records.delete(RUNNER_CHATS, `${namespace}_${user}_${chat}`);
        },

        /**
         * Installs a runner over SSH and connects it; the log goes to its document as it comes. The SSH access is used
         * for this connection only, never kept.
         */
        async install(input: { name?: string; domain: string; access: SshTarget; version?: string }, startedBy: string, onProgress?: (progress: InstallProgress) => void): Promise<{ installId: string; done: Promise<RunnerEntry> }> {
            if (!input.access?.host || !input.access.username || (!input.access.privateKey && !input.access.password)) throw new FleetError('invalid', 'SSH_ACCESS_REQUIRED');
            if (!String(input.domain ?? '').trim()) throw new FleetError('invalid', 'DOMAIN_REQUIRED');
            const installId = newId();
            const state: InstallRecord = { id: installId, status: 'running', lines: [], startedBy };
            await records.put(INSTALLS, state);
            let writing = Promise.resolve();
            const progress = (item: InstallProgress) => {
                onProgress?.(item);
                state.lines = [...state.lines, item.line].slice(-2000);
                writing = writing.then(() => records.put(INSTALLS, state)).catch(() => undefined);
            };
            const done = (async () => {
                try {
                    const installed = await install(input.access, { domain: input.domain, ...(input.version ? { version: input.version } : {}), onProgress: progress });
                    const runner = await fleet.add({ name: input.name, url: installed.url, code: installed.pairingCode }, { hostFingerprint: installed.hostFingerprint });
                    await writing;
                    await records.put<InstallRecord>(INSTALLS, { ...state, status: 'done', runnerId: runner.id });
                    return runner;
                } catch (error) {
                    await writing;
                    await records.put<InstallRecord>(INSTALLS, { ...state, status: 'error', error: error instanceof Error ? error.message : String(error) });
                    throw error;
                }
            })();
            done.catch(() => undefined);
            return { installId, done };
        },

        /** The log of an installation from a line on. */
        async installState(installId: string, startedBy: string, from = 0): Promise<{ status: InstallRecord['status']; lines: string[]; next: number; runnerId?: string; error?: string } | null> {
            const state = await records.get<InstallRecord>(INSTALLS, installId);
            if (!state || state.startedBy !== startedBy) return null;
            return { status: state.status, lines: state.lines.slice(from), next: state.lines.length, ...(state.runnerId ? { runnerId: state.runnerId } : {}), ...(state.error ? { error: state.error } : {}) };
        },
    };
    return fleet;
}

export type Fleet = ReturnType<typeof createFleet>;
