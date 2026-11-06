import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import type { AICompleteRequest, AICompleteResult } from '@llmnative/react';
import { z } from 'zod';

// CR-014: cards in the messages of a chat. A provider whose model first calls the tool that drafts, then answers.
const replies: AICompleteResult[] = [];
const mockProvider = {
    id: 'mock', label: 'Mock', defaultModel: 'm',
    getCapabilities: async () => ({}),
    validateApiKey: async () => ({ ok: true }),
    complete: async (_request: AICompleteRequest) => replies.shift() ?? { type: 'text' as const, text: '' },
};

vi.mock('@llmnative/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@llmnative/react')>();
    return { ...actual, useAIProviderRegistry: () => ({ registry: { mock: mockProvider } }) };
});
vi.mock('../../src/presentation/useAIModelCatalog', () => ({
    useAIModelCatalog: () => ({ hasProviders: true, modelsByProvider: {}, modelsLoading: false, selectedModel: 'mock/m', setSelectedModel: () => undefined }),
}));

const { useAgent } = await import('../../src');
type Definition = import('../../src').AgentDefinition<{ project: string }, { project: string }, { text: string }>;
type CardPart = import('../../src').AgentCardPart;

const actions: Array<{ project: string; card: string; action: string }> = [];
const definition = (): Definition => ({
    buildContext: (params) => params,
    buildPrompt: () => 'Draft a CR.',
    buildFollowUpPrompt: (text) => text,
    parseResponse: (raw) => (raw.trim() ? { text: raw.trim() } : null),
    fallback: () => ({ text: 'no model' }),
    conversational: true,
    getTools: () => [{
        name: 'draft_cr',
        description: 'Drafts a CR',
        inputSchema: z.object({ title: z.string() }),
        execute: async () => ({ drafted: true }),
        card: (input) => ({
            id: 'draft', title: String(input.title), badge: { label: 'Feature' }, body: 'Sign in with SSO.', details: '## Summary\n\nSign in with SSO.',
            actions: [{ id: 'open', label: 'Open the CR', variant: 'primary' }, { id: 'discard', label: 'Discard' }],
            data: { type: 'feature' },
        }),
    }],
    onCardAction: async (params, card, action) => {
        actions.push({ project: params.project, card: card.id, action });
        return action === 'open' ? { status: 'done', text: 'CR #12 opened', link: { label: '#12', url: 'https://github.com/acme/crm/issues/12' } } : { status: 'dismissed', text: 'Discarded' };
    },
});

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;
const cardOf = (activity: Array<{ id: string; parts?: Array<{ type: string }> }>) => {
    const entry = activity.find((a) => a.parts?.some((p) => p.type === 'card'))!;
    return { entry, part: entry.parts!.find((p) => p.type === 'card') as CardPart };
};

describe('a card in a chat (CR-014)', () => {
    it('shows what a tool prepared, and keeps what came of the action the person clicked', async () => {
        replies.push({ type: 'tool_calls', toolCalls: [{ id: 'c1', name: 'draft_cr', input: { title: 'Login with SSO' } }] }, { type: 'text', text: 'The draft is under the chat.' });
        const { result } = renderHook(() => useAgent(definition(), { defaultEnabled: true }), { wrapper });
        await act(async () => { await result.current.run({ project: 'crm' }); });
        const { entry, part } = cardOf(result.current.activity);
        expect(part).toMatchObject({ type: 'card', title: 'Login with SSO', badge: { label: 'Feature' }, data: { type: 'feature' } });
        await act(async () => { await result.current.cardAction(entry.id, part.id, 'open'); });
        expect(actions).toEqual([{ project: 'crm', card: 'draft', action: 'open' }]);
        expect(cardOf(result.current.activity).part.outcome).toEqual({ status: 'done', text: 'CR #12 opened', link: { label: '#12', url: 'https://github.com/acme/crm/issues/12' } });
    });

    it('takes a card of a remote executor in its message', async () => {
        const remote: Definition = {
            ...definition(),
            executor: {
                turn: async (turn) => {
                    turn.onCard?.({ id: 'release', title: 'Release 1.2.0', actions: [{ id: 'start', label: 'Start it' }] });
                    return { text: 'Here it is.' };
                },
            },
        };
        const { result } = renderHook(() => useAgent(remote), { wrapper });
        await act(async () => { await result.current.run({ project: 'crm' }, { openingMessage: 'Release?' }); });
        expect(cardOf(result.current.activity).part).toMatchObject({ type: 'card', id: 'release', title: 'Release 1.2.0' });
    });
});
