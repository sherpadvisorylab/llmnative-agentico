// Il registro dei subagent — store mutabile popolato UNA VOLTA dall'host all'avvio (vedi
// registerSubagents sotto), MAI un array statico che importa manifest concreti da qui: Agentico
// (questo modulo) non deve conoscere quali subagent esistono in un progetto che lo consuma —
// altrimenti un'estrazione futura in un pacchetto a sé porterebbe con sé una dipendenza diretta
// su theme/redirects/html-to-liquid, specifici di QUESTO CMS. L'host (vedi
// src/application/context/CmsProviders.tsx) importa i propri manifest e li registra qui a
// livello di modulo, prima che qualunque componente sotto AgenticoProvider possa leggerli.
import type { SubagentManifest } from './subagentManifest';

let registry: ReadonlyArray<SubagentManifest<any, any, any>> = [];

/** Chiamata dall'host UNA VOLTA, a livello di modulo (non dentro un componente React) — un
 * secondo giro SOSTITUISCE il registro precedente, non lo somma: niente doppie registrazioni
 * accidentali (es. da un hot-reload) da dover deduplicare a valle. */
export function registerSubagents(manifests: ReadonlyArray<SubagentManifest<any, any, any>>): void {
    registry = manifests;
}

/** Letto da codice che ha bisogno dell'INTERO elenco (es. la Grid di ToolsPage, il catalogo CLI
 * dell'orchestratore) — mai per costruzione statica a import-time: se questo ritorna `[]` è
 * quasi sempre perché `registerSubagents` non è ancora stato chiamato (o il modulo che lo chiama
 * non è ancora stato importato) prima di questo punto, non un progetto senza subagent. */
export function getSubagentRegistry(): ReadonlyArray<SubagentManifest<any, any, any>> {
    if (registry.length === 0 && typeof console !== 'undefined') {
        console.warn('[agentico] getSubagentRegistry() letto a registro vuoto — registerSubagents() non è ancora stato chiamato?');
    }
    return registry;
}

export function findSubagentManifest(id: string): SubagentManifest<any, any, any> | undefined {
    return registry.find((m) => m.id === id);
}
