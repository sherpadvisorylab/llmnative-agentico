import type { ComponentAnchor } from './AgenticoContext';
import type { ResultDestination } from '../domain/resultDestination';

/** Consegna a un componentAnchor live (es. ThemeEditor per theme) trattata come UNA destinazione
 * qualunque tra quelle proposte da ResultDestinationPicker — non più un canale a parte con
 * consegna automatica silenziosa (bug segnalato: il risultato finiva nel componente PRIMA che
 * l'utente vedesse alcuna anteprima o cliccasse alcunché). Stesso schema per ogni subagent, con
 * o senza AI: risultato → anteprima in chat → click esplicito → applica. Nessun `id` restituito
 * (l'entità non è ancora persistita finché l'utente non salva lui stesso nel componente aperto —
 * `commitEntityChat` si occupa di quel momento separatamente, dal Save del componente stesso). */
export function buildLiveAnchorDestination(
    matching: ComponentAnchor[],
    meta: Record<string, unknown>,
    taskId: string,
): ResultDestination | null {
    if (matching.length === 0) return null;
    return {
        id:    'live-component',
        label: 'Applica al componente aperto',
        async apply(result) {
            matching.forEach((a) => a.onResult?.(result, meta, taskId));
        },
    };
}
