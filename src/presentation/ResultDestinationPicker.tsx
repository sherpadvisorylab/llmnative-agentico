import React, { useState } from 'react';
import { useProxy } from '@llmnative/react';
import type { SubagentManifest } from '../domain/subagentManifest';
import { getDestinationRegistry } from '../domain/destinationRegistry';
import { JSON_EXPORT_DESTINATION_ID, jsonExportDestination } from '../domain/jsonExportDestination';
import type { ResultDestination } from '../domain/resultDestination';
import { interpolate } from '@llmnative/react';
import { useAgenticoI18n } from '../i18n';
import { useAgentico } from './AgenticoContext';
import { deriveHistoryTitle } from './deriveHistoryTitle';

/** Mostrata da SubagentRunner una volta che il subagent ha prodotto un risultato — un bottone
 * per destinazione dichiarata dal manifest (`destinationIds`) più "Esporta come JSON", sempre
 * disponibile per qualunque risultato (vedi jsonExportDestination). Le destinazioni tenant-scoped
 * (theme, component-library) scrivono SOLO nel tenant attualmente attivo — vedi
 * DestinationContext, nessuna scelta di un tenant diverso qui (decisione esplicita, vedi piano). */
export function ResultDestinationPicker({
    manifest, result, meta, taskId, initiallyApplied, onApplied, extraDestinations,
}: {
    manifest: SubagentManifest<any, any, any>;
    result: unknown;
    meta: Record<string, unknown>;
    /** Id del task Agentico che ha prodotto questo risultato — passato a `commitEntityChat`
     * quando un apply esplicito (click qui) restituisce un `id` (vedi sotto). Assente = nessuna
     * persistenza dello storico per questo click (nessun task noto da cui pescare uno snapshot),
     * comportamento invariato per un eventuale chiamante futuro senza un task Agentico dietro. */
    taskId?: string;
    /** Destinazioni già applicate in precedenza (es. riaprendo un'esecuzione dallo storico) —
     * mostrate subito come spuntate invece di far credere che vadano riapplicate da zero. */
    initiallyApplied?: string[];
    /** Chiamato dopo un apply riuscito — usato da SubagentRunner per aggiornare la voce di
     * storico (appliedDestinationIds), assente quando il chiamante non ne ha bisogno (es. una
     * destinazione già storicizzata che si vuole solo ri-esportare). */
    onApplied?: (destinationId: string) => void;
    /** Destinazioni scoped alla pagina/istanza corrente (es. "Applica a questo Site aperto"),
     * mai registrate nel destinationRegistry condiviso perché chiudono su stato React di UNA
     * pagina specifica — mostrate accanto a quelle del registry, non al loro posto. */
    extraDestinations?: ResultDestination[];
}) {
    const t = useAgenticoI18n();
    const sidebar = useAgentico();
    const scope = sidebar.scope;
    const proxyFetch = useProxy();
    const [pending, setPending] = useState<string | null>(null);
    const [done, setDone] = useState<Set<string>>(new Set(initiallyApplied ?? []));
    const [error, setError] = useState<string | null>(null);

    // Mappa per id, non una semplice concatenazione: un extraDestination con lo STESSO id di
    // una destinazione del registry la SOVRASCRIVE nella stessa posizione invece di duplicarla —
    // utile a una pagina che vuole avvolgere una destinazione generica con un'informazione
    // scoped a sé (es. "collega anche al Site aperto") che il registry tenant-wide non può
    // conoscere da solo.
    const registry = getDestinationRegistry();
    const destinationMap = new Map<string, ResultDestination>();
    manifest.destinationIds.forEach((id: string) => { const d = registry[id]; if (d) destinationMap.set(id, d); });
    (extraDestinations ?? []).forEach((d) => destinationMap.set(d.id, d));
    destinationMap.set(jsonExportDestination.id, jsonExportDestination);
    const destinations = Array.from(destinationMap.values());

    const run = async (destinationId: string) => {
        setPending(destinationId);
        setError(null);
        try {
            const destination = destinationMap.get(destinationId);
            if (!destination) throw new Error(interpolate(t.unknownDestination, { id: destinationId }));
            if (destinationId !== JSON_EXPORT_DESTINATION_ID && !scope) {
                throw new Error(t.destinationNoScope);
            }
            const outcome = await destination.apply(result, {
                scopeId:         scope?.id ?? '',
                // json-export (the only destination allowed without a scope) never reads it.
                dataProvider:    scope?.dataProvider as NonNullable<typeof scope>['dataProvider'],
                storageProvider: scope?.storageProvider ?? null,
                proxyFetch,
            }, meta);
            setDone((prev) => new Set(prev).add(destinationId));
            onApplied?.(destinationId);
            // Un apply riuscito CON un id è, per definizione, l'entità che questo click ha
            // scritto — stessa persistenza dello storico già fatta per l'auto-apply
            // (SubagentRunner.tsx), qui per il caso "l'utente ha cliccato lui stesso il
            // bottone" (es. "Applica a questo Component" di html-to-liquid, che non ha
            // autoApplyDestinationIds): senza questo, quella chat non finiva MAI nello storico
            // (bug segnalato — solo theme/redirects, che la persistono per conto proprio,
            // comparivano).
            if (outcome?.id) {
                sidebar.commitEntityChat(manifest.id, outcome.id, taskId, scope?.id, meta, deriveHistoryTitle(manifest, meta));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPending(null);
        }
    };

    return (
        <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t.destinationPickerTitle}</p>
            <div className="flex flex-wrap gap-2">
                {destinations.map((destination) => (
                    <button
                        key={destination.id}
                        type="button"
                        disabled={pending !== null}
                        onClick={() => void run(destination.id)}
                        className="cursor-pointer rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {pending === destination.id ? t.destinationApplying : `${done.has(destination.id) ? '✓ ' : ''}${destination.id === JSON_EXPORT_DESTINATION_ID ? t.exportJson : destination.label}`}
                    </button>
                ))}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
