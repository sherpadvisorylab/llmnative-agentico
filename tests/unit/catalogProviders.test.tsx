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
        // CR-012: how much it reasons on each provider of the catalog.
        catalogReasoning: (_params, provider) => (provider === 'allowed' ? 'high' : undefined),
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
        // Every request of the turns on that provider with its reasoning level.
        expect(calls.map((call) => (call.request as { reasoning?: string }).reasoning)).toEqual(['high', 'high']);
    });

    it('starts on the first model of the executor when the model picked is not allowed', async () => {
        const { result } = renderHook(() => useAgent(definition([{ label: 'Claude Opus', value: 'h:opus' }]), { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.resume({ project: 'crm' }, { history: [], activity: [] }); });
        expect(result.current.selectedModel).toBe('h:opus');
    });

    it('sends the answers no turn waits for any more as a message of the person', async () => {
        // The executor asked an approval, then stopped waiting for it (its call timed out) and ended its turn.
        const texts: string[] = [];
        const base = definition([{ label: 'Claude Opus', value: 'h:opus' }]);
        const asking: Definition = {
            ...base,
            executor: {
                ...base.executor!,
                turn: async (turn) => {
                    texts.push(turn.text);
                    if (texts.length === 1) void turn.onQuestions([{ id: 'approval-start_release', question: 'Approve? Starting the release v0.1.4', options: [{ label: 'Approve' }, { label: 'Reject' }] }]).catch(() => undefined);
                    return { text: texts.length === 1 ? 'It did not start: try again?' : 'Started.' };
                },
            },
        };
        const { result } = renderHook(() => useAgent(asking, { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.resume({ project: 'crm' }, { history: [], activity: [] }); });
        await act(async () => { await result.current.sendMessage('Release'); });
        const entry = result.current.activity.at(-1)!;
        expect(entry.parts?.some((part) => part.type === 'questions')).toBe(true);

        await act(async () => { await result.current.answerQuestions(entry.id, 'questions-1', [{ id: 'approval-start_release', values: ['Approve'] }]); });
        expect(result.current.error).toBeNull();
        // Answered there, and said to the agent as the next message.
        expect(result.current.activity.find((item) => item.id === entry.id)?.parts?.find((part) => part.type === 'questions')).toMatchObject({ answers: [{ values: ['Approve'] }] });
        expect(texts).toHaveLength(2);
        expect(texts[1]).toContain('Approve');
        expect(result.current.activity.at(-1)?.detail).toBe('Started.');
    });

    it('offers the whole catalog to a chat that names no provider', async () => {
        const { result } = renderHook(() => useAgent(definition(), { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.resume({ project: 'shop' }, { history: [], activity: [] }); });
        expect(Object.keys(result.current.modelsByProvider)).toEqual(['allowed', 'other']);
        expect(result.current.selectedModel).toBe('other/x');
    });
});
