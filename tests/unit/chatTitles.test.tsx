import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import type { AICompleteRequest } from '@llmnative/react';

// CR-011: the titles of the saved chats. A provider the test answers; the catalog has one model of it and
// one of a provider the chats of the project do not allow.
const requests: AICompleteRequest[] = [];
const replies: string[] = [];
const provider = (id: string) => ({
    id, label: id, defaultModel: 'm',
    getCapabilities: async () => ({}),
    validateApiKey: async () => ({ ok: true }),
    complete: async (request: AICompleteRequest) => {
        requests.push({ ...request, model: `${id}/${request.model}` });
        return { type: 'text' as const, text: replies.shift() ?? '' };
    },
});

vi.mock('@llmnative/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@llmnative/react')>();
    return { ...actual, useAIProviderRegistry: () => ({ registry: { allowed: provider('allowed'), other: provider('other') } }) };
});
vi.mock('../../src/presentation/useAIModelCatalog', () => ({
    useAIModelCatalog: () => ({
        hasProviders: true,
        modelsByProvider: {
            other: [{ id: 'other/x', provider: 'other', model: 'X' }],
            allowed: [{ id: 'allowed/a', provider: 'allowed', model: 'a' }],
        },
        modelsLoading: false,
        selectedModel: 'other/x',
        setSelectedModel: () => undefined,
    }),
}));

const agentico = await import('../../src');
const { chatTranscript, cleanTitle, resetChatTitlesPass, useChatTitles } = await import('../../src/presentation/chatTitles');
const { configureEntityChatStore, getEntityChat, listEntityChats, registerSubagents, renameEntityChat, saveEntityChat, onEntityChatsChange } = agentico;

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;

const chat = (entityId: string, activity: Array<{ kind: 'user' | 'thinking'; detail: string }>) => ({
    scopeId: 'acme', subagentId: 'project-chat', entityId, params: { projectId: 'crm' }, history: [], title: 'crm · Jonny',
    activity: activity.map((entry, index) => ({ id: String(index), label: '', status: 'done' as const, ...entry })),
});

beforeEach(() => {
    localStorage.clear();
    configureEntityChatStore({ storageKey: 'test.titles' });
    requests.length = 0;
    replies.length = 0;
    resetChatTitlesPass();
    registerSubagents([{
        id: 'project-chat', label: 'Jonny', icon: 'bot', description: '', commands: [], indexPath: '/', destinationIds: [],
        toParams: (raw: Record<string, unknown>) => raw,
        autoTitle: true,
        definition: {
            buildContext: () => ({}), buildPrompt: () => '', buildFollowUpPrompt: (text: string) => text, parseResponse: () => null, fallback: () => null,
            conversational: true,
            executor: { alongside: true, turn: async () => ({ text: '' }), catalogProviders: (params: { projectId?: string }) => (params.projectId === 'crm' ? ['allowed'] : undefined) },
        },
    }]);
});

describe('the title of a saved chat (CR-011)', () => {
    it('is its own once named, kept across saves; the person names it over the model, never the other way', () => {
        const changes = vi.fn();
        const stop = onEntityChatsChange(changes);
        saveEntityChat(chat('a1', [{ kind: 'user', detail: 'Why are some CRs blocked?' }]));
        // No title written yet: the first message of the person; without one, the title of its params.
        expect(agentico.chatTitle(getEntityChat('acme', 'project-chat', 'a1')!)).toBe('Why are some CRs blocked?');
        expect(agentico.chatTitle(chat('a0', [{ kind: 'thinking', detail: 'Hi!' }]))).toBe('crm · Jonny');
        expect(renameEntityChat('acme', 'project-chat', 'a1', 'Blocked CRs', 'model')).toBe(true);
        saveEntityChat(chat('a1', [{ kind: 'user', detail: 'Why are some CRs blocked?' }, { kind: 'thinking', detail: 'Two wait for you.' }]));
        expect(getEntityChat('acme', 'project-chat', 'a1')).toMatchObject({ name: 'Blocked CRs', namedBy: 'model' });
        renameEntityChat('acme', 'project-chat', 'a1', '  Release   and blocked CRs ');
        expect(renameEntityChat('acme', 'project-chat', 'a1', 'Another', 'model')).toBe(false);
        expect(agentico.chatTitle(getEntityChat('acme', 'project-chat', 'a1')!)).toBe('Release and blocked CRs');
        // Empty: back to the automatic title.
        renameEntityChat('acme', 'project-chat', 'a1', '');
        expect(getEntityChat('acme', 'project-chat', 'a1')).not.toHaveProperty('name');
        expect(changes).toHaveBeenCalled();
        stop();
    });

    it('is read from the whole chat and cleaned', () => {
        expect(chatTranscript(chat('a', [{ kind: 'user', detail: 'Ciao' }, { kind: 'thinking', detail: 'Ciao! Di cosa hai bisogno?' }]).activity)).toBe('Person: Ciao\n\nAgent: Ciao! Di cosa hai bisogno?');
        expect(cleanTitle('"Riavvio delle CR bloccate."\n')).toBe('Riavvio delle CR bloccate');
        expect(cleanTitle('Titolo: ## Release di novembre')).toBe('Release di novembre');
    });

    it('is written with a model the chat may use, and only for a chat the person wrote in', async () => {
        saveEntityChat(chat('a1', [{ kind: 'user', detail: 'puoi far ripartire le cr blocked?' }, { kind: 'thinking', detail: 'Fatto.' }]));
        saveEntityChat(chat('a2', [{ kind: 'thinking', detail: 'Ciao!' }]));
        replies.push('Riavvio delle CR bloccate');
        const { result } = renderHook(() => useChatTitles(undefined), { wrapper });
        expect(await result.current('project-chat', 'a1')).toBe(false);
        const titled = renderHook(() => useChatTitles('acme'), { wrapper });
        // The pass of the session: the chat titled, the one without a message of the person gone.
        await waitFor(() => expect(getEntityChat('acme', 'project-chat', 'a1')?.name).toBe('Riavvio delle CR bloccate'));
        expect(listEntityChats('acme').map((entry) => entry.entityId)).toEqual(['a1']);
        // The model picked is of a provider the project does not allow: the first allowed one.
        expect(requests.map((request) => request.model)).toEqual(['allowed/a']);
        expect(requests[0].prompt).toContain('Person: puoi far ripartire le cr blocked?');
        // Named already: not again.
        expect(await titled.result.current('project-chat', 'a1')).toBe(false);
        expect(requests).toHaveLength(1);
    });
});
