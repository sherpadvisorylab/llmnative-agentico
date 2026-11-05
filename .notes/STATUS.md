# Project status

> Snapshot verified against the real codebase.
> Last reviewed: 2026-11-05

## General state

| Area | Verified real state | Target / gap |
|------|---------------------|--------------|
| Package | `@llmnative/agentico` 0.7.0 ready (published by the person). Peers: `@llmnative/react` ^1.34, `react`/`react-dom` ^19.2, `zod` ^3.24; dependency `zod-to-json-schema`. | — |
| Host contract | Registration APIs (subagents, destinations, reports, cross-agent tools), prompt pack, chat store key, `<AgenticoProvider scope>`, `agentico` i18n namespace. No host-specific code in the package. | — |
| Hosts | `llmnative-cms` (migrated from its internal `src/agentico`), `llmnative-playbook` (planned). | Playbook integration. |
| UI | Composed with `@llmnative/react` components, except three hand-rolled controls inherited from the CMS. | CR-002. |
| Tests | 13 files / 60 tests (Vitest, happy-dom). | — |

## Completed change requests

| CR | State | Evidence |
|----|-------|----------|
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
