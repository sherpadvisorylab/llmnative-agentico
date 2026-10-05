// Estrae un blocco JSON dalla risposta grezza di un agente — condiviso da ogni parseResponse
// che si aspetta un ```json ... ``` (theme-extract, html-to-liquid, e i prossimi).
//
// Cerca il fence OVUNQUE nel testo, non solo se occupa l'intera risposta: un micro-prompt
// trasversale (vedi microPrompts.ts — es. "chiudi sempre con un riepilogo") può far si che il
// modello aggiunga prosa prima o dopo il blocco JSON. Il vecchio comportamento (strip dei soli
// fence iniziale/finale, poi JSON.parse sull'intera stringa) romperebbe silenziosamente il
// parsing non appena comparisse anche una sola riga di prosa attorno al JSON.
export function extractJsonBlock(raw: string): string {
    const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
    if (fenced) return fenced[1].trim();
    // Nessun fence trovato — il modello a volte lo dimentica proprio (l'istruzione "output
    // ONLY the raw JSON" non è sempre rispettata su turni di follow-up lunghi) e scrive il JSON
    // valido seguito, SENZA delimitatori, da un paragrafo di riepilogo in prosa (bug osservato:
    // JSON.parse falliva con "Unexpected non-whitespace character AFTER json" — cioè il JSON
    // stesso era completo e corretto, il problema era solo il testo attaccato subito dopo).
    // Isoliamo il primo valore JSON bilanciato (oggetto o array) contando parentesi/graffe e
    // ignorando quelle dentro le stringhe, e tagliamo lì — qualunque prosa dopo viene scartata.
    const stripped = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    const balanced = extractFirstBalancedJsonValue(stripped);
    return balanced ?? stripped;
}

function extractFirstBalancedJsonValue(text: string): string | null {
    const start = text.search(/[{[]/);
    if (start === -1) return null;

    const open = text[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === open) depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}
