// Punto unico di conversione Zod → JSON Schema — usato SOLO ai due bordi che hanno
// davvero bisogno della forma serializzata (il provider AI in useAgent.ts, che parla
// JSON Schema sul wire come ogni function-calling API; il render CLI in
// cli/renderManifestCli.ts). Ovunque altro nel dominio (AgentTool, SubagentCommand) lo
// schema resta un vero z.ZodType — un solo formato "di verità", mai due dialetti.
//
// La forma `McpTool` è quella del formato MCP Tool (Model Context Protocol) —
// name/description/inputSchema JSON-Schema (+ outputSchema opzionale): non un'invenzione
// interna, così ogni subagent resta esponibile 1:1 come vero MCP tool in futuro, senza
// ulteriore lavoro di adattamento.
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface McpTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
    // zodToJsonSchema inserisce sempre `$schema` (un meta-riferimento al draft, non parte
    // dello schema stesso) alla radice dell'output. Nel wire format function-calling
    // (OpenAI-compatible), quel campo finisce dentro `tools[].function.parameters` — dove
    // non è previsto — e alcuni backend (verificato con OpenCode Zen: falliva su OGNI
    // modello, in modo consistente, non transitorio) rispondono 400/500 non appena
    // `parameters` lo contiene.
    const { $schema, ...rest } = zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>;
    return rest;
}

export function toMcpTool(name: string, description: string, inputSchema: z.ZodType, outputSchema?: z.ZodType): McpTool {
    return {
        name,
        description,
        inputSchema: toJsonSchema(inputSchema),
        ...(outputSchema ? { outputSchema: toJsonSchema(outputSchema) } : {}),
    };
}
