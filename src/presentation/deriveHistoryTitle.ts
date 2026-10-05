import type { SubagentManifest } from '../domain/subagentManifest';

/** Etichetta breve mostrata nell'header di Agentico/nello storico chat per un task — Agentico
 * stesso non conosce la forma di TParams di nessun subagent specifico (nessun `params.url`/
 * `params.siteHostname` hard-codato qui): ogni manifest dichiara il proprio
 * `deriveHistoryTitle` se ha un campo sensato da mostrare (vedi
 * SubagentManifest.deriveHistoryTitle), altrimenti si ripiega sul nome generico del subagent
 * (`manifest.label`) — mai un tentativo di indovinare quale campo di `params` sia "il titolo".
 * File a sé (non dentro SubagentRunner.tsx/ResultDestinationPicker.tsx) perché entrambi lo
 * consumano — tenerlo in uno dei due avrebbe creato un import circolare tra loro. */
export function deriveHistoryTitle(manifest: SubagentManifest<any, any, any>, params: Record<string, unknown>): string {
    return manifest.deriveHistoryTitle?.(params) ?? manifest.label;
}
