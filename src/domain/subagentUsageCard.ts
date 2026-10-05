// Card deterministica "cosa serve per avviare una nuova istanza di questo subagent" — stessa
// fonte (Zod → JSON Schema, vedi mcpTool.ts) già usata dal render CLI (cli/renderManifestCli.ts)
// e dal wire del provider AI (function calling in useAgent.ts), qui proiettata per l'UI di
// Agentico (ToolHistoryPanel/Agentico.tsx) invece che per testo --help o per il tool schema. Un
// solo posto che estrae "quali campi, obbligatori o no, con che descrizione" da un
// SubagentCommand — mai duplicato a mano in prosa per ogni subagent.
import type { SubagentCommand, SubagentManifest } from './subagentManifest';
import { toJsonSchema } from './mcpTool';

export interface SubagentUsageField {
    key: string;
    type: string;
    required: boolean;
    /** Tecnica, machine-facing — la `.describe()` Zod tale e quale, stessa fonte del JSON
     * Schema/CLI help. Verbosa ed enumerativa per progettazione: un LLM sbaglia meno con casi
     * limite espliciti, un umano di passaggio no. */
    description: string;
    /** Human-facing, per la card di Agentico — `command.humanFieldHints[key]` se presente,
     * altrimenti ripiega su `description` (mai vuota, mai un secondo giro di scrittura
     * obbligato per ogni subagent). */
    humanDescription: string;
}

export interface SubagentUsageCard {
    subagentId: string;
    label: string;
    commandName: string;
    /** Tecnica, machine-facing — vedi SubagentCommand.summary. */
    summary: string;
    /** Human-facing — `command.humanSummary` se presente, altrimenti ripiega su `summary`. */
    humanSummary: string;
    fields: SubagentUsageField[];
    example?: string;
    /** Quando true, il consumer UI (SubagentUsageCardView) mostra SOLO `humanSummary` — niente
     * `fields`/`example` (pensati per l'occhio tecnico) — vedi SubagentCommand.humanSummaryOnly
     * per il perché. */
    humanSummaryOnly: boolean;
}

/** Estrae la lista di campi (nome/tipo/obbligatorietà/descrizione) dallo z.ZodType di un
 * comando — riusata sia qui sia da renderManifestCli.ts, che altrimenti duplicherebbe la stessa
 * lettura di `properties`/`required` dal JSON Schema. */
export function describeCommandFields(command: SubagentCommand): SubagentUsageField[] {
    const schema = toJsonSchema(command.inputSchema);
    const properties = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
    const required = new Set((schema.required as string[] | undefined) ?? []);
    return Object.entries(properties).map(([key, def]) => {
        const description = typeof def.description === 'string' ? def.description : '';
        return {
            key,
            type: typeof def.type === 'string' ? def.type : 'string',
            required: required.has(key),
            description,
            humanDescription: command.humanFieldHints?.[key] ?? description,
        };
    });
}

/** Il comando primario di un manifest (oggi quasi sempre l'unico, vedi SubagentManifest.commands)
 * proiettato in una card — `null` solo se un manifest non ne dichiara nessuno (non dovrebbe
 * succedere per un subagent registrato, ma il chiamante UI non deve crashare se succede). */
export function buildSubagentUsageCard(manifest: SubagentManifest<any, any, any>): SubagentUsageCard | null {
    const command = manifest.commands[0];
    if (!command) return null;
    return {
        subagentId: manifest.id,
        label: manifest.label,
        commandName: command.name,
        summary: command.summary,
        humanSummary: command.humanSummary ?? command.summary,
        fields: describeCommandFields(command),
        example: command.example,
        humanSummaryOnly: command.humanSummaryOnly ?? false,
    };
}
