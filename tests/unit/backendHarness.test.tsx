import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { DataProvider, I18nProvider, MockDataProvider } from '@llmnative/react';
import { MemoryRouter } from 'react-router-dom';
import { AgenticoProvider, agenticoTranslations, createAgenticoBackend, type AgenticoSettingsConfig } from '../../src';

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
