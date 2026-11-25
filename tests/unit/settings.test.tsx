import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { DataProvider, I18nProvider, MockDataProvider } from '@llmnative/react';
import { MemoryRouter } from 'react-router-dom';
import type { AICompleteRequest, AIConnectionStore } from '@llmnative/react';

// CR-022: the settings of Agentico: one schema, shown or fixed by the host, kept by its store, and the connectors
// of the AI providers in the settings modal.

const { calls, providerOf } = vi.hoisted(() => {
    const calls: Array<{ provider: string; request: AICompleteRequest }> = [];
    const providerOf = (id: string, models: string[]) => ({
        id, label: id.toUpperCase(), defaultModel: models[0],
        getCapabilities: async () => ({ models: models.map((model) => ({ id: `${id}/${model}`, provider: id, model, label: model, providerLabel: id.toUpperCase() })) }),
        validateApiKey: async () => ({ valid: true }),
        complete: async (request: AICompleteRequest) => {
            calls.push({ provider: id, request });
            return { type: 'text' as const, text: `from ${id}` };
        },
    });
    return { calls, providerOf };
});
vi.mock('@llmnative/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@llmnative/react')>();
    const registry = { one: providerOf('one', ['a', 'b']), two: providerOf('two', ['x']) };
    return { ...actual, useAIProviderRegistry: () => ({ registry }) };
});

const { AgenticoProvider, useAgenticoSettings, AgenticoSettingsModal, effectiveSettings, shownSettings, useAgent } = await import('../../src');
const { useAIModelCatalog } = await import('../../src/presentation/useAIModelCatalog');
type Settings = import('../../src').AgenticoSettings;
type Config = import('../../src').AgenticoSettingsConfig;

/** A store of the host in memory. */
function hostStore(initial: Partial<Settings> = {}) {
    let values = initial;
    return {
        load: vi.fn(async () => values),
        save: vi.fn(async (next: Partial<Settings>) => { values = next; }),
        get values() { return values; },
    };
}

const wrap = (settings?: Config) => ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
        <DataProvider registry={{ default: new MockDataProvider() }} defaultKey="default">
            <I18nProvider><AgenticoProvider settings={settings}>{children}</AgenticoProvider></I18nProvider>
        </DataProvider>
    </MemoryRouter>
);

beforeEach(() => {
    calls.length = 0;
    localStorage.clear();
});

describe('the schema', () => {
    it('is fixed by the host, else saved, else the default', () => {
        expect(effectiveSettings({})).toEqual({ chatTitles: true, threadEvents: true });
        expect(effectiveSettings({ reasoning: 'high', chatTitles: false, unknown: 1 } as never, { reasoning: 'low' })).toEqual({ chatTitles: false, threadEvents: true, reasoning: 'low' });
        expect(shownSettings({ reasoning: 'low' }, ['threadEvents'])).toEqual(['defaultModel', 'providers', 'chatTitles']);
    });
});

describe('in the panel', () => {
    it('loads the values from the host store, and keeps only what the person may change', async () => {
        const store = hostStore({ chatTitles: false });
        const { result } = renderHook(() => useAgenticoSettings(), { wrapper: wrap({ store, fixed: { reasoning: 'max' }, hidden: ['providers'] }) });
        await waitFor(() => expect(result.current.settings.chatTitles).toBe(false));
        expect(result.current.settings.reasoning).toBe('max');
        expect(result.current.shown).toEqual(['defaultModel', 'chatTitles', 'threadEvents']);
        await act(() => result.current.save({ reasoning: 'low', providers: ['one'], threadEvents: false }));
        expect(store.values).toEqual({ chatTitles: false, threadEvents: false });
        expect(result.current.settings.reasoning).toBe('max');
    });

    it('limits the AI catalog to the providers allowed, and starts on the default model', async () => {
        const store = hostStore({ providers: ['one'], defaultModel: 'one/b' });
        const { result } = renderHook(() => ({ catalog: useAIModelCatalog(), all: useAIModelCatalog({ unfiltered: true }) }), { wrapper: wrap({ store }) });
        await waitFor(() => expect(result.current.catalog.selectedModel).toBe('one/b'));
        expect(Object.keys(result.current.catalog.modelsByProvider)).toEqual(['one']);
        await waitFor(() => expect(Object.keys(result.current.all.modelsByProvider)).toEqual(['one', 'two']));
    });

    it('sends the reasoning of the settings when the agent says nothing', async () => {
        const store = hostStore({ reasoning: 'high', defaultModel: 'two/x' });
        const definition: import('../../src').AgentDefinition<{ p: string }, { p: string }, { text: string }> = {
            buildContext: (params) => params,
            buildPrompt: () => 'Hello',
            buildFollowUpPrompt: (text) => text,
            parseResponse: (raw) => ({ text: raw }),
            fallback: () => ({ text: 'none' }),
            conversational: true,
        };
        const { result } = renderHook(() => ({ agent: useAgent(definition, { defaultEnabled: true }) }), { wrapper: wrap({ store }) });
        await waitFor(() => expect(result.current.agent.selectedModel).toBe('two/x'));
        await act(async () => { await result.current.agent.run({ p: 'x' }); });
        expect(calls[0]).toMatchObject({ provider: 'two', request: { model: 'x', reasoning: 'high' } });
    });
});

describe('the settings modal', () => {
    it('shows the settings the host lets change and the connectors, and saves through the store', async () => {
        const store = hostStore();
        const connections: AIConnectionStore = { load: async () => ({ providers: [{ id: 'anthropic' }] }), connect: async () => ({ ok: true }), disconnect: async () => undefined };
        function Open() {
            const { open } = useAgenticoSettings();
            return <><button type="button" onClick={open}>open</button><AgenticoSettingsModal /></>;
        }
        render(<Open />, { wrapper: wrap({ store, fixed: { reasoning: 'low' }, hidden: ['threadEvents'], connections: { store: connections, allow: ['anthropic'] } }) });
        fireEvent.click(screen.getByText('open'));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).queryByText('How much the model reasons')).not.toBeInTheDocument();
        expect(within(dialog).queryByText('Show what the other agents did')).not.toBeInTheDocument();
        // CR-023: one tab each — Chats, Agents and tools, Connectors.
        fireEvent.click(within(dialog).getByText('Connectors'));
        expect(await within(dialog).findByText('Anthropic')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByText('Chats'));
        fireEvent.click(within(dialog).getByLabelText(/The model writes the titles/));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(store.save).toHaveBeenCalled());
        expect(store.values).toMatchObject({ chatTitles: false });
        expect(store.values).not.toHaveProperty('reasoning');
    });
});
