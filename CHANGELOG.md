# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.2.0] - 2026-10-24

Needs `@llmnative/react` 1.31 (Chatbot actions with `onClick`, `DropdownItem.actions`).

### Added
- Remote subagents (CR-003, GH issue #3): `AgentDefinition.executor` (`AgentExecutor`,
  `AgentExecutorTurn`, `AgentExecutorStep`). `useAgent` gives each turn to the host. The host
  receives the text of the person as typed and streams back the reply (`onText`) and the steps
  of the agent (`onStep`). The conversation is `remote: true`: no model picker, no attachments,
  no "continue without AI".
- `useAgentico().startSubagent(subagentId, params, { taskId?, openingMessage? })`: a page starts
  a subagent directly, without the orchestrator. `entityChatTaskId(subagentId, entityId)` keeps
  one task per entity.
- `SubagentManifest.chatEntityId(params)`: the chat is saved after every turn under that entity,
  so it is in the history and can be resumed.
- `SubagentManifest.onlyWhenAnchored`: the orchestrator offers the subagent only when the
  conversation is scoped to it.
- `AgentExecutor.models` and `defaultModel`: a remote subagent offers its own models in the
  composer, at any time; the turn receives the one picked (`AgentExecutorTurn.model`).
- `registerSubagentControls` (`UseSubagentControls`): a hook of the host per subagent that gives
  the actions of the prompt (`ChatbotAction` with `onClick`, e.g. "Finish and open the PR") and the
  content shown above the composer while the task is open.
- History: archive a chat on hover (`SubagentManifest.onArchive`, `confirmArchive`), the chat open
  in the panel marked, times as "2 h ago" (full date on hover).

### Fixed
- The panel follows a reply that grows in place (streamed text, Markdown laid out after it).

## [0.1.0] - 2026-10-05

### Added
- First release, extracted from the `llmnative-cms` `src/agentico` module (CR-001, GH issue #1):
  orchestrator panel (`Agentico`, `AgenticoToggle`, `AgenticoProvider`), subagent contract
  (`defineSubagent`, `registerSubagents`, `SubagentManifest`, `AgentDefinition`), result
  destinations, reports, saved entity chats, page and component context hooks, `useAgent`.
- `AgenticoScope` (`<AgenticoProvider scope>`) replaces the CMS tenant: destinations receive
  `scopeId`, saved chats are keyed by scope (`configureEntityChatStore` sets the storage key; chats
  saved with the old `tenantId` field are still read).
- `registerCrossAgentTools` and `SubagentManifest.withCollected`: the host provides the
  data-collection tools and the per-conversation `collected` scratchpad reaches the handoff.
- `configureAgenticoPrompts` with `agenticoPromptsEn` (default) and `agenticoPromptsIt`:
  model-facing text, extended by the host with its own intro and rules.
- `agenticoTranslations` (en/it/de): user-facing strings in the `agentico` namespace of the
  `@llmnative/react` i18n dictionary, with English fallback and host overrides.
