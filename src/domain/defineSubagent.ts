// Punto unico che uno sviluppatore deve passare per creare un subagent — sostituisce
// l'oggetto letterale libero usato finora (vedi themeSubagentManifest.ts prima della
// migrazione): qui i generici TParams/TContext/TResult sono dedotti da `definition`, e
// TypeScript segnala subito se `toParams` non ritorna il TParams che l'AgentDefinition si
// aspetta, o se manca un campo del manifest — lo stesso livello di guida che darebbe
// "estendere una classe", senza introdurre eredità in un codebase che non la usa altrove.
import type { AgentDefinition } from './agentDefinition';
import type { SubagentManifest } from './subagentManifest';

export function defineSubagent<TParams, TContext, TResult>(
    config: Omit<SubagentManifest<TParams, TContext, TResult>, 'definition'> & {
        definition: AgentDefinition<TParams, TContext, TResult>;
    },
): SubagentManifest<TParams, TContext, TResult> {
    return config;
}
