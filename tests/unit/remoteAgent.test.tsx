import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import { useAgent, type AgentDefinition, type AgentExecutorTurn } from '../../src';

/** A remote agent whose turns the test answers by hand: each call waits for `reply`. */
function remoteDefinition() {
    const turns: Array<AgentExecutorTurn<{ project: string }, { project: string }> & { reply: (text: string, result?: string) => void; fail: (error: Error) => void }> = [];
    const definition: AgentDefinition<{ project: string }, { project: string }, string> = {
        buildContext: (params) => params,
        // Never called for a remote agent.
        buildPrompt: () => { throw new Error('no prompt'); },
        buildFollowUpPrompt: () => { throw new Error('no prompt'); },
        parseResponse: () => { throw new Error('no parsing'); },
        fallback: () => { throw new Error('no fallback'); },
        executor: {
            turn: (turn) => new Promise((resolve, reject) => {
                turns.push({ ...turn, reply: (text, result) => resolve({ text, result }), fail: reject });
            }),
        },
    };
    return { definition, turns };
}

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe('a remote agent', () => {
    it('gives each turn to the executor, with the text of the person as typed', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        expect(result.current.remote).toBe(true);

        let run!: Promise<string | null>;
        act(() => { run = result.current.run({ project: 'shop' }, { openingMessage: 'Online orders' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        expect(turns[0]).toMatchObject({ params: { project: 'shop' }, text: 'Online orders', first: true });

        // The reply grows in one entry, in parts; the steps go above the reply.
        act(() => turns[0].onText('Q1 - Cut'));
        act(() => turns[0].onStep({ id: 'p1', label: 'loaded grilling', status: 'done' }));
        act(() => turns[0].onText('Q1 - Cutoff?'));
        expect(result.current.activity.map((entry) => [entry.kind, entry.detail, entry.status])).toEqual([
            ['user', 'Online orders', 'done'],
            ['thinking', 'Q1 - Cutoff?', 'running'],
        ]);
        expect(result.current.activity[1].parts).toEqual([
            { type: 'tool', id: 'p1', label: 'loaded grilling', status: 'done' },
            { type: 'text', id: 'text', text: 'Q1 - Cutoff?', streaming: true },
        ]);

        await act(async () => { turns[0].reply('Q1 - Cutoff?'); await run; });
        expect(result.current.canContinue).toBe(true);
        expect(result.current.activity.at(-1)).toMatchObject({ kind: 'thinking', detail: 'Q1 - Cutoff?', status: 'done' });
        expect(result.current.activity.at(-1)?.parts?.at(-1)).toEqual({ type: 'text', id: 'text', text: 'Q1 - Cutoff?', streaming: false });

        let next!: Promise<string | null>;
        act(() => { next = result.current.sendMessage('Yes to all'); });
        await waitFor(() => expect(turns).toHaveLength(2));
        expect(turns[1]).toMatchObject({ text: 'Yes to all', first: false });
        await act(async () => { turns[1].reply('Written GLOSSARY.md', 'done'); });
        expect(await next).toBe('done');
        expect(result.current.snapshot()?.history).toEqual([
            { role: 'user', content: 'Online orders' },
            { role: 'assistant', content: 'Q1 - Cutoff?' },
            { role: 'user', content: 'Yes to all' },
            { role: 'assistant', content: 'Written GLOSSARY.md' },
        ]);
    });

    it('stops a turn, and says when the remote agent failed', async () => {
        const { definition, turns } = remoteDefinition();
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        let run!: Promise<string | null>;
        act(() => { run = result.current.run({ project: 'shop' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        expect(turns[0].text).toBe('');
        act(() => result.current.stop());
        expect(turns[0].signal.aborted).toBe(true);
        await act(async () => { turns[0].fail(new Error('aborted')); await run; });
        expect(result.current.activity.at(-1)?.status).toBe('stopped');
        expect(result.current.error).toBeNull();

        let next!: Promise<string | null>;
        act(() => { next = result.current.sendMessage('again'); });
        await waitFor(() => expect(turns).toHaveLength(2));
        await act(async () => { turns[1].fail(new Error('the design session is paused')); await next; });
        expect(result.current.activity.at(-1)?.status).toBe('error');
        expect(result.current.error).toBe('the design session is paused');
    });

    it('offers the models of the executor and gives the picked one to the turn', async () => {
        const { definition, turns } = remoteDefinition();
        definition.executor!.models = () => [{ label: 'Sonnet · OpenCode', value: 'opencode/sonnet' }, { label: 'Flash · OpenCode', value: 'opencode/flash' }];
        definition.executor!.defaultModel = () => 'opencode/flash';
        const { result } = renderHook(() => useAgent(definition), { wrapper });

        let run!: Promise<string | null>;
        act(() => { run = result.current.run({ project: 'shop' }, { openingMessage: 'Orders' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        expect(turns[0].model).toBe('opencode/flash');
        expect(result.current.remoteModels.map((model) => model.value)).toEqual(['opencode/sonnet', 'opencode/flash']);
        await act(async () => { turns[0].reply('Q1'); await run; });

        act(() => result.current.setSelectedModel('opencode/sonnet'));
        expect(result.current.selectedModel).toBe('opencode/sonnet');
        act(() => { void result.current.sendMessage('Yes'); });
        await waitFor(() => expect(turns).toHaveLength(2));
        expect(turns[1].model).toBe('opencode/sonnet');
        await act(async () => { turns[1].reply('Q2'); });
    });
});
