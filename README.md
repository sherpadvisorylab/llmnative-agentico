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
| **Files for an executor** — what the person attaches (chosen, dropped, pasted) reaches the turn of a remote agent | `executor.attachments`, `AgentExecutorTurn.attachments` (CR-017) |
| **Going back to a message** — Retry from here and Edit on a message of the person; the chat and the history of the model are cut there | `useAgent().rewind`, `executor.canRewind`, `AgentExecutorTurn.rewound` (CR-016) |
| **No fallback for a chat** — an agent with no result without a model offers only Retry when the model fails | `AgentDefinition.offersFallback: false` (CR-015) |
| **Cards in the chat** — what an agent prepared (e.g. a draft), with View and the actions of the host, their outcome kept | `AgentTool.card`, `executor.turn` `onCard`, `AgentDefinition.onCardAction` (CR-014) |
| **Saved chats** — one chat per saved entity, resumable, known by when it started, kept by the host too (`backend`, `syncEntityChats`, CR-013) | `configureEntityChatStore`, `getEntityChat`, `listEntityChats`, `chatStartedAt` (CR-010); titles written by the model and renamed by the person: `autoTitle`, `chatTitle`, `renameEntityChat`, `onEntityChatsChange` (CR-011) |
| **Approval of tools** — a tool that stops work, spends or cannot be undone runs only after the person approves it, on a question docked at the bottom of the chat (Approve / Reject with a reason) | `AgentTool.needsApproval`, `describeApproval` |
| **Conversational subagents** — a chat with the model and its tools, nothing to apply at the end: each reply a message of the chat, no result preview or destinations | `AgentDefinition.conversational` |
| **Remote subagents** — turns answered by the host (a remote agent with its own memory, e.g. an opencode session), streamed with its steps; its own models in the composer, no fallback | `AgentDefinition.executor` (`AgentExecutor`, `models`, `defaultModel`) |
| **Executor alongside the AI catalog** — one subagent, its tools on the AI catalog and the turns of the executor's models answered by the host (e.g. a harness on a server); both in one picker, grouped with badges | `executor.alongside`, `executor.catalogGroup`, `groupBadge` (CR-009); `executor.catalogProviders(params)` limits the catalog of a chat (CR-010); `executor.catalogReasoning(params, provider)` sets how much it reasons there (CR-012) |
| **Message parts** — a remote reply in parts, as in the Vercel AI SDK / AG-UI: Markdown text (tables, lists, code; repaired while it streams), the reasoning of the model (closed, "Reasoned for 12 s"), the steps grouped and collapsible, questions answered with a click. Answers go back structured: to the waiting turn (`onQuestions` resolves) or as a new turn with `answers`. Parts are saved with the chat; chats saved with text only still load | `AgentExecutorTurn.onText(text, { id?, done? })`, `onReasoning(text, { id?, done?, duration? })`, `onStep`, `onQuestions(questions, { id? })`, `AgentExecutorTurn.answers`, `AgentMessagePart`, `useAgent().answerQuestions` |
| **Panel** — a column beside the page, resizable by dragging its inner edge (or with the arrow keys on it; double click resets), the width kept per browser (`localStorage`, key `agentico:panel-width`). Questions waiting in the latest message of the agent are docked at the bottom in place of the composer, until answered or stopped | `<Agentico defaultWidth minWidth maxWidth onWidthChange>`, `AGENTICO_WIDTH`, `AGENTICO_MIN_WIDTH`, `AGENTICO_MAX_WIDTH` |
| **Sessions of one chat and who speaks** (CR-018) — the saved chats with the same `thread` key are sessions of one chat: the earlier ones above the open one, read-only, loaded as the person scrolls up, each with its own context; the messages of the person carry their name and picture, each turn of the agent starts with its own | `SubagentManifest.thread`, `SubagentManifest.speaker`, `<AgenticoProvider person>`, `chatThreadOf`, `earlierSessions`, `ChatAuthor` |
| **What happened around a chat** (CR-019) — the events of the host (the work of other agents…) among the messages of a chat with a `thread`, by time, each a compact card with who did it; a filter in the header (Conversation only); the model never reads them. Each entry of a chat keeps when it was born (`at`) | `<AgenticoProvider threadEvents>` (`ThreadEventsSource`: `load(thread, from, to)`, `subscribe`), `ThreadEvent`, `placeEvents` |
| **Images in sight and events going on** (CR-020) — the images pasted or attached to a message stay as small previews after it is sent (kept with the chat, opened larger on a click); an event of the host still going on has a spinner | `entry.attachmentPreviews`, `imagePreviews`, `ThreadEvent.running` |
| **Act on an event from the chat** (CR-021) — buttons on the card of an event run by the host, its body shown at once; the host can put a text in the field of the chat or send it (e.g. the questions of a blocked CR: ask about them, answer them) | `ThreadEvent.actions`, `ThreadEvent.open`, `ThreadEventsSource.onAction(event, actionId, chat)` (`chat.compose`, `chat.send`), `useAgentico().compose` |
| **Direct start** — a page starts a subagent without the orchestrator; with `chatEntityId` its chat is saved at every turn under that entity and resumed from the history; `onlyWhenAnchored` keeps it off the other pages | `useAgentico().startSubagent`, `entityChatTaskId`, `SubagentManifest.chatEntityId`, `SubagentManifest.onlyWhenAnchored` |
| **Controls** — the actions of the prompt of a subagent (e.g. "Finish"), its slash commands (e.g. `/to-spec`, sent as plain text to the executor) and what the host shows above it, from a hook of the host | `registerSubagentControls` |
| **History** — chats per entity, the open one marked, archived on hover (with the host deciding what archiving does) | `SubagentManifest.onArchive`, `confirmArchive` |
| **Prompts** — model-facing text (en default, it included) | `configureAgenticoPrompts`, `agenticoPromptsEn`, `agenticoPromptsIt` |
| **Strings** — user-facing text, namespace `agentico` of the framework i18n (en/it/de) | `agenticoTranslations`, `I18nDict.agentico` |

### Controls of a subagent

```tsx
import type { EditorCommand } from '@llmnative/react';

// A module constant keeps its identity; inside the hook use `useMemo`.
const commands: EditorCommand[] = [{ name: 'to-spec', description: 'Turn the design into a spec' }];

registerSubagentControls({
    design: ({ running }) => {
        const openFinish = useFinishModal(); // the host's own
        return useMemo(() => ({
            actions: [{ key: 'finish', label: 'Finish', icon: 'git-pull-request', disabled: running, onClick: openFinish }],
            commands,
        }), [running, openFinish]);
    },
});
```

Actions, commands and content must keep their identity while nothing changes: a new one registers
the task again. Typing `/` in the prompt of the task opens the commands; one without `handler`
inserts `/name ` and the message reaches the executor's turn as plain `text` (`"/to-spec checkout"`):
Agentico gives it no meaning. The commands live in the composer, so none are offered while docked
questions take its place.

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
