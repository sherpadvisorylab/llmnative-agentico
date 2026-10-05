// Cross-agent tools: data-collection tools the orchestrator can call while it gathers the
// parameters of a subagent command (read a sitemap, list the columns of an attached CSV, scrape
// a page…). Agentico ships none of them: the host registers a factory once at startup, exactly
// like registerSubagents().
//
// Tools often produce large values (hundreds of paths) that the model would have to copy again
// into the final command, and models truncate long arrays when they do. So a tool can also write
// its complete output into `collected`, a per-conversation scratchpad; the subagent the
// conversation hands off to reads it back through SubagentManifest.withCollected.
import type { AgentTool, LatestAttachmentsRef } from './agentDefinition';

export interface CrossAgentToolContext {
    /** Raw attachments of the current turn — for tools that read files too big for the prompt. */
    attachmentsRef: LatestAttachmentsRef | undefined;
    /** Per-conversation scratchpad shared with the subagent manifests (see withCollected). */
    collected: Record<string, unknown>;
    /** CORS-safe fetch of the host app (the framework's proxyFetch). */
    proxyFetch: typeof fetch;
}

export type CrossAgentToolFactory = (context: CrossAgentToolContext) => AgentTool[];

let factories: CrossAgentToolFactory[] = [];

/** Registers the host's cross-agent tools. Called once at startup; a later call replaces the set. */
export function registerCrossAgentTools(...toolFactories: CrossAgentToolFactory[]): void {
    factories = toolFactories;
}

export function createCrossAgentTools(context: CrossAgentToolContext): AgentTool[] {
    return factories.flatMap((factory) => factory(context));
}
