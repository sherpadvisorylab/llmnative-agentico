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
import type { AgentQuestion, AgentQuestionAnswer, AgentQuestionsAnswers } from './messageParts';

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
    /** Present = the turns of this agent are answered by the host, not by the AI provider of
     * Agentico (CR-003): a remote agent with its own memory, for example an opencode session on
     * a server. `useAgent` then builds no prompt, needs no model and never falls back: it gives
     * the executor the text of the person and shows what it reports. `buildPrompt`,
     * `buildFollowUpPrompt`, `parseResponse` and `fallback` stay required by the type but are not
     * called. */
    executor?: AgentExecutor<TParams, TContext, TResult>;
}

/** One step of a remote agent, shown as a line of the activity log and updated by `id`
 * (e.g. "wrote GLOSSARY.md"). */
export interface AgentExecutorStep {
    id: string;
    label: string;
    status: 'running' | 'done' | 'error';
}

/** One turn given to an `AgentExecutor`. */
export interface AgentExecutorTurn<TParams, TContext> {
    params: TParams;
    context: TContext;
    /** What the person wrote: the opening message on the first turn (possibly empty), then
     * each follow-up, as typed — never a prompt built by Agentico. */
    text: string;
    /** true on the turn of `run()`, false on every follow-up. */
    first: boolean;
    /** Aborted when the person stops the turn. */
    signal: AbortSignal;
    /** The model the person picked among `AgentExecutor.models`, if the executor offers any. */
    model?: string;
    /** Present when the person answered questions of an earlier turn (CR-004): the turn carries
     * them, structured, with `text` empty. The executor decides how to forward them (e.g. to the
     * `question` tool of its session). Questions answered while their own turn is still running
     * resolve the promise of `onQuestions` instead. */
    answers?: AgentQuestionsAnswers;
    /** The reply so far, whole (not a delta): shown as it grows, as Markdown. Without `part.id` it
     * is the one reply of the turn (CR-003), kept below the steps and the reasoning; with an id it is
     * a text part of its own, in the order it first arrived (CR-004). `part.done` ends its streaming. */
    onText(text: string, part?: AgentExecutorPartOptions): void;
    /** The reasoning of the model so far, whole (not a delta), as Markdown: shown closed behind
     * "Reasoned for 12 s" (CR-004). Without `part.id` it is one reasoning part per turn. It ends with
     * `part.done`, when another kind of part arrives, or with the turn; `part.duration` (seconds)
     * replaces the time Agentico measures. */
    onReasoning(text: string, part?: AgentExecutorPartOptions & { duration?: number }): void;
    /** A step of the agent: added the first time its id is seen, updated after. Consecutive steps
     * are shown as one collapsible group. */
    onStep(step: AgentExecutorStep): void;
    /** Questions to the person, answered with a click (CR-004). The promise resolves with the
     * answers if they come while this turn is still running (e.g. the session waits for them);
     * once the turn has ended (or the chat was reloaded), the answers arrive as a new turn with
     * `answers` instead. It rejects when the person stops the turn. `part.id` names the set
     * (default: made up by Agentico) and is the `answers.id` of that later turn. */
    onQuestions(questions: AgentQuestion[], part?: { id?: string }): Promise<AgentQuestionAnswer[]>;
}

/** Which part an `onText`/`onReasoning` call updates, and whether it is complete. */
export interface AgentExecutorPartOptions {
    /** The part to update: created the first time it is seen. */
    id?: string;
    /** The part is complete: no longer streaming. */
    done?: boolean;
}

/** The host side of a remote agent: one call per turn, resolved when its reply is complete. */
export interface AgentExecutor<TParams, TContext, TResult> {
    turn(turn: AgentExecutorTurn<TParams, TContext>): Promise<{ text: string; result?: TResult }>;
    /** The models the person can pick in the composer, at any time: what one means is the host's
     * (e.g. the model of the remote session from the next message). Absent = no picker. */
    models?(params: TParams): Array<{ label: string; value: string; group?: string }>;
    /** The model picked at first, e.g. the one the remote session runs with. */
    defaultModel?(params: TParams): string | undefined;
}
