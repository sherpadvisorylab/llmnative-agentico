// Public API of @llmnative/agentico. Hosts import from the package root only.
//
// The host provides everything concrete — subagents (registerSubagents), result destinations
// (registerDestinations), reports (registerSubagentReports), cross-agent tools
// (registerCrossAgentTools), model-facing prompts (configureAgenticoPrompts), user-facing strings
// (agenticoTranslations / I18nDict.agentico) and the current scope (<AgenticoProvider scope>).
// Agentico itself only orchestrates.
import './i18n/types';

// ── Adapter contract (see subagentManifest.ts for the two halves) ─────────────────────────────
export type { AgentDefinition, AgentTool, LatestAttachmentsRef, AgentExecutor, AgentExecutorTurn, AgentExecutorStep, AgentExecutorPartOptions, AgentExecutorModel, AgentModelGroupBadge } from './domain/agentDefinition';
export {
    DEFAULT_TEXT_PART_ID,
    DEFAULT_REASONING_PART_ID,
    upsertMessagePart,
    messagePartsText,
    formatQuestionAnswers,
    type AgentMessagePart,
    type AgentTextPart,
    type AgentReasoningPart,
    type AgentToolPart,
    type AgentQuestionsPart,
    type AgentCard,
    type AgentCardPart,
    type AgentCardAction,
    type AgentCardOutcome,
    type AgentQuestion,
    type AgentQuestionOption,
    type AgentQuestionAnswer,
    type AgentQuestionsAnswers,
} from './domain/messageParts';
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
    chatStartedAt,
    chatTitle,
    chatHasPersonMessage,
    renameEntityChat,
    onEntityChatsChange,
    syncEntityChats,
    hasEntityChatBackend,
    type EntityChatBackend,
    getEntityChat,
    listEntityChats,
    removeEntityChat,
    entityChatTaskId,
    type EntityChatSnapshot,
    type ChatAuthor,
} from './domain/entityChatStore';
export { chatThreadOf, earlierSessions } from './domain/chatThread';
export { placeEvents, type ThreadEvent, type ThreadEventAction, type ThreadEventChat, type ThreadEventsSource } from './domain/threadEvents';
export { imagePreviews, PREVIEW_MAX, PREVIEW_LIMIT, type AttachmentPreview } from './presentation/imagePreview';

// ── i18n ──────────────────────────────────────────────────────────────────────────────────────
export { agenticoTranslations, agenticoEn, agenticoIt, agenticoDe, useAgenticoI18n, type AgenticoDict } from './i18n';

// ── UI/React (panel, provider and hooks a host mounts once) ────────────────────────────────────
export { Agentico, AGENTICO_WIDTH, type AgenticoProps } from './presentation/Agentico';
export { AGENTICO_MIN_WIDTH, AGENTICO_MAX_WIDTH, AGENTICO_WIDTH_STORAGE_KEY, type AgenticoPanelSize } from './presentation/panelWidth';
export { AgenticoToggle } from './presentation/AgenticoToggle';
// ── Settings (CR-022): one schema, shown or fixed by the host, with the connectors of the AI providers ─────────────
export { useAgenticoSettings, type AgenticoSettingsConfig, type AgenticoSettingsTab } from './presentation/AgenticoSettingsContext';
export { AgenticoSettingsModal } from './presentation/AgenticoSettingsModal';
export {
    AGENTICO_SETTING_KEYS,
    DEFAULT_AGENTICO_SETTINGS,
    effectiveSettings,
    shownSettings,
    browserSettingsStore,
    type AgenticoSettings,
    type AgenticoSettingKey,
    type AgenticoSettingsStore,
} from './domain/settings';
export {
    AgenticoProvider,
    useAgentico,
    ORCHESTRATOR_TASK_ID,
    type AgenticoScope,
    type AgenticoRoute,
    type AgenticoRoutingState,
    type AgenticoTask,
    type ComponentAnchor,
} from './presentation/AgenticoContext';
export {
    resolveAgenticoRoute,
    matchAgenticoPage,
    matchesAnyPath,
    subagentToolsOf,
    mergeAgenticoRouting,
    mergeAgenticoPageRules,
    diffAgenticoRouting,
    validateAgenticoRouting,
    compileRoutePattern,
    routePathOf,
    type AgenticoRouting,
    type AgenticoPageRule,
    type AgenticoPageRuleWithOrigin,
    type AgenticoSubagentRouting,
    type AgenticoToolRouting,
    type AgenticoRoutingOrigin,
    type AgenticoRoutingChanges,
    type AgenticoRoutingStore,
    type AgenticoPageMatch,
    type AgenticoRouteMatch,
    type AgenticoRoutingIssue,
    type AgenticoRoutingIssueCode,
} from './domain/routing';
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
export { registerSubagentControls, getSubagentControls, type SubagentControls, type SubagentControlsProps, type UseSubagentControls } from './presentation/subagentControls';

// CR-024: the harness of the host
export {
    createHarnessExecutor,
    harnessTranscript,
    runHostTool,
    type AgenticoHarness,
    type AgenticoHarnessTool,
    type AgenticoHarnessTurn,
    type HarnessExecutorOptions,
    type HostToolLabels,
    type HostToolTurn,
} from './domain/harness';
export { useAgenticoHarness } from './presentation/harnessContext';

// CR-025: the browser side of the server of Agentico (`@llmnative/agentico/server`)
export {
    createAgenticoBackend,
    AgenticoBackendError,
    type AgenticoBackend,
    type AgenticoBackendOptions,
    type AgenticoMe,
    type AgenticoMemory,
    type AgenticoMemoryCheck,
    type AgenticoMemoryHit,
    type AgenticoNamespaceRow,
    type AgenticoRole,
} from './backend/agenticoBackend';
