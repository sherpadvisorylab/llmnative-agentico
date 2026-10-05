// Contratto comune per "dove può andare" il risultato di un subagent — disaccoppiato dal
// subagent stesso (vedi SubagentManifest.destinationIds in ./subagentManifest.ts).
// Consumato dal ResultDestinationPicker mostrato in Agentico per QUALUNQUE invocazione di un
// subagent — sia quelle avviate da /tools sia quelle avviate da pagine specifiche (Site Editor,
// Component Editor) tramite extraDestinations scoped a quella pagina (vedi ResultDestinationPicker
// e SubagentRunner).
import type { DataProviderAdapter, StorageProviderAdapter } from '@llmnative/react';

export interface DestinationContext {
    /** Id of the host scope the result is saved into (a tenant, a company…) — see AgenticoScope. */
    scopeId:         string;
    dataProvider:    DataProviderAdapter;
    storageProvider: StorageProviderAdapter | null;
    proxyFetch:      typeof fetch;
}

/** Esito opzionale di un apply — `id` (usato da destinazioni tenant-wide come
 * componentLibraryDestination per far sapere al chiamante l'id della risorsa creata/aggiornata,
 * un'informazione che una destinazione generica non può conoscere da sola: vedi
 * ResultDestinationPicker.commitEntityChat). `void` per le destinazioni che non hanno nulla da
 * restituire — non un cambio breaking, tutte le destinazioni esistenti restano valide. */
export type ResultDestinationOutcome = { id?: string } | void;

export interface ResultDestination<TResult = unknown> {
    id:    string;
    label: string;
    /** `meta` è il TParams con cui il subagent è stato lanciato (es. `{ url }` per theme) —
     * alcuni risultati non si bastano da soli (es. ThemeExtractResult non porta l'URL
     * sorgente, servito solo per nominare il tema). */
    apply(result: TResult, ctx: DestinationContext, meta: Record<string, unknown>): Promise<ResultDestinationOutcome>;
}
