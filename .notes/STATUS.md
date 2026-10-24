# Project status

> Snapshot verified against the real codebase.
> Last reviewed: 2026-10-24

## General state

| Area | Verified real state | Target / gap |
|------|---------------------|--------------|
| Package | `@llmnative/agentico` 0.2.0 published on npm. Peers: `@llmnative/react` ^1.31, `react`/`react-dom` ^19.2, `zod` ^3.24; dependency `zod-to-json-schema`. | — |
| Host contract | Registration APIs (subagents, destinations, reports, cross-agent tools), prompt pack, chat store key, `<AgenticoProvider scope>`, `agentico` i18n namespace. No host-specific code in the package. | — |
| Hosts | `llmnative-cms` (migrated from its internal `src/agentico`), `llmnative-playbook` (planned). | Playbook integration. |
| UI | Composed with `@llmnative/react` components, except three hand-rolled controls inherited from the CMS. | CR-002. |
| Tests | 9 files / 35 tests (Vitest, happy-dom). | — |

## Completed change requests

| CR | State | Evidence |
|----|-------|----------|
| CR-003 | Done | Remote subagents (executor with streaming, steps and its own models), `startSubagent`, chat per entity, `onlyWhenAnchored`, subagent controls in the prompt, history with archive and relative times, panel following streamed text. 35 tests. Published in 0.2.0. Issue #3 closed. |
| CR-001 | Done | Extraction from the CMS with scope, cross-agent tools, prompt pack and i18n. 31 tests. Published in 0.1.0. Issue #1 closed. |

## Open change requests

| CR | Real state | What is missing |
|----|-----------|-----------------|
| CR-002 | ⬜ | Replace hand-rolled `<button>`, `<input>` and switch with framework components. Issue #2. |
