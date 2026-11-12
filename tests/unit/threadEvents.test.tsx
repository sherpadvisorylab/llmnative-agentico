import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { I18nProvider } from '@llmnative/react';
import {
    Agentico,
    AgenticoProvider,
    placeEvents,
    registerSubagents,
    useAgentico,
    type AgentExecutorTurn,
    type AgenticoScope,
    type EntityChatSnapshot,
    type SubagentManifest,
    type ThreadEvent,
    type ThreadEventsSource,
} from '../../src';

// CR-019: what happened around a chat, said by the host, among its messages.

type Params = { project: string };
type Turn = AgentExecutorTurn<Params, Params> & { reply: (text: string) => void };

function manifest(turns: Turn[]): SubagentManifest<Params, Params, string> {
    return {
        id: 'design',
        label: 'Design',
        icon: 'bot',
        description: 'Designs.',
        indexPath: '/design',
        destinationIds: [],
        commands: [{ name: 'start', summary: 'Start', inputSchema: z.object({ project: z.string() }), describeOutput: () => 'design' }],
        definition: {
            buildContext: (params) => params,
            buildPrompt: () => { throw new Error('no prompt'); },
            buildFollowUpPrompt: () => { throw new Error('no prompt'); },
            parseResponse: () => { throw new Error('no parsing'); },
            fallback: () => { throw new Error('no fallback'); },
            conversational: true,
            executor: {
                turn: (turn) => new Promise((resolve) => { turns.push({ ...turn, reply: (text) => resolve({ text }) }); }),
            },
        },
        toParams: (input) => ({ project: String(input.project ?? '') }),
        thread: (params) => `project:${String(params.project)}`,
        speaker: () => ({ name: 'Jonny' }),
    };
}

const event = (id: string, at: number, title: string, extra: Partial<ThreadEvent> = {}): ThreadEvent => ({ id, at, author: { name: 'Leo' }, title, ...extra });

const STORE = 'llmnative.agentico.entityChat';

function Opener({ resume, start }: { resume?: EntityChatSnapshot; start?: boolean }) {
    const { startSubagent, resumeEntityChat } = useAgentico();
    useEffect(() => {
        if (resume) resumeEntityChat('design', resume.entityId, resume);
        else if (start) startSubagent('design', { project: 'shop' }, { openingMessage: 'Plan the shop' });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

function renderPanel(source: ThreadEventsSource | null, opener: { resume?: EntityChatSnapshot; start?: boolean }) {
    return render(
        <I18nProvider>
            <AgenticoProvider scope={{ id: 'acme' } as AgenticoScope} threadEvents={source}>
                <Opener {...opener} />
                <Agentico />
            </AgenticoProvider>
        </I18nProvider>,
    );
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('the events of a chat', () => {
    it('are placed before the turn they came before; turns without a time take the one before them', () => {
        const slots = placeEvents([100, undefined, 300], [event('a', 50, 'A'), event('b', 150, 'B'), event('c', 250, 'C'), event('d', 400, 'D')]);
        expect(slots.map((slot) => slot.map((e) => e.id))).toEqual([['a'], [], ['b', 'c'], ['d']]);
        expect(placeEvents([], [event('a', 1, 'A')]).map((slot) => slot.map((e) => e.id))).toEqual([['a']]);
    });

    it('the messages get the time they were born, kept with the chat', async () => {
        const turns: Turn[] = [];
        registerSubagents([{ ...manifest(turns), chatEntityId: () => 'c1' }]);
        const before = Date.now();
        renderPanel(null, { start: true });
        await waitFor(() => expect(turns).toHaveLength(1));
        await act(async () => { turns[0].reply('Hello.'); });
        await screen.findByText('Hello.');
        await waitFor(() => expect(JSON.parse(localStorage.getItem(STORE) ?? '[]')).toHaveLength(1));
        const [saved] = JSON.parse(localStorage.getItem(STORE) ?? '[]') as EntityChatSnapshot[];
        expect(saved.activity.every((entry) => typeof entry.at === 'number' && entry.at >= before)).toBe(true);
    });

    it('are shown among the messages with who did them, read again when the host says so, hidden by the filter', async () => {
        registerSubagents([manifest([])]);
        const saved: EntityChatSnapshot = {
            scopeId: 'acme', subagentId: 'design', entityId: 's1', params: { project: 'shop' }, title: 'Shop', savedAt: 3000, startedAt: 1000,
            history: [],
            activity: [
                { id: 'u1', kind: 'user', label: 'Tu', status: 'done', detail: 'first question', at: 1000 },
                { id: 'a1', kind: 'thinking', label: '', status: 'done', detail: 'first answer', at: 1100 },
                { id: 'u2', kind: 'user', label: 'Tu', status: 'done', detail: 'second question', at: 3000 },
            ],
        };
        localStorage.setItem(STORE, JSON.stringify([saved]));
        let events = [event('e1', 2000, '#291 handed to developer', { body: 'Rewritten with R1–R12.', href: 'https://example.com/291' })];
        let changed = () => {};
        const loads: Array<[string, number, number]> = [];
        const source: ThreadEventsSource = {
            load: (thread, from, to) => { loads.push([thread, from, to]); return events; },
            subscribe: (_thread, onChange) => { changed = onChange; return () => { changed = () => {}; }; },
        };
        renderPanel(source, { resume: saved });
        const card = await screen.findByRole('listitem', { name: 'Leo: #291 handed to developer' });
        expect(loads[0]).toEqual(['project:shop', 1000, Infinity]);
        // Between the first answer and the second question.
        const order = [screen.getByText('first answer'), card, screen.getByText('second question')];
        expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // What it said, opened on a click; where to read it whole.
        expect(screen.queryByText('Rewritten with R1–R12.')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        expect(await screen.findByText('Rewritten with R1–R12.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', 'https://example.com/291');

        // A new event: read again when the host says so.
        events = [...events, event('e2', 3500, 'Fra claimed #291', { author: { name: 'Fra' } })];
        act(() => changed());
        expect(await screen.findByRole('listitem', { name: 'Fra: Fra claimed #291' })).toBeInTheDocument();

        // The filter: the conversation only, kept in this browser.
        fireEvent.click(screen.getByRole('button', { name: 'Conversation only' }));
        await waitFor(() => expect(screen.queryByRole('listitem', { name: /Leo:/ })).toBeNull());
        expect(localStorage.getItem('llmnative.agentico.threadEvents')).toBe('off');
        fireEvent.click(screen.getByRole('button', { name: 'Show what the agents did' }));
        expect(await screen.findByRole('listitem', { name: /Leo:/ })).toBeInTheDocument();
    });

    it('without a source the panel has no filter and no events', async () => {
        registerSubagents([manifest([])]);
        const saved: EntityChatSnapshot = {
            scopeId: 'acme', subagentId: 'design', entityId: 's1', params: { project: 'shop' }, title: 'Shop', savedAt: 3000, startedAt: 1000,
            history: [], activity: [{ id: 'u1', kind: 'user', label: 'Tu', status: 'done', detail: 'first question', at: 1000 }],
        };
        localStorage.setItem(STORE, JSON.stringify([saved]));
        renderPanel(null, { resume: saved });
        await screen.findByText('first question');
        expect(screen.queryByRole('button', { name: 'Conversation only' })).toBeNull();
    });
});
