// The approval of the person for a tool (CR-008): asked as a question with two choices, Approve and
// Reject, and a reason in free text; what the answer means for the turn.
import type { AgentTool } from './agentDefinition';
import type { AgentQuestionAnswer } from './messageParts';

/** The id of the questions part of an approval, in its own message. */
export const APPROVAL_PART_ID = 'approval';

/** What the person decided, and what they wrote besides the choice. */
export interface ApprovalDecision {
    approved: boolean;
    reason?: string;
}

/** Whether this call of the tool waits for the person. */
export function needsApproval(tool: AgentTool, input: Record<string, unknown>): boolean {
    return typeof tool.needsApproval === 'function' ? tool.needsApproval(input) : tool.needsApproval === true;
}

/** The decision in the answer: approved only when Approve was chosen; any free text is the reason. */
export function approvalOf(answers: readonly AgentQuestionAnswer[], approve: string, reject: string): ApprovalDecision {
    const values = answers[0]?.values ?? [];
    const reason = values.filter((value) => value !== approve && value !== reject).join(' ').trim();
    return { approved: values.includes(approve) && !values.includes(reject), ...(reason ? { reason } : {}) };
}
