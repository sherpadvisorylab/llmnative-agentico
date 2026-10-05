# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
