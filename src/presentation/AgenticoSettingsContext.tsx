// CR-022: the settings of Agentico for the panel and its hooks, with the host's rules (shown, fixed, hidden) and
// the connectors of the AI providers shown in the settings modal.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AIConnectionsProps } from '@llmnative/react';
import {
    browserSettingsStore,
    effectiveSettings,
    shownSettings,
    DEFAULT_AGENTICO_SETTINGS,
    type AgenticoSettingKey,
    type AgenticoSettings,
    type AgenticoSettingsStore,
} from '../domain/settings';

/** What the host says about the settings (`<AgenticoProvider settings>`). */
export interface AgenticoSettingsConfig {
    /** Where the values the person changes are kept; absent: this browser. */
    store?: AgenticoSettingsStore;
    /** Values fixed in code: applied, not shown, not changed. */
    fixed?: Partial<AgenticoSettings>;
    /** Settings not shown: they keep their saved or default value. */
    hidden?: AgenticoSettingKey[];
    /** The section Connectors of the modal: the AI providers (and the host's connectors, e.g. a subscription on a runner). */
    connections?: Omit<AIConnectionsProps, 'className'>;
    /** CR-024: tabs of the host after Agentico's (e.g. "My subscriptions" on a runner), drawn by the host. */
    tabs?: AgenticoSettingsTab[];
}

/** A tab of the host in the settings modal. */
export interface AgenticoSettingsTab {
    id: string;
    label: string;
    render: () => React.ReactNode;
}

interface AgenticoSettingsContextValue {
    settings: AgenticoSettings;
    /** The settings the modal shows. */
    shown: AgenticoSettingKey[];
    connections?: AgenticoSettingsConfig['connections'];
    tabs?: AgenticoSettingsTab[];
    save: (values: Partial<AgenticoSettings>) => Promise<void>;
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

const AgenticoSettingsContext = createContext<AgenticoSettingsContextValue | null>(null);

export function AgenticoSettingsProvider({ config, children }: { config?: AgenticoSettingsConfig; children: React.ReactNode }) {
    const store = config?.store ?? browserSettingsStore;
    const [saved, setSaved] = useState<Partial<AgenticoSettings>>({});
    const [isOpen, setIsOpen] = useState(false);
    useEffect(() => {
        let live = true;
        store.load().then((values) => { if (live) setSaved(values ?? {}); }, () => undefined);
        return () => { live = false; };
    }, [store]);
    const fixedKey = JSON.stringify(config?.fixed ?? {});
    const hiddenKey = (config?.hidden ?? []).join(',');
    const settings = useMemo(() => effectiveSettings(saved, config?.fixed), [saved, fixedKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const shown = useMemo(() => shownSettings(config?.fixed, config?.hidden), [fixedKey, hiddenKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const save = useCallback(async (values: Partial<AgenticoSettings>) => {
        // Only what the person may change is kept.
        const allowed = Object.fromEntries(Object.entries(values).filter(([key]) => shown.includes(key as AgenticoSettingKey)));
        const next = { ...saved, ...allowed };
        await store.save(next);
        setSaved(next);
    }, [saved, shown, store]);
    const value = useMemo<AgenticoSettingsContextValue>(() => ({
        settings,
        shown,
        connections: config?.connections,
        tabs: config?.tabs,
        save,
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
    }), [settings, shown, config?.connections, config?.tabs, save, isOpen]);
    return <AgenticoSettingsContext.Provider value={value}>{children}</AgenticoSettingsContext.Provider>;
}

const OUTSIDE: AgenticoSettingsContextValue = {
    settings: DEFAULT_AGENTICO_SETTINGS,
    shown: [],
    save: async () => undefined,
    isOpen: false,
    open: () => undefined,
    close: () => undefined,
};

/** The settings of Agentico; the defaults outside `<AgenticoProvider>`. */
export function useAgenticoSettings(): AgenticoSettingsContextValue {
    return useContext(AgenticoSettingsContext) ?? OUTSIDE;
}
