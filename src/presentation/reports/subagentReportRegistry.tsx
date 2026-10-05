import type { ComponentType } from 'react';

/** Booleano = includi/escludi (colori, font — un solo valore risolto per chiave, niente tra cui
 * scegliere). Stringa = candidato scelto per uno slot con più opzioni recuperate (logo/favicon/
 * OG image — '' significa "Nessuno"). Vedi LiquidResultReport per l'uso concreto (theme non ha
 * più un report qui: il risultato popola direttamente il ThemeEditor aperto, vedi
 * SubagentRunner.componentAnchors — nessuna selezione intermedia). */
export type SubagentSelection = Record<string, boolean | string>;

/** Un subagent "a selezione" (branding, html-to-liquid): il risultato è generato UNA volta,
 * l'utente sceglie solo quali campi/candidati includere prima di spedirlo a una destinazione —
 * mai una modifica diretta del contenuto del risultato. */
export interface SelectionReportModule<TResult = any> {
    kind: 'selection';
    Report: ComponentType<{
        result: TResult;
        selection: SubagentSelection;
        onChange: (key: string, value: boolean | string) => void;
    }>;
    /** Solo le chiavi per campi effettivamente presenti nel risultato — l'assenza di una chiave
     * significa "nessuna checkbox per questo campo", non "deselezionato". Parte sempre a true
     * (comportamento opt-out, come il vecchio flusso di import pre-AI). */
    defaultSelection(result: TResult): SubagentSelection;
    /** Copia di result con i campi deselezionati azzerati/filtrati — usata SOLO per alimentare
     * ResultDestinationPicker, mai per il Report stesso (che mostra sempre il result grezzo +
     * stato checkbox, altrimenti un campo deselezionato sparirebbe invece di restare spuntabile). */
    applySelection(result: TResult, selection: SubagentSelection): TResult;
}

/** Un subagent "editabile": il risultato STESSO è l'oggetto che l'utente continua a modificare
 * nel tempo (righe di una griglia, non un opt-in/opt-out su campi noti a priori) — non c'è nulla
 * da "filtrare" prima di una destinazione. Il `Report` di un modulo così presuppone SEMPRE un
 * `<Form>` vivo intorno a sé (i suoi campi editabili sono `Input`/`Select` legati a
 * `useFormContext`) — per questo NON va registrato qui se quel Form lo possiede già un componente
 * component-anchor sempre montato (es. redirects: `RedirectsEditor` monta il proprio Report
 * dentro il proprio `<Form>` con un import diretto, mai tramite questo registro). Registrarlo qui
 * lo esporrebbe ANCHE al fallback "nessun anchor vivo" di SubagentRunner (vedi sotto), che lo
 * renderizza SENZA alcun Form intorno — crash reale osservato (`useFormContext must be used
 * within a FormContext.Provider`, root-caused a redirects registrato qui mentre l'utente naviga
 * via dall'editor senza salvare: un task ancora vivo con un risultato in sospeso, nessun anchor
 * per riceverlo, fallback che monta il Report nudo). Un modulo "editabile" appartiene qui SOLO se
 * il subagent NON garantisce un componente-anchor sempre vivo per ricevere il risultato. */
export interface EditableReportModule<TResult = any> {
    kind: 'editable';
    Report: ComponentType<{
        result: TResult;
        onResultChange: (next: TResult) => void;
    }>;
}

/** Registro presentation-side per id di subagent (stesso principio filesystem-first/id-keyed di
 * destinationRegistry.ts) — MAI un campo su SubagentManifest: quel
 * contratto vive nel domain layer, presentation-agnostico per design (nessun file in domain/
 * importa React in questo repo), mentre un report è JSX puro. Un subagent senza voce qui
 * semplicemente non mostra nessun report nel fallback "nessun anchor vivo" di SubagentRunner —
 * comportamento identico a oggi per redirects (il suo report vive SOLO dentro RedirectsEditor,
 * mai qui, vedi il commento su EditableReportModule sopra), mai un errore.
 * Estendere per un futuro subagent: un modulo + una riga qui SOLO se non ha un componente-anchor
 * sempre vivo che possa possedere il proprio Form. */
export type SubagentReportModule<TResult = any> = SelectionReportModule<TResult> | EditableReportModule<TResult>;

// Store mutabile, non un letterale statico — Agentico (questo file) non deve MAI importare un
// report di un subagent concreto (es. LiquidResultReport, specifico di html-to-liquid): stessa
// inversione di dipendenza di subagentRegistry.ts/registerSubagents, qui applicata al registro
// dei report React invece che ai manifest. L'host (il CMS) registra i propri report una volta
// sola all'avvio (vedi CmsProviders.tsx) — un id senza voce registrata resta "nessun report" per
// il fallback "nessun anchor vivo" di SubagentRunner, mai un errore (comportamento invariato).
const registry: Record<string, SubagentReportModule> = {};

export function registerSubagentReports(reports: Record<string, SubagentReportModule>): void {
    Object.assign(registry, reports);
}

export function getSubagentReport(subagentId: string): SubagentReportModule | undefined {
    return registry[subagentId];
}
