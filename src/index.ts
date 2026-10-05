// Public API of @llmnative/agentico. Hosts import from the package root only.
//
// The host provides everything concrete — subagents (registerSubagents), result destinations
// (registerDestinations), reports (registerSubagentReports), cross-agent tools
// (registerCrossAgentTools), model-facing prompts (configureAgenticoPrompts), user-facing strings
// (agenticoTranslations / I18nDict.agentico) and the current scope (<AgenticoProvider scope>).
// Agentico itself only orchestrates.
import './i18n/types';

// ── Adapter contract (see subagentManifest.ts for the two halves) ─────────────────────────────
export type { AgentDefinition, AgentTool, LatestAttachmentsRef } from './domain/agentDefinition';
export type { SubagentCommand, SubagentManifest, SubagentComponentContext } from './domain/subagentManifest';
export { defineSubagent } from './domain/defineSubagent';
export { registerSubagents, getSubagentRegistry, findSubagentManifest } from './domain/subagentRegistry';
export { registerCrossAgentTools, createCrossAgentTools, type CrossAgentToolContext, type CrossAgentToolFactory } from './domain/crossAgentTools';
export { toJsonSchema, toMcpTool, type McpTool } from './domain/mcpTool';
export { renderSubagentCli, renderRegistryCli } from './domain/cli/renderManifestCli';
export { applyMicroPrompts, MICRO_PROMPT_REGISTRY, SUMMARY_MICRO_PROMPT } from './domain/microPrompts';
export type { MicroPrompt } from './domain/microPrompts';
export {
    configureAgenticoPrompts,
    getAgenticoPrompts,
    resetAgenticoPrompts,
    agenticoPromptsEn,
    agenticoPromptsIt,
    type AgenticoPrompts,
} from './domain/prompts';
export { extractErrorMessage } from './domain/extractErrorMessage';
export { extractJsonBlock } from './domain/extractJsonBlock';
export type { ResultDestination, DestinationContext, ResultDestinationOutcome } from './domain/resultDestination';
export { jsonExportDestination, JSON_EXPORT_DESTINATION_ID } from './domain/jsonExportDestination';
export { registerDestinations, getDestinationRegistry } from './domain/destinationRegistry';
export {
    configureEntityChatStore,
    saveEntityChat,
    getEntityChat,
    listEntityChats,
    removeEntityChat,
    type EntityChatSnapshot,
} from './domain/entityChatStore';

// ── i18n ──────────────────────────────────────────────────────────────────────────────────────
export { agenticoTranslations, agenticoEn, agenticoIt, agenticoDe, useAgenticoI18n, type AgenticoDict } from './i18n';

// ── UI/React (panel, provider and hooks a host mounts once) ────────────────────────────────────
export { Agentico, AGENTICO_WIDTH } from './presentation/Agentico';
export { AgenticoToggle } from './presentation/AgenticoToggle';
export {
    AgenticoProvider,
    useAgentico,
    ORCHESTRATOR_TASK_ID,
    type AgenticoScope,
    type AgenticoTask,
    type ComponentAnchor,
} from './presentation/AgenticoContext';
export { useAgent, type AgentActivityEntry, type AgentConversation, type UseAgentResult } from './presentation/useAgent';
export { useAgenticoPageContext } from './presentation/useAgenticoPageContext';
export { useSubagentComponentContext } from './presentation/useSubagentComponentContext';
export {
    registerSubagentReports,
    getSubagentReport,
    type EditableReportModule,
    type SubagentReportModule,
    type SubagentSelection,
} from './presentation/reports/subagentReportRegistry';
