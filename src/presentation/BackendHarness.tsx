// CR-026: the harness of the runner of the namespace, built by Agentico from the server of the host: the models of the
// person's subscriptions next to the API models, for every agent. Offered only when the runner answers; otherwise
// Agentico stays on the API models. Mounted by the provider only with a backend (it reads the texts of Agentico).
import { useEffect, useMemo } from 'react';
import { interpolate } from '@llmnative/react';
import type { AgenticoBackend } from '../backend/agenticoBackend';
import { createRunnerHarness } from '../backend/runnerHarness';
import type { AgenticoHarness } from '../domain/harness';
import { useAgenticoI18n } from '../i18n';

export function BackendHarness({ backend, onChange }: { backend: AgenticoBackend; onChange: (harness: AgenticoHarness | null) => void }) {
    const t = useAgenticoI18n();
    const harness = useMemo(() => createRunnerHarness(backend.runner(), {
        group: (provider) => interpolate(t.harnessGroup, { provider }),
        noCredit: (at) => interpolate(t.harnessNoCredit, { at }),
        noProvider: t.harnessNoProvider,
        failed: (code) => interpolate(t.harnessFailed, { code }),
    }), [backend, t]);
    useEffect(() => {
        let current = true;
        harness.refresh().then((models) => { if (current) onChange(models.length ? { ...harness, models: harness.models } : null); }, () => { if (current) onChange(null); });
        return () => {
            current = false;
            onChange(null);
        };
    }, [harness, onChange]);
    return null;
}
