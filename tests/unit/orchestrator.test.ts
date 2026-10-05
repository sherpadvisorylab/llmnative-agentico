import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    agenticoPromptsIt,
    configureAgenticoPrompts,
    registerCrossAgentTools,
    registerSubagents,
    resetAgenticoPrompts,
    type SubagentManifest,
} from '../../src';
import { createOrchestratorAgentDefinition, type OrchestratorAgentContext } from '../../src/domain/orchestrator/agenticoOrchestratorAgent';

// buildContext may be async in general; the orchestrator's is synchronous.
const contextOf = (definition: ReturnType<typeof createOrchestratorAgentDefinition>, params: Parameters<ReturnType<typeof createOrchestratorAgentDefinition>['buildContext']>[0]) =>
    definition.buildContext(params) as OrchestratorAgentContext;

const labels = { unavailable: 'AI off', continueWithoutAi: 'go on', preparing: 'Preparing {label}…', collecting: 'Collecting {label}…' };

function mappingManifest(withCollected?: SubagentManifest['withCollected']): SubagentManifest {
    return {
        id: 'mapping',
        label: 'Mapping',
        icon: 'map',
        description: 'Maps paths.',
        indexPath: '/mapping',
        destinationIds: [],
        crossAgentToolIds: ['read_list'],
        commands: [{ name: 'generate', summary: 'Generate the mapping', inputSchema: z.object({ paths: z.array(z.string()) }), describeOutput: () => 'mapping' }],
        definition: {
            buildContext: () => ({}),
            buildPrompt: () => '',
            buildFollowUpPrompt: () => '',
            parseResponse: () => null,
            fallback: () => ({}),
        },
        toParams: (input) => input,
        withCollected,
    };
}

function listTool(name: string) {
    return (context: { collected: Record<string, unknown> }) => [{
        name,
        description: 'Reads a long list.',
        inputSchema: z.object({}),
        async execute() {
            context.collected.paths = ['/a', '/b', '/c'];
            return { count: 3 };
        },
    }];
}

afterEach(() => {
    resetAgenticoPrompts();
    registerCrossAgentTools();
});

describe('orchestrator', () => {
    it('exposes host cross-agent tools and one handoff tool per subagent command', () => {
        registerSubagents([mappingManifest()]);
        registerCrossAgentTools(listTool('read_list'), listTool('other_tool'));
        const definition = createOrchestratorAgentDefinition(labels);
        const params = { userGoal: 'map', pageContext: null, scopedSubagentId: null };
        const context = contextOf(definition, params);

        expect(definition.getTools!(params, context).map((tool) => tool.name)).toEqual(['read_list', 'other_tool', 'mapping_generate']);
        // A conversation pinned to the subagent only sees the tools it declares.
        expect(definition.getTools!({ ...params, scopedSubagentId: 'mapping' }, context).map((tool) => tool.name)).toEqual(['read_list', 'mapping_generate']);
    });

    it('hands off with what the tools collected, through the manifest withCollected hook', async () => {
        registerSubagents([mappingManifest((input, collected) => ({ ...input, paths: collected.paths ?? input.paths }))]);
        registerCrossAgentTools(listTool('read_list'));
        const definition = createOrchestratorAgentDefinition(labels);
        const params = { userGoal: 'map', pageContext: null, scopedSubagentId: null };
        const context = contextOf(definition, params);
        const tools = definition.getTools!(params, context);

        await tools.find((tool) => tool.name === 'read_list')!.execute({});
        const queued = await tools.find((tool) => tool.name === 'mapping_generate')!.execute({ paths: ['/a'] });

        expect(queued).toEqual({ status: 'queued', note: 'Mapping has been queued for the real execution — the result is not available in this conversation yet.' });
        expect(definition.parseResponse('ok', params, context)).toEqual({ kind: 'handoff', subagentId: 'mapping', command: 'generate', params: { paths: ['/a', '/b', '/c'] } });
        // The handoff is consumed by the turn that produced it.
        expect(definition.parseResponse('next', params, context)).toEqual({ kind: 'chat', message: 'next' });
    });

    it('labels the handoff tool with the host strings and falls back to a chat message', () => {
        registerSubagents([mappingManifest()]);
        const definition = createOrchestratorAgentDefinition(labels);
        const params = { userGoal: 'map', pageContext: null, scopedSubagentId: null };
        const handoff = definition.getTools!(params, contextOf(definition, params)).find((tool) => tool.name === 'mapping_generate')!;

        expect(handoff.describeInvocation!({})).toBe('Preparing Mapping…');
        expect(handoff.describeIntent).toBe('Collecting Mapping…');
        expect(definition.fallback(params, contextOf(definition, params))).toEqual({ kind: 'chat', message: 'AI off' });
    });

    it('builds the prompt from the configured pack, with the host intro and rules', () => {
        registerSubagents([mappingManifest()]);
        configureAgenticoPrompts({
            ...agenticoPromptsIt,
            orchestratorIntro: 'Sei Agentico, l\'orchestratore dei tool del CMS.',
            responseRules: [...agenticoPromptsIt.responseRules, 'Regola del CMS.'],
        });
        const definition = createOrchestratorAgentDefinition(labels);
        const params = { userGoal: 'Importa il tema', pageContext: 'Pagina temi', scopedSubagentId: null };
        const prompt = definition.buildPrompt(params, contextOf(definition, params));

        expect(prompt.startsWith('Sei Agentico, l\'orchestratore dei tool del CMS.')).toBe(true);
        expect(prompt).toContain('## Tool disponibili\nmapping [generate] — Mapping: Generate the mapping');
        expect(prompt).toContain('## Contesto pagina');
        expect(prompt).toContain('- Regola del CMS.');
        expect(prompt.endsWith('## Richiesta dell\'utente\nImporta il tema')).toBe(true);
    });
});
