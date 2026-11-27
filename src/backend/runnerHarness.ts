// CR-026: the harness of a runner for Agentico (from the CMS): Claude Code (or opencode) with the subscription of the
// person, on the runner of their namespace, through the server of Agentico (it checks the person and adds the key of
// the namespace). Agentico gives the brief and the tools of the agent; the harness runs the chat on the runner and
// calls the tools back in the app.
import { noCreditUntil, RunnerError, type RunnerChatModel, type RunnerClient, type RunnerModels } from '@llmnative/runner/client';
import type { AgentExecutorModel } from '../domain/agentDefinition';
import type { AgenticoHarness, AgenticoHarnessTurn } from '../domain/harness';
import type { AgenticoRunnerDefault } from './agenticoBackend';

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
 * How much a model of the runner reasons, from the defaults of its subscription (CR-030): Claude Code by its effort,
 * opencode by the variant of the model (medium: its own default, none given).
 */
export function withReasoning(model: RunnerChatModel, reasoning: AgenticoRunnerDefault['reasoning']): RunnerChatModel {
    if (!reasoning) return model;
    if (model.provider === 'claude-code') return { ...model, effort: reasoning };
    return reasoning === 'medium' ? model : { ...model, variant: reasoning };
}

/**
 * The model a chat starts with on the runner (CR-030): the default model of the first subscription, in the order of
 * the models offered, that the admin gave one and that runs it now; none otherwise (the chat starts on the catalog).
 */
export function defaultHarnessModel(models: AgentExecutorModel[], defaults: Record<string, AgenticoRunnerDefault>): string | undefined {
    const providers = [...new Set(models.map((model) => modelOf(model.value)?.provider).filter((id): id is string => !!id))];
    for (const provider of providers) {
        const chosen = defaults[provider]?.model;
        const value = chosen ? `${PREFIX}${provider}/${chosen}` : undefined;
        if (value && models.some((model) => model.value === value)) return value;
    }
    return undefined;
}

/**
 * A harness on a runner client (pointed at runnerApi of the tenant). `models` is what `refresh` read last: Agentico
 * asks for it while rendering, so it is kept here, not fetched each time. `defaults` (CR-030): per subscription, the
 * model chats start with and how much it reasons.
 */
export function createRunnerHarness(
    client: RunnerClient,
    texts: RunnerHarnessTexts,
    initial: AgentExecutorModel[] = [],
    loadDefaults?: () => Promise<Record<string, AgenticoRunnerDefault>>,
): AgenticoHarness & { refresh(): Promise<AgentExecutorModel[]> } {
    let models = initial;
    let defaults: Record<string, AgenticoRunnerDefault> = {};
    return {
        models: () => models,
        defaultModel: () => defaultHarnessModel(models, defaults),
        async refresh() {
            const [read, given] = await Promise.all([client.models(), loadDefaults ? loadDefaults().catch(() => ({})) : Promise.resolve({})]);
            models = harnessModels(read, texts);
            defaults = given;
            return models;
        },
        async turn(turn: AgenticoHarnessTurn) {
            const picked = modelOf(turn.model);
            if (!picked) throw new Error(texts.noProvider);
            const model = withReasoning(picked, defaults[picked.provider]?.reasoning);
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
