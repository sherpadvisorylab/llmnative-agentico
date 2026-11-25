// CR-023: the routing in the settings modal, in three tabs.
// - Subagents: a box per subagent (where it is offered, what it does, the tools it uses); a click
//   opens a modal on top to change its paths and its tools.
// - Tools: a box per data-collection tool (what it does, the subagents that use it, or all of them);
//   a click opens a modal to choose them.
// - Pages: the context the model gets per path, an ordered list (the first matching rule wins).
// Changes go to the host store (route.store); without it, or read-only, the boxes are only shown.
import React, { useMemo, useRef, useState } from 'react';
import {
    ActionButton,
    Alert,
    Badge,
    Card,
    Checklist,
    Form,
    Modal,
    String as TextInput,
    Switch,
    TextArea,
    interpolate,
    proxyFetch,
    useFormController,
} from '@llmnative/react';
import { useAgenticoI18n, type AgenticoDict } from '../i18n';
import { getSubagentRegistry } from '../domain/subagentRegistry';
import { createCrossAgentTools } from '../domain/crossAgentTools';
import {
    matchAgenticoPage,
    matchesAnyPath,
    subagentToolsOf,
    validateAgenticoRouting,
    type AgenticoPageRule,
    type AgenticoPageRuleWithOrigin,
    type AgenticoRouting,
    type AgenticoRoutingIssue,
    type AgenticoRoutingIssueCode,
} from '../domain/routing';
import { useAgentico } from './AgenticoContext';

interface KnownSubagent { id: string; label: string; description: string; onlyWhenAnchored?: boolean; crossAgentToolIds?: string[] }
interface Known {
    subagents: KnownSubagent[];
    tools: { name: string; description: string }[];
    toolNames: string[];
}

/** The subagents and the data-collection tools the host registers. The tools are only listed, never run. */
function useKnown(): Known {
    return useMemo(() => {
        const subagents = getSubagentRegistry().map((m) => ({ id: m.id, label: m.label, description: m.description, onlyWhenAnchored: m.onlyWhenAnchored, crossAgentToolIds: m.crossAgentToolIds }));
        const tools = createCrossAgentTools({ attachmentsRef: undefined, collected: {}, proxyFetch }).map((tool) => ({ name: tool.name, description: tool.description }));
        return { subagents, tools, toolNames: tools.map((tool) => tool.name) };
    }, []);
}

const ISSUE_KEYS: Record<AgenticoRoutingIssueCode, keyof AgenticoDict> = {
    'invalid-pattern': 'routingIssueInvalidPattern',
    'duplicate-id': 'routingIssueDuplicateId',
    'missing-id': 'routingIssueMissingId',
    'unknown-subagent': 'routingIssueUnknownSubagent',
    'unknown-tool': 'routingIssueUnknownTool',
    'anchored-subagent': 'routingIssueAnchoredSubagent',
};

function issueText(t: AgenticoDict, issue: AgenticoRoutingIssue): string {
    return interpolate(t[ISSUE_KEYS[issue.code]], { detail: issue.detail ?? '' });
}

/** A tool name made readable: `read_sitemap` → "Read sitemap". The name itself stays in the editor title. */
export function toolLabel(name: string): string {
    const words = name.replace(/[_-]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The tools as one badge each. */
function ToolBadges({ names }: { names: string[] }) {
    return <>{names.map((name) => <Badge key={name} variant="info">{toolLabel(name)}</Badge>)}</>;
}

const errorOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

function Issues({ t, issues }: { t: AgenticoDict; issues: AgenticoRoutingIssue[] }) {
    return <>{issues.map((issue, i) => <p key={i} className={issue.level === 'error' ? 'text-xs text-destructive' : 'text-xs text-warning'}>{issueText(t, issue)}</p>)}</>;
}

/** A box that opens its editor when the routing can be changed. */
function Box({ onOpen, children }: { onOpen: (() => void) | null; children: React.ReactNode }) {
    if (!onOpen) return <Card>{children}</Card>;
    return (
        <button type="button" className="block w-full rounded-lg text-left transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={onOpen}>
            <Card>{children}</Card>
        </button>
    );
}

/** State shared by the three tabs: what is kept, and the save of a new routing. */
function useRoutingEditor() {
    const t = useAgenticoI18n();
    const { route, routing: state } = useAgentico();
    const known = useKnown();
    const [saveError, setSaveError] = useState<string | null>(null);
    const persist = async (next: AgenticoRouting) => {
        if (!state.save) return;
        setSaveError(null);
        try {
            await state.save(next);
        } catch (error) {
            setSaveError(interpolate(t.routingSaveError, { error: errorOf(error) }));
            throw error;
        }
    };
    const notices = (
        <>
            {state.error && <Alert variant="warning">{interpolate(t.routingLoadError, { error: state.error })}</Alert>}
            {saveError && <Alert variant="danger" onClose={() => setSaveError(null)}>{saveError}</Alert>}
            {!state.save && state.path !== null && <p className="text-xs text-muted-foreground">{t.routingReadOnly}</p>}
            {state.path === null && <p className="text-xs text-muted-foreground">{t.routingNoRouting}</p>}
        </>
    );
    return { t, route, state, known, persist, notices };
}

/** The editor modal on top of the settings modal: the settings one is dimmed behind it. */
function EditorModal({ title, titleBefore, onClose, onSave, onRestore, errors, children }: {
    title: string;
    /** Shown left of the title, in the head of the modal (the switch "Active" of a page rule). */
    titleBefore?: React.ReactNode;
    onClose: () => void;
    onSave: () => Promise<void>;
    /** Present when what is edited differs from the default of the host. */
    onRestore?: (() => Promise<void>) | null;
    errors: string[];
    children: React.ReactNode;
}) {
    const t = useAgenticoI18n();
    const [saving, setSaving] = useState(false);
    const save = async () => {
        setSaving(true);
        try { await onSave(); } finally { setSaving(false); }
    };
    return (
        <Modal
            title={titleBefore ? <span className="flex items-center gap-3">{titleBefore}<span>{title}</span></span> : title}
            position="right"
            size="md"
            onClose={onClose}
            footer={(
                <>
                    {onRestore && <ActionButton variant="outline-secondary" icon="rotate-ccw" label={t.routingRestore} onClick={() => void onRestore()} disabled={saving} className="mr-auto" />}
                    <ActionButton variant="primary" label={t.routingSave} onClick={save} disabled={saving} />
                    <ActionButton variant="link" label={t.routingCancel} onClick={onClose} />
                </>
            )}
        >
            <div className="space-y-4">
                {children}
                {errors.map((error, i) => <p key={i} className="text-sm text-destructive">{error}</p>)}
            </div>
        </Modal>
    );
}

// ── Subagents ───────────────────────────────────────────────────────────────────────────────────

function Here({ t }: { t: AgenticoDict }) {
    const { route } = useAgentico();
    const known = useKnown();
    if (!route) return null;
    const labels = new Map(known.subagents.map((s) => [s.id, s.label]));
    const offered = route.subagentIds.filter((id) => !known.subagents.find((s) => s.id === id)?.onlyWhenAnchored);
    return (
        <Card>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t.routingHere}</dt>
                <dd><code className="break-all text-xs">{route.path}</code></dd>
                <dt className="text-muted-foreground">{t.routingContext}</dt>
                <dd className="whitespace-pre-wrap">{route.context ?? <span className="text-muted-foreground">{t.routingNoContext}</span>}</dd>
                <dt className="text-muted-foreground">{t.routingOfferedHere}</dt>
                <dd className="flex flex-wrap gap-1">
                    {offered.length === 0 && <span className="text-muted-foreground">{t.routingNone}</span>}
                    {offered.map((id) => <Badge key={id} variant="success">{labels.get(id) ?? id}</Badge>)}
                    <ToolBadges names={route.toolNames} />
                </dd>
            </dl>
        </Card>
    );
}

/** One path of the subagent being edited, with a key that survives removing the ones before it. */
interface PathRow { key: number; value: string }

function SubagentEditor({ t, subagent, routing, defaults: hostDefaults, modified, known, onSave, onClose }: {
    t: AgenticoDict;
    subagent: KnownSubagent;
    routing: AgenticoRouting;
    /** The routing of the host in code, for "restore". */
    defaults: AgenticoRouting;
    modified: boolean;
    known: Known;
    onSave: (next: AgenticoRouting) => Promise<void>;
    onClose: () => void;
}) {
    const entry = routing.subagents?.[subagent.id];
    const nextKey = useRef(0);
    const row = (value: string): PathRow => ({ key: nextKey.current++, value });
    const [everywhere, setEverywhere] = useState(!entry?.paths);
    const [rows, setRows] = useState<PathRow[]>(() => (entry?.paths ?? []).map(row));
    const [tools, setTools] = useState<string[]>(() => entry?.tools ?? subagent.crossAgentToolIds ?? []);
    const [tryPath, setTryPath] = useState(useAgentico().routing.path ?? '');
    const [errors, setErrors] = useState<string[]>([]);
    const everywhereTools = Object.entries(routing.tools ?? {}).filter(([, e]) => e.everywhere).map(([name]) => name);
    const paths = rows.map((r) => r.value.trim()).filter(Boolean);
    const defaults = useMemo(() => ({
        everywhere: everywhere ? 'true' : '',
        tools,
        tryPath,
        ...Object.fromEntries(rows.map((r) => [`path_${r.key}`, r.value])),
    // The form is filled once; the rows added later start empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    const save = async () => {
        const next: AgenticoRouting = {
            ...routing,
            subagents: { ...routing.subagents, [subagent.id]: { ...(everywhere ? {} : { paths }), tools: tools.filter((name) => !everywhereTools.includes(name)) } },
        };
        const problems = validateAgenticoRouting(next, { subagents: known.subagents, toolNames: known.toolNames })
            .filter((issue) => issue.where === 'subagent' && issue.key === subagent.id && issue.level === 'error');
        if (problems.length > 0) { setErrors(problems.map((issue) => issueText(t, issue))); return; }
        try {
            await onSave(next);
            onClose();
        } catch (error) {
            setErrors([interpolate(t.routingSaveError, { error: errorOf(error) })]);
        }
    };

    const restore = async () => {
        try {
            await onSave({ ...routing, subagents: { ...routing.subagents, [subagent.id]: hostDefaults.subagents?.[subagent.id] ?? {} } });
            onClose();
        } catch (error) {
            setErrors([interpolate(t.routingSaveError, { error: errorOf(error) })]);
        }
    };

    const offeredOnTry = tryPath.trim() ? matchesAnyPath(everywhere ? undefined : paths, tryPath.trim()) : null;

    return (
        <EditorModal title={interpolate(t.routingEditOf, { label: subagent.label })} onClose={onClose} onSave={save} onRestore={modified ? restore : null} errors={errors}>
            <p className="text-sm text-muted-foreground">{subagent.description}</p>
            {subagent.onlyWhenAnchored && <Alert variant="info">{interpolate(t.routingIssueAnchoredSubagent, { detail: subagent.label })}</Alert>}
            <Form appearance="empty" showNotice={false} defaultValues={defaults}>
                <div className="space-y-4">
                    <Switch name="everywhere" label={t.routingFieldEverywhere} valueChecked="true" onChange={({ value }) => setEverywhere(Boolean(value))} />
                    {!everywhere && (
                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">{t.routingFieldPaths}</legend>
                            <p className="text-xs text-muted-foreground">{t.routingFieldPathsFeedback}</p>
                            {rows.length === 0 && <p className="text-xs text-muted-foreground">{t.routingNowhere}</p>}
                            {rows.map((r) => (
                                <div key={r.key} className="flex items-end gap-1">
                                    <div className="min-w-0 flex-1">
                                        <TextInput name={`path_${r.key}`} placeholder="^/sites/[^/]+/pages/[^/]+$" onChange={({ value }) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, value: String(value ?? '') } : x)))} />
                                    </div>
                                    <ActionButton icon="x" variant="link" title={t.routingRemovePath} ariaLabel={t.routingRemovePath} onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))} />
                                </div>
                            ))}
                            <ActionButton icon="plus" variant="outline-secondary" label={t.routingAddPath} onClick={() => setRows((all) => [...all, row('')])} />
                        </fieldset>
                    )}
                    <TextInput name="tryPath" label={t.routingTryPath} feedback={t.routingTryPathFeedback} onChange={({ value }) => setTryPath(String(value ?? ''))} />
                    {offeredOnTry !== null && <Badge variant={offeredOnTry ? 'success' : 'secondary'}>{offeredOnTry ? t.routingOffered : t.routingNotOffered}</Badge>}
                    <Checklist
                        name="tools"
                        label={t.routingFieldTools}
                        options={known.tools.map((tool) => ({ value: tool.name, label: toolLabel(tool.name) }))}
                        onChange={({ value }) => setTools(Array.isArray(value) ? value.map(String) : value ? [String(value)] : [])}
                    />
                    {everywhereTools.length > 0 && <p className="text-xs text-muted-foreground">{interpolate(t.routingToolsEverywhereNote, { tools: everywhereTools.map(toolLabel).join(', ') })}</p>}
                </div>
            </Form>
        </EditorModal>
    );
}

export function AgenticoSubagentsSettings({ onStack }: { onStack?: (open: boolean) => void }) {
    const { t, route, state, known, persist, notices } = useRoutingEditor();
    const [editing, setEditing] = useState<KnownSubagent | null>(null);
    const issues = useMemo(() => validateAgenticoRouting(state.routing, known), [state.routing, known]);
    const open = (subagent: KnownSubagent | null) => { setEditing(subagent); onStack?.(subagent !== null); };

    return (
        <div className="space-y-4">
            {notices}
            <Here t={t} />
            <p className="text-xs text-muted-foreground">{t.routingSubagentsIntro}</p>
            {known.subagents.map((subagent) => {
                const paths = state.routing.subagents?.[subagent.id]?.paths;
                const tools = subagentToolsOf(state.routing, subagent);
                const here = route ? route.subagentIds.includes(subagent.id) && !subagent.onlyWhenAnchored : null;
                return (
                    <Box key={subagent.id} onOpen={state.save ? () => open(subagent) : null}>
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">{subagent.label}</span>
                                <code className="text-xs text-muted-foreground">{subagent.id}</code>
                                {state.changes.subagents?.[subagent.id] && <Badge variant="warning">{t.routingModified}</Badge>}
                                {subagent.onlyWhenAnchored
                                    ? <Badge variant="info" className="ml-auto">{t.routingOnlyAnchored}</Badge>
                                    : here !== null && <Badge variant={here ? 'success' : 'secondary'} className="ml-auto">{here ? t.routingOffered : t.routingNotOffered}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{subagent.description}</p>
                            <div className="grid grid-cols-[7rem_1fr] gap-1 text-xs">
                                <span className="text-muted-foreground">{t.routingWhere}</span>
                                <span className="flex flex-col gap-0.5">
                                    {!paths && <span>{t.routingEverywhere}</span>}
                                    {paths?.length === 0 && <span>{t.routingNowhere}</span>}
                                    {paths?.map((p, i) => <code key={i} className="break-all rounded bg-muted px-1.5 py-0.5">{p}</code>)}
                                </span>
                                <span className="text-muted-foreground">{t.routingUses}</span>
                                <span className="flex flex-wrap gap-1">
                                    {tools.length === 0 && <span>{t.routingNoTools}</span>}
                                    <ToolBadges names={tools} />
                                </span>
                            </div>
                            <Issues t={t} issues={issues.filter((issue) => issue.where === 'subagent' && issue.key === subagent.id)} />
                        </div>
                    </Box>
                );
            })}
            {editing && <SubagentEditor t={t} subagent={editing} routing={state.routing} defaults={state.defaults} modified={!!state.changes.subagents?.[editing.id]} known={known} onSave={persist} onClose={() => open(null)} />}
        </div>
    );
}

// ── Tools ───────────────────────────────────────────────────────────────────────────────────────

function ToolEditor({ t, tool, routing, known, onSave, onClose }: {
    t: AgenticoDict;
    tool: { name: string; description: string };
    routing: AgenticoRouting;
    known: Known;
    onSave: (next: AgenticoRouting) => Promise<void>;
    onClose: () => void;
}) {
    const usersNow = known.subagents.filter((s) => (routing.subagents?.[s.id]?.tools ?? s.crossAgentToolIds ?? []).includes(tool.name)).map((s) => s.id);
    const [everywhere, setEverywhere] = useState(!!routing.tools?.[tool.name]?.everywhere);
    const [users, setUsers] = useState<string[]>(usersNow);
    const [errors, setErrors] = useState<string[]>([]);
    const defaults = useMemo(() => ({ everywhere: everywhere ? 'true' : '', users }), // filled once
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []);

    const save = async () => {
        // The relation is kept on the subagent side: only the subagents whose use changes get an entry.
        const subagents = { ...routing.subagents };
        for (const s of known.subagents) {
            const own = routing.subagents?.[s.id]?.tools ?? s.crossAgentToolIds ?? [];
            const uses = users.includes(s.id);
            if (uses === own.includes(tool.name)) continue;
            subagents[s.id] = { ...routing.subagents?.[s.id], tools: uses ? [...own, tool.name] : own.filter((name) => name !== tool.name) };
        }
        // An explicit `false`, not a missing entry: the merge would bring a default "everywhere" back.
        const tools = { ...routing.tools, [tool.name]: { everywhere } };
        try {
            await onSave({ ...routing, subagents, tools });
            onClose();
        } catch (error) {
            setErrors([interpolate(t.routingSaveError, { error: errorOf(error) })]);
        }
    };

    return (
        <EditorModal title={interpolate(t.routingEditOf, { label: toolLabel(tool.name) })} onClose={onClose} onSave={save} errors={errors}>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
            <Form appearance="empty" showNotice={false} defaultValues={defaults}>
                <div className="space-y-4">
                    <Switch name="everywhere" label={t.routingFieldAllSubagents} valueChecked="true" onChange={({ value }) => setEverywhere(Boolean(value))} />
                    {!everywhere && (
                        <Checklist
                            name="users"
                            label={t.routingFieldUsedBy}
                            options={known.subagents.map((s) => ({ value: s.id, label: s.label }))}
                            onChange={({ value }) => setUsers(Array.isArray(value) ? value.map(String) : value ? [String(value)] : [])}
                        />
                    )}
                </div>
            </Form>
        </EditorModal>
    );
}

export function AgenticoToolsSettings({ onStack }: { onStack?: (open: boolean) => void }) {
    const { t, route, state, known, persist, notices } = useRoutingEditor();
    const [editing, setEditing] = useState<{ name: string; description: string } | null>(null);
    const open = (tool: { name: string; description: string } | null) => { setEditing(tool); onStack?.(tool !== null); };

    return (
        <div className="space-y-4">
            {notices}
            <p className="text-xs text-muted-foreground">{t.routingToolsIntro}</p>
            {known.tools.map((tool) => {
                const everywhere = !!state.routing.tools?.[tool.name]?.everywhere;
                const users = known.subagents.filter((s) => subagentToolsOf(state.routing, s).includes(tool.name));
                const here = route ? route.toolNames.includes(tool.name) : null;
                return (
                    <Box key={tool.name} onOpen={state.save ? () => open(tool) : null}>
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">{toolLabel(tool.name)}</span>
                                <code className="text-xs text-muted-foreground">{tool.name}</code>
                                {state.changes.tools?.[tool.name] && <Badge variant="warning">{t.routingModified}</Badge>}
                                {here !== null && <Badge variant={here ? 'success' : 'secondary'} className="ml-auto">{here ? t.routingOffered : t.routingNotOffered}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{tool.description}</p>
                            <div className="flex flex-wrap items-center gap-1 text-xs">
                                <span className="mr-1 text-muted-foreground">{t.routingUsedBy}</span>
                                {everywhere && <Badge variant="primary">{t.routingAllSubagents}</Badge>}
                                {!everywhere && users.length === 0 && <span>{t.routingNoSubagents}</span>}
                                {!everywhere && users.map((s) => <Badge key={s.id} variant="primary">{s.label}</Badge>)}
                            </div>
                        </div>
                    </Box>
                );
            })}
            {editing && <ToolEditor t={t} tool={editing} routing={state.routing} known={known} onSave={persist} onClose={() => open(null)} />}
        </div>
    );
}

// ── Pages ───────────────────────────────────────────────────────────────────────────────────────

/** The editor of a page rule. `flags` is not shown (only `i` would matter, paths are lower case): kept as it is.
 * `active`: the switch on = the rule applies; a default rule is switched off instead of deleted. */
export type AgenticoPageRuleForm = { id: string; label: string; pattern: string; flags: string; context: string; active: string };

function toForm(rule: AgenticoPageRule | null): AgenticoPageRuleForm {
    return {
        id: rule?.id ?? '',
        label: rule?.label ?? '',
        pattern: rule?.pattern ?? '',
        flags: rule?.flags ?? '',
        context: rule?.context ?? '',
        active: rule?.disabled ? '' : 'true',
    };
}

/** The page rule written in the editor; empty optional fields left out. */
export function pageRuleFromForm(record: Partial<Record<keyof AgenticoPageRuleForm, unknown>>): AgenticoPageRule {
    const text = (value: unknown) => String(value ?? '').trim();
    const label = text(record.label);
    const flags = text(record.flags);
    const context = text(record.context);
    return {
        id: text(record.id),
        ...(label ? { label } : {}),
        pattern: text(record.pattern),
        ...(flags ? { flags } : {}),
        ...(context ? { context } : {}),
        ...(record.active ? {} : { disabled: true }),
    };
}

const ORIGIN_VARIANT = { default: 'secondary', modified: 'warning', added: 'info' } as const;

function PageEditor({ t, rule, index, pages, routing, known, onSave, onClose }: {
    t: AgenticoDict;
    /** null = a new rule, added first (the first matching rule wins). */
    rule: AgenticoPageRule | null;
    index: number;
    pages: AgenticoPageRule[];
    routing: AgenticoRouting;
    known: Known;
    onSave: (next: AgenticoRouting) => Promise<void>;
    onClose: () => void;
}) {
    const form = useFormController();
    const initial = useMemo(() => toForm(rule), [rule]);
    const [active, setActive] = useState(initial.active);
    const [errors, setErrors] = useState<string[]>([]);

    const save = async () => {
        const edited = pageRuleFromForm({ ...initial, ...(form.record ?? {}), active, ...(rule ? { id: rule.id } : {}) } as Partial<Record<keyof AgenticoPageRuleForm, unknown>>);
        const position = rule ? index : 0;
        const nextPages = rule ? pages.map((r, i) => (i === index ? edited : r)) : [edited, ...pages];
        const messages = validateAgenticoRouting({ pages: nextPages }, known)
            .filter((issue) => issue.where === 'page' && issue.index === position && issue.level === 'error')
            .map((issue) => issueText(t, issue));
        if (!edited.pattern) messages.push(interpolate(t.routingIssueInvalidPattern, { detail: t.routingPatternRequired }));
        if (messages.length > 0) { setErrors(messages); return; }
        try {
            await onSave({ ...routing, pages: nextPages });
            onClose();
        } catch (error) {
            setErrors([interpolate(t.routingSaveError, { error: errorOf(error) })]);
        }
    };

    return (
        <EditorModal
            title={rule ? interpolate(t.routingEditOf, { label: rule.label ?? rule.id }) : t.routingNewRule}
            titleBefore={(
                // Its own form: the head of the modal is outside the form of the rule.
                <Form appearance="empty" showNotice={false} defaultValues={{ active: initial.active }}>
                    <Switch name="active" valueChecked="true" title={t.routingFieldActiveFeedback} ariaLabel={t.routingFieldActive} onChange={({ value }) => setActive(value ? 'true' : '')} />
                </Form>
            )}
            onClose={onClose}
            onSave={save}
            errors={errors}
        >
            {!active && <Alert variant="warning">{t.routingFieldActiveFeedback}</Alert>}
            <Form controller={form} appearance="empty" showNotice={false} defaultValues={initial}>
                <div className="space-y-3">
                    {!rule && <TextInput name="id" label={t.routingFieldId} feedback={t.routingFieldIdFeedback} required />}
                    <TextInput name="label" label={t.routingFieldLabel} />
                    <TextInput name="pattern" label={t.routingFieldPattern} feedback={t.routingFieldPatternFeedback} required />
                    <TextArea name="context" label={t.routingContext} feedback={t.routingFieldContextFeedback} minHeight={120} />
                </div>
            </Form>
        </EditorModal>
    );
}

function PageTester({ t, pages, start }: { t: AgenticoDict; pages: readonly AgenticoPageRule[]; start: string }) {
    const [path, setPath] = useState(start);
    const match = useMemo(() => (path.trim() ? matchAgenticoPage(pages, path.trim()) : null), [pages, path]);
    return (
        <div className="space-y-1">
            <Form appearance="empty" showNotice={false} defaultValues={{ path: start }}>
                <TextInput name="path" label={t.routingTryPath} feedback={t.routingTryPathFeedback} onChange={({ value }) => setPath(String(value ?? ''))} />
            </Form>
            {path.trim() && (
                <p className="text-sm">
                    {match
                        ? <><span className="font-medium">{match.rule.label ?? match.rule.id}</span>{match.context ? <span className="block whitespace-pre-wrap text-xs text-muted-foreground">{match.context}</span> : null}</>
                        : <span className="text-muted-foreground">{t.routingNoPage}</span>}
                </p>
            )}
        </div>
    );
}

export function AgenticoPagesSettings({ onStack }: { onStack?: (open: boolean) => void }) {
    const { t, state, known, persist, notices } = useRoutingEditor();
    const pages = state.pages;
    const issues = useMemo(() => validateAgenticoRouting({ pages }, known), [pages, known]);
    const [editing, setEditing] = useState<{ rule: AgenticoPageRuleWithOrigin | null; index: number } | null>(null);
    const open = (next: typeof editing) => { setEditing(next); onStack?.(next !== null); };
    const plain = (): AgenticoPageRule[] => pages.map(({ origin: _origin, defaultRule: _defaultRule, ...rule }) => rule);
    const write = (nextPages: AgenticoPageRule[]) => { void persist({ ...state.routing, pages: nextPages }).catch(() => undefined); };
    const move = (index: number, delta: -1 | 1) => {
        const next = plain();
        const [moved] = next.splice(index, 1);
        next.splice(index + delta, 0, moved);
        write(next);
    };
    const current = state.path !== null ? matchAgenticoPage(pages, state.path) : null;

    return (
        <div className="space-y-4">
            {notices}
            <div className="flex items-start gap-2">
                <p className="flex-1 text-xs text-muted-foreground">{t.routingPagesIntro}</p>
                {state.save && <ActionButton icon="plus" label={t.routingNewRule} variant="outline-secondary" onClick={() => open({ rule: null, index: 0 })} />}
            </div>
            <PageTester t={t} pages={pages} start={state.path ?? ''} />
            {pages.map((rule, index) => {
                const origin = { default: t.routingOriginDefault, modified: t.routingOriginModified, added: t.routingOriginAdded }[rule.origin];
                return (
                    <div key={rule.id} className="flex items-start gap-2">
                        <span className="mt-4 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                            <Box onOpen={state.save ? () => open({ rule, index }) : null}>
                                <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-sm font-medium">{rule.label ?? rule.id}</span>
                                        <Badge variant={ORIGIN_VARIANT[rule.origin]}>{origin}</Badge>
                                        {rule.disabled && <Badge variant="dark">{t.routingRuleOff}</Badge>}
                                        {current?.rule.id === rule.id && <Badge variant="success" className="ml-auto">{t.routingHereBadge}</Badge>}
                                    </div>
                                    <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{rule.pattern}{rule.flags ? `  /${rule.flags}` : ''}</code>
                                    {rule.context && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{rule.context}</p>}
                                    <Issues t={t} issues={issues.filter((issue) => issue.index === index)} />
                                </div>
                            </Box>
                        </div>
                        {state.save && (
                            <div className="mt-2 flex shrink-0 flex-col">
                                <ActionButton icon="arrow-up" title={t.routingMoveUp} ariaLabel={t.routingMoveUp} variant="link" disabled={index === 0} onClick={() => move(index, -1)} />
                                <ActionButton icon="arrow-down" title={t.routingMoveDown} ariaLabel={t.routingMoveDown} variant="link" disabled={index === pages.length - 1} onClick={() => move(index, 1)} />
                                {rule.origin === 'modified' && <ActionButton icon="rotate-ccw" title={t.routingRestore} ariaLabel={t.routingRestore} variant="link" onClick={() => write(plain().map((r, i) => (i === index && rule.defaultRule ? rule.defaultRule : r)))} />}
                                {rule.origin === 'added' && <ActionButton icon="trash-2" title={t.routingRemove} ariaLabel={t.routingRemove} variant="link" onClick={() => write(plain().filter((_, i) => i !== index))} />}
                            </div>
                        )}
                    </div>
                );
            })}
            {editing && (
                <PageEditor
                    t={t}
                    rule={editing.rule}
                    index={editing.index}
                    pages={plain()}
                    routing={state.routing}
                    known={known}
                    onSave={persist}
                    onClose={() => open(null)}
                />
            )}
        </div>
    );
}
