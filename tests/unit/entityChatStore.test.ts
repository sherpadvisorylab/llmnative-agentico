import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatStartedAt, configureEntityChatStore, getEntityChat, listEntityChats, removeEntityChat, saveEntityChat } from '../../src';

const snapshot = (scopeId: string, entityId: string) => ({
    scopeId, subagentId: 'theme', entityId, params: { url: 'https://example.com' }, history: [], activity: [], title: entityId,
});

beforeEach(() => {
    localStorage.clear();
    configureEntityChatStore({ storageKey: 'test.entityChat' });
});

describe('entity chat store', () => {
    it('keeps one chat per entity and lists them per scope', () => {
        saveEntityChat(snapshot('acme', 'blue'));
        saveEntityChat(snapshot('acme', 'blue'));
        saveEntityChat(snapshot('beta', 'red'));

        expect(listEntityChats('acme').map((chat) => chat.entityId)).toEqual(['blue']);
        expect(getEntityChat('beta', 'theme', 'red')?.title).toBe('red');
        removeEntityChat('acme', 'theme', 'blue');
        expect(listEntityChats('acme')).toEqual([]);
    });

    it('reads chats saved before the scope rename (tenantId) as scopeId', () => {
        localStorage.setItem('test.entityChat', JSON.stringify([
            { tenantId: 'acme', subagentId: 'theme', entityId: 'legacy', params: {}, history: [], activity: [], title: 'Legacy', savedAt: 1 },
        ]));

        const chat = getEntityChat('acme', 'theme', 'legacy');
        expect(chat).toMatchObject({ scopeId: 'acme', title: 'Legacy' });
        expect(chat).not.toHaveProperty('tenantId');
    });

    it('keeps the start of a chat across its saves, and lists the last started first (CR-010)', () => {
        const now = vi.spyOn(Date, 'now');
        now.mockReturnValue(1000);
        saveEntityChat(snapshot('acme', 'old'));
        now.mockReturnValue(2000);
        saveEntityChat(snapshot('acme', 'new'));
        // The old one written to again: its start stays, it does not move up.
        now.mockReturnValue(3000);
        saveEntityChat(snapshot('acme', 'old'));
        expect(getEntityChat('acme', 'theme', 'old')).toMatchObject({ startedAt: 1000, savedAt: 3000 });
        expect(listEntityChats('acme').map((chat) => chat.entityId)).toEqual(['new', 'old']);
        // Saved before 0.9.0: its last save is its start.
        expect(chatStartedAt({ savedAt: 5 })).toBe(5);
        now.mockRestore();
    });

    it('uses the configured storage key', () => {
        configureEntityChatStore({ storageKey: 'host.chats' });
        saveEntityChat(snapshot('acme', 'blue'));

        expect(localStorage.getItem('host.chats')).toContain('"scopeId":"acme"');
        expect(localStorage.getItem('test.entityChat')).toBeNull();
    });
});
