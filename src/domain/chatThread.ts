// CR-018: the sessions of one chat. A subagent that declares `thread` makes its saved chats with the same key
// sessions of one chat (e.g. the chats with the orchestrator of a project): the panel shows the earlier ones
// above the open one, read-only. Each keeps its own context: the model reads only the open one.
import { chatStartedAt, entityChatTaskId, listEntityChats, type EntityChatSnapshot } from './entityChatStore';
import { findSubagentManifest } from './subagentRegistry';

/** The chat a saved chat is a session of: the key its subagent gives (`SubagentManifest.thread`), if any. */
export function chatThreadOf(chat: Pick<EntityChatSnapshot, 'subagentId' | 'params'>): string | undefined {
    return findSubagentManifest(chat.subagentId)?.thread?.(chat.params) || undefined;
}

/**
 * The sessions of a chat before the open one, the latest first: the saved chats of the scope with the same
 * key, started before it (all of them for a chat not saved yet), the open one left out.
 */
export function earlierSessions(scopeId: string, thread: string, openTaskId: string | undefined): EntityChatSnapshot[] {
    const chats = listEntityChats(scopeId);
    const open = openTaskId ? chats.find((chat) => entityChatTaskId(chat.subagentId, chat.entityId) === openTaskId) : undefined;
    const before = open ? chatStartedAt(open) : Infinity;
    return chats
        .filter((chat) => chat !== open && chatStartedAt(chat) < before && chatThreadOf(chat) === thread)
        .sort((a, b) => chatStartedAt(b) - chatStartedAt(a));
}
