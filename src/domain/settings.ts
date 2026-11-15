// CR-022: the settings of Agentico, in one place. Each one has a value of its own; the host decides in code which
// ones the person changes in the settings modal and which it fixes (or hides). They are kept by the host's store
// (absent: this browser), never read from environment variables Agentico does not manage.

import type { AIReasoningLevel } from '@llmnative/react';

export interface AgenticoSettings {
    /** The model the chats start with on the AI catalog (`provider/model`); absent: the person picks one. */
    defaultModel?: string;
    /** How much the model reasons on the AI catalog when the agent does not say (`executor.catalogReasoning`). */
    reasoning?: AIReasoningLevel;
    /** The providers of the AI catalog the chats may use; absent: all the connected ones. */
    providers?: string[];
    /** The model writes the titles of the chats (CR-011). */
    chatTitles: boolean;
    /** The events of the host (what the other agents did) are shown among the messages (CR-019). */
    threadEvents: boolean;
}

export type AgenticoSettingKey = keyof AgenticoSettings;

export const AGENTICO_SETTING_KEYS: readonly AgenticoSettingKey[] = ['defaultModel', 'reasoning', 'providers', 'chatTitles', 'threadEvents'];

export const DEFAULT_AGENTICO_SETTINGS: AgenticoSettings = { chatTitles: true, threadEvents: true };

/** Where the settings the person changes are kept: the host's store (a database, its server). */
export interface AgenticoSettingsStore {
    load(): Promise<Partial<AgenticoSettings>>;
    save(values: Partial<AgenticoSettings>): Promise<void>;
}

/** The value of each setting: fixed by the host, else what the person saved, else the default. */
export function effectiveSettings(saved: Partial<AgenticoSettings>, fixed: Partial<AgenticoSettings> = {}): AgenticoSettings {
    const clean = Object.fromEntries(Object.entries(saved).filter(([key, value]) => AGENTICO_SETTING_KEYS.includes(key as AgenticoSettingKey) && value !== undefined));
    return { ...DEFAULT_AGENTICO_SETTINGS, ...clean, ...fixed };
}

/** The settings the modal shows: neither fixed nor hidden by the host. */
export function shownSettings(fixed: Partial<AgenticoSettings> = {}, hidden: readonly AgenticoSettingKey[] = []): AgenticoSettingKey[] {
    return AGENTICO_SETTING_KEYS.filter((key) => !(key in fixed) && !hidden.includes(key));
}

const STORAGE_KEY = 'llmnative.agentico.settings';

/** The store of this browser, when the host gives none. */
export const browserSettingsStore: AgenticoSettingsStore = {
    async load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) as Partial<AgenticoSettings> : {};
        } catch {
            return {};
        }
    },
    async save(values) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
        } catch {
            // not kept in this browser: the values still hold for this session
        }
    },
};
