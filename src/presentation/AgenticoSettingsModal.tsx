// CR-022: the settings modal of Agentico: the settings the host lets the person change, and the connectors of the
// AI providers (the page of the framework, CR-134), subscriptions on a runner included when the host has them.
import React, { useState } from 'react';
import { AIConnections, Form, LoadingButton, ActionButton, Modal, Select, Switch, Tab, TabItem, useAIProviderRegistry, useFormController, type AIReasoningLevel } from '@llmnative/react';
import { AgenticoPagesSettings, AgenticoSubagentsSettings, AgenticoToolsSettings } from './AgenticoRoutingSettings';
import { getSubagentRegistry } from '../domain/subagentRegistry';
import { useAgenticoI18n } from '../i18n';
import type { AgenticoSettings } from '../domain/settings';
import { useAgenticoSettings } from './AgenticoSettingsContext';
import { useAIModelCatalog } from './useAIModelCatalog';
import { AgenticoConnectionsTab, AgenticoMemoryTab, AgenticoProjectsTab, useAgenticoMe } from './AgenticoConnectionsSettings';

const LEVELS: AIReasoningLevel[] = ['low', 'medium', 'high', 'max'];

/** Whether the modal has anything to show: a setting the person changes, the subagents, tools and pages (CR-023), or the connectors. */
export function useHasAgenticoSettings(): boolean {
    const { shown, connections, backend } = useAgenticoSettings();
    return shown.length > 0 || Boolean(connections) || Boolean(backend) || getSubagentRegistry().length > 0;
}

export function AgenticoSettingsModal() {
    const t = useAgenticoI18n();
    const { settings, shown, connections, tabs, backend, save, isOpen, close } = useAgenticoSettings();
    const { me } = useAgenticoMe(isOpen ? backend : undefined);
    const form = useFormController();
    const registry = useAIProviderRegistry()?.registry ?? {};
    const { modelsByProvider } = useAIModelCatalog({ unfiltered: true });
    const [tab, setTab] = useState(0);
    // An editor of the routing open on top: this modal is dimmed behind it (CR-023).
    const [stacked, setStacked] = useState(false);
    if (!isOpen) return null;
    const hasAgents = getSubagentRegistry().length > 0;

    const providerIds = Object.keys(registry);
    const labelOf = (id: string) => registry[id]?.label ?? id;
    const models = Object.values(modelsByProvider).flat();
    const levels: Record<AIReasoningLevel, string> = { low: t.settingsReasoningLow, medium: t.settingsReasoningMedium, high: t.settingsReasoningHigh, max: t.settingsReasoningMax };
    const show = (key: keyof AgenticoSettings) => shown.includes(key);
    const defaults: Record<string, string> = {
        defaultModel: settings.defaultModel ?? '',
        reasoning: settings.reasoning ?? '',
        chatTitles: settings.chatTitles ? 'on' : '',
        threadEvents: settings.threadEvents ? 'on' : '',
        ...Object.fromEntries(providerIds.map((id) => [`provider_${id}`, !settings.providers || settings.providers.includes(id) ? 'on' : ''])),
    };

    return (
        <Modal
            title={t.settingsTitle}
            position="right"
            size="lg"
            stackedBehind={stacked}
            onClose={close}
            footer={(
                <>
                    {shown.length > 0 && tab === 0 && <LoadingButton variant="primary" label={t.settingsSave} onClick={(event) => form.save(event)} />}
                    <ActionButton variant="link" label={t.settingsClose} onClick={close} />
                </>
            )}
        >
            <Tab defaultIndex={0} onChange={setTab} contentClassName="pt-4">
                {[
                shown.length > 0 && (
                    <TabItem key="chats" label={t.settingsChats}>
                        <Form
                            appearance="empty"
                            controller={form}
                            showNotice={false}
                            defaultValues={defaults}
                            onSave={async ({ record }) => {
                                const value = (key: string) => String(record?.[key] ?? '');
                                const allowed = providerIds.filter((id) => value(`provider_${id}`) === 'on');
                                await save({
                                    ...(show('defaultModel') ? { defaultModel: value('defaultModel') || undefined } : {}),
                                    ...(show('reasoning') ? { reasoning: (value('reasoning') || undefined) as AIReasoningLevel | undefined } : {}),
                                    ...(show('providers') ? { providers: allowed.length === providerIds.length ? undefined : allowed } : {}),
                                    ...(show('chatTitles') ? { chatTitles: value('chatTitles') === 'on' } : {}),
                                    ...(show('threadEvents') ? { threadEvents: value('threadEvents') === 'on' } : {}),
                                });
                                close();
                                return undefined;
                            }}
                        >
                            <div className="space-y-3">
                                {show('defaultModel') && (
                                    <Select
                                        name="defaultModel"
                                        label={t.settingsDefaultModel}
                                        placeholderOption={{ label: t.settingsDefaultModelNone, value: '' }}
                                        options={models.map((model) => ({ label: `${model.providerLabel ?? model.provider} / ${model.model}`, value: model.id }))}
                                    />
                                )}
                                {show('reasoning') && (
                                    <Select
                                        name="reasoning"
                                        label={t.settingsReasoning}
                                        placeholderOption={{ label: t.settingsReasoningDefault, value: '' }}
                                        options={LEVELS.map((level) => ({ label: levels[level], value: level }))}
                                    />
                                )}
                                {show('providers') && providerIds.length > 0 && (
                                    <fieldset className="space-y-1">
                                        <legend className="text-sm font-medium">{t.settingsProviders}</legend>
                                        {providerIds.map((id) => <Switch key={id} name={`provider_${id}`} label={labelOf(id)} />)}
                                    </fieldset>
                                )}
                                {show('chatTitles') && <Switch name="chatTitles" label={t.settingsChatTitles} />}
                                {show('threadEvents') && <Switch name="threadEvents" label={t.settingsThreadEvents} />}
                            </div>
                        </Form>
                    </TabItem>
                ),
                hasAgents && (
                    <TabItem key="subagents" label={t.settingsSubagents}>
                        <AgenticoSubagentsSettings onStack={setStacked} />
                    </TabItem>
                ),
                hasAgents && (
                    <TabItem key="tools" label={t.settingsTools}>
                        <AgenticoToolsSettings onStack={setStacked} />
                    </TabItem>
                ),
                hasAgents && (
                    <TabItem key="pages" label={t.settingsPages}>
                        <AgenticoPagesSettings onStack={setStacked} />
                    </TabItem>
                ),
                // CR-026: on the server of Agentico, Connections (Cloud, runners), Memory and Projects.
                backend && me && (
                    <TabItem key="connections" label={t.connectionsTab}>
                        <AgenticoConnectionsTab backend={backend} me={me} {...(connections ? { cloud: connections } : {})} />
                    </TabItem>
                ),
                backend && me && (me.administers?.memories ?? me.role === 'platform') && (
                    <TabItem key="memory" label={t.memoryTab}>
                        <AgenticoMemoryTab backend={backend} />
                    </TabItem>
                ),
                backend && me && me.role !== 'member' && (
                    <TabItem key="projects" label={t.projectsTab}>
                        <AgenticoProjectsTab backend={backend} me={me} />
                    </TabItem>
                ),
                connections && !backend && (
                    <TabItem key="connectors" label={t.settingsConnectors}>
                        <AIConnections {...connections} />
                    </TabItem>
                ),
                // CR-024: the host's tabs, drawn by the host.
                ...(tabs ?? []).map((extra) => (
                    <TabItem key={`host-${extra.id}`} label={extra.label}>
                        {extra.render()}
                    </TabItem>
                )),
                ].filter(Boolean)}
            </Tab>
        </Modal>
    );
}
