// Contratto comune a ogni agente AI del CMS (theme import, html-to-liquid import, e i
// prossimi) — vedi domain/subagents/theme/agent.ts e
// domain/subagents/htmlToLiquid/agent.ts per le implementazioni concrete, e
// agentico/presentation/useAgent.ts per l'unico esecutore che le consuma.
//
// Il controller (buildContext) gira SEMPRE, che l'AI sia abilitata o meno — produce sia il
// contesto passato al prompt sia la base per il fallback deterministico. `fallback` è quindi
// obbligatorio, non opzionale: non esiste un agente senza risultato utilizzabile a costo zero.

import type { z } from 'zod';
import type { AIAttachment } from '@llmnative/react';

/** Rif mutabile, sempre aggiornato da useAgent.ts all'inizio di ogni turno (roundTrip 0) con
 * gli allegati grezzi (base64) di QUESTO turno — mai un valore statico catturato una volta:
 * un tool creato da getTools() (chiamato una sola volta per sessione) deve comunque vedere gli
 * allegati dell'ULTIMO messaggio, non quelli del primo. Esiste per un solo motivo: un allegato
 * testuale grande (es. un CSV da alcuni MB) non può essere incollato per intero nel messaggio
 * al modello — supererebbe qualunque finestra di contesto — ma un tool (es.
 * extract_csv_column) può leggerlo direttamente da qui, bypassando quel limite. `undefined` =
 * nessun allegato in questo turno. */
export interface LatestAttachmentsRef {
    current: AIAttachment[] | undefined;
}

/** Tool che il modello può scegliere di invocare durante la conversazione — `execute` è
 * l'implementazione VERA, mai inviata al provider (solo name/description/inputSchema lo sono,
 * via useAgent, convertito in JSON Schema in quel punto — vedi mcpTool.ts). Tipicamente
 * chiude su `params`/`context` dell'agente per rieseguire il controller con argomenti
 * diversi suggeriti dall'utente in un messaggio di follow-up. */
export interface AgentTool {
    name: string;
    description: string;
    /** Zod, non JSON Schema — sorgente unica di validazione/tipi. Serializzato a JSON
     * Schema solo al bordo del provider AI (useAgent.ts), mai qui. */
    inputSchema: z.ZodType;
    execute: (input: Record<string, unknown>) => Promise<unknown>;
    /** Etichetta human-friendly per la UI mentre il tool gira (es. "Ricontrollo
     * https://example.com/about…") — puramente deterministica/locale, MAI generata
     * chiedendo al modello di narrare se stesso (inaffidabile, spreca token, e duplica
     * un'informazione — name+input — già strutturata nella risposta del provider). Assente =
     * la UI mostra un'etichetta generica col solo nome del tool. */
    describeInvocation?: (input: Record<string, unknown>) => string;
    /** Frase completa e discorsiva sullo scopo GENERALE del tool (es. "Sto ricontrollando il
     * sito per aggiornare branding e stile…"), SENZA i parametri della singola chiamata —
     * quelli li mostra già la riga della tool call sotto, via describeInvocation. Usata SOLO
     * per il turno "sto pensando" che ha richiesto questo tool senza scrivere testo libero
     * (vedi useAgent.ts/thinkingDisplayLabel): senza questo campo, quella riga ripeterebbe
     * parola per parola l'etichetta della tool call subito sotto — la stessa informazione
     * scritta due volte una sopra l'altra. Assente = ripiega su describeInvocation (meglio
     * di niente, ma con la ripetizione). */
    describeIntent?: string;
}

export interface AgentDefinition<TParams, TContext, TResult> {
    /** Gira sempre, con o senza AI — estrazione/parsing deterministico dei dati grezzi. */
    buildContext(params: TParams): Promise<TContext> | TContext;
    /** Prompt finale da inviare al provider — già completamente renderizzato (nessuna
     * sostituzione ulteriore lato hook). */
    buildPrompt(params: TParams, context: TContext): string;
    /** Incorpora un messaggio libero dell'utente in un turno di follow-up (conversazione già
     * avviata da run(), vedi useAgent.sendMessage) — DEVE ripetere il contratto di output
     * (schema atteso) di buildPrompt: il modello tende a rispondere in prosa libera dopo
     * qualche turno se non gli si ricorda il formato, e un fallimento di parseResponse a
     * quel punto farebbe silenziosamente perdere il risultato del turno all'utente. */
    buildFollowUpPrompt(userText: string, params: TParams, context: TContext): string;
    /** Valida/interpreta la risposta grezza dell'AI. `null` = risposta non valida → fallback. */
    parseResponse(raw: string, params: TParams, context: TContext): TResult | null;
    /** Risultato deterministico usato quando l'AI è disabilitata, non disponibile, o la sua
     * risposta non è valida. */
    fallback(params: TParams, context: TContext): TResult;
    /** Frase da mostrare nel log di attività quando l'utente preme "Continua senza AI" (vedi
     * useAgent.runFallback) — descrive COSA rappresenta il risultato appena prodotto per
     * QUESTO agente specifico, perché runFallback (generico per costruzione, non conosce la
     * forma di TResult) non può saperlo da solo. Per un agente il cui fallback produce un
     * output azionabile (import HTML, tema, redirect) basta una conferma breve ("pronto per la
     * revisione qui sotto"); per l'orchestratore è FONDAMENTALE: il suo fallback non è un vero
     * handoff (non può indovinare l'intento dell'utente senza AI), è SOLO un messaggio da
     * leggere — a differenza di un turno AI riuscito, il cui testo libero è già visibile di suo
     * nel log "sto pensando", qui non esiste un turno equivalente che lo mostri, quindi senza
     * questo hook il messaggio sparirebbe nel nulla (bug osservato: click su "Continua senza
     * AI", nessun feedback, l'utente non sa se l'import è riuscito o no). Assente = etichetta
     * generica ("Continuo senza AI — uso il risultato deterministico."). */
    describeFallback?(result: TResult): string;
    /** Tool disponibili al modello durante l'intera conversazione (primo turno e ogni
     * messaggio di follow-up) — assente o [] = nessun tool per questo agente.
     * `attachmentsRef` — vedi LatestAttachmentsRef: solo i tool che ne hanno davvero bisogno
     * (oggi extract_csv_column) lo leggono, tutti gli altri lo ignorano tranquillamente
     * (parametro opzionale, retrocompatibile con ogni getTools già scritto). */
    getTools?(params: TParams, context: TContext, attachmentsRef?: LatestAttachmentsRef): AgentTool[];
    /** Id di micro-prompt trasversali (vedi microPrompts.ts) da aggiungere in coda a
     * buildPrompt/buildFollowUpPrompt — applicati centralmente da useAgent, non da questo
     * agente: qui si dichiara solo QUALI si vogliono, mai il loro testo. Assente o [] =
     * nessuno. */
    microPromptIds?: string[];
}
