import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import { useAgent, type AgentDefinition, type AgentExecutorTurn } from '../../src';

// CR-017: the files of a message reach an executor that takes them.

type Turn = AgentExecutorTurn<{ project: string }, { project: string }> & { reply: (text: string) => void };

function remoteDefinition(attachments: boolean) {
    const turns: Turn[] = [];
    const definition: AgentDefinition<{ project: string }, { project: string }, string> = {
        buildContext: (params) => params,
        buildPrompt: () => { throw new Error('no prompt'); },
        buildFollowUpPrompt: () => { throw new Error('no prompt'); },
        parseResponse: () => { throw new Error('no parsing'); },
        fallback: () => { throw new Error('no fallback'); },
        executor: {
            turn: (turn) => new Promise((resolve) => { turns.push({ ...turn, reply: (text) => resolve({ text }) }); }),
            attachments,
        },
    };
    return { definition, turns };
}

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe('the files of a message on an executor', () => {
    it('reach its turn as the AI providers take them, their names on the message', async () => {
        const { definition, turns } = remoteDefinition(true);
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        expect(result.current.executorAttachments).toBe(true);
        let pending!: Promise<string | null>;
        act(() => { pending = result.current.run({ project: 'crm' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        await act(async () => { turns[0].reply('Hi'); await pending; });

        const shot = new File(['png-bytes'], 'pasted-20261111180000.png', { type: 'image/png' });
        act(() => { pending = result.current.sendMessage('What is wrong here?', { attachments: [shot] }); });
        await waitFor(() => expect(turns).toHaveLength(2));
        expect(turns[1].attachments).toEqual([{ name: 'pasted-20261111180000.png', mimeType: 'image/png', base64: btoa('png-bytes') }]);
        expect(result.current.activity.at(-2)).toMatchObject({ kind: 'user', detail: 'What is wrong here?', attachmentNames: ['pasted-20261111180000.png'] });
        await act(async () => { turns[1].reply('A button of its own.'); await pending; });

        // A message without files carries none.
        act(() => { pending = result.current.sendMessage('Thanks'); });
        await waitFor(() => expect(turns).toHaveLength(3));
        expect(turns[2].attachments).toBeUndefined();
        await act(async () => { turns[2].reply('Welcome.'); await pending; });
    });

    it('never reach an executor that does not take them', async () => {
        const { definition, turns } = remoteDefinition(false);
        const { result } = renderHook(() => useAgent(definition), { wrapper });
        expect(result.current.executorAttachments).toBe(false);
        let pending!: Promise<string | null>;
        act(() => { pending = result.current.run({ project: 'crm' }); });
        await waitFor(() => expect(turns).toHaveLength(1));
        await act(async () => { turns[0].reply('Hi'); await pending; });
        act(() => { pending = result.current.sendMessage('Look', { attachments: [new File(['x'], 'x.png', { type: 'image/png' })] }); });
        await waitFor(() => expect(turns).toHaveLength(2));
        expect(turns[1].attachments).toBeUndefined();
        await act(async () => { turns[1].reply('Ok'); await pending; });
    });
});
