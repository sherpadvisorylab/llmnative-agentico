# Project status

> Snapshot verified against the real codebase.
> Last reviewed: 2026-11-12

## General state

| Area | Verified real state | Target / gap |
|------|---------------------|--------------|
| Package | `@llmnative/agentico` 0.20.1 ready (published by the person). Peers: `@llmnative/react` ^1.34 || ^2.0, `react`/`react-dom` ^19.2, `zod` ^3.24; dependency `zod-to-json-schema`. | — |
| Host contract | Registration APIs (subagents, destinations, reports, cross-agent tools), prompt pack, chat store key, `<AgenticoProvider scope>`, `agentico` i18n namespace. No host-specific code in the package. | — |
| Hosts | `llmnative-cms` (migrated from its internal `src/agentico`), `llmnative-playbook` (planned). | Playbook integration. |
| UI | Composed with `@llmnative/react` components, except three hand-rolled controls inherited from the CMS. | CR-002. |
| Tests | 22 files / 98 tests (Vitest, happy-dom). | — |

## Completed change requests

| CR | State | Evidence |
|----|-------|----------|
| CR-021 | Done | Act on an event from the chat: `ThreadEvent.actions`/`open`, `ThreadEventsSource.onAction` with `chat.compose`/`chat.send`, `useAgentico().compose`. 98 tests. Version 0.20.0, verified in Playbook against the local build. Issue #21. |
| CR-020 | Done | Images in sight (`attachmentPreviews`, `imagePreviews`: previews kept with the chat, opened larger) and events going on (`ThreadEvent.running`, a spinner). 96 tests. Version 0.19.0, verified in Playbook against the local build. Issue #20. |
| CR-019 | Done | What happened around a chat: `at` on every entry, `<AgenticoProvider threadEvents>` (`ThreadEventsSource`), events among the turns by time as cards with who did it, header filter, never read by the model; `placeEvents`. 93 tests. Version 0.18.0, verified in Playbook against the local build. Issue #19. |
| CR-018 | Done | Sessions of one chat and who speaks: `SubagentManifest.thread`/`speaker`, `<AgenticoProvider person>`, `author` on messages of the person, `EarlierSessions` (read-only, loaded as the person scrolls up, Continue this session), `chatThreadOf`, `earlierSessions`. 88 tests. Version 0.17.0 (0.17.1-0.17.2: one column on the left for people and agents, the reasoning and steps summed up next to the name of the agent), verified in Playbook against the local build. Issue #18. |
| CR-017 | Done | Attachments for an executor: `executor.attachments`, `AgentExecutorTurn.attachments`, the composer offers them on its models. 83 tests. Version 0.16.0. Issue #17. |
| CR-016 | Done | Retry from here and Edit on a message of the person: `rewind`, `historyAt`, `executor.canRewind`, `rewound` on the next turn of the executor, a confirmation listing the steps done after it. 79 tests. Version 0.15.0. Issue #16. |
| CR-015 | Done | `AgentDefinition.offersFallback: false` hides Continue without AI when the model fails. 75 tests. Version 0.14.0. Issue #15. |
| CR-014 | Done | Cards in the messages of a chat: part `card` with View and the actions of the host, `AgentTool.card`, `turn.onCard`, `onCardAction` (outcome kept in the card). 73 tests. Version 0.13.0, verified in Playbook against the local build. Issue #14. |
| CR-013 | Done | Saved chats kept by the host too: `EntityChatBackend` (load, save, remove), writes sent in the background, `syncEntityChats` on scope change (later copy wins, gone ones dropped, unsent ones sent). 71 tests. Version 0.12.0. Issue #13. |
| CR-012 | Done | Reasoning level of the turns on the AI catalog: `executor.catalogReasoning(params, provider)`, sent as `reasoning` on every request of a turn (@llmnative/react 1.46, CR-122). 68 tests. Version 0.11.0. Issue #12. |
| CR-011 | Done | Titles of the saved chats: `autoTitle` (written by the model from the whole chat after a turn and once per session for older ones, with a model the chat may use), empty conversational chats not kept, `name`/`namedBy`, `chatTitle`, `renameEntityChat` (the person's wins), `onEntityChatsChange`, Rename in the history. 68 tests. Version 0.10.0, verified in Playbook against the local build. Issue #11. |
| CR-010 | Done | Start of a chat: `startedAt` kept across saves (`chatStartedAt`), history shown and sorted by it, last message in the tooltip; `executor.catalogProviders(params)` limits the AI catalog of a chat (composer and turns). 65 tests. Version 0.9.0, verified in Playbook (typecheck, tests, build against the local build). Issue #10. |
| CR-009 | Done | An executor alongside the AI catalog: `executor.alongside`, `catalogGroup`, `groupBadge`; one picker with the executor's models and the catalog's; turns of the executor's models only to it. 61 tests. Version 0.8.0. Issue #9. |
| CR-008 | Done | Approval of the person for a tool: `AgentTool.needsApproval`, `describeApproval`; a docked question Approve / Reject with a reason before it runs; rejected, the model reads why. 60 tests. Version 0.7.0, verified in Playbook. Issue #8. |
| CR-007 | Done | Conversational subagents: `AgentDefinition.conversational`, each reply a text part of its turn, no result panel (preview, destinations). 56 tests. Version 0.6.0, verified in Playbook. Issue #7. |
| CR-006 | Done | Slash commands of a subagent: `SubagentControls.commands` (`EditorCommand[]`) given to the task's `Chatbot`; the command reaches the executor as plain text; none while questions are docked. 54 tests. Version 0.5.0 (Playbook verification and npm publish by the main session). Issue #6. |
| CR-005 | Done | Resizable panel (drag, keyboard separator, double click reset, width per browser, `defaultWidth`/`minWidth`/`maxWidth`/`onWidthChange`); questions of the latest agent message docked at the bottom in place of the composer, person's message unpinned meanwhile, back inline read-only once answered; reloaded chats answerable. 52 tests. Version 0.4.0 (Playbook verification and npm publish by the main session). Issue #5. |
| CR-004 | Done | Messages in parts (text, reasoning, steps, questions) with `ChatMarkdown`, `ChatReasoning`, grouped steps, `ChatQuestions`; `onReasoning`, `onQuestions`, structured `answers`; sticky message per turn; saved chats with parts. 44 tests. Version 0.3.0 (npm publish and Playbook verification by the main session). Issue #4 closed. |
| CR-003 | Done | Remote subagents (executor with streaming, steps and its own models), `startSubagent`, chat per entity, `onlyWhenAnchored`, subagent controls in the prompt, history with archive and relative times, panel following streamed text. 35 tests. Published in 0.2.0. Issue #3 closed. |
| CR-001 | Done | Extraction from the CMS with scope, cross-agent tools, prompt pack and i18n. 31 tests. Published in 0.1.0. Issue #1 closed. |

## Open change requests

| CR | Real state | What is missing |
|----|-----------|-----------------|
| CR-002 | ⬜ | Replace hand-rolled `<button>`, `<input>` and switch with framework components. Issue #2. |
