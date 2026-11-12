// CR-019: what happened around a chat, said by the host (the turns of other agents on a project, a release):
// shown among its messages in order of time, each with who did it. The model never reads them.
import type { ChatAuthor } from './entityChatStore';

/** Something that happened in the chat of a `thread` (SubagentManifest.thread), told by the host. */
export interface ThreadEvent {
    /** Stable: the same event read again has the same id. */
    id: string;
    /** When it happened (ms). */
    at: number;
    /** Who did it: an agent, a person. */
    author: ChatAuthor;
    /** One line: what happened. */
    title: string;
    /** Markdown, short: what it said (shown when the card is opened). */
    body?: string;
    badge?: { label: string; variant?: 'info' | 'light' | 'success' | 'warning' | 'danger' };
    /** Where to read it whole (opened in a new tab). */
    href?: string;
    /** Framework icon of what it was (default: none). */
    icon?: string;
    /** CR-020: still going on (an agent at work on it): a spinner in place of its icon. */
    running?: boolean;
    /** CR-021: its body shown at once (e.g. the questions an agent waits on), not behind a click. */
    open?: boolean;
    /** CR-021: buttons on the card, run by the host (`ThreadEventsSource.onAction`). */
    actions?: ThreadEventAction[];
}

/** CR-021: a button on the card of an event. */
export interface ThreadEventAction {
    id: string;
    label: string;
    icon?: string;
    primary?: boolean;
}

/** CR-021: what an action of an event may do in the chat open in the panel. */
export interface ThreadEventChat {
    /** Puts `text` in the field of the chat, for the person to change and send. */
    compose(text: string): void;
    /** Sends `text` as a message of the person. */
    send(text: string): Promise<void>;
}

/** Where the panel reads the events of a chat (`<AgenticoProvider threadEvents>`). */
export interface ThreadEventsSource {
    /** The events of `thread` from `from` (inclusive) to `to` (exclusive, Infinity = up to now). */
    load(thread: string, from: number, to: number): ThreadEvent[] | Promise<ThreadEvent[]>;
    /** Called when the events of `thread` may have changed: the panel reads them again. Returns the unsubscribe. */
    subscribe?(thread: string, onChange: () => void): () => void;
    /** CR-021: a button of the card of an event was clicked. */
    onAction?(event: ThreadEvent, actionId: string, chat: ThreadEventChat): void | Promise<void>;
}

/** Each of the events among the turns of a log, by time: before the turn it came before. Turns without a time
 * take the one of the turn before them; events after the last turn go at the end (index = turns). */
export function placeEvents(turnTimes: ReadonlyArray<number | undefined>, events: readonly ThreadEvent[]): ThreadEvent[][] {
    const slots: ThreadEvent[][] = Array.from({ length: turnTimes.length + 1 }, () => []);
    const times: number[] = [];
    let last = -Infinity;
    for (const at of turnTimes) {
        if (at !== undefined) last = at;
        times.push(last);
    }
    for (const event of [...events].sort((a, b) => a.at - b.at)) {
        const index = times.findIndex((at) => at > event.at);
        slots[index === -1 ? turnTimes.length : index].push(event);
    }
    return slots;
}
