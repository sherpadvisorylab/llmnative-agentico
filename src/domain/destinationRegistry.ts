// Registro delle destinazioni per id, letto da ResultDestinationPicker per risolvere
// `manifest.destinationIds` in `ResultDestination` reali — stesso principio di
// subagentRegistry.ts: Agentico possiede SOLO `jsonExportDestination` (generica, funziona per
// qualunque TResult), mai una destinazione specifica di un subagent concreto (es.
// componentLibraryDestination, specifica di html-to-liquid). L'host la registra una volta
// all'avvio (vedi CmsProviders.tsx), Agentico si limita a fondere quel registro con la propria
// voce generica sempre presente.
import type { ResultDestination } from './resultDestination';
import { jsonExportDestination } from './jsonExportDestination';

let hostDestinations: Record<string, ResultDestination<any>> = {};

/** Chiamata dall'host UNA VOLTA, a livello di modulo — un secondo giro SOSTITUISCE il registro
 * precedente, stesso principio di registerSubagents. */
export function registerDestinations(destinations: Record<string, ResultDestination<any>>): void {
    hostDestinations = destinations;
}

export function getDestinationRegistry(): Record<string, ResultDestination<any>> {
    return { [jsonExportDestination.id]: jsonExportDestination, ...hostDestinations };
}
