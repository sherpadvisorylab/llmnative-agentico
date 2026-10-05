// Normalizza un errore di chiamata AI in un messaggio leggibile — condiviso da ogni chiamante
// di useAgent (prima duplicato identico in SiteEditorPage.tsx). I provider AI (OpenAI,
// Anthropic, Gemini) non lanciano sempre un vero Error: spesso è un oggetto con la forma
// { error: { message } } propagato as-is dalla loro risposta HTTP.
export function extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (err !== null && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        // Forma comune quanto { error: { message } } — alcuni provider (visto con OpenCode
        // locale) rispondono con { error: "testo" } invece che { error: { message: "testo" } }.
        if (typeof e.error === 'string') return e.error;
        if (e.error && typeof e.error === 'object') {
            const inner = e.error as Record<string, unknown>;
            if (typeof inner.message === 'string') return inner.message;
        }
        if (typeof e.message === 'string') return e.message;
        if (typeof e.status === 'number') return `HTTP ${e.status}`;
        // Forma sconosciuta — meglio un dump JSON leggibile (e diagnosticabile) che
        // "[object Object]" da String(err) sul default toString() di un plain object.
        try { return JSON.stringify(err); } catch { /* fall through */ }
    }
    return String(err);
}
