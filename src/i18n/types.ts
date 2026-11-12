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
    approvalHeader: string;
    approve: string;
    reject: string;
    approveQuestion: string;
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
    /** CR-018: next to the name of the agent while it reasons. */
    reasoningNow: string;
    /** CR-018: next to the name of the agent once it reasoned; `{seconds}`. */
    reasonedFor: string;
    /** CR-018: the same without a duration. */
    reasoned: string;
    /** CR-018: the tooltip of the summary that opens the reasoning and the steps. */
    processDetails: string;
    /** Accessible name of the group of the steps. */
    stepsLabel: string;
    // Panel
    /** `{label}` = subagent label */
    newInstance: string;
    chatHistory: string;
    /** CR-018: the button that loads the session before (also loaded by scrolling to the top). */
    earlierSession: string;
    /** CR-018: the separator above the open session, once earlier ones are shown. */
    thisSession: string;
    /** CR-018: takes up an earlier session (its own context). */
    continueSession: string;
    /** CR-018: the separator of an earlier session without a title; `{at}` its start. */
    sessionOf: string;
    /** CR-019: opens and closes what an event of the host said. */
    eventMore: string;
    eventLess: string;
    /** CR-019: opens the event where the host keeps it. */
    eventOpen: string;
    /** CR-020: an event still going on (its spinner). */
    eventRunning: string;
    /** CR-019: the filter in the header: show the events of the host, or the conversation only. */
    showEvents: string;
    hideEvents: string;
    /** CR-011: renaming a saved chat. */
    /** CR-014: the whole text of a card, and closing it. */
    cardView: string;
    cardClose: string;
    renameChat: string;
    chatTitleLabel: string;
    chatTitleHint: string;
    /** CR-010: the tooltip of a chat of the history, `{at}` its start and its last message. */
    chatStarted: string;
    chatLastMessage: string;
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
    /** CR-016: the actions on a message of the person, the composer while editing one, the confirmation. */
    editMessage: string;
    editingMessage: string;
    cancelEdit: string;
    rewindTitle: string;
    /** Followed by the steps done after the message. */
    rewindText: string;
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
