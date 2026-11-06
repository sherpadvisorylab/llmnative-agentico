// CR-011: the title of a saved chat, written by the model from the whole chat (3-6 words, in its
// language), for the subagents that ask for it (`SubagentManifest.autoTitle`). The model is one of the AI
// catalog the chat may run on (`executor.catalogProviders`): the one picked when it is, else the first
// allowed one; without any, the chat keeps the title it has.
import { useCallback, useEffect, useRef } from 'react';
import { parseAIModelRef, useAIProviderRegistry } from '@llmnative/react';
import type { AIModelDescriptor, AIProviderAdapter } from '@llmnative/react';
import type { SubagentManifest } from '../domain/subagentManifest';
import { findSubagentManifest } from '../domain/subagentRegistry';
import { chatHasPersonMessage, isRetryMessage, getEntityChat, listEntityChats, removeEntityChat, renameEntityChat, type EntityChatSnapshot } from '../domain/entityChatStore';
import { getAgenticoPrompts } from '../domain/prompts';
import { useAIModelCatalog } from './useAIModelCatalog';

/** What the model reads of a chat: who wrote what, in order; the middle of a long one left out. */
export function chatTranscript(activity: EntityChatSnapshot['activity'], max = 6000): string {
    const text = activity
        .filter((entry) => (entry.kind === 'user' || entry.kind === 'thinking') && entry.detail?.trim() && !isRetryMessage(entry))
        .map((entry) => `${entry.kind === 'user' ? 'Person' : 'Agent'}: ${entry.detail!.trim()}`)
        .join('\n\n');
    return text.length > max ? `${text.slice(0, max * 0.7)}\n\n[…]\n\n${text.slice(-max * 0.3)}` : text;
}

/** The title as the model wrote it: one line, without quotes, a heading mark or a final dot. */
export function cleanTitle(raw: string): string {
    const line = raw.trim().split('\n').map((value) => value.trim()).find(Boolean) ?? '';
    return line.replace(/^(title|titolo)\s*:\s*/i, '').replace(/^#+\s*/, '').replace(/^["'«“]+|["'»”]+$/g, '').replace(/[.。]+$/, '').trim().slice(0, 80);
}

/** The providers of the AI catalog a chat of `manifest` may run on (CR-010); none: all. */
function allowedProviders(manifest: SubagentManifest, params: Record<string, unknown>): readonly string[] | undefined {
    try {
        return manifest.definition.executor?.catalogProviders?.(manifest.toParams(params));
    } catch {
        return undefined;
    }
}

/** The model a chat is titled with: `preferred` when the chat may use it, else its first allowed one. */
export function titleModel(
    manifest: SubagentManifest, params: Record<string, unknown>, preferred: string | undefined,
    modelsByProvider: Record<string, AIModelDescriptor[]>, registry: Record<string, AIProviderAdapter>,
): string | undefined {
    const allowed = allowedProviders(manifest, params);
    const usable = (model: string | undefined) => {
        const ref = model ? parseAIModelRef(model) : null;
        return Boolean(ref && registry[ref.provider] && (!allowed || allowed.includes(ref.provider)));
    };
    if (usable(preferred)) return preferred;
    return Object.values(modelsByProvider).flat().map((model) => model.id).find(usable);
}

/**
 * Titles chats with the AI catalog of the app: `titleChat` for one (after a turn), and once per scope and
 * session the chats already saved without a title (those where the person never wrote are removed).
 */
export function useChatTitles(scopeId: string | undefined) {
    const registry: Record<string, AIProviderAdapter> = useAIProviderRegistry()?.registry ?? {};
    const { modelsByProvider, selectedModel } = useAIModelCatalog();
    const latest = useRef({ registry, modelsByProvider, selectedModel });
    latest.current = { registry, modelsByProvider, selectedModel };
    const busy = useRef(new Set<string>());

    const titleChat = useCallback(async (subagentId: string, entityId: string, preferred?: string): Promise<boolean> => {
        if (!scopeId) return false;
        const chat = getEntityChat(scopeId, subagentId, entityId);
        const manifest = findSubagentManifest(subagentId);
        const key = `${scopeId}:${subagentId}:${entityId}`;
        if (!chat || !manifest?.autoTitle || chat.name || !chatHasPersonMessage(chat) || busy.current.has(key)) return false;
        const { registry: providers, modelsByProvider: models, selectedModel: picked } = latest.current;
        const model = titleModel(manifest, chat.params, preferred ?? picked, models, providers);
        const ref = model ? parseAIModelRef(model) : null;
        if (!ref) return false;
        busy.current.add(key);
        try {
            const result = await providers[ref.provider].complete({
                prompt: getAgenticoPrompts().chatTitle.replace('{chat}', chatTranscript(chat.activity)),
                model: ref.model,
                history: [],
            });
            const title = result && result.type === 'text' ? cleanTitle(result.text) : '';
            return title ? renameEntityChat(scopeId, subagentId, entityId, title, 'model') : false;
        } catch {
            return false;
        } finally {
            busy.current.delete(key);
        }
    }, [scopeId]);

    // Once per scope and session, when the catalog is there: the chats saved before without a title.
    const loaded = Object.keys(modelsByProvider).length > 0;
    useEffect(() => {
        if (!scopeId || !loaded || passed.has(scopeId)) return;
        passed.add(scopeId);
        void (async () => {
            for (const chat of listEntityChats(scopeId)) {
                const manifest = findSubagentManifest(chat.subagentId);
                if (!manifest?.autoTitle) continue;
                // A chat the person never wrote in says nothing: off the history.
                if (manifest.definition.conversational && !chatHasPersonMessage(chat)) {
                    removeEntityChat(scopeId, chat.subagentId, chat.entityId);
                    continue;
                }
                if (!chat.name) await titleChat(chat.subagentId, chat.entityId);
            }
        })();
    }, [scopeId, loaded, titleChat]);

    return titleChat;
}

/** The scopes whose saved chats were titled in this session. */
const passed = new Set<string>();

/** For the tests: the pass runs again. */
export const resetChatTitlesPass = () => passed.clear();
