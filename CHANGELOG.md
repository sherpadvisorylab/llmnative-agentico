# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.12.0] - 2026-11-06

### Added
- Saved chats kept by the host too (CR-013, GH issue #13): `configureEntityChatStore({ storageKey, backend })` with
  an `EntityChatBackend` (`load(scopeId)`, `save(snapshot)`, `remove(...)`). The browser keeps its copy (reads stay
  synchronous); every save, rename and removal also goes to the backend in the background. `syncEntityChats(scopeId)`
  (run by `AgenticoProvider` when its scope changes) takes a newer copy from the backend, drops a chat gone from
  it, and sends the chats of the browser never sent (those from before the backend); a removal the backend refuses
  comes back with the next sync. `snapshot.changedAt` (the later copy wins), `hasEntityChatBackend()`.

## [0.11.0] - 2026-11-06

### Added
- How much the model reasons on the turns of a chat on the AI catalog (CR-012, GH issue #12):
  `executor.catalogReasoning(params, provider)` gives the level (`low`, `medium`, `high`, `max`); every request
  of the turn (its rounds and the closing one) carries it as `reasoning`, which `@llmnative/react` 1.46 (CR-122)
  sends in the format of each provider. An older framework ignores it.

## [0.10.3] - 2026-11-06

### Fixed
- A chat of a subagent with `chatEntityId` is saved when the person writes (the start of a turn) as well as when the reply ends: it is in the history and in the lists of the host while a long reply is being written, not only after it.

## [0.10.2] - 2026-11-06

### Fixed
- The message the Retry button sends is marked (`AgentActivityEntry.retry`, `sendMessage(text, { retry: true })`) and is never the title of a chat nor a message of the person (`chatHasPersonMessage`); in chats saved before, its text in en/it/de is recognized. The model writing a title leaves it out.

## [0.10.1] - 2026-11-06

### Fixed
- A chat reopened from the history is no longer saved again by the reopening: its last message stays when it was.
- `chatTitle`: without a title written (no model the chat may use), the first message of the person, before the title of its params.
- History: each chat shows its title only (which agent: its icon and the tooltip), and the chat open in the panel stands out.

## [0.10.0] - 2026-11-06

### Added
- Titles of the saved chats (CR-011, GH issue #11): with `SubagentManifest.autoTitle`, a chat with a message of
  the person and no title of its own gets one from the model after a turn, read from the whole chat (3-6 words
  in its language, prompt `chatTitle` en/it), with a model of the AI catalog the chat may run on (the one
  picked, else the first allowed by `executor.catalogProviders`; none: the title stays). Once per scope and
  session the chats saved before get one the same way, and a conversational one where the person never wrote
  is removed; such a chat is no longer saved at all.
- `EntityChatSnapshot.name` and `namedBy` (`'model' | 'person'`), kept across saves; `chatTitle(snapshot)`,
  `chatHasPersonMessage(snapshot)`, `renameEntityChat(scopeId, subagentId, entityId, title, by?)` (a title of
  the person is never replaced by the model's; empty: back to the automatic one) and
  `onEntityChatsChange(listener)`. The history shows `chatTitle` and has a Rename action.

## [0.9.0] - 2026-11-06

### Added
- The start of a saved chat (CR-010, GH issue #10): `EntityChatSnapshot.startedAt`, set at its first save and
  kept by every later one, read with `chatStartedAt(snapshot)` (a chat saved before: its `savedAt`).
  `listEntityChats` lists the last started first, and the history shows the time since the start, its start
  and its last message in the tooltip: reopening an old chat no longer moves it to now.
- The AI catalog limited per chat (CR-010): `executor.catalogProviders(params)` gives the providers of the
  catalog the chat may run on (absent: all). `useAgent().modelsByProvider` lists only their models, and a
  model of another provider is never used: the first model of the executor is picked instead (when the
  executor names no default), else the first allowed model of the catalog.

## [0.8.0] - 2026-11-06

### Added
- An executor alongside the AI catalog (CR-009, GH issue #9): with `executor.alongside: true` a subagent stays
  an agent of the AI catalog (its prompts, its tools, its approvals) and its executor answers only the turns
  whose model is one of `executor.models` (`first` on its first turn of the chat). The composer offers the
  models of the executor and those of the catalog together; `executor.catalogGroup(provider, label)` gives the
  group and badge the catalog models are listed under, and an executor model may carry `groupBadge` (shown on
  the right of its group header with `@llmnative/react` 1.45.0, CR-121). Attachments only on catalog models.
  `useAgent` exposes `alongside` and `catalogGroup`. Without `alongside` nothing changes.

## [0.7.0] - 2026-11-05

### Added
- Approval of the person for a tool (CR-008, GH issue #8): `AgentTool.needsApproval?: boolean |
  ((input) => boolean)` and `describeApproval?(input)`. Before a tool that needs it runs, the turn stops
  on a question of its own message (`approval-<call id>`, part `approval`), docked at the bottom of the
  chat like the other questions: "Approve? <action>" with Approve / Reject and a free-text reason; the
  calls of one round are asked one at a time, before any of them runs. Approved, the tool runs;
  rejected, it does not and the model reads `toolRejected` of the prompt pack (with the reason). A stop
  while waiting ends the turn. The answer stays in the chat. i18n: `approvalHeader`, `approve`,
  `reject`, `approveQuestion`.

## [0.6.0] - 2026-11-04

### Added
- Conversational subagents (CR-007, GH issue #7): `AgentDefinition.conversational?: boolean`. Each
  text reply of the model is a text part of its turn (`parts`, rendered with `ChatMarkdown` like the
  reply of a remote agent) instead of a detail under "Response received", and `SubagentRunner` keeps no
  result for it: no preview and no destinations ("Save result to… / Export as JSON") under the chat, on
  the first turn, on follow-ups and on Retry. `parseResponse` still runs (what `run`/`sendMessage`
  resolve to). For an agent that talks and uses tools with nothing to apply at the end. Agents without
  the flag are unchanged.

## [0.5.0] - 2026-10-27

### Added
- Slash commands of a subagent (CR-006, GH issue #6): `SubagentControls.commands?: EditorCommand[]`
  (the type of `@llmnative/react`), returned by the hook of `registerSubagentControls` next to
  `actions` and `content`, with the same rule (identity kept with `useMemo`), and given to the
  `Chatbot` of the task's composer (`commands`). Typing `/` opens the menu; a command without
  `handler` inserts `/name `; the message reaches the executor's turn as plain `text` (e.g.
  `"/to-spec checkout"`), with no meaning given by Agentico. No commands while docked questions
  (CR-005) take the place of the composer. `AgenticoTask.composerCommands`.

## [0.4.0] - 2026-10-27

### Added
- Resizable panel (CR-005, GH issue #5): the Agentico column is resized by dragging its inner edge
  (the one facing the page). The edge is a focusable `role="separator"` (`aria-orientation="vertical"`,
  `aria-valuenow/min/max`): arrow keys by 16 px (Shift: 64), Home/End to the minimum/maximum, double
  click back to the default. A thin primary line shows on hover, focus and drag (theme tokens only).
  The width is kept per browser in `localStorage` (`agentico:panel-width`, exported as
  `AGENTICO_WIDTH_STORAGE_KEY`).
- `<Agentico>` props `defaultWidth` (default `AGENTICO_WIDTH`, 420), `minWidth` (default
  `AGENTICO_MIN_WIDTH`, 320), `maxWidth` (px or `'<n>vw'`, default `AGENTICO_MAX_WIDTH`, `'60vw'`),
  `onWidthChange(width)`. Types `AgenticoProps`, `AgenticoPanelSize`.
- Docked questions (CR-005): unanswered questions of the latest message of the agent are shown at the
  bottom of the panel in place of the composer (as tall as needed up to the chat area, then scrolling
  inside, focused for the number keys), with a Stop button while the turn runs. Meanwhile the message
  of the person is not pinned at the top. Answered, or the turn stopped, they go back into the thread,
  read-only, and the composer returns. Unanswered questions of a reloaded chat are docked and answerable.
- Strings `resizePanel`, `resizePanelHint`, `pendingQuestions`, `stop` (en/it/de).

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
