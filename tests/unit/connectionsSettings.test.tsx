import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DataProvider, I18nProvider, MockDataProvider } from '@llmnative/react';
import { MemoryRouter } from 'react-router-dom';
import type { AIProviderAdapter } from '@llmnative/react/server';
import { AgenticoProvider, AgenticoSettingsModal, createAgenticoBackend, useAgenticoSettings, type AgenticoSettingsConfig } from '../../src';
import { createAgenticoServer, memoryStores, type AgenticoIdentity } from '../../src/server';

// CR-026: the tabs Connections, Memory and Projects of the settings, on a real server of Agentico in memory.

function backendFor(identity: AgenticoIdentity, options: { runner?: boolean; tenantOwned?: boolean } = {}) {
    const stores = memoryStores();
    if (options.runner) void stores.records.put('agentico_runners', { id: 'r1', name: 'Runner', url: 'https://runner.test', isDefault: true, draining: false, createdAt: 1, updatedAt: 1 });
    const server = createAgenticoServer({
        identity: async () => identity,
        ...stores,
        platformName: 'Test',
        basePath: '/api/agentico',
        adapter: async (provider) => ({ id: provider, validateApiKey: async () => ({ valid: true }) }) as unknown as AIProviderAdapter,
        fetch: (async () => new Response('{}', { status: 404 })) as typeof fetch,
        tenants: async () => [{ id: 'acme', name: 'Acme' }],
        ...(options.tenantOwned ? { tenantOwned: { runners: true, memories: true } } : {}),
    });
    return createAgenticoBackend({ baseUrl: 'https://host.test/api/agentico', fetch: ((input: string | URL | Request, init?: RequestInit) => server.handle(new Request(input, init))) as typeof fetch });
}

const wrap = (settings: AgenticoSettingsConfig) => ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
        <DataProvider registry={{ default: new MockDataProvider() }} defaultKey="default">
            <I18nProvider><AgenticoProvider settings={settings}>{children}</AgenticoProvider></I18nProvider>
        </DataProvider>
    </MemoryRouter>
);

function Open() {
    const { open } = useAgenticoSettings();
    return <><button type="button" onClick={open}>open</button><AgenticoSettingsModal /></>;
}

describe('the settings on the server of Agentico', () => {
    it('the platform sees Connections as boxes (Cloud, Add a runner), Memory and Projects with its namespaces', async () => {
        const backend = backendFor({ user: { id: 'bea' }, role: 'platform', project: 'cms' });
        render(<Open />, { wrapper: wrap({ backend, hidden: ['defaultModel', 'reasoning', 'providers', 'chatTitles', 'threadEvents'] }) });
        fireEvent.click(screen.getByText('open'));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(within(dialog).getByText('Connections')).toBeInTheDocument());
        expect(within(dialog).queryByText('Connectors')).not.toBeInTheDocument();
        fireEvent.click(within(dialog).getByText('Connections'));
        expect(await within(dialog).findByText('Cloud')).toBeInTheDocument();
        expect(await within(dialog).findByText('Add a runner')).toBeInTheDocument();
        expect(within(dialog).getByText('None connected')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByText('Memory'));
        expect(await within(dialog).findByText('Add a memory')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByText('Projects'));
        expect(await within(dialog).findByText('cms-acme')).toBeInTheDocument();
        expect(within(dialog).getByText('Acme')).toBeInTheDocument();
    });

    it('a member sees only Connections: Cloud read only, and their own subscriptions on the runner', async () => {
        const backend = backendFor({ user: { id: 'ana' }, role: 'member', project: 'cms', tenant: 'acme' }, { runner: true });
        render(<Open />, { wrapper: wrap({ backend, hidden: ['defaultModel', 'reasoning', 'providers', 'chatTitles', 'threadEvents'] }) });
        fireEvent.click(screen.getByText('open'));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(within(dialog).getByText('Connections')).toBeInTheDocument());
        fireEvent.click(within(dialog).getByText('Connections'));
        expect(await within(dialog).findByText('Your subscriptions on the runner of the workspace.')).toBeInTheDocument();
        expect(within(dialog).queryByText('Add a runner')).not.toBeInTheDocument();
        expect(within(dialog).queryByText('Memory')).not.toBeInTheDocument();
        expect(within(dialog).queryByText('Projects')).not.toBeInTheDocument();
    });
    it('Cloud is on the connections of the host when it keeps its AI keys itself', async () => {
        const backend = backendFor({ user: { id: 'adele' }, role: 'admin', project: 'cms', tenant: 'acme' }, { tenantOwned: true });
        const store = { load: async () => ({ providers: [{ id: 'anthropic' }, { id: 'openai' }] }), connect: async () => ({ ok: true as const }), disconnect: async () => undefined };
        render(<Open />, { wrapper: wrap({ backend, connections: { store }, hidden: ['defaultModel', 'reasoning', 'providers', 'chatTitles', 'threadEvents'] }) });
        fireEvent.click(screen.getByText('open'));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(within(dialog).getByText('Connections')).toBeInTheDocument());
        fireEvent.click(within(dialog).getByText('Connections'));
        expect(await within(dialog).findByText('2 connected')).toBeInTheDocument();
        // CR-027: an admin administers the memories of their namespace.
        fireEvent.click(within(dialog).getByText('Memory'));
        expect(await within(dialog).findByText('Add a memory')).toBeInTheDocument();
        expect(within(dialog).queryByText('Connectors')).not.toBeInTheDocument();
    });

    it('names a runner from its address: the box and its modal, with no name to type', async () => {
        const backend = backendFor({ user: { id: 'bea' }, role: 'platform', project: 'cms' }, { runner: true });
        render(<Open />, { wrapper: wrap({ backend, hidden: ['defaultModel', 'reasoning', 'providers', 'chatTitles', 'threadEvents'] }) });
        fireEvent.click(screen.getByText('open'));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(within(dialog).getByText('Connections')).toBeInTheDocument());
        fireEvent.click(within(dialog).getByText('Connections'));
        // https://runner.test: its main label.
        fireEvent.click(await within(dialog).findByText('runner'));
        expect(await screen.findAllByText('runner')).not.toHaveLength(0);
        expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    });
});
