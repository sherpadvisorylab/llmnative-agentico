import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { DataProvider, I18nProvider, MockDataProvider } from '@llmnative/react';
import { MemoryRouter } from 'react-router-dom';
import { AgenticoProvider, agenticoTranslations, createAgenticoBackend, type AgenticoSettingsConfig } from '../../src';
import { defaultHarnessModel, withReasoning } from '../../src/backend/runnerHarness';

// CR-026: the harness of the runner of the namespace reads its models once per backend, however often the host
// renders — with the strings of Agentico of the host too (a new object each render looped on /v1/models).

function runnerBackend() {
    const asked: string[] = [];
    const fetch = (async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        asked.push(new URL(url).pathname);
        if (url.endsWith('/runner/v1/models')) {
            return Response.json({ providers: [{ id: 'claude-code', kind: 'subscription', models: ['haiku'], accounts: 1, available: 1, yours: 0, tenant: 1 }] });
        }
        return new Response('{}', { status: 404 });
    }) as typeof globalThis.fetch;
    return { backend: createAgenticoBackend({ baseUrl: 'https://host.test/api/agentico', fetch }), asked };
}

describe('the harness of the backend', () => {
    it('reads the models of the runner once, across renders of the host with its own strings', async () => {
        const { backend, asked } = runnerBackend();
        let rerender: () => void = () => undefined;
        function Host() {
            const [, setTick] = useState(0);
            rerender = () => setTick((tick) => tick + 1);
            const settings: AgenticoSettingsConfig = { backend };
            return (
                <MemoryRouter>
                    <DataProvider registry={{ default: new MockDataProvider() }} defaultKey="default">
                        <AgenticoProvider settings={settings}>{null}</AgenticoProvider>
                    </DataProvider>
                </MemoryRouter>
            );
        }
        render(<I18nProvider config={{ locale: 'it', translations: { it: agenticoTranslations.it } }}><Host /></I18nProvider>);
        await waitFor(() => expect(asked.filter((path) => path.endsWith('/runner/v1/models'))).toHaveLength(1));
        for (let index = 0; index < 5; index += 1) await act(async () => rerender());
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(asked.filter((path) => path.endsWith('/runner/v1/models'))).toHaveLength(1);
    });
});

describe('the defaults of the subscriptions (CR-030)', () => {
    const models = [
        { label: 'Claude Code · sonnet', value: 'runner:claude-code/sonnet' },
        { label: 'Claude Code · opus', value: 'runner:claude-code/opus' },
        { label: 'OpenCode Go · kimi-k3', value: 'runner:opencode-go/kimi-k3' },
    ];

    it('a chat starts on the default model of the first subscription that has one it runs; none: on the catalog', () => {
        expect(defaultHarnessModel(models, {})).toBeUndefined();
        expect(defaultHarnessModel(models, { 'opencode-go': { model: 'kimi-k3' } })).toBe('runner:opencode-go/kimi-k3');
        expect(defaultHarnessModel(models, { 'claude-code': { model: 'opus' }, 'opencode-go': { model: 'kimi-k3' } })).toBe('runner:claude-code/opus');
        // A model the subscription does not run now is passed over.
        expect(defaultHarnessModel(models, { 'claude-code': { model: 'gone' }, 'opencode-go': { model: 'kimi-k3' } })).toBe('runner:opencode-go/kimi-k3');
        expect(defaultHarnessModel(models, { 'claude-code': { reasoning: 'high' } })).toBeUndefined();
    });

    it('how much it reasons: Claude Code by its effort, opencode by the variant (medium: its own default)', () => {
        expect(withReasoning({ provider: 'claude-code', model: 'opus' }, 'max')).toEqual({ provider: 'claude-code', model: 'opus', effort: 'max' });
        expect(withReasoning({ provider: 'opencode-go', model: 'kimi-k3' }, 'high')).toEqual({ provider: 'opencode-go', model: 'kimi-k3', variant: 'high' });
        expect(withReasoning({ provider: 'opencode-go', model: 'kimi-k3' }, 'medium')).toEqual({ provider: 'opencode-go', model: 'kimi-k3' });
        expect(withReasoning({ provider: 'claude-code', model: 'opus' }, undefined)).toEqual({ provider: 'claude-code', model: 'opus' });
    });
});
