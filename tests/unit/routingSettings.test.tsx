import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { DataProvider, I18nProvider, MockDataProvider } from '@llmnative/react';
import { MemoryRouter } from 'react-router-dom';
import { z } from 'zod';
import {
    AgenticoProvider,
    registerCrossAgentTools,
    registerSubagents,
    useAgentico,
    type AgenticoRoute,
    type AgenticoRouting,
    type AgenticoRoutingChanges,
    type SubagentManifest,
} from '../../src';
import { AgenticoPagesSettings, AgenticoSubagentsSettings, AgenticoToolsSettings, pageRuleFromForm } from '../../src/presentation/AgenticoRoutingSettings';

// CR-023: the routing kept by the host store, and the tabs Subagents, Tools and Pages of the settings.

const defaults: AgenticoRouting = {
    pages: [
        { id: 'pages', label: 'Page editor', pattern: '^/pages/(?<pageId>[^/]+)$', context: 'Editing {pageId}' },
        { id: 'all', pattern: '.*' },
    ],
    subagents: { theme: { paths: ['^/pages/'] }, redirects: { paths: ['^/redirects'] } },
};

function manifest(id: string, label: string, crossAgentToolIds: string[] = []): SubagentManifest {
    return {
        id, label, icon: 'bot', description: `${label} does things.`, indexPath: `/${id}`, destinationIds: [], crossAgentToolIds,
        commands: [{ name: 'run', summary: 'Run', inputSchema: z.object({}), describeOutput: () => id }],
        definition: { buildContext: () => ({}), buildPrompt: () => '', buildFollowUpPrompt: () => '', parseResponse: () => null, fallback: () => ({}) },
        toParams: (input) => input,
    };
}

function memoryStore(initial: AgenticoRoutingChanges | null = null) {
    let kept = initial;
    return { load: vi.fn(async () => kept), save: vi.fn(async (changes: AgenticoRoutingChanges) => { kept = changes; }) };
}

const wrap = (route: AgenticoRoute) => ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
        <DataProvider registry={{ default: new MockDataProvider() }} defaultKey="default">
            <I18nProvider><AgenticoProvider route={route}>{children}</AgenticoProvider></I18nProvider>
        </DataProvider>
    </MemoryRouter>
);

function registerAll() {
    registerSubagents([manifest('theme', 'Theme extractor', ['scrape_page']), manifest('redirects', 'Redirects manager', ['read_sitemap'])]);
    registerCrossAgentTools(() => [
        { name: 'read_sitemap', description: 'Reads a sitemap.', inputSchema: z.object({}), execute: async () => ({}) },
        { name: 'scrape_page', description: 'Scrapes a page.', inputSchema: z.object({}), execute: async () => ({}) },
    ]);
}

afterEach(() => { cleanup(); registerSubagents([]); registerCrossAgentTools(); });

describe('routing kept by the host store', () => {
    it('loads the changes over the defaults, and saves only the differences', async () => {
        registerAll();
        const store = memoryStore({ pages: [{ id: 'pages', pattern: '^/pages/(?<pageId>[^/]+)$', context: 'Changed {pageId}' }], subagents: { redirects: {} } });
        const { result } = renderHook(() => useAgentico(), { wrapper: wrap({ path: '/pages/home', defaults, store }) });
        await waitFor(() => expect(result.current.route?.context).toBe('Changed home'));
        expect(result.current.routing.pages.map((r) => r.origin)).toEqual(['modified', 'default']);
        expect(result.current.route?.subagentIds).toEqual(['theme', 'redirects']);
        expect(result.current.route?.toolNames.sort()).toEqual(['read_sitemap', 'scrape_page']);

        await act(async () => { await result.current.routing.save!(defaults); });
        expect(store.save).toHaveBeenLastCalledWith({});
        expect(result.current.route?.context).toBe('Editing home');
        expect(result.current.route?.subagentIds).toEqual(['theme']);
    });

    it('without a store, or read-only: shown, not changed', () => {
        const { result } = renderHook(() => useAgentico(), { wrapper: wrap({ path: '/x', defaults, store: memoryStore(), readOnly: true }) });
        expect(result.current.routing.save).toBeNull();
        expect(result.current.route?.page?.rule.id).toBe('all');
    });
});

describe('the tabs', () => {
    it('Subagents: a box per subagent with its paths, tools and whether it is offered here', async () => {
        registerAll();
        render(<AgenticoSubagentsSettings />, { wrapper: wrap({ path: '/pages/home', defaults }) });
        expect(screen.getByText('Theme extractor')).toBeTruthy();
        expect(screen.getByText('^/redirects')).toBeTruthy();
        expect(screen.getByText('Read sitemap')).toBeTruthy(); // the tool of Redirects manager, readable
        // theme offered here; redirects not.
        expect(screen.getAllByText('Offered here').length).toBe(1);
        expect(screen.getAllByText('Not here').length).toBe(1);
    });

    it('"Try a path" on the current path: only its subagents, tools and page rules', async () => {
        registerAll();
        const { unmount } = render(<AgenticoSubagentsSettings />, { wrapper: wrap({ path: '/pages/home', defaults }) });
        fireEvent.click(screen.getByText('Try a path'));
        expect(screen.getByText('Theme extractor')).toBeTruthy();
        expect(screen.queryByText('Redirects manager')).toBeNull();
        unmount();
        const tools = render(<AgenticoToolsSettings />, { wrapper: wrap({ path: '/pages/home', defaults }) });
        fireEvent.click(screen.getByText('Try a path'));
        expect(screen.getByText('Scrape page')).toBeTruthy();
        expect(screen.queryByText('Read sitemap')).toBeNull();
        tools.unmount();
        render(<AgenticoPagesSettings />, { wrapper: wrap({ path: '/pages/home', defaults }) });
        fireEvent.click(screen.getByText('Try a path'));
        // Both rules match: the first applies (its context filled from the path), the catch-all is overridden.
        expect(screen.getByText('Applies')).toBeTruthy();
        expect(screen.getByText('Editing home')).toBeTruthy();
        expect(screen.getByText('Overridden by #1')).toBeTruthy();
    });

    it('"Try a path": the button opens a field, prefilled with the current path, that filters the boxes', async () => {
        registerAll();
        render(<AgenticoSubagentsSettings />, { wrapper: wrap({ path: '/pages/home', defaults }) });
        expect(screen.getByText('Redirects manager')).toBeTruthy();
        fireEvent.click(screen.getByText('Try a path'));
        const field = screen.getByPlaceholderText('/sites/acme/en/pages/home') as HTMLInputElement;
        expect(field.value).toBe('/pages/home');
        expect(screen.queryByText('Redirects manager')).toBeNull();
        expect(screen.getByText('1 of 2 match. Query and hash do not count.')).toBeTruthy();
        fireEvent.change(field, { target: { value: '/redirects/x' } });
        expect(screen.getByText('Redirects manager')).toBeTruthy();
        expect(screen.queryByText('Theme extractor')).toBeNull();
        fireEvent.change(field, { target: { value: '/nowhere' } });
        expect(screen.getByText('Nothing matches this path.')).toBeTruthy();
        fireEvent.click(screen.getByText('Try a path'));
        expect(screen.getByText('Theme extractor')).toBeTruthy();
    });

    it('Subagents: a click opens the editor on top; saving keeps the new path', async () => {
        registerAll();
        const store = memoryStore();
        render(<AgenticoSubagentsSettings />, { wrapper: wrap({ path: '/pages/home', defaults, store }) });
        await waitFor(() => expect(store.load).toHaveBeenCalled());
        fireEvent.click(screen.getByText('Redirects manager'));
        await waitFor(() => expect(screen.getByText('Edit Redirects manager')).toBeTruthy());
        fireEvent.click(screen.getByText('Add a path'));
        const inputs = screen.getAllByPlaceholderText('^/sites/[^/]+/pages/[^/]+$');
        fireEvent.change(inputs[inputs.length - 1], { target: { value: '^/moved' } });
        await act(async () => { fireEvent.click(screen.getByText('Save')); });
        await waitFor(() => expect(store.save).toHaveBeenCalled());
        expect(store.save.mock.calls[0][0]).toEqual({ subagents: { redirects: { paths: ['^/redirects', '^/moved'], tools: ['read_sitemap'] } } });
    });

    it('Tools: a box per tool with the subagents that use it', async () => {
        registerAll();
        render(<AgenticoToolsSettings />, { wrapper: wrap({ path: '/pages/home', defaults }) });
        expect(screen.getByText('Reads a sitemap.')).toBeTruthy();
        expect(screen.getByText('Redirects manager')).toBeTruthy();
        expect(screen.getByText('Theme extractor')).toBeTruthy();
    });

    it('Pages: the rules in order, the one of this page marked', async () => {
        registerAll();
        render(<AgenticoPagesSettings />, { wrapper: wrap({ path: '/pages/home', defaults }) });
        expect(screen.getByText('Page editor')).toBeTruthy();
        expect(screen.queryByPlaceholderText('/sites/acme/en/pages/home')).toBeNull(); // "Try a path" is closed until asked
        expect(screen.getByText('This page')).toBeTruthy();
    });

    it('pageRuleFromForm leaves empty optional fields out; the switch Active off disables the rule', () => {
        expect(pageRuleFromForm({ id: ' r ', label: '', pattern: ' ^/a$ ', flags: '', context: '', active: 'true' })).toEqual({ id: 'r', pattern: '^/a$' });
        // Switched off: disabled. The flags of a rule written in code are kept, not shown.
        expect(pageRuleFromForm({ id: 'r', label: 'R', pattern: '^/a$', flags: 'i', context: 'C', active: '' }))
            .toEqual({ id: 'r', label: 'R', pattern: '^/a$', flags: 'i', context: 'C', disabled: true });
    });
});
