import { beforeEach, describe, expect, it } from 'vitest';
import { configureEntityChatStore, getEntityChat, listEntityChats, removeEntityChat, saveEntityChat } from '../../src';

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

    it('uses the configured storage key', () => {
        configureEntityChatStore({ storageKey: 'host.chats' });
        saveEntityChat(snapshot('acme', 'blue'));

        expect(localStorage.getItem('host.chats')).toContain('"scopeId":"acme"');
        expect(localStorage.getItem('test.entityChat')).toBeNull();
    });
});
