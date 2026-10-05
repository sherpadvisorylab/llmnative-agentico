// Destinazione generica — funziona per QUALUNQUE TResult, sempre disponibile (vedi
// ResultDestinationPicker, che la elenca oltre a manifest.destinationIds, non al posto loro).
import type { ResultDestination } from './resultDestination';

export const JSON_EXPORT_DESTINATION_ID = 'json-export';

export const jsonExportDestination: ResultDestination<unknown> = {
    id:    JSON_EXPORT_DESTINATION_ID,
    label: 'Export as JSON', // shown through the agentico.exportJson translation by the picker
    async apply(result) {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = `tool-result-${Date.now()}.json`;
            a.click();
        } finally {
            URL.revokeObjectURL(url);
        }
    },
};
