// CR-026: the harness of a runner for Agentico (from the CMS): Claude Code (or opencode) with the subscription of the
// person, on the runner of their namespace, through the server of Agentico (it checks the person and adds the key of
// the namespace). Agentico gives the brief and the tools of the agent; the harness runs the chat on the runner and
// calls the tools back in the app.
import { noCreditUntil, RunnerError, type RunnerChatModel, type RunnerClient, type RunnerModels } from '@llmnative/runner/client';
import type { AgentExecutorModel } from '../domain/agentDefinition';
import type { AgenticoHarness, AgenticoHarnessTurn } from '../domain/harness';

export type RunnerHarnessTexts = {
    /** The group of the models in the composer, e.g. "Claude Code · your subscription". */
    group: (provider: string) => string;
    /** The credit of the subscription is over until {at}. */
    noCredit: (at: string) => string;
    /** No subscription connected that runs this model. */
    noProvider: string;
    /** The runner is busy or did not answer. */
    failed: (code: string) => string;
};

const PROVIDER_NAMES: Record<string, string> = { 'claude-code': 'Claude Code', 'opencode-go': 'OpenCode Go', opencode: 'OpenCode Zen' };
const PREFIX = 'runner:';

/** `runner:claude-code/sonnet` ↔ the model of a chat on the runner. */
export function modelOf(value: string): RunnerChatModel | null {
    if (!value.startsWith(PREFIX)) return null;
    const [provider, ...rest] = value.slice(PREFIX.length).split('/');
    return provider && rest.length ? { provider, model: rest.join('/') } : null;
}

/** The models the person can run now: providers with an account of theirs (or of the tenant) available. */
export function harnessModels(models: RunnerModels, texts: Pick<RunnerHarnessTexts, 'group'>): AgentExecutorModel[] {
    return models.providers
        .filter((provider) => provider.available > 0 && (provider.yours > 0 || provider.tenant > 0))
        .flatMap((provider) => provider.models.map((model) => ({
            label: `${PROVIDER_NAMES[provider.id] ?? provider.id} · ${model}`,
            value: `${PREFIX}${provider.id}/${model}`,
            group: texts.group(PROVIDER_NAMES[provider.id] ?? provider.id),
        })));
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Words for the person from what the runner said. */
function failureOf(error: unknown, texts: RunnerHarnessTexts): Error {
    if (error instanceof RunnerError) {
        if (error.code === 'no-credit') return new Error(texts.noCredit(error.until ? timeOf(error.until) : '?'));
        if (error.code === 'no-provider') return new Error(texts.noProvider);
        return new Error(texts.failed(error.code));
    }
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * A harness on a runner client (pointed at runnerApi of the tenant). `models` is what `refresh` read last: Agentico
 * asks for it while rendering, so it is kept here, not fetched each time.
 */
export function createRunnerHarness(client: RunnerClient, texts: RunnerHarnessTexts, initial: AgentExecutorModel[] = []): AgenticoHarness & { refresh(): Promise<AgentExecutorModel[]> } {
    let models = initial;
    return {
        models: () => models,
        async refresh() {
            models = harnessModels(await client.models(), texts);
            return models;
        },
        async turn(turn: AgenticoHarnessTurn) {
            const model = modelOf(turn.model);
            if (!model) throw new Error(texts.noProvider);
            let text = '';
            let reasoning = '';
            try {
                if (turn.first) await client.chats.start(turn.chatId, turn.tools);
                const events = client.chats.send(turn.chatId, {
                    text: turn.prompt,
                    model,
                    ...(turn.attachments?.length ? { attachments: turn.attachments.map((file) => ({ name: file.name ?? 'file', mimeType: file.mimeType, base64: file.base64 })) } : {}),
                }, turn.signal);
                for await (const event of events) {
                    if (event.type === 'text') {
                        text += event.text;
                        turn.onText(text);
                    } else if (event.type === 'reasoning') {
                        reasoning += event.text;
                        turn.onReasoning(reasoning);
                    } else if (event.type === 'step') {
                        turn.onStep({ id: event.id, label: event.label, status: event.status });
                    } else if (event.type === 'tool-call') {
                        // A tool of the agent: run in the app (approval, step, card), its answer back to the harness.
                        const answer = await turn.callTool(event.name, event.input);
                        await client.chats.answerCall(turn.chatId, event.id, answer);
                    } else if (event.type === 'error') {
                        const until = noCreditUntil(event);
                        throw until ? new Error(texts.noCredit(timeOf(until))) : new Error(texts.failed(event.message));
                    } else if (event.type === 'done') {
                        break;
                    }
                }
            } catch (error) {
                if (turn.signal.aborted) throw error;
                throw failureOf(error, texts);
            }
            if (reasoning) turn.onReasoning(reasoning, { done: true });
            return { text };
        },
        async close(chatId: string) {
            await client.chats.close(chatId).catch(() => false);
        },
    };
}
