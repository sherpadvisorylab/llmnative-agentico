import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import type { AICompleteRequest } from '@llmnative/react';

// CR-010: a chat allows only some providers of the AI catalog. Two providers the test answers: the turns
// of each are recorded apart.
const calls: Array<{ provider: string; request: AICompleteRequest }> = [];
const providerOf = (id: string) => ({
    id, label: id, defaultModel: 'm',
    getCapabilities: async () => ({}),
    validateApiKey: async () => ({ ok: true }),
    complete: async (request: AICompleteRequest) => {
        calls.push({ provider: id, request });
        return { type: 'text' as const, text: `from ${id}` };
    },
});

vi.mock('@llmnative/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@llmnative/react')>();
    return { ...actual, useAIProviderRegistry: () => ({ registry: { allowed: providerOf('allowed'), other: providerOf('other') } }) };
});
// The person picked a model of the provider the chat does not allow.
vi.mock('../../src/presentation/useAIModelCatalog', () => ({
    useAIModelCatalog: () => ({
        hasProviders: true,
        modelsByProvider: {
            allowed: [{ id: 'allowed/a', provider: 'allowed', model: 'A', providerLabel: 'Allowed' }],
            other: [{ id: 'other/x', provider: 'other', model: 'X', providerLabel: 'Other' }],
        },
        modelsLoading: false,
        selectedModel: 'other/x',
        setSelectedModel: () => undefined,
    }),
}));

const { useAgent } = await import('../../src');
type Definition = import('../../src').AgentDefinition<{ project: string }, { project: string }, { text: string }>;

const definition = (models: Array<{ label: string; value: string }> = []): Definition => ({
    buildContext: (params) => params,
    buildPrompt: (params) => `You talk about ${params.project}.`,
    buildFollowUpPrompt: (text) => text,
    parseResponse: (raw) => (raw.trim() ? { text: raw.trim() } : null),
    fallback: () => ({ text: 'no model' }),
    conversational: true,
    executor: {
        alongside: true,
        models: () => models,
        catalogProviders: (params) => (params.project === 'crm' ? ['allowed'] : undefined),
        turn: async () => ({ text: 'from the executor' }),
    },
});

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe('the AI catalog of a chat (CR-010)', () => {
    it('offers and runs only the models of the providers the chat allows', async () => {
        calls.length = 0;
        const { result } = renderHook(() => useAgent(definition(), { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.run({ project: 'crm' }); });
        expect(Object.keys(result.current.modelsByProvider)).toEqual(['allowed']);
        // The model picked is of a provider it does not allow: its first allowed one instead.
        expect(result.current.selectedModel).toBe('allowed/a');
        expect(calls.map((call) => call.provider)).toEqual(['allowed']);
        // Asked by name for a model of another provider: never used.
        await act(async () => { await result.current.sendMessage('And now?', { model: 'other/x' }); });
        expect(calls.map((call) => call.provider)).toEqual(['allowed', 'allowed']);
    });

    it('starts on the first model of the executor when the model picked is not allowed', async () => {
        const { result } = renderHook(() => useAgent(definition([{ label: 'Claude Opus', value: 'h:opus' }]), { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.resume({ project: 'crm' }, { history: [], activity: [] }); });
        expect(result.current.selectedModel).toBe('h:opus');
    });

    it('offers the whole catalog to a chat that names no provider', async () => {
        const { result } = renderHook(() => useAgent(definition(), { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.resume({ project: 'shop' }, { history: [], activity: [] }); });
        expect(Object.keys(result.current.modelsByProvider)).toEqual(['allowed', 'other']);
        expect(result.current.selectedModel).toBe('other/x');
    });
});
