import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    configureEntityChatStore, getEntityChat, listEntityChats, removeEntityChat, renameEntityChat, saveEntityChat, syncEntityChats,
    type EntityChatBackend, type EntityChatSnapshot,
} from '../../src';

// CR-013: the chats kept by the host too. A backend in memory, as the server of a host would be.
function memoryBackend() {
    const kept = new Map<string, EntityChatSnapshot>();
    const keyOf = (s: Pick<EntityChatSnapshot, 'subagentId' | 'entityId'>) => `${s.subagentId}:${s.entityId}`;
    const refuse = new Set<string>();
    const backend: EntityChatBackend = {
        load: async (scopeId) => [...kept.values()].filter((s) => s.scopeId === scopeId).map((s) => structuredClone(s)),
        save: async (snapshot) => { kept.set(keyOf(snapshot), structuredClone(snapshot)); },
        remove: async (_scopeId, subagentId, entityId) => {
            if (refuse.has(entityId)) throw new Error('keeps the work it gave');
            kept.delete(keyOf({ subagentId, entityId }));
        },
    };
    return { backend, kept, refuse };
}

const chat = (entityId: string, text = 'Why?') => ({
    scopeId: 'acme', subagentId: 'jonny', entityId, params: { projectId: 'crm' }, history: [], title: 'crm',
    activity: [{ id: '1', kind: 'user' as const, label: '', status: 'done' as const, detail: text }],
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => localStorage.clear());
afterEach(() => configureEntityChatStore({ storageKey: 'test.chats' }));

describe('the chats kept by the host (CR-013)', () => {
    it('sends what is saved and renamed; sends at the first sync the chats of this browser from before', async () => {
        configureEntityChatStore({ storageKey: 'test.chats' });
        saveEntityChat(chat('old'));
        const { backend, kept } = memoryBackend();
        configureEntityChatStore({ storageKey: 'test.chats', backend });
        await syncEntityChats('acme');
        await settle();
        expect([...kept.keys()]).toEqual(['jonny:old']);
        expect(kept.get('jonny:old')).not.toHaveProperty('synced');
        expect(getEntityChat('acme', 'jonny', 'old')?.synced).toBe(true);

        saveEntityChat(chat('new'));
        renameEntityChat('acme', 'jonny', 'new', 'Login with SSO');
        await settle();
        expect(kept.get('jonny:new')?.name).toBe('Login with SSO');
    });

    it('takes the later copy, and drops a chat gone from the backend', async () => {
        const { backend, kept } = memoryBackend();
        configureEntityChatStore({ storageKey: 'test.chats', backend });
        const now = vi.spyOn(Date, 'now');
        now.mockReturnValue(1000);
        saveEntityChat(chat('a1'));
        saveEntityChat(chat('a2'));
        await settle();
        // Another browser wrote to a1 later, and removed a2.
        kept.set('jonny:a1', { ...kept.get('jonny:a1')!, activity: [...kept.get('jonny:a1')!.activity, { id: '2', kind: 'thinking', label: '', status: 'done', detail: 'Because.' }], changedAt: 2000, savedAt: 2000 });
        kept.delete('jonny:a2');
        // And someone else started one.
        kept.set('jonny:b1', { ...chat('b1', 'Release?'), savedAt: 1500, changedAt: 1500, startedAt: 1500 });
        await syncEntityChats('acme');
        expect(listEntityChats('acme').map((e) => e.entityId)).toEqual(['b1', 'a1']);
        expect(getEntityChat('acme', 'jonny', 'a1')?.activity).toHaveLength(2);
        now.mockRestore();
    });

    it('brings back with the next sync a chat the backend would not remove', async () => {
        const { backend, refuse } = memoryBackend();
        configureEntityChatStore({ storageKey: 'test.chats', backend });
        saveEntityChat(chat('gave-a-cr'));
        await settle();
        refuse.add('gave-a-cr');
        removeEntityChat('acme', 'jonny', 'gave-a-cr');
        await settle();
        expect(getEntityChat('acme', 'jonny', 'gave-a-cr')).toBeNull();
        await syncEntityChats('acme');
        expect(getEntityChat('acme', 'jonny', 'gave-a-cr')).not.toBeNull();
    });
});
