import type { ReactNode } from 'react';
import type { ChatbotAction } from '@llmnative/react';

/** What the controls of a subagent receive (CR-003). */
export interface SubagentControlsProps {
    /** The raw params the subagent was started with. */
    params: Record<string, unknown>;
    /** The id of the task in the Agentico panel. */
    taskId: string;
    /** A turn is running: actions that would interrupt it should wait. */
    running: boolean;
    /** Ends the task (stops a running turn and closes it). */
    close: () => void;
}

/** The controls of a task: actions of the prompt, and what the host shows above it (a modal, a message). */
export interface SubagentControls {
    /** Buttons of the composer, next to the attachments (`ChatbotAction` with `onClick`). */
    actions?: ChatbotAction[];
    /** Shown above the composer while the task is open. */
    content?: ReactNode;
}

/**
 * A React hook of the host: called by the runner of each task of its subagent, on every render.
 * Its `actions` and `content` must keep their identity while nothing changes (`useMemo`): a new
 * one registers the task again, and a new one at every render would never stop.
 */
export type UseSubagentControls = (props: SubagentControlsProps) => SubagentControls;

// Keyed by subagent id, presentation side as the report registry: Agentico never imports a
// concrete one. The hook of a subagent never changes, so a runner always calls the same one.
const registry: Record<string, UseSubagentControls> = {};

export function registerSubagentControls(controls: Record<string, UseSubagentControls>): void {
    Object.assign(registry, controls);
}

export function getSubagentControls(subagentId: string): UseSubagentControls | undefined {
    return registry[subagentId];
}
