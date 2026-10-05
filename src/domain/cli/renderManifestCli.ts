// Rendering deterministico (nessuna chiamata LLM) di un SubagentManifest in testo "CLI --help".
// Usato dall'orchestratore Agentico (buildContext, che gira SEMPRE — vedi agentDefinition.ts)
// per il discovery: il modello legge questo testo, non JSON Schema grezzo — più denso, più
// leggibile, e allineato al vocabolario "usage/example" con cui i modelli sono più addestrati a
// ragionare su strumenti a riga di comando.
import type { SubagentCommand, SubagentManifest } from '../subagentManifest';
import { describeCommandFields } from '../subagentUsageCard';
import { getAgenticoPrompts } from '../prompts';

function renderInputSchemaUsage(commandName: string, fields: ReturnType<typeof describeCommandFields>): string {
    const flags = fields.map((f) => (f.required ? `--${f.key} <${f.type}>` : `[--${f.key} <${f.type}>]`));
    return `${commandName} ${flags.join(' ')}`.trim();
}

function renderCommand(subagentId: string, command: SubagentCommand): string {
    // command.inputSchema è Zod (sorgente unica) — la lista di campi (nome/tipo/obbligatorietà/
    // descrizione) è la stessa estratta da subagentUsageCard.ts per la card UI di Agentico,
    // mai duplicata a mano qui.
    const fields = describeCommandFields(command);
    const usage = renderInputSchemaUsage(command.name, fields);
    const paramLines = fields.map((f) =>
        `    --${f.key} <${f.type}>  (${f.required ? 'required' : 'optional'})${f.description ? ` — ${f.description}` : ''}`);

    return [
        `COMMAND: ${subagentId} ${command.name}`,
        `  ${command.summary}`,
        '',
        `  USAGE`,
        `    ${subagentId} ${usage}`,
        paramLines.length ? '' : '',
        paramLines.length ? `  PARAMS` : '',
        ...paramLines,
        '',
        `  OUTPUT`,
        indent(command.describeOutput(), 4),
        command.example ? '' : '',
        command.example ? `  EXAMPLE` : '',
        command.example ? `    ${command.example}` : '',
    ].filter((line) => line !== '').join('\n');
}

function indent(text: string, spaces: number): string {
    const pad = ' '.repeat(spaces);
    return text.split('\n').map((line) => (line ? pad + line : line)).join('\n');
}

/** Help completo di UN subagent — tutte le sue command, la sua descrizione. */
export function renderSubagentCli<TParams, TContext, TResult>(
    manifest: SubagentManifest<TParams, TContext, TResult>,
): string {
    return [
        `NAME`,
        `  ${manifest.id} — ${manifest.label}`,
        '',
        `DESCRIPTION`,
        indent(manifest.description, 2),
        '',
        ...manifest.commands.map((c) => renderCommand(manifest.id, c)),
    ].join('\n');
}

/** Indice sintetico di TUTTI i subagent registrati — una riga per subagent, i suoi comandi
 * elencati per nome. Questa è la vista che l'orchestratore Agentico usa come punto di partenza
 * ("cosa esiste") prima di approfondire un singolo subagent con renderSubagentCli(). */
export function renderRegistryCli(registry: ReadonlyArray<SubagentManifest<any, any, any>>): string {
    if (registry.length === 0) return getAgenticoPrompts().noToolsAvailable;
    return registry
        .map((m) => `${m.id} [${m.commands.map((c) => c.name).join('|')}] — ${m.label}: ${m.commands.map((c) => c.summary).join(' / ')}`)
        .join('\n');
}
