// Routing (CR-023): what Agentico knows and offers at each point of the host app.
//
// Three things, each kept where people look for it (Settings › Subagents, Tools, Pages):
// - a SUBAGENT is offered on the paths it declares (regular expressions on the path; none declared =
//   everywhere) and uses some data-collection tools (none declared = the ones of its manifest,
//   SubagentManifest.crossAgentToolIds);
// - a TOOL may be used by every subagent ("everywhere"), otherwise by the subagents that name it:
//   the two views edit the same relation, it is kept on the subagent side;
// - a PAGE rule gives the model a context about where the person is: an ordered list, the FIRST
//   rule whose pattern matches the path wins.
// On a path the orchestrator offers the subagents whose paths match, and the tools they use plus
// the ones used everywhere. No routing at all (no `<AgenticoProvider route>`) = everything is
// offered, as before this CR. Routing decides what Agentico proposes, it is not access control.
//
// The host declares its defaults in code and may keep changes made by people elsewhere (its
// database, per tenant…): mergeAgenticoRouting() puts the two together, diffAgenticoRouting()
// gives back only what differs.
import type { SubagentManifest } from './subagentManifest';

/** A context for the model about a point of the host app. */
export interface AgenticoPageRule {
    /** Stable id: a saved change replaces the default rule with the same id. */
    id: string;
    /** Name shown to people. */
    label?: string;
    /** Regular expression matched against the path only (no query, no hash), e.g.
     * `^/sites/(?<siteId>[^/]+)/pages/(?<pageId>[^/]+)$`. Anchor it (`^…$`) to match the whole path. */
    pattern: string;
    /** Flags of the regular expression (`i`…). `g` and `y` are ignored. */
    flags?: string;
    /** Text for the model. `{name}` = a named group of the pattern, `{1}`, `{2}`… = numbered groups,
     * `{path}` = the whole path. A group that matched nothing (an optional one) gives an empty text;
     * a placeholder that is no group stays as it is. */
    context?: string;
    /** A disabled rule never matches (a default rule turned off by a saved change). */
    disabled?: boolean;
}

/** Where the subagent is offered and what it uses. */
export interface AgenticoSubagentRouting {
    /** Regular expressions on the path where it is offered. Absent = everywhere; `[]` = nowhere (only
     * when a chat is scoped to it: an anchor on the page, a button of the host). */
    paths?: string[];
    /** Names of the data-collection tools it uses. Absent = the ones of its manifest
     * (`crossAgentToolIds`). Tools used everywhere are added anyway. */
    tools?: string[];
}

export interface AgenticoToolRouting {
    /** Used by every subagent, so offered on every page. */
    everywhere?: boolean;
}

/** The routing of the host: its defaults in code, or those with the changes kept by people. */
export interface AgenticoRouting {
    /** Context per path, in order: the first matching rule wins. */
    pages?: AgenticoPageRule[];
    /** By subagent id. A subagent missing here: everywhere, with the tools of its manifest. */
    subagents?: Record<string, AgenticoSubagentRouting>;
    /** By tool name. A tool missing here: used by the subagents that name it. */
    tools?: Record<string, AgenticoToolRouting>;
}

/** Where a page rule comes from, after mergeAgenticoRouting(). */
export type AgenticoRoutingOrigin = 'default' | 'modified' | 'added';

export interface AgenticoPageRuleWithOrigin extends AgenticoPageRule {
    origin: AgenticoRoutingOrigin;
    /** The default rule this one changes (only when `origin` is `modified`). */
    defaultRule?: AgenticoPageRule;
}

/** Changes kept by the host over its defaults: only what differs. */
export interface AgenticoRoutingChanges {
    /** Page rules replacing a default rule with the same id, or added. */
    pages?: AgenticoPageRule[];
    /** Order of the page rules by id. Ids missing here keep their place after the listed ones. */
    pageOrder?: string[];
    /** Entries replacing the default entry of the same subagent. */
    subagents?: Record<string, AgenticoSubagentRouting>;
    /** Entries replacing the default entry of the same tool. */
    tools?: Record<string, AgenticoToolRouting>;
}

/** Where the host keeps the changes people make to its routing (its database, per tenant…). */
export interface AgenticoRoutingStore {
    /** The changes kept; nothing kept: `null` or `{}`. */
    load(): Promise<AgenticoRoutingChanges | null>;
    /** Keeps the changes (only what differs from the defaults; `{}` = back to the defaults). */
    save(changes: AgenticoRoutingChanges): Promise<void>;
}

/** The page rule matching a path. */
export interface AgenticoPageMatch {
    rule: AgenticoPageRule;
    /** Groups of the pattern: named ones by name, numbered ones by number ("1", "2"…). */
    groups: Record<string, string>;
    /** The context of the rule with its placeholders filled, `null` when the rule has none. */
    context: string | null;
}

/** What Agentico offers on a path. */
export interface AgenticoRouteMatch {
    path: string;
    /** The page rule of the path, `null` = none. */
    page: AgenticoPageMatch | null;
    /** The context of the page rule, `null` = none. */
    context: string | null;
    /** Subagents whose paths match (a subagent only for an anchored page is still offered only when scoped). */
    subagentIds: string[];
    /** Data-collection tools offered: the ones the subagents offered here use, and the ones used everywhere. */
    toolNames: string[];
    /** The tools each registered subagent uses, wherever it is offered (a scoped chat uses these). */
    toolsOf: Record<string, string[]>;
}

export type AgenticoRoutingIssueCode =
    | 'invalid-pattern'
    | 'duplicate-id'
    | 'missing-id'
    | 'unknown-subagent'
    | 'unknown-tool'
    | 'anchored-subagent';

export interface AgenticoRoutingIssue {
    /** What the issue is about: a page rule (key = its id), a subagent (its id) or a tool (its name). */
    where: 'page' | 'subagent' | 'tool';
    key: string;
    /** Index of the page rule, or of the path of the subagent, the issue is about. */
    index?: number;
    code: AgenticoRoutingIssueCode;
    /** `error`: it cannot work as written. `warning`: it works, maybe not as expected. */
    level: 'error' | 'warning';
    /** The subagent id, tool name or the error of the regular expression the issue is about. */
    detail?: string;
}

type KnownSubagent = Pick<SubagentManifest, 'id' | 'onlyWhenAnchored' | 'crossAgentToolIds'>;

/** The path matched: query and hash removed. */
export function routePathOf(location: string): string {
    const cut = location.search(/[?#]/);
    return cut === -1 ? location : location.slice(0, cut);
}

const compiled = new Map<string, RegExp | Error>();

/** The regular expression of a pattern, or its error. Cached. */
export function compileRoutePattern(pattern: string, flags = ''): RegExp | Error {
    const cleanFlags = flags.replace(/[gy]/g, '');
    const key = `${cleanFlags}/${pattern}`;
    let entry = compiled.get(key);
    if (!entry) {
        try {
            entry = new RegExp(pattern, cleanFlags);
        } catch (error) {
            entry = error instanceof Error ? error : new Error(String(error));
        }
        compiled.set(key, entry);
    }
    return entry;
}

/** Whether one of `paths` matches `location` (absent = everywhere; an invalid pattern never matches). */
export function matchesAnyPath(paths: readonly string[] | undefined, location: string): boolean {
    if (!paths) return true;
    const path = routePathOf(location);
    return paths.some((pattern) => {
        const regex = compileRoutePattern(pattern);
        return !(regex instanceof Error) && regex.test(path);
    });
}

function interpolateContext(text: string, groups: Record<string, string>, groupNames: ReadonlySet<string>, path: string): string {
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
        if (name === 'path') return path;
        if (name in groups) return groups[name];
        return groupNames.has(name) ? '' : whole;
    });
}

/** The first enabled page rule matching `location` (path, query and hash allowed: only the path counts). */
export function matchAgenticoPage(rules: readonly AgenticoPageRule[], location: string): AgenticoPageMatch | null {
    const path = routePathOf(location);
    for (const rule of rules) {
        if (rule.disabled) continue;
        const regex = compileRoutePattern(rule.pattern, rule.flags);
        if (regex instanceof Error) continue;
        const found = regex.exec(path);
        if (!found) continue;
        const groups: Record<string, string> = {};
        found.slice(1).forEach((value, i) => { if (value !== undefined) groups[String(i + 1)] = value; });
        for (const [name, value] of Object.entries(found.groups ?? {})) if (value !== undefined) groups[name] = value;
        const groupNames = new Set([...Object.keys(found.groups ?? {}), ...found.slice(1).map((_, i) => String(i + 1))]);
        return { rule, groups, context: rule.context ? interpolateContext(rule.context, groups, groupNames, path) : null };
    }
    return null;
}

/** The tools a subagent uses: its routing, else its manifest; plus the ones used everywhere. */
export function subagentToolsOf(routing: AgenticoRouting, manifest: KnownSubagent): string[] {
    const own = routing.subagents?.[manifest.id]?.tools ?? manifest.crossAgentToolIds ?? [];
    const everywhere = Object.entries(routing.tools ?? {}).filter(([, entry]) => entry.everywhere).map(([name]) => name);
    return [...new Set([...own, ...everywhere])];
}

/** What Agentico offers on `location` with `routing`, for the registered `subagents`. */
export function resolveAgenticoRoute(routing: AgenticoRouting, location: string, subagents: readonly KnownSubagent[]): AgenticoRouteMatch {
    const path = routePathOf(location);
    const page = matchAgenticoPage(routing.pages ?? [], path);
    const toolsOf = Object.fromEntries(subagents.map((manifest) => [manifest.id, subagentToolsOf(routing, manifest)]));
    const offered = subagents.filter((manifest) => matchesAnyPath(routing.subagents?.[manifest.id]?.paths, path));
    const everywhere = Object.entries(routing.tools ?? {}).filter(([, entry]) => entry.everywhere).map(([name]) => name);
    const toolNames = [...new Set([
        ...offered.filter((manifest) => !manifest.onlyWhenAnchored).flatMap((manifest) => toolsOf[manifest.id]),
        ...everywhere,
    ])];
    return { path, page, context: page?.context ?? null, subagentIds: offered.map((manifest) => manifest.id), toolNames, toolsOf };
}

/** The page rules of the defaults with the changes, each one with its origin. */
export function mergeAgenticoPageRules(
    defaults: readonly AgenticoPageRule[],
    changes?: Pick<AgenticoRoutingChanges, 'pages' | 'pageOrder'> | null,
): AgenticoPageRuleWithOrigin[] {
    const changed = new Map((changes?.pages ?? []).map((rule) => [rule.id, rule]));
    const defaultIds = new Set(defaults.map((rule) => rule.id));
    const merged: AgenticoPageRuleWithOrigin[] = [
        ...defaults.map((rule): AgenticoPageRuleWithOrigin => {
            const change = changed.get(rule.id);
            return change ? { ...change, origin: 'modified', defaultRule: rule } : { ...rule, origin: 'default' };
        }),
        ...(changes?.pages ?? []).filter((rule) => !defaultIds.has(rule.id)).map((rule): AgenticoPageRuleWithOrigin => ({ ...rule, origin: 'added' })),
    ];
    const order = changes?.pageOrder ?? [];
    if (order.length === 0) return merged;
    const rank = new Map(order.map((id, i) => [id, i]));
    // Stable: listed ids first in their order, the others after them in their own order.
    return merged
        .map((rule, i) => ({ rule, i }))
        .sort((a, b) => (rank.get(a.rule.id) ?? order.length + a.i) - (rank.get(b.rule.id) ?? order.length + b.i))
        .map(({ rule }) => rule);
}

/** The defaults of the host with the changes kept elsewhere. */
export function mergeAgenticoRouting(defaults: AgenticoRouting, changes?: AgenticoRoutingChanges | null): AgenticoRouting {
    return {
        pages: mergeAgenticoPageRules(defaults.pages ?? [], changes).map(stripOrigin),
        subagents: { ...defaults.subagents, ...changes?.subagents },
        tools: { ...defaults.tools, ...changes?.tools },
    };
}

function stripOrigin({ origin: _origin, defaultRule: _defaultRule, ...rule }: AgenticoPageRule & Partial<AgenticoPageRuleWithOrigin>): AgenticoPageRule {
    return rule;
}

const normPage = (rule: AgenticoPageRule) => JSON.stringify({
    id: rule.id, label: rule.label ?? '', pattern: rule.pattern, flags: rule.flags ?? '', context: rule.context ?? '', disabled: rule.disabled ?? false,
});
const normSubagent = (entry: AgenticoSubagentRouting | undefined) => JSON.stringify({ paths: entry?.paths ?? null, tools: entry?.tools ?? null });
const normTool = (entry: AgenticoToolRouting | undefined) => JSON.stringify({ everywhere: entry?.everywhere ?? false });

/** What a host saves to get `next` back from its `defaults` with mergeAgenticoRouting(): only the
 * page rules, subagents and tools that differ, and the order of the page rules when it changed. */
export function diffAgenticoRouting(defaults: AgenticoRouting, next: AgenticoRouting): AgenticoRoutingChanges {
    const changes: AgenticoRoutingChanges = {};
    const defaultPages = defaults.pages ?? [];
    const byId = new Map(defaultPages.map((rule) => [rule.id, rule]));
    const pages = (next.pages ?? []).map(stripOrigin);
    const changedPages = pages.filter((rule) => {
        const original = byId.get(rule.id);
        return !original || normPage(original) !== normPage(rule);
    });
    if (changedPages.length > 0) changes.pages = changedPages;
    const defaultOrder = defaultPages.map((rule) => rule.id);
    const order = pages.map((rule) => rule.id);
    if (order.length !== defaultOrder.length || order.some((id, i) => id !== defaultOrder[i])) changes.pageOrder = order;

    const subagents = Object.fromEntries(Object.entries(next.subagents ?? {})
        .filter(([id, entry]) => normSubagent(entry) !== normSubagent(defaults.subagents?.[id])));
    if (Object.keys(subagents).length > 0) changes.subagents = subagents;
    const tools = Object.fromEntries(Object.entries(next.tools ?? {})
        .filter(([name, entry]) => normTool(entry) !== normTool(defaults.tools?.[name])));
    if (Object.keys(tools).length > 0) changes.tools = tools;
    return changes;
}

/** Problems of a routing, against the subagents and data-collection tools the host registers. */
export function validateAgenticoRouting(
    routing: AgenticoRouting,
    known: { subagents: readonly KnownSubagent[]; toolNames: readonly string[] },
): AgenticoRoutingIssue[] {
    const issues: AgenticoRoutingIssue[] = [];
    const seen = new Set<string>();
    (routing.pages ?? []).forEach((rule, index) => {
        const base = { where: 'page' as const, key: rule.id, index };
        if (!rule.id.trim()) issues.push({ ...base, code: 'missing-id', level: 'error' });
        else if (seen.has(rule.id)) issues.push({ ...base, code: 'duplicate-id', level: 'error' });
        seen.add(rule.id);
        const regex = compileRoutePattern(rule.pattern, rule.flags);
        if (regex instanceof Error) issues.push({ ...base, code: 'invalid-pattern', level: 'error', detail: regex.message });
    });
    const subagents = new Map(known.subagents.map((manifest) => [manifest.id, manifest]));
    const tools = new Set(known.toolNames);
    for (const [id, entry] of Object.entries(routing.subagents ?? {})) {
        const manifest = subagents.get(id);
        if (!manifest) { issues.push({ where: 'subagent', key: id, code: 'unknown-subagent', level: 'warning', detail: id }); continue; }
        (entry.paths ?? []).forEach((pattern, index) => {
            const regex = compileRoutePattern(pattern);
            if (regex instanceof Error) issues.push({ where: 'subagent', key: id, index, code: 'invalid-pattern', level: 'error', detail: regex.message });
        });
        if (manifest.onlyWhenAnchored && entry.paths) issues.push({ where: 'subagent', key: id, code: 'anchored-subagent', level: 'warning', detail: id });
        for (const name of entry.tools ?? []) {
            if (!tools.has(name)) issues.push({ where: 'subagent', key: id, code: 'unknown-tool', level: 'error', detail: name });
        }
    }
    for (const name of Object.keys(routing.tools ?? {})) {
        if (!tools.has(name)) issues.push({ where: 'tool', key: name, code: 'unknown-tool', level: 'warning', detail: name });
    }
    return issues;
}
