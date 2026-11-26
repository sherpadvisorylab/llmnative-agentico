import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { act, renderHook, waitFor } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import { createHarnessExecutor, runHostTool, useAgent, type AgentDefinition, type AgentExecutorTurn, type AgentTool, type AgenticoHarness, type AgenticoHarnessTurn } from '../../src';
import { AgenticoHarnessContext } from '../../src/presentation/harnessContext';

// CR-024: models of the host that run their own loop of tools, for every agent without an executor of its own.

const labels = { approveQuestion: 'Approve? {action}', approve: 'Approve', reject: 'Reject', rejected: 'Not done{reason}.' };

function turnSpy() {
    const steps: Array<{ id: string; label: string; status: string }> = [];
    const cards: unknown[] = [];
    let answers: Array<{ values: string[] }> = [];
    return {
        steps,
        cards,
        answer: (values: string[]) => { answers = [{ values }]; },
        turn: {
            onQuestions: vi.fn(async (_questions: Array<{ question: string; options: Array<{ label: string }> }>, _part?: { id?: string }) => answers.map((answer, index) => ({ id: `q${index}`, values: answer.values }))),
            onStep: (step: { id: string; label: string; status: string }) => steps.push(step),
            onCard: (card: unknown) => cards.push(card),
        },
    };
}

const publish: AgentTool = {
    name: 'publish',
    description: 'Publishes the page',
    inputSchema: z.object({ page: z.string() }),
    needsApproval: true,
    describeApproval: (input) => `publish ${String(input.page)}`,
    describeInvocation: (input) => `Publishing ${String(input.page)}`,
    execute: async (input) => ({ published: input.page }),
    card: (input) => ({ id: 'card', title: `Published ${String(input.page)}` }),
};

describe('a tool of the app called by a harness', () => {
    it('runs after the approval of the person, with its step and its card', async () => {
        const spy = turnSpy();
        spy.answer(['Approve']);
        const done = await runHostTool([publish], 'publish', { page: 'home' }, spy.turn, labels);
        expect(done).toEqual({ result: { published: 'home' } });
        expect(spy.turn.onQuestions.mock.calls[0]?.[0][0]).toMatchObject({ question: 'Approve? publish home', options: [{ label: 'Approve' }, { label: 'Reject' }] });
        expect(spy.steps.map((step) => step.status)).toEqual(['running', 'done']);
        expect(spy.steps[0].label).toBe('Publishing home');
        expect(spy.cards).toEqual([{ id: 'card', title: 'Published home' }]);
    });

    it('rejected, it does not run and the harness reads why; wrong calls are errors, never throws', async () => {
        const spy = turnSpy();
        spy.answer(['Reject', 'not today']);
        const execute = vi.spyOn(publish, 'execute');
        expect(await runHostTool([publish], 'publish', { page: 'home' }, spy.turn, labels)).toEqual({ result: 'Not done (not today).', isError: true });
        expect(execute).not.toHaveBeenCalled();
        expect(await runHostTool([publish], 'nope', {}, spy.turn, labels)).toMatchObject({ isError: true });
        expect(await runHostTool([publish], 'publish', { page: 3 }, spy.turn, labels)).toMatchObject({ isError: true });
        const failing: AgentTool = { name: 'boom', description: '', inputSchema: z.object({}), execute: async () => { throw new Error('down'); } };
        expect(await runHostTool([failing], 'boom', {}, spy.turn, labels)).toEqual({ result: 'down', isError: true });
        expect(spy.steps.at(-1)?.status).toBe('error');
    });
});

type Params = { goal: string };
type Ctx = { site: string };

function definition(): AgentDefinition<Params, Ctx, { said: string }> {
    return {
        buildContext: async () => ({ site: 'acme.com' }),
        buildPrompt: (params, context) => `Brief for ${context.site}: ${params.goal}`,
        buildFollowUpPrompt: (text) => `Follow-up: ${text}`,
        parseResponse: (raw) => ({ said: raw }),
        fallback: () => ({ said: 'none' }),
        getTools: () => [publish],
    };
}

function fakeHarness() {
    const turns: AgenticoHarnessTurn[] = [];
    const close = vi.fn((_chatId: string) => undefined);
    const harness: AgenticoHarness & { close: typeof close } = {
        models: () => [{ label: 'Claude Code · your subscription', value: 'runner:claude-code/sonnet', group: 'Your subscription' }],
        turn: async (turn) => {
            turns.push(turn);
            return { text: `reply ${turns.length}` };
        },
        close,
    };
    return { harness, turns };
}

const executorTurn = (over: Partial<AgentExecutorTurn<Params, Ctx>>): AgentExecutorTurn<Params, Ctx> => ({
    params: { goal: 'a landing page' },
    context: { site: 'acme.com' },
    text: '',
    first: true,
    signal: new AbortController().signal,
    model: 'runner:claude-code/sonnet',
    onText: () => {},
    onReasoning: () => {},
    onStep: () => {},
    onQuestions: async () => [],
    ...over,
});

describe('an agent on the harness', () => {
    it('sends its brief first, then the follow-ups on the same chat, its tools as JSON Schema, its parsing', async () => {
        const { harness, turns } = fakeHarness();
        const executor = createHarnessExecutor(definition(), harness, { labels });
        expect(executor.alongside).toBe(true);
        expect(executor.canRewind).toBe(true);
        expect(executor.models?.({ goal: '' })).toHaveLength(1);
        const first = await executor.turn(executorTurn({ text: 'a landing page' }));
        expect(first).toEqual({ text: 'reply 1', result: { said: 'reply 1' } });
        expect(turns[0]).toMatchObject({ first: true, prompt: 'Brief for acme.com: a landing page', model: 'runner:claude-code/sonnet' });
        expect(turns[0].chatId).toMatch(/^[0-9a-f]{8}$/);
        expect(turns[0].tools).toEqual([{ name: 'publish', description: 'Publishes the page', inputSchema: expect.objectContaining({ type: 'object', properties: { page: { type: 'string' } } }) }]);

        await executor.turn(executorTurn({ first: false, text: 'make it blue' }));
        expect(turns[1]).toMatchObject({ first: false, prompt: 'Follow-up: make it blue', chatId: turns[0].chatId });
    });

    it('starts a new chat with the chat so far when taken back to a message, closing the one before', async () => {
        const { harness, turns } = fakeHarness();
        const executor = createHarnessExecutor(definition(), harness, { labels });
        await executor.turn(executorTurn({ text: 'a landing page' }));
        await executor.turn(executorTurn({
            first: false,
            text: 'make it green',
            rewound: { activity: [
                { id: 'u1', kind: 'user', label: 'You', status: 'done', detail: 'a landing page' },
                { id: 't1', kind: 'thinking', label: '', status: 'done', detail: 'Here it is.' },
            ] },
        }));
        expect(turns[1].first).toBe(true);
        expect(turns[1].chatId).not.toBe(turns[0].chatId);
        expect(harness.close).toHaveBeenCalledWith(turns[0].chatId);
        expect(turns[1].prompt).toBe('Brief for acme.com: a landing page\n\n## The chat so far\n\nPerson: a landing page\n\nAgent: Here it is.\n\n---\n\nmake it green');
    });

    it('is offered next to the AI catalog for an agent without an executor, and answers the turns of its models', async () => {
        const { harness, turns } = fakeHarness();
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <I18nProvider><AgenticoHarnessContext.Provider value={harness}>{children}</AgenticoHarnessContext.Provider></I18nProvider>
        );
        const agent = definition();
        const { result } = renderHook(() => useAgent(agent), { wrapper });
        expect(result.current.alongside).toBe(true);
        let pending!: Promise<{ said: string } | null>;
        act(() => { pending = result.current.run({ goal: 'a landing page' }, { model: 'runner:claude-code/sonnet' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        await act(async () => { expect(await pending).toEqual({ said: 'reply 1' }); });
        expect(result.current.remoteModels.map((model) => model.value)).toEqual(['runner:claude-code/sonnet']);
        expect(turns[0].prompt).toBe('Brief for acme.com: a landing page');
    });
});
