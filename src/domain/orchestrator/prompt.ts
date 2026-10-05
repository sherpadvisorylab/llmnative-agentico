// Prompt + parsing per l'orchestratore Agentico — vedi
// ./agenticoOrchestratorAgent.ts per l'AgentDefinition che li usa.
//
// A differenza di theme/html-to-liquid, qui non c'è un contratto JSON da far rispettare: il
// modello o continua a conversare in prosa libera (per raccogliere parametri) o invoca uno dei
// tool generati dal registry (../subagentRegistry.ts) — la vera "risposta
// strutturata" arriva dalla tool call, non dal testo. Vedi agenticoOrchestratorAgent.ts per come
// il tool eseguito scrive nel context (`handoff`) che parseOrchestratorResponse legge qui.
import { getAgenticoPrompts } from '../prompts';

export interface OrchestratorHandoff {
    subagentId: string;
    command:    string;
    params:     Record<string, unknown>;
}

export type OrchestratorResult =
    | { kind: 'chat'; message: string }
    | ({ kind: 'handoff' } & OrchestratorHandoff);

export function describeOrchestratorResponseContract(): string {
    const prompts = getAgenticoPrompts();
    return [prompts.responseRulesHeading, ...prompts.responseRules.map((rule) => `- ${rule}`)].join('\n');
}

export function buildOrchestratorPrompt(userGoal: string, cliCatalog: string, pageContext?: string | null): string {
    const prompts = getAgenticoPrompts();
    const pageContextSection = pageContext
        ? `\n${prompts.pageContextHeading}\n${prompts.pageContextIntro}\n${pageContext}\n`
        : '';

    return `${prompts.orchestratorIntro}

${prompts.toolsHeading}
${cliCatalog}
${pageContextSection}
${describeOrchestratorResponseContract()}

${prompts.userRequestHeading}
${userGoal}`;
}

/** `handoff` arriva dal context della sessione (settato dall'execute() del tool invocato in
 * questo turno, vedi agenticoOrchestratorAgent.ts) — se presente ha sempre priorità sul testo
 * libero del modello, che a quel punto è solo un commento discorsivo sul tool appena invocato. */
export function parseOrchestratorResponse(raw: string, handoff: OrchestratorHandoff | null): OrchestratorResult {
    if (handoff) return { kind: 'handoff', ...handoff };
    return { kind: 'chat', message: raw };
}
