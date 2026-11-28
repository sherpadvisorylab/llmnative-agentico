// CR-026: the tabs Connections, Memory and Projects of the settings, on the server of Agentico (CR-025). The macro
// connections are boxes that open a modal: Cloud (the AI providers of the framework), one per runner of the project,
// Add a runner (installed or connected with the challenge on the runner). Switches, never checkboxes.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AIConnections,
    ActionButton,
    Alert,
    Badge,
    Card,
    DescriptionList,
    Form,
    Icon,
    ListCard,
    LoadingButton,
    Modal,
    ModalYesNo,
    Password,
    Select,
    String as TextInput,
    Switch,
    interpolate,
    useI18n,
} from '@llmnative/react';
import type { AIConnectionsProps } from '@llmnative/react';
import type { RunnerProvider, RunnerStatus } from '@llmnative/runner/client';
import { AddRunner, RunnerAccounts, textsFor, type RunnerEntry } from '@llmnative/runner/ui';
import type { AgenticoBackend, AgenticoMe, AgenticoMemory, AgenticoMemoryCheck, AgenticoMemoryNamespace, AgenticoNamespaceRow, AgenticoRunnerDefault } from '../backend/agenticoBackend';
import { useAgenticoI18n } from '../i18n';
import { nameOfHost } from './hostName';

const reason = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure));

/** Who is asking, read once per backend. */
export function useAgenticoMe(backend: AgenticoBackend | undefined) {
    const [me, setMe] = useState<AgenticoMe | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!backend) return;
        let live = true;
        backend.me().then((value) => { if (live) setMe(value); }, (failure) => { if (live) setError(reason(failure)); });
        return () => { live = false; };
    }, [backend]);
    return { me, error };
}

/**
 * Connections: Cloud, the runners of the project, Add a runner. `cloud`: the connections of the host when it keeps its
 * AI keys itself (its own store, the providers it allows); without it, those of the server of Agentico.
 */
export function AgenticoConnectionsTab({ backend, me, cloud, onStack }: { backend: AgenticoBackend; me: AgenticoMe; cloud?: Omit<AIConnectionsProps, 'className'>; /** A modal of the tab is open over the settings (they dim behind it). */ onStack?: (open: boolean) => void }) {
    const t = useAgenticoI18n();
    const { locale } = useI18n();
    const platform = me.role === 'platform';
    // CR-028: the admin of a namespace connects and administers its own runners; the platform all of them.
    const administers = me.administers?.runners ?? platform;
    const store = useMemo(() => cloud?.store ?? backend.connections(), [backend, cloud?.store]);
    const [connected, setConnected] = useState<number | null>(null);
    const [runners, setRunners] = useState<RunnerEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpenState] = useState<'cloud' | 'add' | 'mine' | { runner: RunnerEntry } | null>(null);
    // A modal of a subscription over "My subscriptions": that one dims behind it.
    const [mineStacked, setMineStacked] = useState(false);
    // Every modal of the tab opens on the right, over the settings, which dim behind it.
    const setOpen = (next: typeof open) => {
        setOpenState(next);
        onStack?.(next !== null);
    };

    const load = useCallback(async () => {
        try {
            setConnected((await store.load()).providers.length);
            if (administers) setRunners(await backend.fleet.list());
            setError(null);
        } catch (failure) {
            setError(reason(failure));
        }
    }, [backend, store, administers]);
    useEffect(() => { void load(); }, [load]);
    const close = () => {
        setOpen(null);
        void load();
    };

    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t.connectionsIntro}</p>
            {error && <Alert variant="danger">{interpolate(t.connectionsError, { error })}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
                <ListCard
                    icon="cloud"
                    title={t.cloudTitle}
                    description={t.cloudDescription}
                    badge={connected ? <Badge variant="success">{interpolate(t.cloudConnected, { count: connected })}</Badge> : <Badge variant="light">{t.cloudNone}</Badge>}
                    onClick={() => setOpen('cloud')}
                />
                {administers && runners?.map((runner) => (
                    <ListCard
                        key={runner.id}
                        icon="server"
                        title={nameOfHost(runner.url)}
                        description={runner.url}
                        badge={runner.draining ? <Badge variant="warning">{t.runnerDraining}</Badge> : runner.isDefault ? <Badge variant="info">{t.runnerDefault}</Badge> : undefined}
                        onClick={() => setOpen({ runner })}
                    />
                ))}
                {!administers && me.hasRunner && (
                    <ListCard icon="server" title={t.runnerOfProject} description={t.runnerOfProjectDescription} onClick={() => setOpen('mine')} />
                )}
                {administers && (
                    <ListCard icon="plus" dashed title={t.runnerAdd} description={t.runnerAddDescription} onClick={() => setOpen('add')} />
                )}
            </div>
            {open === 'cloud' && (
                <Modal title={t.cloudTitle} position="right" size="xl" onClose={close} footer={<ActionButton variant="link" label={t.settingsClose} onClick={close} />}>
                    <AIConnections {...(cloud ?? {})} store={store} readOnly={cloud?.readOnly ?? me.role === 'member'} />
                </Modal>
            )}
            {open === 'mine' && (
                <Modal title={t.runnerOfProject} position="right" size="lg" stackedBehind={mineStacked} onClose={close} footer={<ActionButton variant="link" label={t.settingsClose} onClick={close} />}>
                    <RunnerAccounts client={backend.runner()} scope="user" locale={locale} onStack={setMineStacked} />
                </Modal>
            )}
            {open === 'add' && (
                <AddRunner fleet={backend.fleet} t={textsFor(locale)} locale={locale} position="right" onClose={close} onAdded={close} />
            )}
            {open && typeof open === 'object' && <RunnerModal backend={backend} runner={open.runner} platform={platform} onClose={close} />}
        </div>
    );
}

/** One runner of the project: its state, its accounts for the namespace, default and draining, remove. */
function RunnerModal({ backend, runner, platform, onClose }: { backend: AgenticoBackend; runner: RunnerEntry; platform: boolean; onClose: () => void }) {
    const t = useAgenticoI18n();
    const { locale } = useI18n();
    const [status, setStatus] = useState<RunnerStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [removing, setRemoving] = useState(false);
    // A modal of the accounts (the name of one) over this one: this one dims behind it.
    const [stacked, setStacked] = useState(false);
    const defaults = useRunnerDefaults(backend);
    useEffect(() => {
        let live = true;
        backend.fleet.status(runner.id).then((value) => { if (live) setStatus(value); }, (failure) => { if (live) setError(reason(failure)); });
        return () => { live = false; };
    }, [backend, runner.id]);
    const set = (patch: { isDefault?: boolean; draining?: boolean }) => backend.fleet.update(runner.id, patch).catch((failure) => setError(reason(failure)));
    const runnerClient = useMemo(() => backend.runnerOfNamespace(), [backend]);

    return (
        <Modal
            // Its name, from its address (no name to type).
            title={nameOfHost(runner.url)}
            position="right"
            size="lg"
            stackedBehind={stacked}
            onClose={onClose}
            footer={(
                <>
                    <ActionButton variant="outline-danger" icon="trash" label={t.runnerRemove} onClick={() => setRemoving(true)} />
                    <ActionButton variant="link" label={t.settingsClose} onClick={onClose} />
                </>
            )}
        >
            <div className="flex flex-col gap-4">
                {error && <Alert variant="danger">{interpolate(t.runnerUnreachable, { error })}</Alert>}
                <DescriptionList items={[
                    { label: 'URL', value: runner.url },
                    { label: t.runnerVersion, value: status?.version ?? '…' },
                    { label: t.runnerLoad, value: status ? interpolate(t.runnerLoadValue, { chats: status.load.chats, max: status.load.maxChats }) : '…' },
                ]} />
                <Form appearance="empty" showNotice={false} onSubmit={() => false}>
                    <div className="flex flex-col gap-2">
                        {platform && !(runner as RunnerEntry & { owners?: string[] }).owners?.length && <Switch name="isDefault" label={t.runnerSetDefault} defaultValue={runner.isDefault ? 'on' : ''} onChange={({ value }: { value?: unknown }) => void set({ isDefault: Boolean(value) })} />}
                        <Switch name="draining" label={t.runnerSetDraining} defaultValue={runner.draining ? 'on' : ''} onChange={({ value }: { value?: unknown }) => void set({ draining: Boolean(value) })} />
                    </div>
                </Form>
                <RunnerAccounts
                    client={runnerClient}
                    scope="tenant"
                    locale={locale}
                    onStack={setStacked}
                    onChange={() => void defaults.reload()}
                    renderProvider={(provider, accounts) => (accounts.length ? <RunnerDefaults provider={provider} defaults={defaults} /> : null)}
                />
            </div>
            {removing && (
                <ModalYesNo
                    title={t.runnerRemove}
                    danger
                    onClose={() => setRemoving(false)}
                    onYes={async () => {
                        try {
                            await backend.fleet.remove(runner.id);
                            onClose();
                        } catch (failure) {
                            setError(reason(failure));
                        }
                        setRemoving(false);
                        return true;
                    }}
                >
                    {interpolate(t.runnerRemoveConfirm, { name: runner.name })}
                </ModalYesNo>
            )}
        </Modal>
    );
}

/** CR-030: the defaults of the subscriptions of the namespace, and the models each runs, read together. */
function useRunnerDefaults(backend: AgenticoBackend) {
    const [values, setValues] = useState<Record<string, AgenticoRunnerDefault>>({});
    const [models, setModels] = useState<Record<string, string[]>>({});
    const [error, setError] = useState<string | null>(null);
    const reload = useCallback(async () => {
        try {
            // The models of the runner as its people see them: the runner answers its models to a person, not to the
            // namespace alone (404).
            const [given, read] = await Promise.all([backend.runnerDefaults.get(), backend.runner().models()]);
            setValues(given);
            setModels(Object.fromEntries(read.providers.map((provider) => [provider.id, provider.models])));
            setError(null);
        } catch (failure) {
            setError(reason(failure));
        }
    }, [backend]);
    useEffect(() => { void reload(); }, [reload]);
    const save = async (provider: string, value: AgenticoRunnerDefault) => {
        try {
            setValues(await backend.runnerDefaults.set(provider, value));
            setError(null);
        } catch (failure) {
            setError(reason(failure));
        }
    };
    return { values, models, error, reload, save };
}

/** CR-030: under a subscription of the runner, the model the chats of Agentico start with on it and how much it reasons. */
function RunnerDefaults({ provider, defaults }: { provider: RunnerProvider; defaults: ReturnType<typeof useRunnerDefaults> }) {
    const t = useAgenticoI18n();
    const saved = defaults.values[provider] ?? {};
    const offered = defaults.models[provider] ?? [];
    const levels: Record<NonNullable<AgenticoRunnerDefault['reasoning']>, string> = { low: t.settingsReasoningLow, medium: t.settingsReasoningMedium, high: t.settingsReasoningHigh, max: t.settingsReasoningMax };
    const save = (patch: AgenticoRunnerDefault) => {
        const next = { ...saved, ...patch };
        void defaults.save(provider, { ...(next.model ? { model: next.model } : {}), ...(next.reasoning ? { reasoning: next.reasoning } : {}) });
    };
    return (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
            <h6 className="text-sm font-semibold">{t.runnerDefaultsTitle}</h6>
            <p className="text-xs text-muted-foreground">{t.runnerDefaultsIntro}</p>
            {defaults.error && <Alert variant="danger">{interpolate(t.connectionsError, { error: defaults.error })}</Alert>}
            <Form appearance="empty" showNotice={false} defaultValues={{ model: saved.model ?? '', reasoning: saved.reasoning ?? '' }} onSubmit={() => false}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                        name="model"
                        label={t.runnerDefaultModel}
                        placeholderOption={{ label: t.runnerDefaultModelNone, value: '' }}
                        options={[...new Set([...offered, ...(saved.model ? [saved.model] : [])])].map((model) => ({ label: model, value: model }))}
                        onChange={({ value }: { value?: unknown }) => save({ model: String(value ?? '') || undefined })}
                    />
                    <Select
                        name="reasoning"
                        label={t.runnerDefaultReasoning}
                        placeholderOption={{ label: t.runnerDefaultReasoningNone, value: '' }}
                        options={(Object.keys(levels) as Array<keyof typeof levels>).map((level) => ({ label: levels[level], value: level }))}
                        onChange={({ value }: { value?: unknown }) => save({ reasoning: (String(value ?? '') || undefined) as AgenticoRunnerDefault['reasoning'] })}
                    />
                </div>
            </Form>
        </div>
    );
}

const checkText = (t: ReturnType<typeof useAgenticoI18n>, check: AgenticoMemoryCheck) => (
    check.ok ? t.memoryOk : check.error === 'rejected' ? t.memoryRejected : check.error === 'unreachable' ? t.memoryUnreachable : t.memoryInvalid
);

/** Memory: a box per memory of the project, Add a memory. */
export function AgenticoMemoryTab({ backend, onStack }: { backend: AgenticoBackend; onStack?: (open: boolean) => void }) {
    const t = useAgenticoI18n();
    const [memories, setMemories] = useState<AgenticoMemory[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpenState] = useState<AgenticoMemory | 'add' | null>(null);
    const setOpen = (next: typeof open) => {
        setOpenState(next);
        onStack?.(next !== null);
    };
    const load = useCallback(async () => {
        try {
            setMemories(await backend.memories.list());
            setError(null);
        } catch (failure) {
            setError(reason(failure));
        }
    }, [backend]);
    useEffect(() => { void load(); }, [load]);
    const close = () => {
        setOpen(null);
        void load();
    };
    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t.memoryIntro}</p>
            {error && <Alert variant="danger">{interpolate(t.connectionsError, { error })}</Alert>}
            {memories && !memories.length && <p className="text-sm text-muted-foreground">{t.memoryNone}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
                {memories?.map((memory) => (
                    <ListCard key={memory.id} icon="database" title={nameOfHost(memory.apiUrl)} description={memory.apiUrl} meta={memory.mcpUrl} onClick={() => setOpen(memory)} />
                ))}
                <ListCard icon="plus" dashed title={t.memoryAdd} description={t.memoryAddDescription} onClick={() => setOpen('add')} />
            </div>
            {open && <MemoryModal backend={backend} memory={open === 'add' ? null : open} onClose={close} />}
        </div>
    );
}

/**
 * A memory: its MCP server, the address of its API (where it is written) and its key, in that order; its name comes
 * from its address. Once connected, the namespaces it keeps, with how much each holds.
 */
function MemoryModal({ backend, memory, onClose }: { backend: AgenticoBackend; memory: AgenticoMemory | null; onClose: () => void }) {
    const t = useAgenticoI18n();
    const [values, setValues] = useState({ apiUrl: memory?.apiUrl ?? '', mcpUrl: memory?.mcpUrl ?? '', key: '' });
    const [notice, setNotice] = useState<{ variant: 'success' | 'danger'; text: string } | null>(null);
    const [removing, setRemoving] = useState(false);
    const [namespaces, setNamespaces] = useState<AgenticoMemoryNamespace[] | null>(null);
    const [namespacesError, setNamespacesError] = useState<string | null>(null);
    const field = (name: keyof typeof values) => ({ value }: { value?: unknown }) => setValues((all) => ({ ...all, [name]: String(value ?? '') }));
    const fail = (failure: unknown) => setNotice({ variant: 'danger', text: interpolate(t.connectionsError, { error: reason(failure) }) });
    useEffect(() => {
        if (!memory) return undefined;
        let live = true;
        backend.memories.namespaces(memory.id).then((list) => { if (live) setNamespaces(list); }, (failure) => { if (live) setNamespacesError(reason(failure)); });
        return () => { live = false; };
    }, [backend, memory]);
    const name = values.apiUrl.trim() ? nameOfHost(values.apiUrl) : t.memoryAdd;
    // Checked with the key typed, or (a memory already connected) with the one kept.
    const canCheck = !!values.apiUrl.trim() && (!!values.key.trim() || !!memory);

    return (
        <Modal
            title={memory ? nameOfHost(memory.apiUrl) : name}
            position="right"
            size="lg"
            onClose={onClose}
            footer={(
                <>
                    {memory && <ActionButton variant="outline-danger" icon="trash" label={t.memoryRemove} onClick={() => setRemoving(true)} />}
                    <LoadingButton
                        variant="outline-primary"
                        label={t.memoryCheck}
                        disabled={!canCheck || (!memory && !values.key.trim())}
                        onClick={async () => {
                            const check = await backend.memories.check({ apiUrl: values.apiUrl, key: values.key }).catch((failure) => ({ ok: false as const, error: 'unreachable' as const, failure }));
                            setNotice({ variant: check.ok ? 'success' : 'danger', text: checkText(t, check) });
                        }}
                    />
                    <LoadingButton
                        variant="primary"
                        label={t.memorySave}
                        disabled={memory ? !values.apiUrl.trim() : !values.apiUrl.trim() || !values.key.trim()}
                        onClick={async () => {
                            try {
                                const named = nameOfHost(values.apiUrl);
                                if (memory) {
                                    await backend.memories.update(memory.id, {
                                        name: named,
                                        mcpUrl: values.mcpUrl.trim() || null,
                                        ...(values.apiUrl.trim() !== memory.apiUrl ? { apiUrl: values.apiUrl.trim() } : {}),
                                        ...(values.key.trim() ? { key: values.key } : {}),
                                    });
                                } else {
                                    await backend.memories.add({ name: named, apiUrl: values.apiUrl, mcpUrl: values.mcpUrl.trim() || undefined, key: values.key });
                                }
                                onClose();
                            } catch (failure) {
                                fail(failure);
                            }
                        }}
                    />
                </>
            )}
        >
            <div className="flex flex-col gap-5">
                <Form appearance="empty" showNotice={false} onSubmit={() => false}>
                    <div className="flex flex-col gap-3">
                        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
                        <TextInput name="mcpUrl" label={t.memoryMcpUrl} feedback={t.memoryMcpUrlHint} placeholder="https://memory.example.com/mcp" defaultValue={values.mcpUrl} onChange={field('mcpUrl')} />
                        <TextInput name="apiUrl" label={t.memoryApiUrl} placeholder="https://memory.example.com" defaultValue={values.apiUrl} onChange={field('apiUrl')} />
                        <Password
                            name="key"
                            label={t.memoryKey}
                            autoComplete="off"
                            placeholder={memory ? t.memoryKeySaved : undefined}
                            feedback={memory ? t.memoryKeyKeep : undefined}
                            onChange={field('key')}
                        />
                    </div>
                </Form>
                {memory && (
                    <section className="flex flex-col gap-2">
                        <h5 className="text-sm font-semibold">{interpolate(t.memoryNamespaces, { count: namespaces?.length ?? 0 })}</h5>
                        {namespacesError && <Alert variant="warning">{interpolate(t.connectionsError, { error: namespacesError })}</Alert>}
                        {!namespaces && !namespacesError && <p className="text-xs text-muted-foreground">{t.memoryNamespacesLoading}</p>}
                        {namespaces && !namespaces.length && <p className="text-xs text-muted-foreground">{t.memoryNamespacesNone}</p>}
                        {namespaces && namespaces.length > 0 && (
                            <ul className="divide-y divide-border rounded-md border border-border text-sm">
                                {namespaces.map((item) => (
                                    <li key={item.namespace} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                        <span className="font-mono text-xs">{item.namespace}</span>
                                        <span className="flex flex-wrap items-center gap-1">
                                            <Badge variant="light">{interpolate(t.memoryDocuments, { count: item.documents })}</Badge>
                                            <Badge variant="light">{interpolate(t.memoryMemories, { count: item.memories })}</Badge>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </div>
            {removing && memory && (
                <ModalYesNo
                    title={t.memoryRemove}
                    danger
                    onClose={() => setRemoving(false)}
                    onYes={async () => {
                        try {
                            await backend.memories.remove(memory.id);
                            onClose();
                        } catch (failure) {
                            fail(failure);
                        }
                        setRemoving(false);
                        return true;
                    }}
                >
                    {interpolate(t.memoryRemoveConfirm, { name: nameOfHost(memory.apiUrl) })}
                </ModalYesNo>
            )}
        </Modal>
    );
}

/** Projects: each namespace of the project as a card, with the runner and the memory it uses. */
export function AgenticoProjectsTab({ backend, me }: { backend: AgenticoBackend; me: AgenticoMe }) {
    const t = useAgenticoI18n();
    const platform = me.role === 'platform';
    const [rows, setRows] = useState<AgenticoNamespaceRow[] | null>(null);
    const [runners, setRunners] = useState<RunnerEntry[]>([]);
    const [memories, setMemories] = useState<AgenticoMemory[]>([]);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(async () => {
        try {
            const [projects, runnerList, memoryList] = await Promise.all([
                backend.projects.list(),
                backend.fleet.list(),
                backend.memories.list(),
            ]);
            setRows(projects.namespaces);
            setRunners(runnerList);
            setMemories(memoryList);
            setError(null);
        } catch (failure) {
            setError(reason(failure));
        }
    }, [backend, platform]);
    useEffect(() => { void load(); }, [load]);
    const set = async (namespace: string, patch: { runnerId?: string; memoryId?: string | null }) => {
        try {
            await backend.projects.set(namespace, patch);
            await load();
        } catch (failure) {
            setError(reason(failure));
        }
    };
    const runnerName = (row: AgenticoNamespaceRow) => {
        const runner = runners.find((item) => item.id === row.runner?.id);
        return runner ? nameOfHost(runner.url) : row.runner?.name ?? t.projectsDefaultRunner;
    };
    const memoryName = (row: AgenticoNamespaceRow) => {
        const memory = memories.find((item) => item.id === row.memory?.id);
        return memory ? nameOfHost(memory.apiUrl) : row.memory?.name ?? t.projectsNoMemory;
    };
    /** One choice of the card: an icon, what it is, and its select (or its value, read only). */
    const choice = (icon: string, label: string, control: React.ReactNode) => (
        <div className="flex items-start gap-3">
            <span className="mt-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon name={icon} /></span>
            <div className="min-w-0 flex-1">{control ?? <span className="text-sm">{label}</span>}</div>
        </div>
    );
    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t.projectsIntro}</p>
            {!platform && <p className="text-xs text-muted-foreground">{t.projectsReadOnly}</p>}
            {error && <Alert variant="danger">{interpolate(t.connectionsError, { error })}</Alert>}
            {rows?.map((row) => {
                const editable = platform || row.namespace === me.namespace;
                return (
                    <Card
                        key={row.namespace}
                        headerClassName="justify-between"
                        header={(
                            <>
                                <span className="font-medium">{row.name ?? row.tenant ?? row.namespace}</span>
                                <Badge variant="light"><span className="font-mono">{row.namespace}</span></Badge>
                            </>
                        )}
                    >
                        <Form appearance="empty" showNotice={false} onSubmit={() => false}>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {choice('server', runnerName(row), editable && (platform || runners.length > 0) ? (
                                    <Select
                                        name={`runner-${row.namespace}`}
                                        label={t.projectsRunner}
                                        defaultValue={row.runner?.id ?? ''}
                                        placeholderOption={{ label: t.projectsDefaultRunner, value: '' }}
                                        options={runners.map((runner) => ({ label: nameOfHost(runner.url), value: runner.id }))}
                                        onChange={({ value }: { value?: unknown }) => { if (value) void set(row.namespace, { runnerId: String(value) }); }}
                                    />
                                ) : null)}
                                {choice('database', memoryName(row), editable ? (
                                    <Select
                                        name={`memory-${row.namespace}`}
                                        label={t.projectsMemory}
                                        defaultValue={row.memory?.id ?? ''}
                                        placeholderOption={{ label: t.projectsNoMemory, value: '' }}
                                        options={memories.map((memory) => ({ label: nameOfHost(memory.apiUrl), value: memory.id }))}
                                        onChange={({ value }: { value?: unknown }) => void set(row.namespace, { memoryId: value ? String(value) : null })}
                                    />
                                ) : null)}
                            </div>
                        </Form>
                    </Card>
                );
            })}
        </div>
    );
}
