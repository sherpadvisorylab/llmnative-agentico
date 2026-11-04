import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { I18nProvider } from '@llmnative/react';
import type { AICompleteRequest, AICompleteResult } from '@llmnative/react';

// An AI provider the test scripts: each turn of the model the next reply.
const replies: AICompleteResult[] = [];
const requests: AICompleteRequest[] = [];
const mockProvider = {
    id: 'mock', label: 'Mock', defaultModel: 'm',
    getCapabilities: async () => ({}),
    validateApiKey: async () => ({ ok: true }),
    complete: async (request: AICompleteRequest) => {
        requests.push(request);
        return replies.shift() ?? { type: 'text' as const, text: '' };
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
const { approvalOf } = await import('../../src/domain/approval');
type Definition = import('../../src').AgentDefinition<object, object, { text: string }>;

const closed: number[] = [];
const commented: number[] = [];
const definition: Definition = {
    buildContext: () => ({}),
    buildPrompt: () => 'Manage the CRs.',
    buildFollowUpPrompt: (text) => text,
    parseResponse: (raw) => (raw.trim() ? { text: raw.trim() } : null),
    fallback: () => ({ text: 'stopped' }),
    conversational: true,
    getTools: () => [
        {
            name: 'close_cr', description: 'Closes a CR', inputSchema: z.object({ number: z.number() }),
            needsApproval: true,
            describeApproval: (input) => `Close #${String(input.number)}`,
            execute: async (input) => { closed.push(Number(input.number)); return { closed: true }; },
        },
        {
            name: 'comment_cr', description: 'Comments on a CR', inputSchema: z.object({ number: z.number() }),
            execute: async (input) => { commented.push(Number(input.number)); return { commented: true }; },
        },
    ],
};

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;
const toolResult = (index: number) => {
    const turn = requests[index]?.history?.at(-1) as { role: string; results?: Array<{ name: string; output: unknown; isError?: boolean }> } | undefined;
    return turn?.results ?? [];
};

describe('a tool that needs the approval of the person', () => {
    it('runs only once approved; the tools without approval run as before', async () => {
        replies.push(
            { type: 'tool_calls', toolCalls: [{ id: 'c1', name: 'close_cr', input: { number: 141 } }, { id: 'c2', name: 'comment_cr', input: { number: 141 } }] },
            { type: 'text', text: 'Closed #141.' },
        );
        const { result } = renderHook(() => useAgent(definition, { defaultEnabled: true }), { wrapper });
        let run!: Promise<{ text: string } | null>;
        act(() => { run = result.current.run({}); });

        // The turn waits on a question docked at the bottom: nothing ran yet.
        await waitFor(() => expect(result.current.activity.at(-1)?.id).toBe('approval-c1'));
        const asked = result.current.activity.at(-1)!;
        expect(asked.parts?.[0]).toMatchObject({ type: 'questions', id: 'approval', questions: [{ question: 'Approve? Close #141', options: [{ label: 'Approve' }, { label: 'Reject' }] }] });
        expect(closed).toEqual([]);
        expect(commented).toEqual([]);

        await act(async () => { await result.current.answerQuestions('approval-c1', 'approval', [{ values: ['Approve'] }]); await run; });
        expect(closed).toEqual([141]);
        expect(commented).toEqual([141]);
        expect(await run).toEqual({ text: 'Closed #141.' });
        // The choice stays in the chat.
        expect(result.current.activity.find((entry) => entry.id === 'approval-c1')?.parts?.[0]).toMatchObject({ answers: [{ values: ['Approve'] }] });
    });

    it('does not run when rejected, and the model reads the reason', async () => {
        closed.length = 0;
        requests.length = 0;
        replies.push(
            { type: 'tool_calls', toolCalls: [{ id: 'c3', name: 'close_cr', input: { number: 139 } }] },
            { type: 'text', text: 'Left #139 open.' },
        );
        const { result } = renderHook(() => useAgent(definition, { defaultEnabled: true }), { wrapper });
        let run!: Promise<{ text: string } | null>;
        act(() => { run = result.current.run({}); });
        await waitFor(() => expect(result.current.activity.at(-1)?.id).toBe('approval-c3'));
        await act(async () => { await result.current.answerQuestions('approval-c3', 'approval', [{ values: ['Reject', 'it is still needed'] }]); await run; });
        expect(closed).toEqual([]);
        expect(toolResult(1)).toEqual([{ toolCallId: 'c3', name: 'close_cr', output: 'Not done: the person rejected this action (it is still needed). Do not call it again unless they ask for it.', isError: true }]);
        expect(result.current.activity.find((entry) => entry.id === 'c3')?.status).toBe('stopped');
    });

    it('stops with the turn', async () => {
        replies.push({ type: 'tool_calls', toolCalls: [{ id: 'c4', name: 'close_cr', input: { number: 7 } }] });
        const { result } = renderHook(() => useAgent(definition, { defaultEnabled: true }), { wrapper });
        let run!: Promise<{ text: string } | null>;
        act(() => { run = result.current.run({}); });
        await waitFor(() => expect(result.current.activity.at(-1)?.id).toBe('approval-c4'));
        await act(async () => { result.current.stop(); await run; });
        expect(result.current.activity.find((entry) => entry.id === 'approval-c4')?.status).toBe('stopped');
        expect(closed).toEqual([]);
    });
});

describe('the answer to an approval', () => {
    it('approves only with Approve, and keeps what else was written as the reason', () => {
        expect(approvalOf([{ values: ['Approve'] }], 'Approve', 'Reject')).toEqual({ approved: true });
        expect(approvalOf([{ values: ['Reject', 'not now'] }], 'Approve', 'Reject')).toEqual({ approved: false, reason: 'not now' });
        expect(approvalOf([{ values: ['wait for Monday'] }], 'Approve', 'Reject')).toEqual({ approved: false, reason: 'wait for Monday' });
        expect(approvalOf([], 'Approve', 'Reject')).toEqual({ approved: false });
    });
});
