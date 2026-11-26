// @vitest-environment node
// CR-025: the browser client against the real server, one fetch between them.
import { describe, expect, it } from 'vitest';
import type { AIProviderAdapter } from '@llmnative/react/server';
import { createAgenticoBackend } from '../../src/backend/agenticoBackend';
import { createAgenticoServer, memoryStores, type AgenticoIdentity } from '../../src/server';

const admin: AgenticoIdentity = { user: { id: 'adele' }, role: 'admin', project: 'crm', tenant: 'consuletica' };

describe('the client of the server of Agentico', () => {
    it('is the AIConnectionStore of the framework: connect, read back without keys, accounts, order', async () => {
        const stores = memoryStores();
        const server = createAgenticoServer({
            identity: async (request) => (request.headers.get('x-session') === 'ok' ? admin : null),
            ...stores,
            platformName: 'CRM',
            basePath: '/api/agentico',
            adapter: async (provider, fields) => ({ id: provider, validateApiKey: async () => (fields.apiKey?.startsWith('sk-') ? { valid: true } : { valid: false, error: 'no' }) }) as unknown as AIProviderAdapter,
        });
        const backend = createAgenticoBackend({
            baseUrl: 'https://crm.test/api/agentico',
            headers: () => ({ 'x-session': 'ok' }),
            fetch: ((input: string | URL | Request, init?: RequestInit) => server.handle(new Request(input, init))) as typeof fetch,
        });
        expect(await backend.me()).toMatchObject({ namespace: 'crm-consuletica', role: 'admin' });
        const store = backend.connections();
        expect(await store.connect('anthropic', { apiKey: 'nope' })).toEqual({ ok: false, error: 'no' });
        expect(await store.connect('anthropic', { apiKey: 'sk-first' })).toEqual({ ok: true });
        expect(await store.addAccount!('anthropic', { apiKey: 'sk-second', label: 'Backup' })).toEqual({ ok: true });
        const snapshot = await store.load();
        expect(snapshot.providers[0].accounts!.map((account) => account.label ?? 'first')).toEqual(['first', 'Backup']);
        expect(JSON.stringify(snapshot)).not.toContain('sk-');
        const [first, second] = snapshot.providers[0].accounts!;
        await store.orderAccounts!('anthropic', [second.id, first.id]);
        expect((await store.load()).providers[0].accounts!.map((account) => account.id)).toEqual([second.id, first.id]);
        await store.setOrder!(['anthropic']);
        expect((await store.load()).order).toEqual({ list: ['anthropic'], manual: true });
        await store.disconnect('anthropic');
        expect((await store.load()).providers).toEqual([]);
        // An admin sees the runners of its namespace only (CR-028): none yet.
        expect(await backend.fleet.list()).toEqual([]);
    });
});
