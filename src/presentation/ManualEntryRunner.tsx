import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '@llmnative/react';
import { useAgent } from './useAgent';
import { useAgenticoI18n } from '../i18n';
import { useAgentico } from './AgenticoContext';
import type { SubagentManifest } from '../domain/subagentManifest';
import type { ResultDestination } from '../domain/resultDestination';
import { ResultDestinationPicker } from './ResultDestinationPicker';
import { getSubagentReport, type SubagentSelection } from './reports/subagentReportRegistry';
import { GenericResultPreview } from './reports/GenericResultPreview';
import { buildLiveAnchorDestination } from './liveAnchorDestination';

/** Percorso "senza AI" per un subagent già scoped (un solo target possibile, niente da
 * instradare — vedi SubagentManifest.manualEntry e AgenticoContext.startManualEntry), montato
 * quando l'orchestratore stesso non riesce a partire (AI giù) ma il chiamante sa già a priori
 * quale subagent servirà. Mostra il prompt statico del manifest; sul primo testo inviato
 * dall'utente costruisce i TParams DIRETTAMENTE dal testo grezzo (`manualEntry.fromRawText`) e
 * chiama `agent.run()` con l'AI disabilitata a priori — `buildContext` (sempre deterministico)
 * gira comunque, ma la chiamata AI viene saltata del tutto (vedi useAgent.run, ramo
 * `!enabled`), zero round-trip di rete, zero possibilità di fallire per un provider giù.
 *
 * Il risultato è mostrato in anteprima (report del subagent se registrato, altrimenti
 * `GenericResultPreview`) più `ResultDestinationPicker` — STESSO identico schema di
 * SubagentRunner, mai un apply automatico appena arriva il risultato (bug segnalato: prima
 * consegnava subito a un anchor live o alla prima extraDestination, senza che l'utente vedesse
 * nulla prima). Un componentAnchor live (es. ThemeEditor per theme) è trattato come una
 * destinazione in più tra quelle proposte (vedi liveAnchorDestination.ts), non un canale a
 * parte. */
export function ManualEntryRunner({
    manifest, extraDestinations,
}: {
    manifest: SubagentManifest<any, any, any>;
    extraDestinations?: ResultDestination[];
}) {
    const agent = useAgent(manifest.definition, { defaultEnabled: false });
    const t = useAgenticoI18n();
    const sidebar = useAgentico();
    const taskId = useRef(`manual-${manifest.id}-${crypto.randomUUID()}`).current;
    const [result, setResult] = useState<unknown>(null);
    const [appliedIds, setAppliedIds] = useState<string[]>([]);
    const reportModule = getSubagentReport(manifest.id);
    const selectionModule = reportModule?.kind === 'selection' ? reportModule : null;
    const [selection, setSelection] = useState<SubagentSelection | null>(null);
    // Ultimi TParams usati con successo — riusati sia per costruire `meta` per
    // ResultDestinationPicker sia da "Riprendi con AI" (AgenticoContext.resumeWithAI) come punto
    // di partenza per un vero SubagentRunner, invece di far ridigitare da capo lo stesso testo.
    const [lastParams, setLastParams] = useState<Record<string, unknown> | null>(null);
    const dismissedRef = useRef(false);

    const handleSubmit = (rawText: string) => {
        if (!manifest.manualEntry) return;
        let params;
        try {
            params = manifest.manualEntry.fromRawText(rawText);
        } catch (err) {
            // Difensivo — il composer (Chatbot) blocca già l'invio di testo vuoto/whitespace,
            // stessa condizione che fromRawText tipicamente rifiuta; nessun canale per mostrare
            // un errore sincrono qui (niente sessione ancora avviata su cui appoggiarlo).
            console.error('[ManualEntryRunner] manualEntry.fromRawText ha rifiutato il testo:', err);
            return;
        }
        setLastParams(params as Record<string, unknown>);
        setAppliedIds([]);
        void agent.run(params, { openingMessage: rawText }).then((r) => { if (r) setResult(r); });
    };

    useEffect(() => {
        if (result && selectionModule) setSelection(selectionModule.defaultSelection(result));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, selectionModule]);

    const handleSelectionChange = (key: string, value: boolean | string) => {
        setSelection((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    const handleResultChange = (next: unknown) => setResult(next);

    // Memoizzato: applySelection ritorna sempre un oggetto NUOVO (spread) — senza useMemo,
    // ogni render produrrebbe un filteredResult diverso, e finendo nelle dipendenze dell'effect
    // di sidebar.openTask sotto, quell'effect non si stabilizzerebbe mai (loop di re-render
    // infinito, "Maximum update depth exceeded" — bug osservato). Stesso identico principio già
    // documentato in SubagentRunner.tsx.
    const filteredResult = useMemo(
        () => (result && selectionModule && selection ? selectionModule.applySelection(result, selection) : result),
        [result, selectionModule, selection],
    );

    const handleDestinationApplied = (destinationId: string) => {
        setAppliedIds((prev) => (prev.includes(destinationId) ? prev : [...prev, destinationId]));
    };

    // Memoizzati per lo stesso motivo — non sono nelle dipendenze dell'effect sotto (solo
    // `sidebar.componentAnchors`/`lastParams` lo sono), ma restano comunque props di
    // ResultDestinationPicker dentro `panelExtra`: un riferimento nuovo a ogni render vi
    // propagherebbe un re-render inutile a ogni giro, oltre a essere inutilmente fragile se in
    // futuro qualcuno li aggiungesse alle dipendenze.
    const matchingAnchors = useMemo(
        () => sidebar.componentAnchors.filter((a) => a.subagentId === manifest.id && a.onResult),
        [sidebar.componentAnchors, manifest.id],
    );
    const liveAnchorDestination = useMemo(
        () => (lastParams ? buildLiveAnchorDestination(matchingAnchors, lastParams, taskId) : null),
        [matchingAnchors, lastParams, taskId],
    );
    const pickerExtraDestinations = useMemo(
        () => (liveAnchorDestination ? [liveAnchorDestination, ...(extraDestinations ?? [])] : extraDestinations),
        [liveAnchorDestination, extraDestinations],
    );

    useEffect(() => {
        if (dismissedRef.current) return;
        sidebar.openTask({
            id: taskId, title: manifest.label, icon: manifest.icon, agent,
            onApplied: (r: unknown) => setResult(r),
            manualEntry: manifest.manualEntry ? { prompt: manifest.manualEntry.prompt, onSubmit: handleSubmit } : undefined,
            onDismiss: () => {
                dismissedRef.current = true;
                if (agent.running) agent.stop();
                sidebar.closeTask(taskId);
            },
            panelExtra: result ? (
                <div className="space-y-2">
                    {selectionModule && selection ? (
                        <selectionModule.Report result={result} selection={selection} onChange={handleSelectionChange} />
                    ) : reportModule?.kind === 'editable' ? (
                        <reportModule.Report result={result} onResultChange={handleResultChange} />
                    ) : (
                        <GenericResultPreview result={filteredResult} />
                    )}
                    <ResultDestinationPicker
                        manifest={manifest} result={filteredResult} meta={lastParams ?? {}} taskId={taskId}
                        initiallyApplied={appliedIds} onApplied={handleDestinationApplied}
                        extraDestinations={pickerExtraDestinations}
                    />
                    {/* Il "contrario" di startManualEntry — niente da rifare, solo il canale che
                        cambia: gli stessi `lastParams` avviano un vero SubagentRunner (AI
                        abilitata) al posto di questo task. Nascosto se non esiste nemmeno un
                        provider configurato: riprovare con AI fallirebbe di nuovo allo stesso
                        modo, senza aggiungere nulla. */}
                    {agent.hasProviders && (
                        <ActionButton
                            label={t.resumeWithAi}
                            variant="outline-secondary"
                            className="text-xs"
                            onClick={() => { if (lastParams) sidebar.resumeWithAI(manifest.id, lastParams, extraDestinations); }}
                        />
                    )}
                </div>
            ) : undefined,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent.activity, agent.running, agent.error, agent.hasProviders, sidebar.componentAnchors, result, filteredResult, selection, appliedIds, lastParams]);

    useEffect(() => {
        return () => { sidebar.closeTask(taskId); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}
