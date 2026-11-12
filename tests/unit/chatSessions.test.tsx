import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { z } from 'zod';
import { I18nProvider } from '@llmnative/react';
import {
    Agentico,
    AgenticoProvider,
    earlierSessions,
    chatThreadOf,
    entityChatTaskId,
    registerSubagents,
    useAgentico,
    type AgentExecutorTurn,
    type AgenticoScope,
    type ChatAuthor,
    type EntityChatSnapshot,
    type SubagentManifest,
} from '../../src';

// CR-018: the sessions of one chat, and who speaks.

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
        thread: (params) => (params.project ? `project:${String(params.project)}` : undefined),
        speaker: () => ({ name: 'Jonny' }),
    };
}

const chat = (entityId: string, project: string, startedAt: number, text: string): EntityChatSnapshot => ({
    scopeId: 'acme', subagentId: 'design', entityId, params: { project }, title: `Chat ${entityId}`, name: `Chat ${entityId}`,
    savedAt: startedAt + 10, startedAt, history: [{ role: 'user', content: text }, { role: 'assistant', content: `About ${text}` }],
    activity: [
        { id: `${entityId}-u`, kind: 'user', label: 'Tu', status: 'done', detail: text },
        { id: `${entityId}-a`, kind: 'thinking', label: '', status: 'done', detail: `About ${text}` },
    ],
});

const STORE = 'llmnative.agentico.entityChat';
const keep = (chats: EntityChatSnapshot[]) => localStorage.setItem(STORE, JSON.stringify(chats));

function Opener({ resume, start }: { resume?: EntityChatSnapshot; start?: boolean }) {
    const { startSubagent, resumeEntityChat } = useAgentico();
    useEffect(() => {
        if (resume) resumeEntityChat('design', resume.entityId, resume);
        else if (start) startSubagent('design', { project: 'shop' }, { openingMessage: 'Plan the shop' });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

function renderPanel({ resume, start, person }: { resume?: EntityChatSnapshot; start?: boolean; person?: ChatAuthor } = {}) {
    return render(
        <I18nProvider>
            <AgenticoProvider scope={{ id: 'acme' } as AgenticoScope} person={person ?? null}>
                <Opener resume={resume} start={start} />
                <Agentico />
            </AgenticoProvider>
        </I18nProvider>,
    );
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('the sessions of one chat', () => {
    it('are the saved chats with the same key started before the open one, the latest first', () => {
        registerSubagents([manifest([])]);
        const [one, two, three, other] = [chat('s1', 'shop', 100, 'one'), chat('s2', 'shop', 200, 'two'), chat('s3', 'shop', 300, 'three'), chat('o1', 'blog', 250, 'other')];
        keep([one, two, three, other]);
        expect(chatThreadOf(one)).toBe('project:shop');
        expect(earlierSessions('acme', 'project:shop', entityChatTaskId('design', 's3')).map((c) => c.entityId)).toEqual(['s2', 's1']);
        expect(earlierSessions('acme', 'project:shop', entityChatTaskId('design', 's2')).map((c) => c.entityId)).toEqual(['s1']);
        // A chat not saved yet: all of them are before it.
        expect(earlierSessions('acme', 'project:shop', 'entitychat-design-new').map((c) => c.entityId)).toEqual(['s3', 's2', 's1']);
        expect(earlierSessions('acme', 'project:blog', undefined).map((c) => c.entityId)).toEqual(['o1']);
    });

    it('are loaded above the open one, one at a time, read-only, and one can be taken up', async () => {
        registerSubagents([manifest([])]);
        const [one, two, three] = [chat('s1', 'shop', 100, 'one'), chat('s2', 'shop', 200, 'two'), chat('s3', 'shop', 300, 'three')];
        keep([one, two, three, chat('o1', 'blog', 250, 'other')]);
        renderPanel({ resume: three });
        await screen.findByText('three');
        expect(screen.queryByText('two')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Earlier session' }));
        expect(await screen.findByText('two')).toBeInTheDocument();
        expect(screen.getByRole('separator', { name: 'This session' })).toBeInTheDocument();
        expect(screen.queryByText('one')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Earlier session' }));
        expect(await screen.findByText('one')).toBeInTheDocument();
        // All loaded: no more button; the chat of another project never.
        expect(screen.queryByRole('button', { name: 'Earlier session' })).toBeNull();
        expect(screen.queryByText('other')).toBeNull();

        // Taking up the first one: it is the open session now, with nothing before it.
        const first = screen.getByRole('region', { name: 'Chat s1' });
        fireEvent.click(within(first).getByRole('button', { name: 'Continue this session' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Earlier session' })).toBeNull());
        await waitFor(() => expect(screen.queryByRole('separator', { name: 'This session' })).toBeNull());
        expect(screen.getByText('one')).toBeInTheDocument();
        expect(screen.queryByText('three')).toBeNull();
    });

    it('without a key the panel shows the open chat only', async () => {
        const plain = { ...manifest([]), thread: undefined };
        registerSubagents([plain]);
        keep([chat('s1', 'shop', 100, 'one'), chat('s2', 'shop', 200, 'two')]);
        renderPanel({ resume: chat('s2', 'shop', 200, 'two') });
        await screen.findByText('two');
        expect(screen.queryByRole('button', { name: 'Earlier session' })).toBeNull();
    });
});

describe('who speaks', () => {
    it('the messages of the person carry their name and picture, the turns of the agent its own', async () => {
        const turns: Turn[] = [];
        registerSubagents([manifest(turns)]);
        renderPanel({ start: true, person: { name: 'Ada Lovelace' } });
        await waitFor(() => expect(turns).toHaveLength(1));
        // The opening message of the person, with who wrote it, also for the executor (the chat as it is).
        expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toBeInTheDocument();
        await act(async () => { turns[0].reply('Hello, I am here.'); });
        await screen.findByText('Hello, I am here.');
        expect(screen.getAllByText('Jonny').length).toBeGreaterThan(0);
        expect(screen.getAllByRole('img', { name: 'Jonny' }).length).toBeGreaterThan(0);
    });

    it('the reasoning and steps before the text are summed up next to the name of the agent, opened on a click', async () => {
        registerSubagents([manifest([])]);
        const saved = chat('s1', 'shop', 100, 'one');
        saved.activity[1] = {
            id: 's1-a', kind: 'thinking', label: '', status: 'done', detail: 'The answer.', parts: [
                { type: 'reasoning', id: 'r', text: 'Thinking it through', duration: 4 },
                { type: 'tool', id: 't', label: 'Read the CRs', status: 'done' },
                { type: 'text', id: 'x', text: 'The answer.' },
            ],
        };
        keep([saved]);
        renderPanel({ resume: saved });
        const summary = await screen.findByRole('button', { name: 'Reasoned for 4 s · 1 step' });
        expect(screen.getByText('The answer.')).toBeInTheDocument();
        expect(screen.queryByText('Read the CRs')).toBeNull();
        fireEvent.click(summary);
        expect(await screen.findByText('Read the CRs')).toBeInTheDocument();
    });

    it('a saved message keeps its author; one saved before has none', async () => {
        registerSubagents([manifest([])]);
        const saved = chat('s1', 'shop', 100, 'one');
        saved.activity[0] = { ...saved.activity[0], author: { name: 'Grace Hopper' } };
        keep([saved, chat('s0', 'shop', 50, 'zero')]);
        renderPanel({ resume: saved });
        expect(await screen.findByRole('img', { name: 'Grace Hopper' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Earlier session' }));
        await screen.findByText('zero');
        expect(screen.getAllByRole('img', { name: /Grace Hopper/ })).toHaveLength(1);
    });
});
