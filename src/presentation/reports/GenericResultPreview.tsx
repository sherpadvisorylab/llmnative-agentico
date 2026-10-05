import React, { useState } from 'react';
import { Code } from '@llmnative/react';

/** Anteprima di riserva per un subagent SENZA un report registrato (oggi: theme, redirects) —
 * mostrata nella stessa identica posizione/momento di un vero `SubagentReportModule.Report`
 * (prima del bottone "Applica"), cosi ogni subagent, con o senza report dedicato, con o senza
 * AI, passa dallo STESSO schema "vedi il risultato → poi applica", mai un apply automatico
 * silenzioso. Un JSON grezzo non è bello quanto uno swatch di colori o una griglia editabile,
 * ma è sempre meglio di applicare alla cieca — un report dedicato resta la via preferita quando
 * ne vale la pena scriverne uno (vedi subagentReportRegistry.tsx). */
export function GenericResultPreview({ result }: { result: unknown }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div
            className={`relative cursor-pointer rounded-md border border-border/60 ${expanded ? 'max-h-80 overflow-y-auto' : 'max-h-28 overflow-hidden'}`}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Clic per comprimere' : 'Clic per espandere'}
        >
            <Code language="json" showCopy={expanded} background="transparent" className="!text-[11px]">
                {JSON.stringify(result, null, 2)}
            </Code>
            {!expanded && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-muted/30 to-transparent" />
            )}
        </div>
    );
}
