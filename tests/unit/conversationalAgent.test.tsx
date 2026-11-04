import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import type { AICompleteRequest } from '@llmnative/react';

// An AI provider the test answers: each turn of the model a text reply.
const replies: string[] = [];
const requests: AICompleteRequest[] = [];
const mockProvider = {
    id: 'mock', label: 'Mock', defaultModel: 'm',
    getCapabilities: async () => ({}),
    validateApiKey: async () => ({ ok: true }),
    complete: async (request: AICompleteRequest) => {
        requests.push(request);
        return { type: 'text' as const, text: replies.shift() ?? '' };
    },
};

vi.mock('@llmnative/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@llmnative/react')>();
    return { ...actual, useAIProviderRegistry: () => ({ registry: { mock: mockProvider } }) };
});
vi.mock('../../src/presentation/useAIModelCatalog', () => ({
    useAIModelCatalog: () => ({ hasProviders: true, modelsByProvider: {}, modelsLoading: false, selectedModel: 'mock/m', setSelectedModel: () => undefined }),
}));

const { useAgent } = await import('../../src');
type Definition = import('../../src').AgentDefinition<{ project: string }, { project: string }, { text: string }>;

const definition = (conversational?: boolean): Definition => ({
    buildContext: (params) => params,
    buildPrompt: (params) => `You talk about ${params.project}.`,
    buildFollowUpPrompt: (text) => text,
    parseResponse: (raw) => (raw.trim() ? { text: raw.trim() } : null),
    fallback: () => ({ text: 'no model' }),
    ...(conversational ? { conversational } : {}),
});

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe('a conversational agent', () => {
    it('shows each reply of the model as a text part of its turn', async () => {
        replies.push('Hi! What do you need?', 'CR #121 is with the developer.');
        const { result } = renderHook(() => useAgent(definition(true), { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.run({ project: 'crm' }); });
        expect(result.current.activity.at(-1)).toMatchObject({ kind: 'thinking', status: 'done', parts: [{ type: 'text', id: 'text', text: 'Hi! What do you need?' }] });

        let next!: { text: string } | null;
        await act(async () => { next = await result.current.sendMessage('Where is #121?'); });
        expect(next).toEqual({ text: 'CR #121 is with the developer.' });
        expect(result.current.activity.at(-1)?.parts).toEqual([{ type: 'text', id: 'text', text: 'CR #121 is with the developer.' }]);
        expect(requests.at(-1)?.prompt).toBe('Where is #121?');
    });

    it('leaves the replies of any other agent as they were', async () => {
        replies.push('{"text":"done"}');
        const { result } = renderHook(() => useAgent(definition(), { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.run({ project: 'crm' }); });
        expect(result.current.activity.at(-1)).toMatchObject({ kind: 'thinking', status: 'done', detail: '{"text":"done"}' });
        expect(result.current.activity.at(-1)?.parts).toBeUndefined();
    });
});
