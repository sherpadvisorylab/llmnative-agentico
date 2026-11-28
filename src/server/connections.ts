// CR-025: the cloud connections of a namespace: the AI providers of @llmnative/react with their keys (CR-134, the
// server side of `AIConnectionStore`). A key is checked with its provider before it is kept, kept as a secret, and
// used only here: to answer (`complete`), and in the proxy of the browser (CR-102), which puts it in only towards a
// host of its provider.
import {
    AI_PROVIDER_DEFINITIONS,
    createAIProvider,
    createCloudflareProviderDefinition,
    createOpenAICompatibleProviderDefinition,
    createVertexAIProvider,
    resolveServerCredentials,
    type AICompleteRequest,
    type AICompleteResult,
    type AIModelDescriptor,
    type AIProviderAdapter,
    type ServerAISecret,
    type VertexLocation,
} from '@llmnative/react/server';
import type { AgenticoRecords, AgenticoSecrets } from './ports';

export const CONNECTIONS = 'agentico_connections';

/** The fields of the providers that are not secret (shown again); every other field is a secret. */
const PLAIN_FIELDS = new Set(['accountId', 'baseUrl', 'projectId', 'location', 'model']);
const PROVIDER_ID = /^[a-z][a-z0-9-]{1,40}$/;

type Account = { id: string; label?: string; at: string };
type Provider = { id: string; at: string; fields?: Record<string, string>; accounts: Account[] };
/** The connections of a namespace, one document: never a key. */
export interface ConnectionsRecord {
    id: string;
    providers: Provider[];
    order?: { list: string[]; manual: boolean };
}

export type ConnectionsSnapshot = {
    providers: Array<{ id: string; at?: string; fields?: Record<string, string>; accounts?: Array<{ id: string; label?: string; at?: string }> }>;
    order?: { list: string[]; manual: boolean };
};

export type ConnectionResult = { ok: true } | { ok: false; error?: string };

/** Builds the adapter of a provider from its fields (the key among them); a host can give its own. */
export type AdapterFactory = (provider: string, fields: Record<string, string>) => Promise<AIProviderAdapter>;

export const defaultAdapterFactory: AdapterFactory = async (provider, fields) => {
    if (provider === 'vertex') {
        return createVertexAIProvider({
            ...(fields.serviceAccount ? { serviceAccount: fields.serviceAccount } : {}),
            projectId: fields.projectId,
            location: (fields.location || 'eu') as VertexLocation,
        });
    }
    if (provider === 'cloudflare') return createAIProvider(createCloudflareProviderDefinition({ accountId: fields.accountId ?? '' }), fields.apiKey ?? '');
    if (provider === 'openai-compatible') {
        return createAIProvider(createOpenAICompatibleProviderDefinition({
            id: 'openai-compatible',
            label: 'OpenAI-compatible',
            baseUrl: fields.baseUrl ?? '',
        } as never), fields.apiKey ?? '');
    }
    if (!AI_PROVIDER_DEFINITIONS.some((definition) => definition.id === provider)) throw new Error(`unknown provider ${provider}`);
    return createAIProvider(provider as never, fields.apiKey ?? '');
};

const secretName = (namespace: string, provider: string, account: string) => `ai/${namespace}/${provider}/${account}`;
const newAccountId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);

function split(fields: Record<string, string>) {
    const plain: Record<string, string> = {};
    const secret: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields ?? {})) {
        if (typeof value !== 'string' || !value.trim()) continue;
        (PLAIN_FIELDS.has(key) ? plain : secret)[key] = value.trim();
    }
    return { plain, secret };
}

export type ConnectionsDeps = { records: AgenticoRecords; secrets: AgenticoSecrets; adapter?: AdapterFactory; now?: () => Date };

export function createConnections(deps: ConnectionsDeps) {
    const { records, secrets } = deps;
    const adapterOf = deps.adapter ?? defaultAdapterFactory;
    const now = deps.now ?? (() => new Date());

    const read = async (namespace: string): Promise<ConnectionsRecord> => (await records.get<ConnectionsRecord>(CONNECTIONS, namespace)) ?? { id: namespace, providers: [] };
    const write = (record: ConnectionsRecord) => records.put(CONNECTIONS, record);
    const fieldsOf = async (namespace: string, provider: Provider, account: Account): Promise<Record<string, string>> => {
        const raw = await secrets.get(secretName(namespace, provider.id, account.id));
        const secret = raw ? JSON.parse(raw) as Record<string, string> : {};
        return { ...(provider.fields ?? {}), ...secret };
    };
    /** The fields given, checked with the provider: why not, when it refuses them. */
    const check = async (provider: string, fields: Record<string, string>): Promise<ConnectionResult> => {
        try {
            const result = await (await adapterOf(provider, fields)).validateApiKey();
            return result.valid ? { ok: true } : { ok: false, error: result.error ?? 'rejected' };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
    };
    const keepAccount = async (namespace: string, provider: string, fields: Record<string, string>, label?: string): Promise<ConnectionResult> => {
        if (!PROVIDER_ID.test(provider)) return { ok: false, error: 'invalid provider' };
        const checked = await check(provider, fields);
        if (!checked.ok) return checked;
        const { plain, secret } = split(fields);
        const record = await read(namespace);
        const account: Account = { id: newAccountId(), at: now().toISOString(), ...(label ? { label } : {}) };
        await secrets.set(secretName(namespace, provider, account.id), JSON.stringify(secret));
        const existing = record.providers.find((item) => item.id === provider);
        if (existing) {
            existing.accounts.push(account);
            existing.fields = { ...(existing.fields ?? {}), ...plain };
        } else {
            record.providers.push({ id: provider, at: account.at, ...(Object.keys(plain).length ? { fields: plain } : {}), accounts: [account] });
        }
        await write(record);
        return { ok: true };
    };

    const connections = {
        /** What is connected: never a key. */
        async snapshot(namespace: string): Promise<ConnectionsSnapshot> {
            const record = await read(namespace);
            return {
                providers: record.providers.map(({ id, at, fields, accounts }) => ({ id, at, ...(fields ? { fields } : {}), accounts: accounts.map((account) => ({ ...account })) })),
                ...(record.order ? { order: record.order } : {}),
            };
        },

        /** Connects a provider with its first account: any account it had is replaced. */
        async connect(namespace: string, provider: string, fields: Record<string, string>): Promise<ConnectionResult> {
            await connections.disconnect(namespace, provider);
            return keepAccount(namespace, provider, fields);
        },

        async addAccount(namespace: string, provider: string, fields: Record<string, string>): Promise<ConnectionResult> {
            const { label, ...rest } = fields;
            return keepAccount(namespace, provider, rest, label?.trim() || undefined);
        },

        async disconnect(namespace: string, provider: string): Promise<void> {
            const record = await read(namespace);
            const found = record.providers.find((item) => item.id === provider);
            if (!found) return;
            for (const account of found.accounts) await secrets.delete(secretName(namespace, provider, account.id));
            record.providers = record.providers.filter((item) => item.id !== provider);
            if (record.order) record.order = { ...record.order, list: record.order.list.filter((id) => id !== provider) };
            await write(record);
        },

        async removeAccount(namespace: string, provider: string, accountId: string): Promise<void> {
            const record = await read(namespace);
            const found = record.providers.find((item) => item.id === provider);
            if (!found) return;
            await secrets.delete(secretName(namespace, provider, accountId));
            found.accounts = found.accounts.filter((account) => account.id !== accountId);
            if (!found.accounts.length) record.providers = record.providers.filter((item) => item.id !== provider);
            await write(record);
        },

        /** A new name for an account (never its key); empty takes the name away. */
        async renameAccount(namespace: string, provider: string, accountId: string, label: string): Promise<void> {
            const record = await read(namespace);
            const account = record.providers.find((item) => item.id === provider)?.accounts.find((item) => item.id === accountId);
            if (!account) return;
            const name = String(label ?? '').trim().slice(0, 100);
            if (name) account.label = name;
            else delete account.label;
            await write(record);
        },

        async orderAccounts(namespace: string, provider: string, accountIds: string[]): Promise<void> {
            const record = await read(namespace);
            const found = record.providers.find((item) => item.id === provider);
            if (!found) return;
            const position = (id: string) => {
                const index = accountIds.indexOf(id);
                return index < 0 ? accountIds.length : index;
            };
            found.accounts = [...found.accounts].sort((a, b) => position(a.id) - position(b.id));
            await write(record);
        },

        async setOrder(namespace: string, order: string[] | null): Promise<void> {
            const record = await read(namespace);
            if (order === null) delete record.order;
            else record.order = { list: order.filter((id) => typeof id === 'string'), manual: true };
            await write(record);
        },

        /** The adapter of a provider with its first account: what the server answers with. */
        async adapter(namespace: string, provider: string): Promise<AIProviderAdapter | null> {
            const record = await read(namespace);
            const found = record.providers.find((item) => item.id === provider);
            const account = found?.accounts[0];
            if (!found || !account) return null;
            return adapterOf(provider, await fieldsOf(namespace, found, account));
        },

        async models(namespace: string, provider: string): Promise<AIModelDescriptor[]> {
            const adapter = await connections.adapter(namespace, provider);
            return adapter ? (await adapter.getCapabilities()).models : [];
        },

        /** A request answered on the server with the key of the namespace. */
        async complete(namespace: string, provider: string, request: AICompleteRequest): Promise<AICompleteResult | null> {
            const adapter = await connections.adapter(namespace, provider);
            if (!adapter) throw new Error('no-provider');
            return adapter.complete(request);
        },

        /**
         * The proxy of the browser (CR-102): the placeholders of the request swapped for the keys of the namespace,
         * only towards a host of their provider. The scope of a placeholder must be the namespace itself.
         */
        async resolve(namespace: string, request: { url: string; headers: Record<string, string> }) {
            const record = await read(namespace);
            return resolveServerCredentials(request, async (scope, provider): Promise<ServerAISecret | undefined> => {
                if (scope !== namespace) return undefined;
                const found = record.providers.find((item) => item.id === provider);
                const account = found?.accounts[0];
                if (!found || !account) return undefined;
                const fields = await fieldsOf(namespace, found, account);
                const apiKey = fields.apiKey ?? fields.serviceAccount;
                return apiKey ? { id: provider, apiKey, ...(fields.accountId ? { accountId: fields.accountId } : {}), ...(fields.baseUrl ? { baseUrl: fields.baseUrl } : {}), ...(fields.projectId ? { projectId: fields.projectId } : {}), ...(fields.location ? { location: fields.location } : {}) } : undefined;
            });
        },
    };
    return connections;
}

export type Connections = ReturnType<typeof createConnections>;
