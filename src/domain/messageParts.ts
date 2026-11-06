// The parts of a message of an agent (CR-004), on the model of the Vercel AI SDK and AG-UI: what a
// remote executor reports during a turn (text, reasoning, steps, questions) is kept as a list of
// parts, in the order they arrive, each shown by its own component. Plain data: saved with the chat
// (EntityChatSnapshot) and reloaded as it is.

/** A choice of a question (the shape of the `question` tool of opencode and of MCP elicitation). */
export interface AgentQuestionOption {
    /** What the answer says: it is the value returned when chosen. */
    label: string;
    /** A line under the label. */
    description?: string;
}

/** A question of the agent to the person. */
export interface AgentQuestion {
    /** Returned with the answer, to match it to the question. */
    id?: string;
    /** Short title: the label of its tab. */
    header?: string;
    question: string;
    /** The choices. Without them the question takes a free-text answer. */
    options?: AgentQuestionOption[];
    /** More than one choice. */
    multiple?: boolean;
    /** The choice the agent recommends: its index (from 0) or its label. */
    recommended?: number | string;
    /** Offers "Other" with a free-text answer (default: yes). */
    custom?: boolean;
}

/** The answer to one question: the chosen labels and/or the free text, in the order of the questions. */
export interface AgentQuestionAnswer {
    id?: string;
    header?: string;
    values: string[];
}

/** The answers to a set of questions, as a turn gives them to the executor. `id` is the id of the
 * questions part (the one given to `onQuestions`, or the one Agentico made up). */
export interface AgentQuestionsAnswers {
    id: string;
    answers: AgentQuestionAnswer[];
}

/** Text of the reply, as Markdown. `streaming` while it is still arriving. */
export interface AgentTextPart {
    type: 'text';
    id: string;
    text: string;
    streaming?: boolean;
}

/** The reasoning of the model, as Markdown, shown closed behind "Reasoned for 12 s". */
export interface AgentReasoningPart {
    type: 'reasoning';
    id: string;
    text: string;
    streaming?: boolean;
    /** Seconds the model reasoned: given by the executor, or measured by Agentico. */
    duration?: number;
}

/** A step of the agent (a tool it ran, a file it wrote). Consecutive steps are shown as one group. */
export interface AgentToolPart {
    type: 'tool';
    id: string;
    label: string;
    status: 'running' | 'done' | 'error' | 'stopped';
}

/** Questions to the person, answered with a click. `answers` once answered (shown read-only). */
export interface AgentQuestionsPart {
    type: 'questions';
    id: string;
    questions: AgentQuestion[];
    answers?: AgentQuestionAnswer[];
}

/** An action of a card (CR-014), run by the host (`AgentDefinition.onCardAction`). */
export interface AgentCardAction {
    id: string;
    label: string;
    icon?: string;
    variant?: 'primary' | 'outline-primary' | 'outline-secondary' | 'outline-danger';
}

/** What came of an action of a card: its buttons are then off. */
export interface AgentCardOutcome {
    status: 'done' | 'dismissed' | 'error';
    text: string;
    link?: { label: string; url: string };
}

/**
 * A card in a message (CR-014): what the agent prepared for the person (e.g. a draft of a CR) with the actions
 * of the host. `details`: the whole text, opened by Agentico (View) in a side modal; `data`: of the host, given
 * back with an action. Saved with the chat, outcome included.
 */
export interface AgentCardPart {
    type: 'card';
    id: string;
    title: string;
    badge?: { label: string; variant?: 'info' | 'light' | 'success' | 'warning' | 'danger' };
    /** Markdown: what to read at once. */
    body?: string;
    details?: string;
    actions?: AgentCardAction[];
    data?: Record<string, unknown>;
    outcome?: AgentCardOutcome;
}

/** A card as a tool or an executor gives it. */
export type AgentCard = Omit<AgentCardPart, 'type'>;

export type AgentMessagePart = AgentTextPart | AgentReasoningPart | AgentToolPart | AgentQuestionsPart | AgentCardPart;

/** The id of the text part of an executor that calls `onText` without an id (the reply of CR-003). */
export const DEFAULT_TEXT_PART_ID = 'text';
/** The id of the reasoning part of an executor that calls `onReasoning` without an id. */
export const DEFAULT_REASONING_PART_ID = 'reasoning';

/** Adds `part`, or replaces the part of the same type and id. A new step or reasoning goes above the
 * default text part, so the reply (as in CR-003) stays below the work that led to it; anything else
 * is appended. `closeReasoning` closes the reasoning still streaming when a part of another type
 * arrives (the model moved on), with its duration. */
export function upsertMessagePart(
    parts: AgentMessagePart[],
    part: AgentMessagePart,
    closeReasoning?: (part: AgentReasoningPart) => AgentReasoningPart,
): AgentMessagePart[] {
    const at = parts.findIndex((p) => p.type === part.type && p.id === part.id);
    if (at >= 0) return parts.map((p, i) => (i === at ? part : p));
    const closed = part.type === 'reasoning' || !closeReasoning
        ? parts
        : parts.map((p) => (p.type === 'reasoning' && p.streaming ? closeReasoning(p) : p));
    const defaultText = closed.findIndex((p) => p.type === 'text' && p.id === DEFAULT_TEXT_PART_ID);
    if ((part.type === 'tool' || part.type === 'reasoning') && defaultText >= 0) {
        return [...closed.slice(0, defaultText), part, ...closed.slice(defaultText)];
    }
    return [...closed, part];
}

/** The text of a message: its text parts, one paragraph each (what `AgentActivityEntry.detail` holds). */
export function messagePartsText(parts: readonly AgentMessagePart[]): string {
    return parts.filter((p): p is AgentTextPart => p.type === 'text').map((p) => p.text).filter(Boolean).join('\n\n');
}

/** The answers as one line per question ("Database: Postgres"), for the history of the chat. */
export function formatQuestionAnswers(questions: readonly AgentQuestion[], answers: readonly AgentQuestionAnswer[]): string {
    return answers.map((answer, i) => {
        const title = answer.header ?? questions[i]?.header ?? questions[i]?.question ?? answer.id ?? `${i + 1}`;
        return `${title}: ${answer.values.join(', ')}`;
    }).join('\n');
}
