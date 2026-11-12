import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { I18nProvider } from '@llmnative/react';
import { Agentico, AgenticoProvider, registerSubagents, useAgentico, type AgenticoScope, type EntityChatSnapshot, type SubagentManifest } from '../../src';

// What a card came to is saved with the chat at once (not with the next turn): reopened, its buttons stay off.

type Params = { project: string; chatId: string };
const STORE = 'llmnative.agentico.entityChat';

function manifest(opened: string[]): SubagentManifest<Params, Params, { text: string }> {
    return {
        id: 'chat',
        label: 'Chat',
        icon: 'bot',
        description: 'Talks.',
        indexPath: '/',
        destinationIds: [],
        commands: [{ name: 'start', summary: 'Start', inputSchema: z.object({ project: z.string() }), describeOutput: () => 'chat' }],
        chatEntityId: (params) => String(params.chatId),
        definition: {
            buildContext: (params) => params,
            buildPrompt: () => { throw new Error('no prompt'); },
            buildFollowUpPrompt: () => { throw new Error('no prompt'); },
            parseResponse: () => { throw new Error('no parsing'); },
            fallback: () => ({ text: '' }),
            conversational: true,
            executor: {
                turn: async (turn) => {
                    turn.onCard?.({ id: 'draft', title: 'Login page', actions: [{ id: 'open', label: 'Open the CR', variant: 'primary' }] });
                    return { text: 'Here is the draft.' };
                },
            },
            onCardAction: async (_params, _card, action) => {
                opened.push(action);
                return { status: 'done', text: 'CR #12 opened' };
            },
        },
        toParams: (input) => ({ project: String(input.project ?? ''), chatId: String(input.chatId ?? '') }),
    };
}

function Starter() {
    const { startSubagent } = useAgentico();
    useEffect(() => { startSubagent('chat', { project: 'crm', chatId: 'c1' }, { openingMessage: 'Write the CR' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('a card of a saved chat', () => {
    it('is saved with what came of its action at once', async () => {
        const opened: string[] = [];
        registerSubagents([manifest(opened)]);
        render(
            <I18nProvider>
                <AgenticoProvider scope={{ id: 'acme' } as AgenticoScope}>
                    <Starter />
                    <Agentico />
                </AgenticoProvider>
            </I18nProvider>,
        );
        await screen.findByText('Here is the draft.');
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open the CR' })); });
        expect(opened).toEqual(['open']);
        await waitFor(() => {
            const [saved] = JSON.parse(localStorage.getItem(STORE) ?? '[]') as EntityChatSnapshot[];
            const card = saved?.activity.flatMap((entry) => entry.parts ?? []).find((part) => part.type === 'card');
            expect(card && 'outcome' in card ? card.outcome : undefined).toMatchObject({ status: 'done', text: 'CR #12 opened' });
        });
    });
});
