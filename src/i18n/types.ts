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
    // Panel
    /** `{label}` = subagent label */
    newInstance: string;
    chatHistory: string;
    newChat: string;
    searchChats: string;
    messagePlaceholder: string;
    unsavedConversationConfirm: string;
    noSavedChats: string;
    noResults: string;
    retry: string;
    /** User message sent to the model by the retry button */
    retryMessage: string;
    continueWithoutAi: string;
    resumeWithAi: string;
    openPanel: string;
    closePanel: string;
}

declare module '@llmnative/react' {
    interface I18nDict {
        agentico: AgenticoDict;
    }
}
