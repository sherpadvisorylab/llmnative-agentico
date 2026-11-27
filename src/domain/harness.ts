// CR-024: the harness of the host — models that run their own loop of tools (e.g. Claude Code with the person's
// subscription, on a runner of the host), offered next to the AI catalog for every agent without an executor of its
// own, orchestrator included. Agentico knows nothing of where they run: the host implements `AgenticoHarness`.
// From it Agentico composes an executor alongside the catalog (CR-009) with the prompts, the tools (approvals,
// steps, cards: `runHostTool`) and the parsing of the agent itself.
import type { AIAttachment } from '@llmnative/react';
import type {
    AgentDefinition,
    AgentExecutor,
    AgentExecutorModel,
    AgentExecutorPartOptions,
    AgentExecutorStep,
    AgentExecutorTurn,
    AgentTool,
    LatestAttachmentsRef,
} from './agentDefinition';
import { approvalOf, needsApproval, APPROVAL_PART_ID } from './approval';
import type { EntityChatActivityEntry } from './entityChatStore';
import { toJsonSchema } from './mcpTool';
import type { AgentCard, AgentQuestion, AgentQuestionAnswer } from './messageParts';
import { applyMicroPrompts } from './microPrompts';

/** A tool of the agent as the harness gets it: JSON Schema for its input. */
export interface AgenticoHarnessTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

/** One turn given to the harness. */
export interface AgenticoHarnessTurn {
    /** The chat on the harness (8 hex characters): a new one when `first`. */
    chatId: string;
    /** true: a new chat on the harness, `prompt` is the whole brief of the agent (and the chat so far, if any). */
    first: boolean;
    /** What the harness sends to its model. */
    prompt: string;
    /** One of `AgenticoHarness.models()`. */
    model: string;
    /** The tools of the agent: the harness calls them back with `callTool`. */
    tools: AgenticoHarnessTool[];
    /** Runs a tool of the agent in the app, as on the AI catalog (approval, step, card). */
    callTool(name: string, input: Record<string, unknown>): Promise<{ result: unknown; isError?: boolean }>;
    attachments?: AIAttachment[];
    signal: AbortSignal;
    /** The reply so far, whole. */
    onText(text: string, part?: AgentExecutorPartOptions): void;
    onReasoning(text: string, part?: AgentExecutorPartOptions & { duration?: number }): void;
    /** A step of the harness of its own (reading files…); the tools of the agent show their steps by themselves. */
    onStep(step: AgentExecutorStep): void;
}

/** What the host gives Agentico (`<AgenticoProvider harness>`). */
export interface AgenticoHarness {
    /** The models the harness runs now for the person (e.g. "Claude Code · your subscription"); none: nothing offered. */
    models(): AgentExecutorModel[];
    /** CR-030: the model a chat starts with on the harness, one of `models()`; none: the chat starts on the catalog. */
    defaultModel?(): string | undefined;
    /** A turn; rejects with the words for the person when it cannot run (no credit, no subscription…). */
    turn(turn: AgenticoHarnessTurn): Promise<{ text: string }>;
    /** A chat on the harness that is over (the person started again, or left). */
    close?(chatId: string): Promise<void> | void;
}

/** The words `runHostTool` says to the person and to the model. */
export interface HostToolLabels {
    /** "Approve? {action}" */
    approveQuestion: string;
    approve: string;
    reject: string;
    /** What the model reads when the person rejected: "{reason}" is " (why)" or empty. */
    rejected: string;
}

/** What `runHostTool` needs of the turn that runs it. */
export type HostToolTurn = {
    onQuestions(questions: AgentQuestion[], part?: { id?: string }): Promise<AgentQuestionAnswer[]>;
    onStep(step: AgentExecutorStep): void;
    onCard?(card: AgentCard): void;
};

let toolSteps = 0;

/**
 * A tool of the app called by a harness (or any remote model): validated, approved by the person when it needs it
 * (CR-008: a question Approve / Reject with a reason), shown as a step, its card added (CR-014) — as on the AI catalog.
 * Never throws: what went wrong is the answer to the harness, `isError`.
 */
export async function runHostTool(
    tools: readonly AgentTool[],
    name: string,
    input: Record<string, unknown>,
    turn: HostToolTurn,
    labels: HostToolLabels,
): Promise<{ result: unknown; isError?: boolean }> {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) return { result: `No tool ${name}.`, isError: true };
    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) return { result: `Invalid input for ${name}: ${parsed.error.message}`, isError: true };
    const values = parsed.data as Record<string, unknown>;
    if (needsApproval(tool, values)) {
        const action = tool.describeApproval?.(values) ?? tool.describeInvocation?.(values) ?? name;
        toolSteps += 1;
        const answers = await turn.onQuestions([{
            id: `${APPROVAL_PART_ID}-${name}`,
            question: labels.approveQuestion.replace('{action}', action),
            options: [{ label: labels.approve }, { label: labels.reject }],
            recommended: 0,
        }], { id: `${APPROVAL_PART_ID}-${toolSteps}` });
        const decision = approvalOf(answers, labels.approve, labels.reject);
        if (!decision.approved) return { result: labels.rejected.replace('{reason}', decision.reason ? ` (${decision.reason})` : ''), isError: true };
    }
    toolSteps += 1;
    const step = `tool-${name}-${toolSteps}`;
    const label = tool.describeInvocation?.(values) ?? name;
    turn.onStep({ id: step, label, status: 'running' });
    try {
        const result = await tool.execute(values);
        turn.onStep({ id: step, label, status: 'done' });
        const card = tool.card?.(values, result);
        if (card) turn.onCard?.(card);
        return { result };
    } catch (error) {
        turn.onStep({ id: step, label, status: 'error' });
        return { result: error instanceof Error ? error.message : String(error), isError: true };
    }
}

/** The chat so far, as a model reads it: what the person wrote and what the agent answered, in order. */
export function harnessTranscript(activity: readonly EntityChatActivityEntry[]): string {
    return activity
        .filter((entry) => (entry.kind === 'user' || entry.kind === 'thinking') && entry.detail?.trim())
        .map((entry) => `${entry.kind === 'user' ? 'Person' : 'Agent'}: ${entry.detail!.trim()}`)
        .join('\n\n');
}

const newChatId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(16).padStart(2, '0')).join('');

export type HarnessExecutorOptions = {
    labels: HostToolLabels;
    /** The chat before the message being sent, when the harness starts in the middle of it (the AI catalog came first). */
    earlier?: () => readonly EntityChatActivityEntry[];
    /** How the chat so far is introduced to the model. */
    chatSoFar?: string;
};

/**
 * The executor alongside the AI catalog that runs an agent on the harness: its brief (`buildPrompt`, then
 * `buildFollowUpPrompt`), its tools (`getTools`, through `runHostTool`), its reading of the reply (`parseResponse`).
 */
export function createHarnessExecutor<TParams, TContext, TResult>(
    definition: AgentDefinition<TParams, TContext, TResult>,
    harness: AgenticoHarness,
    options: HarnessExecutorOptions,
): AgentExecutor<TParams, TContext, TResult> {
    let chatId = '';
    return {
        alongside: true,
        canRewind: true,
        attachments: true,
        models: () => harness.models(),
        ...(harness.defaultModel ? { defaultModel: () => harness.defaultModel?.() } : {}),
        async turn(turn: AgentExecutorTurn<TParams, TContext>) {
            const attachmentsRef: LatestAttachmentsRef = { current: undefined };
            const tools = definition.getTools?.(turn.params, turn.context, attachmentsRef) ?? [];
            // A new chat on the harness: the first turn of the executor, or the chat taken back to a message.
            const first = turn.first || Boolean(turn.rewound) || !chatId;
            if (first) {
                if (chatId) void Promise.resolve(harness.close?.(chatId)).catch(() => undefined);
                chatId = newChatId();
            }
            const text = turn.text || (turn.answers ? turn.answers.answers.map((answer) => answer.values.join(', ')).join('\n') : '');
            let prompt: string;
            if (first) {
                const before = harnessTranscript(turn.rewound?.activity ?? options.earlier?.() ?? []);
                const brief = applyMicroPrompts(definition.buildPrompt(turn.params, turn.context), definition.microPromptIds);
                // On the first turn of the chat the brief holds the request already (as on the AI catalog); in the
                // middle of the chat, or taken back to a message, the message being sent comes after the chat so far.
                prompt = [
                    brief,
                    ...(before ? ['', options.chatSoFar ?? '## The chat so far', '', before] : []),
                    ...(text && !(turn.first && !turn.rewound) ? ['', '---', '', text] : []),
                ].join('\n');
            } else {
                prompt = applyMicroPrompts(definition.buildFollowUpPrompt(text, turn.params, turn.context), definition.microPromptIds);
            }
            const reply = await harness.turn({
                chatId,
                first,
                prompt,
                model: turn.model ?? '',
                tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: toJsonSchema(tool.inputSchema) })),
                callTool: (name, input) => runHostTool(tools, name, input, turn, options.labels),
                ...(turn.attachments?.length ? { attachments: turn.attachments } : {}),
                signal: turn.signal,
                onText: turn.onText,
                onReasoning: turn.onReasoning,
                onStep: turn.onStep,
            });
            const result = definition.parseResponse(reply.text, turn.params, turn.context);
            return { text: reply.text, ...(result !== null && result !== undefined ? { result } : {}) };
        },
    };
}
