// Layer di micro-prompt trasversali — frammenti di istruzione che si aggiungono in coda al
// prompt VERTICALE di un agente specifico (theme-extract, html-to-liquid, e i prossimi)
// SENZA che quell'agente debba conoscerne il testo o duplicarlo nel proprio buildPrompt/
// buildFollowUpPrompt. Applicati centralmente da useAgent (l'unico esecutore, vedi
// agentDefinition.ts) — un agente si limita a dichiarare QUALI vuole via
// `AgentDefinition.microPromptIds`, un elenco di id che referenzia questo registro.
//
// Perché un registro per id invece di far comporre il testo direttamente a ogni agente: un
// domani, un nuovo comportamento trasversale (es. "rispondi sempre in italiano", "cita sempre
// le fonti quando disponibili") si aggiunge in un solo posto qui sotto e diventa disponibile a
// ogni agente esistente e futuro con una sola riga (`microPromptIds: [...]`), invece di dover
// toccare il buildPrompt di ciascuno.
import { getAgenticoPrompts } from './prompts';

export interface MicroPrompt {
    id: string;
    text: string;
}

/** Chiede al modello di chiudere SEMPRE la propria risposta testuale con un riepilogo
 * conciso di cosa ha fatto — utile perché l'utente altrimenti vede solo il log delle tool
 * call/turni "sto pensando" (già deterministico, mai narrato dal modello) ma nessuna sintesi
 * finale in linguaggio naturale di cosa è stato effettivamente ottenuto.
 *
 * Il riepilogo va DOPO il blocco ```json — mai prima, mai a comporlo — cosi
 * extractJsonBlock() lo trova comunque cercando il fence ovunque nel testo, e il riepilogo
 * stesso resta visibile all'utente come testo libero accanto al JSON (vedi DetailContent in
 * AgentActivityLog.tsx, che già sa render testo + blocco codice misti nello stesso turno). */
export const SUMMARY_MICRO_PROMPT: MicroPrompt = {
    id: 'closing-summary',
    // Read from the active prompt pack (prompts.ts) at use time, so the host's language applies.
    get text() {
        return getAgenticoPrompts().closingSummary;
    },
};

/** Registro dei micro-prompt disponibili, per id. */
export const MICRO_PROMPT_REGISTRY: Record<string, MicroPrompt> = {
    [SUMMARY_MICRO_PROMPT.id]: SUMMARY_MICRO_PROMPT,
};

/** Applica in coda al prompt verticale i micro-prompt richiesti per id — no-op se l'agente
 * non ne richiede nessuno (o richiede un id sconosciuto, ignorato silenziosamente: un id
 * scritto male non deve far fallire l'intero prompt). */
export function applyMicroPrompts(prompt: string, ids: string[] | undefined): string {
    if (!ids || ids.length === 0) return prompt;
    const fragments = ids.map((id) => MICRO_PROMPT_REGISTRY[id]?.text).filter((t): t is string => !!t);
    if (fragments.length === 0) return prompt;
    return `${prompt}\n\n${fragments.join('\n')}`;
}
