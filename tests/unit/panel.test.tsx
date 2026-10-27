import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { I18nProvider } from '@llmnative/react';
import {
    AGENTICO_WIDTH,
    AGENTICO_WIDTH_STORAGE_KEY,
    Agentico,
    AgenticoProvider,
    registerSubagentControls,
    registerSubagents,
    useAgentico,
    type AgentActivityEntry,
    type AgentExecutorTurn,
    type AgenticoProps,
    type AgenticoScope,
    type EntityChatSnapshot,
    type SubagentManifest,
    type UseSubagentControls,
} from '../../src';
import { clampPanelWidth, resolvePanelSize } from '../../src/presentation/panelWidth';
import { findDockedQuestions } from '../../src/presentation/AgentActivityLog';

type Params = { project: string };
type Turn = AgentExecutorTurn<Params, Params> & { reply: (text: string) => void; fail: (error: Error) => void };

const questions = [
    { id: 'db', header: 'Database', question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] },
];

function remoteManifest(turns: Turn[]): SubagentManifest<Params, Params, string> {
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
            executor: {
                turn: (turn) => new Promise((resolve, reject) => {
                    turns.push({ ...turn, reply: (text) => resolve({ text }), fail: reject });
                }),
            },
        },
        toParams: (input) => ({ project: String(input.project ?? '') }),
    };
}

/** Starts the design subagent, or resumes a saved chat of it, as a page of the host would. */
function Starter({ resume }: { resume?: EntityChatSnapshot }) {
    const { startSubagent, resumeEntityChat } = useAgentico();
    useEffect(() => {
        if (resume) resumeEntityChat('design', resume.entityId, resume);
        else startSubagent('design', { project: 'shop' }, { openingMessage: 'Plan the shop' });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

function renderPanel(props: AgenticoProps = {}, resume?: EntityChatSnapshot) {
    return render(
        <I18nProvider>
            <AgenticoProvider scope={{ id: 'acme' } as AgenticoScope}>
                <Starter resume={resume} />
                <Agentico {...props} />
            </AgenticoProvider>
        </I18nProvider>,
    );
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('the width of the panel', () => {
    it('resolves vw against the viewport and clamps between min and max', () => {
        expect(resolvePanelSize('60vw', 1000)).toBe(600);
        expect(resolvePanelSize(500, 1000)).toBe(500);
        expect(clampPanelWidth(200, 320, 600)).toBe(320);
        expect(clampPanelWidth(900, 320, 600)).toBe(600);
        // A max below the min gives way to the min.
        expect(clampPanelWidth(900, 320, 100)).toBe(320);
    });

    it('is resized with the keyboard on a focusable separator, stored, and reset by a double click', async () => {
        const turns: Turn[] = [];
        registerSubagents([remoteManifest(turns)]);
        renderPanel({ minWidth: 320, maxWidth: 700 });
        const handle = await screen.findByRole('separator', { name: 'Resize the agent panel' });
        expect(handle).toHaveAttribute('aria-orientation', 'vertical');
        expect(handle).toHaveAttribute('tabindex', '0');
        expect(handle).toHaveAttribute('aria-valuenow', String(AGENTICO_WIDTH));
        expect(handle).toHaveAttribute('aria-valuemin', '320');
        expect(handle).toHaveAttribute('aria-valuemax', '700');
        const panel = handle.parentElement!;
        expect(panel.style.width).toBe(`${AGENTICO_WIDTH}px`);

        // The panel is on the right: the left arrow moves the edge left, the panel gets wider.
        fireEvent.keyDown(handle, { key: 'ArrowLeft' });
        expect(handle).toHaveAttribute('aria-valuenow', String(AGENTICO_WIDTH + 16));
        fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
        expect(handle).toHaveAttribute('aria-valuenow', String(AGENTICO_WIDTH + 16 - 64));
        fireEvent.keyDown(handle, { key: 'End' });
        expect(handle).toHaveAttribute('aria-valuenow', '700');
        expect(panel.style.width).toBe('700px');
        expect(localStorage.getItem(AGENTICO_WIDTH_STORAGE_KEY)).toBe('700');
        fireEvent.keyDown(handle, { key: 'Home' });
        expect(handle).toHaveAttribute('aria-valuenow', '320');

        fireEvent.doubleClick(handle);
        expect(handle).toHaveAttribute('aria-valuenow', String(AGENTICO_WIDTH));
        expect(localStorage.getItem(AGENTICO_WIDTH_STORAGE_KEY)).toBeNull();
    });

    it('is resized by dragging its inner edge, within the bounds', async () => {
        const turns: Turn[] = [];
        registerSubagents([remoteManifest(turns)]);
        renderPanel({ defaultWidth: 400, minWidth: 320, maxWidth: 600 });
        const handle = await screen.findByRole('separator');
        fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 1000 });
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900 });
        expect(handle).toHaveAttribute('aria-valuenow', '500');
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100 });
        expect(handle).toHaveAttribute('aria-valuenow', '600');
        fireEvent.pointerUp(handle, { pointerId: 1, clientX: 100 });
        expect(localStorage.getItem(AGENTICO_WIDTH_STORAGE_KEY)).toBe('600');
    });

    it('starts from the width stored in this browser', async () => {
        localStorage.setItem(AGENTICO_WIDTH_STORAGE_KEY, '512');
        registerSubagents([remoteManifest([])]);
        renderPanel({ maxWidth: 800 });
        expect(await screen.findByRole('separator')).toHaveAttribute('aria-valuenow', '512');
    });
});

describe('docked questions', () => {
    it('finds only the unanswered questions of the latest message, when they can be answered', () => {
        const ask: AgentActivityEntry = { id: 'm', kind: 'thinking', label: '', status: 'done', parts: [{ type: 'text', id: 't', text: 'Hi' }, { type: 'questions', id: 'q', questions }] };
        expect(findDockedQuestions([ask], () => true)).toMatchObject({ entry: { id: 'm' }, part: { id: 'q' } });
        expect(findDockedQuestions([ask], () => false)).toBeNull();
        expect(findDockedQuestions([{ ...ask, status: 'stopped' }], () => true)).toBeNull();
        expect(findDockedQuestions([ask, { id: 'u', kind: 'user', label: 'Tu', status: 'done', detail: 'Hey' }], () => true)).toBeNull();
        const answered = { ...ask, parts: [{ type: 'questions' as const, id: 'q', questions, answers: [{ values: ['SQLite'] }] }] };
        expect(findDockedQuestions([answered], () => true)).toBeNull();
    });

    it('docks pending questions in place of the composer, unpins the person, and goes back inline once answered', async () => {
        const turns: Turn[] = [];
        registerSubagents([remoteManifest(turns)]);
        const { container } = renderPanel();
        await waitFor(() => expect(turns).toHaveLength(1));
        // Before the questions: the composer is there and the message of the person is pinned.
        expect(container.querySelector('textarea')).not.toBeNull();
        expect(container.querySelector('.sticky')).not.toBeNull();

        let asked!: Promise<unknown>;
        act(() => { turns[0].onText('Two things first.', { id: 'a' }); });
        act(() => { asked = turns[0].onQuestions(questions, { id: 'q1' }); });

        const dock = await screen.findByRole('region', { name: 'Questions of the agent' });
        expect(dock).toContainElement(screen.getByRole('radio', { name: /SQLite/ }));
        // Once only: not repeated in the thread.
        expect(screen.getAllByRole('radio', { name: /SQLite/ })).toHaveLength(1);
        expect(container.querySelector('textarea')).toBeNull();
        expect(container.querySelector('.sticky')).toBeNull();
        // The turn is still running: it can be stopped from the dock.
        expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: /SQLite/ }));
        fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
        await expect(asked).resolves.toEqual([{ id: 'db', header: 'Database', values: ['SQLite'] }]);
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Questions of the agent' })).toBeNull());
        // Back in the thread, read-only, and the layout is back to normal.
        expect(screen.getAllByRole('group', { name: /Answered/i }).length).toBeGreaterThan(0);
        expect(container.querySelector('textarea')).not.toBeNull();
        expect(container.querySelector('.sticky')).not.toBeNull();
        await act(async () => { turns[0].reply('Noted'); });
    });

    it('leaves the questions of a stopped turn in the thread', async () => {
        const turns: Turn[] = [];
        registerSubagents([remoteManifest(turns)]);
        renderPanel();
        await waitFor(() => expect(turns).toHaveLength(1));
        let asked!: Promise<unknown>;
        act(() => { asked = turns[0].onQuestions(questions, { id: 'q1' }); });
        await screen.findByRole('region', { name: 'Questions of the agent' });
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await expect(asked).rejects.toMatchObject({ name: 'AbortError' });
        await act(async () => { turns[0].fail(new Error('aborted')); });
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Questions of the agent' })).toBeNull());
        expect(screen.getByRole('radio', { name: /SQLite/ })).toBeInTheDocument();
    });

    it('docks the unanswered questions of a reloaded chat, answerable: the answers start a new turn', async () => {
        const turns: Turn[] = [];
        registerSubagents([remoteManifest(turns)]);
        const snapshot: EntityChatSnapshot = {
            scopeId: 'acme', subagentId: 'design', entityId: 'd1', params: { project: 'shop' }, title: 'Shop', savedAt: 1,
            history: [{ role: 'user', content: 'Plan the shop' }, { role: 'assistant', content: 'Two things first.' }],
            activity: [
                { id: 'u', kind: 'user', label: 'Tu', status: 'done', detail: 'Plan the shop' },
                { id: 'm', kind: 'thinking', label: '', status: 'done', detail: 'Two things first.', parts: [
                    { type: 'text', id: 'text', text: 'Two things first.' },
                    { type: 'questions', id: 'q1', questions },
                ] },
            ],
        };
        renderPanel({}, snapshot);
        const dock = await screen.findByRole('region', { name: 'Questions of the agent' });
        const radio = screen.getByRole('radio', { name: /Postgres/ });
        expect(dock).toContainElement(radio);
        expect(radio).not.toBeDisabled();
        fireEvent.click(radio);
        fireEvent.click(screen.getByRole('button', { name: /Submit/ }));
        await waitFor(() => expect(turns).toHaveLength(1));
        expect(turns[0]).toMatchObject({ text: '', answers: { id: 'q1', answers: [{ id: 'db', header: 'Database', values: ['Postgres'] }] } });
        await act(async () => { turns[0].reply('Postgres it is'); });
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Questions of the agent' })).toBeNull());
    });
});

describe('slash commands of a subagent', () => {
    const commands = [{ name: 'to-spec', icon: 'file-text' }, { name: 'status' }];
    const useDesignControls: UseSubagentControls = () => React.useMemo(() => ({ commands }), []);

    const openMenu = (textarea: HTMLElement, value = '/') => {
        fireEvent.keyDown(textarea, { key: '/' });
        fireEvent.change(textarea, { target: { value } });
    };

    it('offers the commands of the controls on "/" and sends the picked one as plain text', async () => {
        const turns: Turn[] = [];
        registerSubagents([remoteManifest(turns)]);
        registerSubagentControls({ design: useDesignControls });
        const { container } = renderPanel();
        await waitFor(() => expect(turns).toHaveLength(1));
        await act(async () => { turns[0].reply('Ready'); });

        const textarea = container.querySelector('textarea')!;
        openMenu(textarea);
        const toSpec = await screen.findByRole('menuitem', { name: '/to-spec' });
        expect(screen.getByRole('menuitem', { name: '/status' })).toBeInTheDocument();
        fireEvent.mouseDown(toSpec);
        await waitFor(() => expect(textarea).toHaveValue('/to-spec '));

        fireEvent.change(textarea, { target: { value: '/to-spec checkout' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/i }));
        await waitFor(() => expect(turns).toHaveLength(2));
        expect(turns[1].text).toBe('/to-spec checkout');
        await act(async () => { turns[1].reply('Spec written'); });
    });

    it('is not offered while docked questions take the place of the composer', async () => {
        const turns: Turn[] = [];
        registerSubagents([remoteManifest(turns)]);
        registerSubagentControls({ design: useDesignControls });
        const { container } = renderPanel();
        await waitFor(() => expect(turns).toHaveLength(1));
        act(() => { turns[0].onQuestions(questions, { id: 'q1' }).catch(() => undefined); });
        await screen.findByRole('region', { name: 'Questions of the agent' });
        expect(container.querySelector('textarea')).toBeNull();
        expect(screen.queryByRole('menuitem')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await act(async () => { turns[0].fail(new Error('aborted')); });
    });
});
