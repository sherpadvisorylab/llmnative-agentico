import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import { useAgent, type AgentDefinition, type AgentExecutorTurn } from '../../src';
import { AgentActivityLog } from '../../src/presentation/AgentActivityLog';
import type { AgentActivityEntry } from '../../src/presentation/useAgent';

// CR-016: the person takes the chat back to one of their messages, and sends it again as it was or edited.

type Turn = AgentExecutorTurn<{ project: string }, { project: string }> & { reply: (text: string) => void };

function remoteDefinition() {
    const turns: Turn[] = [];
    const definition: AgentDefinition<{ project: string }, { project: string }, string> = {
        buildContext: (params) => params,
        buildPrompt: () => { throw new Error('no prompt'); },
        buildFollowUpPrompt: () => { throw new Error('no prompt'); },
        parseResponse: () => { throw new Error('no parsing'); },
        fallback: () => { throw new Error('no fallback'); },
        executor: {
            turn: (turn) => new Promise((resolve) => {
                turns.push({ ...turn, reply: (text) => resolve({ text }) });
            }),
            canRewind: true,
        },
    };
    return { definition, turns };
}

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe('going back to a message of the person', () => {
    it('cuts the chat and the history of the model there, sends it again, and tells the executor once', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        let pending!: Promise<string | null>;
        act(() => { pending = result.current.run({ project: 'crm' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        await act(async () => { turns[0].reply('Hello, what do you need?'); await pending; });

        act(() => { pending = result.current.sendMessage('Where is the CI?'); });
        await waitFor(() => expect(turns).toHaveLength(2));
        await act(async () => { turns[1].reply('Red on #287.'); await pending; });
        act(() => { pending = result.current.sendMessage('And the standards?'); });
        await waitFor(() => expect(turns).toHaveLength(3));
        await act(async () => { turns[2].reply('Two of them.'); await pending; });

        const first = result.current.activity.find((entry) => entry.detail === 'Where is the CI?')!;
        // Each message remembers where the history was when it was sent.
        expect(first.historyAt).toBe(1);

        // Edited: everything from that message on goes, and the new text is sent in its place.
        act(() => { pending = result.current.rewind(first.id, 'Where is the CI on develop?'); });
        await waitFor(() => expect(turns).toHaveLength(4));
        expect(turns[3]).toMatchObject({ text: 'Where is the CI on develop?', first: false });
        expect(turns[3].rewound?.activity.map((entry) => entry.detail)).toEqual(['Hello, what do you need?']);
        await act(async () => { turns[3].reply('Green on develop.'); await pending; });
        expect(result.current.activity.map((entry) => entry.detail)).toEqual(['Hello, what do you need?', 'Where is the CI on develop?', 'Green on develop.']);
        expect(result.current.snapshot()?.history).toEqual([
            { role: 'assistant', content: 'Hello, what do you need?' },
            { role: 'user', content: 'Where is the CI on develop?' },
            { role: 'assistant', content: 'Green on develop.' },
        ]);

        // The next turn goes on as usual: the executor was told once.
        act(() => { pending = result.current.sendMessage('Thanks'); });
        await waitFor(() => expect(turns).toHaveLength(5));
        expect(turns[4].rewound).toBeUndefined();
        await act(async () => { turns[4].reply('You are welcome.'); await pending; });

        // As it was: the same text again.
        const again = result.current.activity.find((entry) => entry.detail === 'Thanks')!;
        act(() => { pending = result.current.rewind(again.id); });
        await waitFor(() => expect(turns).toHaveLength(6));
        expect(turns[5]).toMatchObject({ text: 'Thanks' });
        expect(turns[5].rewound?.activity).toHaveLength(3);
        await act(async () => { turns[5].reply('Anytime.'); await pending; });
    });

    it('is refused while a turn runs, and on a message the history does not show', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        let pending!: Promise<string | null>;
        act(() => { pending = result.current.run({ project: 'crm' }, { openingMessage: 'Hi' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        const opening = result.current.activity[0];
        let refused: string | null = 'not called';
        await act(async () => { refused = await result.current.rewind(opening.id); });
        expect(refused).toBeNull();
        expect(result.current.error).not.toBeNull();
        await act(async () => { turns[0].reply('Hello'); await pending; });
        // Sent without historyAt (the opening, or before 0.15.0): found in the history by its text.
        expect(opening.historyAt).toBeUndefined();
        expect(result.current.rewindable(opening.id)).toBe(true);

        // A chat reopened whose history does not have an earlier message: no going back to it.
        const reopened = renderHook(() => useAgent(definition), { wrapper }).result;
        await act(async () => {
            await reopened.current.resume({ project: 'crm' }, { history: [], activity: [
                { id: 'old', kind: 'user', label: 'Tu', status: 'done', detail: 'Lost' },
                { id: 'later', kind: 'user', label: 'Tu', status: 'done', detail: 'Later' },
            ] });
        });
        expect(reopened.current.rewindable('old')).toBe(false);
        await act(async () => { refused = await reopened.current.rewind('old'); });
        expect(refused).toBeNull();
        expect(turns).toHaveLength(1);
    });

    it('takes back the last message of the person when the chat was saved while its turn ran, never recorded', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        await act(async () => {
            await result.current.resume({ project: 'crm' }, {
                history: [{ role: 'assistant', content: 'Hi, what do you need?' }],
                activity: [
                    { id: 'a', kind: 'thinking', label: '', status: 'done', detail: 'Hi, what do you need?' },
                    { id: 'u', kind: 'user', label: 'Tu', status: 'done', detail: 'Where are we?' },
                    { id: 'b', kind: 'thinking', label: '', status: 'running' },
                ],
            });
        });
        expect(result.current.rewindable('u')).toBe(true);
        let pending!: Promise<string | null>;
        act(() => { pending = result.current.rewind('u'); });
        await waitFor(() => expect(turns).toHaveLength(1));
        expect(turns[0]).toMatchObject({ text: 'Where are we?' });
        expect(turns[0].rewound?.activity.map((entry) => entry.id)).toEqual(['a']);
        await act(async () => { turns[0].reply('On #287.'); await pending; });
        expect(result.current.snapshot()?.history).toEqual([
            { role: 'assistant', content: 'Hi, what do you need?' },
            { role: 'user', content: 'Where are we?' },
            { role: 'assistant', content: 'On #287.' },
        ]);
    });

    it('finds the message of an older chat in its history, the same occurrence of the same text', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        await act(async () => {
            await result.current.resume({ project: 'crm' }, {
                history: [{ role: 'assistant', content: 'Hi' }, { role: 'user', content: 'Again' }, { role: 'assistant', content: 'One' }, { role: 'user', content: 'Again' }, { role: 'assistant', content: 'Two' }],
                activity: [
                    { id: 'a', kind: 'thinking', label: '', status: 'done', detail: 'Hi' },
                    { id: 'u1', kind: 'user', label: 'Tu', status: 'done', detail: 'Again' },
                    { id: 'b', kind: 'thinking', label: '', status: 'done', detail: 'One' },
                    { id: 'u2', kind: 'user', label: 'Tu', status: 'done', detail: 'Again' },
                    { id: 'c', kind: 'thinking', label: '', status: 'done', detail: 'Two' },
                ],
            });
        });
        let pending!: Promise<string | null>;
        act(() => { pending = result.current.rewind('u2'); });
        await waitFor(() => expect(turns).toHaveLength(1));
        expect(turns[0].rewound?.activity.map((entry) => entry.id)).toEqual(['a', 'u1', 'b']);
        await act(async () => { turns[0].reply('Three'); await pending; });
        expect(result.current.snapshot()?.history.map((turn) => ('content' in turn ? turn.content : ''))).toEqual(['Hi', 'Again', 'One', 'Again', 'Three']);
    });
});

describe('the actions on a message of the person', () => {
    const entries: AgentActivityEntry[] = [
        { id: 'u1', kind: 'user', label: 'Tu', status: 'done', detail: 'Where is the CI?', historyAt: 1 },
        { id: 't1', kind: 'thinking', label: '', status: 'done', detail: 'Red.' },
        { id: 'u0', kind: 'user', label: 'Tu', status: 'done', detail: 'An old one' },
    ];

    it('are Retry from here and Edit, on the messages that can go back, off while a turn runs', () => {
        const onRetry = vi.fn();
        const onEdit = vi.fn();
        const actions = { available: (entry: AgentActivityEntry) => entry.historyAt !== undefined, disabled: false, onRetry, onEdit };
        const { rerender } = render(<I18nProvider><AgentActivityLog activity={entries} messageActions={actions} /></I18nProvider>);
        expect(screen.getAllByRole('button', { name: 'Retry from here' })).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Retry from here' }));
        expect(onRetry).toHaveBeenCalledWith(entries[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(onEdit).toHaveBeenCalledWith(entries[0]);
        rerender(<I18nProvider><AgentActivityLog activity={entries} messageActions={{ ...actions, disabled: true }} /></I18nProvider>);
        expect(screen.getByRole('button', { name: 'Retry from here' })).toBeDisabled();
    });
});

describe('an executor that cannot start again from the chat', () => {
    it('offers no going back', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent({ ...definition, executor: { ...definition.executor!, canRewind: false } }), { wrapper });
        expect(result.current.canRewind).toBe(false);
        let pending!: Promise<string | null>;
        act(() => { pending = result.current.run({ project: 'crm' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        await act(async () => { turns[0].reply('Hello'); await pending; });
        act(() => { pending = result.current.sendMessage('Hi'); });
        await waitFor(() => expect(turns).toHaveLength(2));
        await act(async () => { turns[1].reply('Yes?'); await pending; });
        let refused: string | null = 'not called';
        await act(async () => { refused = await result.current.rewind(result.current.activity[1].id); });
        expect(refused).toBeNull();
        expect(turns).toHaveLength(2);
    });
});
