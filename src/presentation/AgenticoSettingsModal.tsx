// CR-022: the settings modal of Agentico: the settings the host lets the person change, and the connectors of the
// AI providers (the page of the framework, CR-134), subscriptions on a runner included when the host has them.
import React from 'react';
import { AIConnections, Checkbox, Form, LoadingButton, ActionButton, Modal, Select, Switch, useAIProviderRegistry, useFormController, type AIReasoningLevel } from '@llmnative/react';
import { useAgenticoI18n } from '../i18n';
import type { AgenticoSettings } from '../domain/settings';
import { useAgenticoSettings } from './AgenticoSettingsContext';
import { useAIModelCatalog } from './useAIModelCatalog';

const LEVELS: AIReasoningLevel[] = ['low', 'medium', 'high', 'max'];

/** Whether the modal has anything to show: a setting the person changes, or the connectors. */
export function useHasAgenticoSettings(): boolean {
    const { shown, connections } = useAgenticoSettings();
    return shown.length > 0 || Boolean(connections);
}

export function AgenticoSettingsModal() {
    const t = useAgenticoI18n();
    const { settings, shown, connections, save, isOpen, close } = useAgenticoSettings();
    const form = useFormController();
    const registry = useAIProviderRegistry()?.registry ?? {};
    const { modelsByProvider } = useAIModelCatalog({ unfiltered: true });
    if (!isOpen) return null;

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
            onClose={close}
            footer={(
                <>
                    {shown.length > 0 && <LoadingButton variant="primary" label={t.settingsSave} onClick={(event) => form.save(event)} />}
                    <ActionButton variant="link" label={t.settingsClose} onClick={close} />
                </>
            )}
        >
            <div className="space-y-6">
                {shown.length > 0 && (
                    <section className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.settingsChats}</h4>
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
                                        {providerIds.map((id) => <Checkbox key={id} name={`provider_${id}`} label={labelOf(id)} />)}
                                    </fieldset>
                                )}
                                {show('chatTitles') && <Switch name="chatTitles" label={t.settingsChatTitles} />}
                                {show('threadEvents') && <Switch name="threadEvents" label={t.settingsThreadEvents} />}
                            </div>
                        </Form>
                    </section>
                )}
                {connections && (
                    <section className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.settingsConnectors}</h4>
                        <AIConnections {...connections} />
                    </section>
                )}
            </div>
        </Modal>
    );
}
