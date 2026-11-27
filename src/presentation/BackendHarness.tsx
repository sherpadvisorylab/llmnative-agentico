// CR-026: the harness of the runner of the namespace, built by Agentico from the server of the host: the models of the
// person's subscriptions next to the API models, for every agent. Offered only when the runner answers; otherwise
// Agentico stays on the API models. Mounted by the provider only with a backend (it reads the texts of Agentico).
import { useEffect, useMemo, useRef } from 'react';
import { interpolate } from '@llmnative/react';
import type { AgenticoBackend } from '../backend/agenticoBackend';
import { createRunnerHarness } from '../backend/runnerHarness';
import type { AgenticoHarness } from '../domain/harness';
import { useAgenticoI18n } from '../i18n';

export function BackendHarness({ backend, onChange }: { backend: AgenticoBackend; onChange: (harness: AgenticoHarness | null) => void }) {
    const t = useAgenticoI18n();
    // The texts are read when used: the harness (and its one read of the models) follows the backend only, never a
    // new render of the host.
    const texts = useRef(t);
    texts.current = t;
    const harness = useMemo(() => createRunnerHarness(backend.runner(), {
        group: (provider) => interpolate(texts.current.harnessGroup, { provider }),
        noCredit: (at) => interpolate(texts.current.harnessNoCredit, { at }),
        get noProvider() { return texts.current.harnessNoProvider; },
        failed: (code) => interpolate(texts.current.harnessFailed, { code }),
    }, [], () => backend.runnerDefaults.get()), [backend]);
    useEffect(() => {
        let current = true;
        harness.refresh().then((models) => { if (current) onChange(models.length ? { ...harness, models: harness.models, defaultModel: harness.defaultModel } : null); }, () => { if (current) onChange(null); });
        return () => {
            current = false;
            onChange(null);
        };
    }, [harness, onChange]);
    return null;
}
