import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    AgenticoProvider,
    diffAgenticoRouting,
    matchAgenticoPage,
    mergeAgenticoRouting,
    mergeAgenticoPageRules,
    registerCrossAgentTools,
    registerSubagents,
    resolveAgenticoRoute,
    routePathOf,
    subagentToolsOf,
    useAgentico,
    useAgenticoPageContext,
    validateAgenticoRouting,
    type AgenticoPageRule,
    type AgenticoRouting,
    type SubagentManifest,
} from '../../src';
import { createOrchestratorAgentDefinition, type OrchestratorAgentContext } from '../../src/domain/orchestrator/agenticoOrchestratorAgent';

// CR-023: routing — where each subagent is offered and the tools it uses, the tools used
// everywhere, the context per page (the first matching page rule wins).

const pages: AgenticoPageRule[] = [
    { id: 'page-editor', pattern: '^/sites/(?<siteId>[^/]+)/pages/([^/]+)$', context: 'Editing page {2} of site {siteId} ({path}), {unknown} stays.' },
    { id: 'sites', pattern: '^/sites(/|$)' },
    { id: 'off', pattern: '.*', disabled: true, context: 'never' },
];

function manifest(id: string, extra: Partial<SubagentManifest> = {}): SubagentManifest {
    return {
        id,
        label: id,
        icon: 'bot',
        description: id,
        indexPath: `/${id}`,
        destinationIds: [],
        commands: [{ name: 'run', summary: `Run ${id}`, inputSchema: z.object({}), describeOutput: () => id }],
        definition: { buildContext: () => ({}), buildPrompt: () => '', buildFollowUpPrompt: () => '', parseResponse: () => null, fallback: () => ({}) },
        toParams: (input) => input,
        ...extra,
    };
}

const subagents = [
    manifest('theme', { crossAgentToolIds: ['scrape_page'] }),
    manifest('redirects', { crossAgentToolIds: ['read_sitemap', 'scrape_page'] }),
    manifest('pinned', { onlyWhenAnchored: true, crossAgentToolIds: ['list_csv'] }),
];

const routing: AgenticoRouting = {
    pages,
    subagents: {
        theme: { paths: ['^/tools/theme', '^/sites/[^/]+/branding$'] },
        redirects: { paths: ['/redirects'], tools: ['read_sitemap'] },
    },
    tools: { ask_user: { everywhere: true } },
};

describe('matchAgenticoPage', () => {
    it('takes the first matching rule, on the path only, with its groups in the context', () => {
        const match = matchAgenticoPage(pages, '/sites/acme/pages/home?tab=seo#top');
        expect(match?.rule.id).toBe('page-editor');
        expect(match?.groups).toMatchObject({ siteId: 'acme', '1': 'acme', '2': 'home' });
        expect(match?.context).toBe('Editing page home of site acme (/sites/acme/pages/home), {unknown} stays.');
    });

    it('falls to the next rule; disabled and invalid rules never match; optional groups give empty text', () => {
        expect(matchAgenticoPage(pages, '/sites/acme')?.rule.id).toBe('sites');
        expect(matchAgenticoPage(pages, '/sites/acme')?.context).toBeNull();
        expect(matchAgenticoPage(pages, '/components')).toBeNull();
        expect(matchAgenticoPage([{ id: 'bad', pattern: '([' }, { id: 'ok', pattern: '^/a$' }], '/a')?.rule.id).toBe('ok');
        expect(matchAgenticoPage([{ id: 'ci', pattern: '^/A$', flags: 'gi' }], '/a')?.rule.id).toBe('ci');
        expect(matchAgenticoPage([{ id: 'opt', pattern: '^/t(?:/(?<id>[^/]+))?$', context: 'theme [{id}] {other}' }], '/t')?.context).toBe('theme [] {other}');
    });

    it('routePathOf drops query and hash', () => {
        expect(routePathOf('/a/b?x=1#h')).toBe('/a/b');
        expect(routePathOf('/a#h?x')).toBe('/a');
    });
});

describe('resolveAgenticoRoute', () => {
    it('offers the subagents whose paths match, and the tools they use plus the ones used everywhere', () => {
        const branding = resolveAgenticoRoute(routing, '/sites/acme/branding', subagents);
        expect(branding.subagentIds).toEqual(['theme', 'pinned']); // pinned: no paths = everywhere, still only when anchored
        expect(branding.toolNames.sort()).toEqual(['ask_user', 'scrape_page']);
        expect(branding.context).toBeNull();

        const redirects = resolveAgenticoRoute(routing, '/sites/acme/redirects', subagents);
        expect(redirects.subagentIds).toEqual(['redirects', 'pinned']);
        expect(redirects.toolNames.sort()).toEqual(['ask_user', 'read_sitemap']);
        expect(redirects.page?.rule.id).toBe('sites');
    });

    it('toolsOf: the routing, else the manifest, plus the tools used everywhere', () => {
        const route = resolveAgenticoRoute(routing, '/', subagents);
        expect(route.subagentIds).toEqual(['pinned']);
        expect(route.toolNames).toEqual(['ask_user']);
        expect(route.toolsOf).toEqual({ theme: ['scrape_page', 'ask_user'], redirects: ['read_sitemap', 'ask_user'], pinned: ['list_csv', 'ask_user'] });
        expect(subagentToolsOf({}, subagents[0])).toEqual(['scrape_page']);
    });

    it('no paths declared = everywhere, [] = nowhere', () => {
        expect(resolveAgenticoRoute({}, '/x', subagents).subagentIds).toEqual(['theme', 'redirects', 'pinned']);
        expect(resolveAgenticoRoute({ subagents: { theme: { paths: [] } } }, '/x', subagents).subagentIds).toEqual(['redirects', 'pinned']);
    });
});

describe('merge and diff', () => {
    it('changes replace the default entry; page rules keep their origin and order', () => {
        const merged = mergeAgenticoRouting(routing, {
            pages: [{ id: 'sites', pattern: '^/sites/' }, { id: 'new', pattern: '^/n$' }],
            pageOrder: ['new', 'page-editor'],
            subagents: { theme: { tools: [] } },
            tools: { ask_user: { everywhere: false } },
        });
        expect(merged.pages?.map((r) => r.id)).toEqual(['new', 'page-editor', 'sites', 'off']);
        expect(merged.subagents?.theme).toEqual({ tools: [] });
        expect(merged.subagents?.redirects).toEqual(routing.subagents?.redirects);
        expect(merged.tools?.ask_user).toEqual({ everywhere: false });
        expect(mergeAgenticoPageRules(pages, { pages: [{ id: 'sites', pattern: '^/s' }, { id: 'n', pattern: '^/n' }] }).map((r) => [r.id, r.origin]))
            .toEqual([['page-editor', 'default'], ['sites', 'modified'], ['off', 'default'], ['n', 'added']]);
    });

    it('diff keeps only what differs: the same routing gives nothing', () => {
        expect(diffAgenticoRouting(routing, routing)).toEqual({});
        // An empty entry is the same as a missing one; an explicit false the same as a missing tool.
        expect(diffAgenticoRouting({}, { subagents: { theme: {} }, tools: { x: { everywhere: false } } })).toEqual({});
        const next: AgenticoRouting = {
            ...routing,
            pages: [pages[1], pages[0], pages[2]],
            subagents: { ...routing.subagents, theme: { paths: [] } },
            tools: { ask_user: { everywhere: false } },
        };
        expect(diffAgenticoRouting(routing, next)).toEqual({
            pageOrder: ['sites', 'page-editor', 'off'],
            subagents: { theme: { paths: [] } },
            tools: { ask_user: { everywhere: false } },
        });
        expect(mergeAgenticoRouting(routing, diffAgenticoRouting(routing, next))).toEqual({ ...next, pages: next.pages });
    });
});

describe('validateAgenticoRouting', () => {
    it('reports invalid patterns, ids, unknown subagents and tools', () => {
        const issues = validateAgenticoRouting({
            pages: [{ id: 'a', pattern: '(' }, { id: 'a', pattern: '^/b$' }, { id: ' ', pattern: '^/c$' }],
            subagents: { theme: { paths: ['^/ok', '['], tools: ['nope'] }, ghost: {}, pinned: { paths: ['^/p'] } },
            tools: { missing: { everywhere: true } },
        }, { subagents, toolNames: ['scrape_page'] });
        expect(issues.map((i) => [i.where, i.key, i.index ?? null, i.code, i.level])).toEqual([
            ['page', 'a', 0, 'invalid-pattern', 'error'],
            ['page', 'a', 1, 'duplicate-id', 'error'],
            ['page', ' ', 2, 'missing-id', 'error'],
            ['subagent', 'theme', 1, 'invalid-pattern', 'error'],
            ['subagent', 'theme', null, 'unknown-tool', 'error'],
            ['subagent', 'ghost', null, 'unknown-subagent', 'warning'],
            ['subagent', 'pinned', null, 'anchored-subagent', 'warning'],
            ['tool', 'missing', null, 'unknown-tool', 'warning'],
        ]);
    });
});

const tool = (name: string) => ({ name, description: name, inputSchema: z.object({}), execute: async () => ({}) });

describe('orchestrator under routing', () => {
    afterEach(() => { registerCrossAgentTools(); registerSubagents([]); });

    const labels = { unavailable: 'off', continueWithoutAi: 'go', preparing: '{label}', collecting: '{label}' };
    const run = (params: Parameters<ReturnType<typeof createOrchestratorAgentDefinition>['buildContext']>[0]) => {
        const definition = createOrchestratorAgentDefinition(labels);
        const context = definition.buildContext(params) as OrchestratorAgentContext;
        return { tools: definition.getTools!(params, context, undefined).map((t) => t.name), catalog: context.cliCatalog };
    };

    it('offers only what the route gives; the scoped subagent keeps the tools the routing gives it', () => {
        registerSubagents(subagents);
        registerCrossAgentTools(() => [tool('read_sitemap'), tool('scrape_page'), tool('list_csv')]);

        expect(run({ userGoal: '', pageContext: null, scopedSubagentId: null }).tools.sort())
            .toEqual(['list_csv', 'read_sitemap', 'redirects_run', 'scrape_page', 'theme_run']);

        const routed = run({ userGoal: '', pageContext: null, scopedSubagentId: null, route: { subagentIds: ['theme', 'pinned'], toolNames: ['scrape_page'] } });
        expect(routed.tools.sort()).toEqual(['scrape_page', 'theme_run']);
        expect(routed.catalog).not.toContain('redirects');

        const scoped = run({ userGoal: '', pageContext: null, scopedSubagentId: 'redirects', route: { subagentIds: [], toolNames: [], toolsOf: { redirects: ['read_sitemap'] } } });
        expect(scoped.tools.sort()).toEqual(['read_sitemap', 'redirects_run']);
        const manifestTools = run({ userGoal: '', pageContext: null, scopedSubagentId: 'redirects', route: { subagentIds: [], toolNames: [] } });
        expect(manifestTools.tools.sort()).toEqual(['read_sitemap', 'redirects_run', 'scrape_page']);
    });
});

describe('<AgenticoProvider route>', () => {
    afterEach(() => { registerSubagents([]); });

    function Probe({ out, pageText }: { out: { current: ReturnType<typeof useAgentico> | null }; pageText?: string }) {
        useAgenticoPageContext(pageText ?? null);
        out.current = useAgentico();
        return null;
    }

    it('exposes what is offered on the current path, the page context before the one of the page', async () => {
        registerSubagents(subagents);
        const out: { current: ReturnType<typeof useAgentico> | null } = { current: null };
        const { rerender } = render(
            <AgenticoProvider route={{ path: '/sites/acme/pages/home', defaults: routing }}><Probe out={out} pageText="The page form is open." /></AgenticoProvider>,
        );
        await act(async () => {});
        expect(out.current?.route?.page?.rule.id).toBe('page-editor');
        expect(out.current?.route?.subagentIds).toEqual(['pinned']);
        expect(out.current?.pageContext).toBe('Editing page home of site acme (/sites/acme/pages/home), {unknown} stays.\n\nThe page form is open.');

        rerender(<AgenticoProvider route={{ path: '/components', defaults: routing }}><Probe out={out} /></AgenticoProvider>);
        await act(async () => {});
        expect(out.current?.route?.page).toBeNull();
        expect(out.current?.pageContext).toBeNull();
    });
});
