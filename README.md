# @llmnative/agentico

Agentic chat orchestrator for [`@llmnative/react`](https://www.npmjs.com/package/@llmnative/react) apps.

Agentico is a persistent side panel: the user says what they want, the orchestrator collects the
parameters in conversation and hands the work to a **subagent** registered by the host app. Every
subagent also has a deterministic fallback, so the app keeps working without AI.

Agentico only orchestrates. The host provides everything concrete: subagents, result
destinations, reports, cross-agent tools, model-facing prompts, user-facing strings and the
current scope (tenant, company, workspace…).

## Install

```bash
npm install @llmnative/agentico @llmnative/react zod
```

Requires Node.js 24 LTS, React 19 and `@llmnative/react` ≥ 1.34.

## Setup (once, at startup)

```tsx
import { App, locales } from '@llmnative/react';
import {
    Agentico, AgenticoProvider, AgenticoToggle,
    agenticoPromptsIt, agenticoTranslations, configureAgenticoPrompts,
    registerCrossAgentTools, registerDestinations, registerSubagents,
} from '@llmnative/agentico';

registerSubagents([themeSubagent, importSubagent]);           // what the orchestrator can hand off to
registerDestinations({ [themeLibrary.id]: themeLibrary });   // where results can be saved
registerCrossAgentTools(({ collected, attachmentsRef, proxyFetch }) => [readSitemapTool(proxyFetch, collected)]);
configureAgenticoPrompts({                                    // optional: language and host rules for the model
    ...agenticoPromptsIt,
    responseRules: [...agenticoPromptsIt.responseRules, 'A rule only this app needs.'],
});

<App
    i18n={{ locale: 'it', translations: { it: { ...locales.it, ...agenticoTranslations.it } } }}
    /* … */
>
    <AgenticoProvider scope={currentCompany && { id: currentCompany.id, dataProvider, storageProvider }}>
        <AgenticoToggle />   {/* in the header */}
        <Agentico />         {/* the panel */}
    </AgenticoProvider>
</App>
```

## Concepts

| Concept | API |
|---|---|
| **Subagent** — a capability with commands (Zod input), an `AgentDefinition` (prompt, parse, deterministic fallback, tools) and its index route | `defineSubagent`, `registerSubagents`, `SubagentManifest` |
| **Orchestrator** — reads the CLI catalog of the registered subagents, collects parameters, invokes a `<subagent>_<command>` handoff tool | built in |
| **Cross-agent tools** — data-collection tools the orchestrator may call (read a sitemap, a CSV…); complete outputs go to a per-conversation `collected` scratchpad, merged into the handoff by `SubagentManifest.withCollected` | `registerCrossAgentTools` |
| **Result destinations** — where a result can be saved, in the current scope | `registerDestinations`, `ResultDestination` |
| **Reports** — custom result views per subagent | `registerSubagentReports` |
| **Scope** — the host's current tenant/company: id + data and storage providers | `<AgenticoProvider scope>` |
| **Page context** — what the user is looking at, for the orchestrator prompt | `useAgenticoPageContext`, `useSubagentComponentContext` |
| **Saved chats** — one chat per saved entity, resumable | `configureEntityChatStore`, `getEntityChat`, `listEntityChats` |
| **Remote subagents** — turns answered by the host (a remote agent with its own memory, e.g. an opencode session), streamed with its steps; its own models in the composer, no fallback | `AgentDefinition.executor` (`AgentExecutor`, `models`, `defaultModel`) |
| **Message parts** — a remote reply in parts, as in the Vercel AI SDK / AG-UI: Markdown text (tables, lists, code; repaired while it streams), the reasoning of the model (closed, "Reasoned for 12 s"), the steps grouped and collapsible, questions answered with a click. Answers go back structured: to the waiting turn (`onQuestions` resolves) or as a new turn with `answers`. Parts are saved with the chat; chats saved with text only still load | `AgentExecutorTurn.onText(text, { id?, done? })`, `onReasoning(text, { id?, done?, duration? })`, `onStep`, `onQuestions(questions, { id? })`, `AgentExecutorTurn.answers`, `AgentMessagePart`, `useAgent().answerQuestions` |
| **Direct start** — a page starts a subagent without the orchestrator; with `chatEntityId` its chat is saved at every turn under that entity and resumed from the history; `onlyWhenAnchored` keeps it off the other pages | `useAgentico().startSubagent`, `entityChatTaskId`, `SubagentManifest.chatEntityId`, `SubagentManifest.onlyWhenAnchored` |
| **Controls** — the actions of the prompt of a subagent (e.g. "Finish") and what the host shows above it, from a hook of the host | `registerSubagentControls` |
| **History** — chats per entity, the open one marked, archived on hover (with the host deciding what archiving does) | `SubagentManifest.onArchive`, `confirmArchive` |
| **Prompts** — model-facing text (en default, it included) | `configureAgenticoPrompts`, `agenticoPromptsEn`, `agenticoPromptsIt` |
| **Strings** — user-facing text, namespace `agentico` of the framework i18n (en/it/de) | `agenticoTranslations`, `I18nDict.agentico` |

## Development

```bash
npm run typecheck
npm test
npm run build
```

Changes and releases follow `docs/directives/maintainers/llm-rule-change-release.md` (CR + GitHub
issue + version + npm), tracked in `.notes/`.

## License

Apache-2.0
