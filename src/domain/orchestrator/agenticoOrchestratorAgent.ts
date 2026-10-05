// AgentDefinition of the Agentico orchestrator — see ../agentDefinition.ts for the contract. Its
// "result" is never used by the user directly: either conversation text (kind: 'chat', still
// collecting parameters) or a handoff (kind: 'handoff') that the caller (Agentico.tsx) turns into
// a SubagentRunner on the chosen subagent.
//
// Agentico knows no concrete subagent or tool: the handoff tools are generated from the registry
// (registerSubagents) and the data-collection tools come from the host (registerCrossAgentTools).
import { interpolate, proxyFetch } from '@llmnative/react';
import type { AgentDefinition, AgentTool } from '../agentDefinition';
import { getSubagentRegistry, findSubagentManifest } from '../subagentRegistry';
import { renderRegistryCli } from '../cli/renderManifestCli';
import { createCrossAgentTools } from '../crossAgentTools';
import { getAgenticoPrompts } from '../prompts';
import {
    buildOrchestratorPrompt,
    describeOrchestratorResponseContract,
    parseOrchestratorResponse,
    type OrchestratorHandoff,
    type OrchestratorResult,
} from './prompt';

export interface OrchestratorAgentParams {
    /** The opening message — the user's free request, or a goal pre-seeded from a subagent card. */
    userGoal: string;
    /** "Where the user is now" (see useAgenticoPageContext), captured once at run(). */
    pageContext: string | null;
    /** Subagent the starting page is pinned to, `null` for a generic chat. Restricts the
     * cross-agent tools to the ones that subagent declares (SubagentManifest.crossAgentToolIds). */
    scopedSubagentId: string | null;
}

export interface OrchestratorAgentContext {
    cliCatalog: string;
    /** Written by the execute() of the handoff tool invoked in this turn and read by parseResponse:
     * the only way a tool call outcome reaches parseResponse, which only sees the final text.
     * Reset every turn — a handoff is valid only for the turn that invoked it. */
    handoff: { current: OrchestratorHandoff | null };
    /** Complete outputs of the cross-agent tools of this conversation (see crossAgentTools.ts). */
    collected: Record<string, unknown>;
}

/** User-facing labels of the orchestrator (from the `agentico` i18n namespace). */
export interface OrchestratorLabels {
    /** Chat message used when the AI is not available. */
    unavailable: string;
    /** Log line of "continue without AI". */
    continueWithoutAi: string;
    /** Tool call label while a handoff is prepared — `{label}` = subagent label. */
    preparing: string;
    /** "Thinking" label of the turn that requested the handoff — `{label}` = subagent label. */
    collecting: string;
}

export function createOrchestratorAgentDefinition(
    labels: OrchestratorLabels,
): AgentDefinition<OrchestratorAgentParams, OrchestratorAgentContext, OrchestratorResult> {
    return {
        buildContext() {
            return {
                cliCatalog: renderRegistryCli(getSubagentRegistry()),
                handoff: { current: null },
                collected: {},
            };
        },

        buildPrompt({ userGoal, pageContext }, { cliCatalog }) {
            return buildOrchestratorPrompt(userGoal, cliCatalog, pageContext);
        },

        buildFollowUpPrompt(userText, _params, { cliCatalog }) {
            return `${userText}\n\n${describeOrchestratorResponseContract()}\n\n${getAgenticoPrompts().toolsHeading}\n${cliCatalog}`;
        },

        parseResponse(raw, _params, context) {
            const handoff = context.handoff.current;
            context.handoff.current = null; // consumed — must not survive into the next turn
            return parseOrchestratorResponse(raw, handoff);
        },

        fallback() {
            return { kind: 'chat', message: labels.unavailable };
        },

        // The fallback is never a real handoff (it cannot guess the subagent without AI), only a
        // message to read: without this hook "continue without AI" would show nothing.
        describeFallback(result) {
            return result.kind === 'chat' ? result.message : labels.continueWithoutAi;
        },

        // One handoff tool per (subagent, command) of the registry, generated — registering a
        // subagent makes it invocable here. execute() does NOT run the subagent (that would nest a
        // multi-turn AI conversation in a tool call): it only stores the parameters for parseResponse.
        getTools(params, context, attachmentsRef): AgentTool[] {
            const allCrossAgentTools = createCrossAgentTools({ attachmentsRef, collected: context.collected, proxyFetch });

            // A conversation pinned to a subagent only sees the cross-agent tools it declares; a
            // generic chat (not yet scoped) sees them all, since the target is still unknown.
            const scopedManifest = params.scopedSubagentId ? findSubagentManifest(params.scopedSubagentId) : null;
            const crossAgentTools = scopedManifest
                ? allCrossAgentTools.filter((tool) => (scopedManifest.crossAgentToolIds ?? []).includes(tool.name))
                : allCrossAgentTools;

            const handoffTools: AgentTool[] = getSubagentRegistry().flatMap((manifest) =>
                manifest.commands.map((command) => ({
                    name: `${manifest.id}_${command.name}`,
                    description: `${manifest.label}: ${command.summary}`,
                    inputSchema: command.inputSchema,
                    describeInvocation: () => interpolate(labels.preparing, { label: manifest.label }),
                    describeIntent: interpolate(labels.collecting, { label: manifest.label }),
                    async execute(input) {
                        // What the cross-agent tools collected always wins over what the model copied.
                        const handoffParams = manifest.withCollected ? manifest.withCollected({ ...input }, context.collected) : input;
                        context.handoff.current = { subagentId: manifest.id, command: command.name, params: handoffParams };
                        // NEVER `{ ready: true }`-like: a model seeing "ready" narrates a finished
                        // result in this same turn, before the real work (mounted after this turn)
                        // has even started. The payload must read unmistakably as "queued".
                        return { status: 'queued', note: interpolate(getAgenticoPrompts().handoffQueued, { label: manifest.label }) };
                    },
                })),
            );

            return [...crossAgentTools, ...handoffTools];
        },
    };
}
