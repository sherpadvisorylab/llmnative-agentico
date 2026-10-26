import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import {
    formatQuestionAnswers,
    getEntityChat,
    messagePartsText,
    saveEntityChat,
    upsertMessagePart,
    useAgent,
    type AgentActivityEntry,
    type AgentDefinition,
    type AgentExecutorTurn,
    type AgentMessagePart,
} from '../../src';
import { AgentActivityLog } from '../../src/presentation/AgentActivityLog';

type Turn = AgentExecutorTurn<{ project: string }, { project: string }> & { reply: (text: string) => void; fail: (error: Error) => void };

function remoteDefinition() {
    const turns: Turn[] = [];
    const definition: AgentDefinition<{ project: string }, { project: string }, string> = {
        buildContext: (params) => params,
        buildPrompt: () => { throw new Error('no prompt'); },
        buildFollowUpPrompt: () => { throw new Error('no prompt'); },
        parseResponse: () => { throw new Error('no parsing'); },
        fallback: () => { throw new Error('no fallback'); },
        executor: {
            turn: (turn) => new Promise((resolve, reject) => {
                turns.push({ ...turn, reply: (text) => resolve({ text }), fail: reject });
            }),
        },
    };
    return { definition, turns };
}

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;
const questions = [
    { id: 'db', header: 'Database', question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] },
];

afterEach(() => { vi.useRealTimers(); });

describe('message parts', () => {
    it('keeps a new step or reasoning above the default reply, and closes the reasoning when another part arrives', () => {
        let parts: AgentMessagePart[] = [];
        const close = (p: Extract<AgentMessagePart, { type: 'reasoning' }>) => ({ ...p, streaming: false, duration: 3 });
        parts = upsertMessagePart(parts, { type: 'reasoning', id: 'r', text: 'Hmm', streaming: true }, close);
        parts = upsertMessagePart(parts, { type: 'text', id: 'text', text: 'Hello', streaming: true }, close);
        parts = upsertMessagePart(parts, { type: 'tool', id: 's1', label: 'read', status: 'running' }, close);
        parts = upsertMessagePart(parts, { type: 'text', id: 'text', text: 'Hello world', streaming: true }, close);
        expect(parts).toEqual([
            { type: 'reasoning', id: 'r', text: 'Hmm', streaming: false, duration: 3 },
            { type: 'tool', id: 's1', label: 'read', status: 'running' },
            { type: 'text', id: 'text', text: 'Hello world', streaming: true },
        ]);
        expect(messagePartsText([...parts, { type: 'text', id: 't2', text: 'More' }])).toBe('Hello world\n\nMore');
        expect(formatQuestionAnswers(questions, [{ id: 'db', values: ['Postgres'] }])).toBe('Database: Postgres');
    });

    it('collects the parts a remote executor reports, in order, with the time the model reasoned', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        let run!: Promise<string | null>;
        act(() => { run = result.current.run({ project: 'shop' }, { openingMessage: 'Orders' }); });
        await waitFor(() => expect(turns).toHaveLength(1));

        act(() => turns[0].onReasoning('Let me think'));
        vi.setSystemTime(Date.now() + 4000);
        act(() => turns[0].onText('Here is the plan', { id: 'a' }));
        act(() => turns[0].onStep({ id: 'w', label: 'wrote PLAN.md', status: 'done' }));
        act(() => turns[0].onText('| A | B |\n|---|---|\n| 1 | 2 |', { id: 'b', done: true }));
        await act(async () => { turns[0].reply('the whole reply'); await run; });

        const entry = result.current.activity.at(-1)!;
        expect(entry.parts).toEqual([
            { type: 'reasoning', id: 'reasoning', text: 'Let me think', streaming: false, duration: 4 },
            { type: 'text', id: 'a', text: 'Here is the plan', streaming: false },
            { type: 'tool', id: 'w', label: 'wrote PLAN.md', status: 'done' },
            { type: 'text', id: 'b', text: '| A | B |\n|---|---|\n| 1 | 2 |', streaming: false },
        ]);
        // The text of the message, for what reads `detail`; the history keeps the reply of the turn.
        expect(entry.detail).toBe('Here is the plan\n\n| A | B |\n|---|---|\n| 1 | 2 |');
        expect(result.current.snapshot()?.history.at(-1)).toEqual({ role: 'assistant', content: 'the whole reply' });
    });

    it('gives the answers to the turn that is waiting for them', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        act(() => { void result.current.run({ project: 'shop' }); });
        await waitFor(() => expect(turns).toHaveLength(1));

        let asked!: Promise<unknown>;
        act(() => { asked = turns[0].onQuestions(questions, { id: 'q1' }); });
        const entryId = result.current.activity.at(-1)!.id;
        await act(async () => { await result.current.answerQuestions(entryId, 'q1', [{ id: 'db', header: 'Database', values: ['SQLite'] }]); });
        await expect(asked).resolves.toEqual([{ id: 'db', header: 'Database', values: ['SQLite'] }]);
        expect(turns).toHaveLength(1);
        expect(result.current.activity.at(-1)?.parts).toEqual([
            { type: 'questions', id: 'q1', questions, answers: [{ id: 'db', header: 'Database', values: ['SQLite'] }] },
        ]);
        await act(async () => { turns[0].reply('Noted'); });
    });

    it('sends answers given after their turn as a new turn, structured', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        let run!: Promise<string | null>;
        act(() => { run = result.current.run({ project: 'shop' }, { openingMessage: 'Start' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        act(() => { void turns[0].onQuestions(questions); });
        await act(async () => { turns[0].reply('Answer these'); await run; });

        const entryId = result.current.activity.at(-1)!.id;
        let answered!: Promise<string | null>;
        act(() => { answered = result.current.answerQuestions(entryId, 'questions-1', [{ id: 'db', values: ['Postgres'] }]); });
        await waitFor(() => expect(turns).toHaveLength(2));
        expect(turns[1]).toMatchObject({ text: '', first: false, answers: { id: 'questions-1', answers: [{ id: 'db', values: ['Postgres'] }] } });
        await act(async () => { turns[1].reply('Postgres it is'); await answered; });
        expect(result.current.activity.find((a) => a.id === entryId)?.parts?.find((p) => p.type === 'questions')).toMatchObject({ answers: [{ id: 'db', values: ['Postgres'] }] });
        expect(result.current.snapshot()?.history.slice(-2)).toEqual([
            { role: 'user', content: 'Database: Postgres' },
            { role: 'assistant', content: 'Postgres it is' },
        ]);
    });

    it('rejects the questions of a turn the person stops', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        act(() => { void result.current.run({ project: 'shop' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        let asked!: Promise<unknown>;
        act(() => { asked = turns[0].onQuestions(questions); });
        act(() => result.current.stop());
        await expect(asked).rejects.toMatchObject({ name: 'AbortError' });
        await act(async () => { turns[0].fail(new Error('aborted')); });
        expect(result.current.activity.at(-1)?.status).toBe('stopped');
    });

    it('saves the parts with the chat and reads them back; a chat saved with text only still loads', () => {
        const activity: AgentActivityEntry[] = [
            { id: 'u', kind: 'user', label: 'Tu', status: 'done', detail: 'Hi' },
            { id: 'm', kind: 'thinking', label: '', status: 'done', detail: 'Hello', parts: [{ type: 'text', id: 'text', text: 'Hello' }, { type: 'questions', id: 'q', questions, answers: [{ values: ['SQLite'] }] }] },
        ];
        saveEntityChat({ scopeId: 's', subagentId: 'design', entityId: 'e1', params: {}, history: [], activity, title: 'Design' });
        expect(getEntityChat('s', 'design', 'e1')?.activity).toEqual(activity);
        localStorage.setItem('llmnative.agentico.entityChat', JSON.stringify([
            { scopeId: 's', subagentId: 'design', entityId: 'old', params: {}, history: [], title: 'Old', savedAt: 1,
                activity: [{ id: 'm', kind: 'thinking', label: '', status: 'done', detail: 'Plain **text**' }] },
        ]));
        expect(getEntityChat('s', 'design', 'old')?.activity[0].parts).toBeUndefined();
    });
});

describe('the activity log of a message in parts', () => {
    const renderLog = (activity: AgentActivityEntry[], onAnswer = vi.fn(async () => undefined)) => {
        render(
            <I18nProvider>
                <AgentActivityLog activity={activity} questions={{ canAnswer: () => true, onAnswer }} />
            </I18nProvider>,
        );
        return onAnswer;
    };

    it('renders Markdown tables, the reasoning closed, the steps as one group and the person pinned in its turn', () => {
        const { container } = render(
            <I18nProvider>
                <AgentActivityLog activity={[
                    { id: 'u', kind: 'user', label: 'Tu', status: 'done', detail: 'Plan it' },
                    { id: 'm', kind: 'thinking', label: '', status: 'done', parts: [
                        { type: 'reasoning', id: 'r', text: 'Secret thoughts', duration: 12 },
                        { type: 'tool', id: 's1', label: 'read README.md', status: 'done' },
                        { type: 'tool', id: 's2', label: 'wrote PLAN.md', status: 'done' },
                        { type: 'text', id: 't', text: '| Step | Owner |\n|---|---|\n| One | **Ann** |' },
                    ] },
                ]} />
            </I18nProvider>,
        );
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(screen.getByText('Ann').tagName).toBe('STRONG');
        expect(screen.getByRole('button', { name: /12 s/ })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Secret thoughts')).not.toBeInTheDocument();
        expect(screen.getByRole('tree', { name: 'Steps of the agent' })).toBeInTheDocument();
        expect(screen.getByText('2 steps')).toBeInTheDocument();
        // The bubble of the person is sticky inside the item of its own turn, with the reply.
        const bubble = container.querySelector('.sticky')!;
        expect(bubble.parentElement?.tagName).toBe('LI');
        expect(bubble.parentElement?.textContent).toContain('One');
    });

    it('sends the answers chosen, and shows an answered set read-only', async () => {
        const onAnswer = renderLog([
            { id: 'm', kind: 'thinking', label: '', status: 'done', parts: [{ type: 'questions', id: 'q', questions }] },
            { id: 'n', kind: 'thinking', label: '', status: 'done', parts: [{ type: 'questions', id: 'q2', questions: [{ ...questions[0], id: 'db2' }], answers: [{ id: 'db2', header: 'Database', values: ['Postgres'] }] }] },
        ]);
        fireEvent.click(screen.getAllByRole('radio', { name: /SQLite/ })[0]);
        fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('m', 'q', [{ id: 'db', header: 'Database', values: ['SQLite'] }]));
        expect(screen.getAllByRole('group', { name: /Answered/i }).length).toBeGreaterThan(0);
    });

    it('shows a message saved before the parts from its text, as Markdown', () => {
        renderLog([{ id: 'm', kind: 'thinking', label: '', status: 'done', detail: 'A **bold** reply\n\n- one\n- two' }]);
        expect(screen.getByText('bold').tagName).toBe('STRONG');
        expect(screen.getAllByRole('listitem').some((li) => li.textContent === 'one')).toBe(true);
    });
});
