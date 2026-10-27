// User-facing strings of Agentico, as a namespace of the @llmnative/react i18n dictionary.
// Hosts merge `agenticoTranslations` into <App i18n={{ translations }}> and may override any key.

export interface AgenticoDict {
    // Model picker / AI controls
    modelLabel: string;
    modelsLoading: string;
    noModelsAvailable: string;
    noProviderConnected: string;
    selectModelPlaceholder: string;
    // Orchestrator starter composer
    orchestratorStarterHint: string;
    orchestratorStarterPlaceholder: string;
    // Result destinations
    destinationPickerTitle: string;
    destinationApplying: string;
    destinationNoScope: string;
    exportJson: string;
    /** `{id}` = destination id */
    unknownDestination: string;
    // Orchestrator (see OrchestratorLabels)
    orchestratorUnavailable: string;
    orchestratorContinueWithoutAi: string;
    /** `{label}` = subagent label */
    orchestratorPreparing: string;
    /** `{label}` = subagent label */
    orchestratorCollecting: string;
    // Activity log and run state
    thinking: string;
    stopped: string;
    toolRequest: string;
    modelRequestError: string;
    noProviderResponse: string;
    noActiveSession: string;
    requestInProgress: string;
    invalidResponse: string;
    responseReceived: string;
    noProviderAvailable: string;
    tooManyToolTurns: string;
    aiDisabledFallback: string;
    continueWithoutAiFallback: string;
    // Parts of a message (CR-004)
    /** The group of the steps of the agent, when it holds one step. */
    oneStep: string;
    /** The group of the steps of the agent. `{count}` = number of steps */
    steps: string;
    /** Accessible name of the group of the steps. */
    stepsLabel: string;
    // Panel
    /** `{label}` = subagent label */
    newInstance: string;
    chatHistory: string;
    newChat: string;
    searchChats: string;
    messagePlaceholder: string;
    unsavedConversationConfirm: string;
    noSavedChats: string;
    /** Archives a chat of the history (CR-003). */
    archiveChat: string;
    noResults: string;
    retry: string;
    /** User message sent to the model by the retry button */
    retryMessage: string;
    continueWithoutAi: string;
    resumeWithAi: string;
    openPanel: string;
    closePanel: string;
    // Resizable panel and docked questions (CR-005)
    /** Accessible name of the edge that resizes the panel. */
    resizePanel: string;
    /** Tooltip of that edge. */
    resizePanelHint: string;
    /** Accessible name of the questions docked at the bottom of the panel. */
    pendingQuestions: string;
    /** Stops the turn while its questions are docked (the composer, with its stop button, is hidden). */
    stop: string;
}

declare module '@llmnative/react' {
    interface I18nDict {
        agentico: AgenticoDict;
    }
}
