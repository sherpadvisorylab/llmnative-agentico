# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.3.0] - 2026-10-26

Needs `@llmnative/react` 1.34 (`ChatMarkdown`, `ChatReasoning`, `ChatQuestions`).

### Added
- Messages in parts (CR-004, GH issue #4), on the model of the Vercel AI SDK / AG-UI: the reply of a
  remote subagent is a list of parts (`AgentMessagePart`: `text`, `reasoning`, `tool`, `questions`)
  in `AgentActivityEntry.parts`, in the order they arrive; `detail` still holds the text.
- `AgentExecutorTurn.onText(text, { id?, done? })`: without an id it is the one reply of CR-003 (kept
  below the steps); with an id, a text part of its own. `onReasoning(text, { id?, done?, duration? })`:
  the reasoning of the model, its duration measured when the executor does not give it.
  `onQuestions(questions, { id? })`: questions in the format of the `question` tool of opencode / MCP
  elicitation; the promise resolves with the answers (`[{ id?, header?, values }]`) when they come
  while the turn runs.
- `AgentExecutorTurn.answers` (`{ id, answers }`): answers given after their turn (or after the chat
  was reloaded) start a new turn that carries them structured, with empty `text`.
  `useAgent().answerQuestions(entryId, partId, answers)`.
- Exported helpers and types: `upsertMessagePart`, `messagePartsText`, `formatQuestionAnswers`,
  `DEFAULT_TEXT_PART_ID`, `DEFAULT_REASONING_PART_ID`, `AgentQuestion`, `AgentQuestionAnswer`,
  `AgentQuestionsAnswers`, `AgentExecutorPartOptions`, the part types.
- Strings `oneStep`, `steps`, `stepsLabel` (en/it/de).

### Changed
- Agent text is rendered with `ChatMarkdown` of the framework (GFM: tables, lists, headings, code with
  copy; `streaming` while a part arrives), in place of the hand-written inline Markdown. The reasoning
  with `ChatReasoning`, consecutive steps as one collapsible group (`Tree`), questions with
  `ChatQuestions`, read-only once answered (they stay in the history answered).
- The steps of a remote turn are parts of its message instead of separate `tool` entries of the log.
- The message of the person stays pinned at the top only within its own turn: it no longer peeks out
  from under the bubble of a later turn, over the text.
- Saved chats (`EntityChatSnapshot`) keep the parts; chats saved before 0.3.0 (text only) still load
  and show their text as Markdown.

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
