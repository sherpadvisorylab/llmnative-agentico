// Contratto pubblico che ogni subagent (theme, html-to-liquid, e i prossimi) espone oltre al
// proprio `AgentDefinition` (agentDefinition.ts) — questo NON sostituisce quel contratto, lo
// descrive dall'esterno per un consumer che non conosce ancora TParams/TContext/TResult: il
// registry Tools/Agentico (subagentRegistry.ts) e il renderer CLI (cli/renderManifestCli.ts).
//
// Filosofia: nessuna registrazione a DB. Un subagent "esiste" perché il suo file è importato in
// subagentRegistry.ts — lo stesso principio filesystem-first di domain/services/<feature>/.
import type { z } from 'zod';
import type { AgentDefinition } from './agentDefinition';

/** Una singola capability offerta dal subagent (oggi quasi sempre una sola per manifest). */
export interface SubagentCommand {
    /** Nome del comando, snake_case, univoco nel subagent — es. "extract", "import". */
    name: string;
    /** Una riga — cosa fa questo comando. */
    summary: string;
    /** Zod, non JSON Schema — sorgente unica di validazione/tipi dei parametri del RUN
     * primario (buildContext/buildPrompt), non di un tool di follow-up a metà conversazione
     * (quelli sono AgentTool.inputSchema). Serializzato a JSON Schema solo ai bordi (render
     * CLI, futuro MCP tool) via mcpTool.ts — mai qui. */
    inputSchema: z.ZodType;
    /** Zod dei dati che compongono il TResult — opzionale: oggi la forma del risultato è
     * documentata solo in prosa da describeOutput(); questo schema serve a un futuro
     * consumer machine-readable (es. la CLI) che debba validare/tipizzare l'output, non al
     * prompt AI né al CLI help testuale. */
    outputSchema?: z.ZodType;
    /** Testo che descrive la forma della risposta — quasi sempre un riuso diretto della
     * describe<Feature>ResponseContract() già scritta per il prompt AI (domain/prompts/<feature>.ts):
     * nessuna duplicazione, la stessa stringa serve sia da contratto per il modello sia da
     * sezione OUTPUT del CLI help. */
    describeOutput(): string;
    /** Un invocazione realistica, mostrata nella sezione EXAMPLE del CLI help. */
    example?: string;
    /** Riassunto in una riga per un UMANO che guarda la card di Agentico (SubagentUsageCardView,
     * Agentico.tsx) — NON per il modello/CLI, quelli restano su `summary` (che può permettersi
     * di essere tecnico/preciso perché è machine-facing). Assente = la card ripiega su `summary`
     * (comportamento di oggi, invariato per i subagent che non ne hanno ancora bisogno). Due
     * pubblici diversi per lo stesso comando: un LLM ha bisogno di casi limite ed enumerazioni
     * per non sbagliare la chiamata, un umano ha bisogno di una frase che si legge in un
     * secondo — mai lo stesso testo per entrambi. */
    humanSummary?: string;
    /** Come `humanSummary` ma per-campo (chiave = nome campo in `inputSchema`) — sostituisce SOLO
     * nella card umana la `.describe()` Zod di quel campo (che resta la fonte tecnica per JSON
     * Schema/prompt/CLI, invariata). Un campo assente da questa mappa mostra comunque la
     * descrizione tecnica nella card — non è un obbligo compilare tutti i campi qui, solo quelli
     * la cui descrizione tecnica è troppo densa per un umano di passaggio. Ignorato quando
     * `humanSummaryOnly` è true (vedi sotto). */
    humanFieldHints?: Record<string, string>;
    /** Quando true, la card umana mostra SOLO `humanSummary` (che allora deve raccontare da solo,
     * in prosa naturale, cosa serve e come recuperarlo) — niente elenco di campi con badge
     * richiesto/opzionale, niente esempio in sintassi CLI. Serve per comandi il cui schema
     * tecnico (N campi separati) non rispecchia come un umano pensa l'input — es. redirects:
     * lo schema ha 4 campi (incomingPaths/destinationPaths/trafficByPath/siteHostname) ma un
     * umano ragiona in termini di "cosa mando" (un CSV, l'accesso a Search Console, una sitemap),
     * non di quei 4 nomi — un elenco a campi separati implicherebbe erroneamente che vadano
     * forniti come input distinti, quando in realtà UNA fonte sola (es. un CSV con status code)
     * può bastare da sola per riempirli entrambi. Assente/false = comportamento di oggi (elenco
     * campi), corretto per un comando i cui campi SONO l'input diretto dell'utente (es. `url` di
     * theme). */
    humanSummaryOnly?: boolean;
    /** Regola/i decisionale/i ad alta visibilità per l'ORCHESTRATORE Agentico — iniettata nel
     * "Contesto pagina" (vedi useAgenticoPageContext/agentico-orchestrator.ts, che istruisce
     * esplicitamente il modello a controllare quella sezione PRIMA di chiedere qualunque
     * parametro), non nella `.describe()` Zod dei campi. Le due cose sembrano ridondanti ma non
     * lo sono: la `.describe()` di un campo il modello la vede solo quando ha già deciso di
     * ispezionare/chiamare quel tool specifico — un contesto profondo, letto in modo
     * inconsistente (bug osservato: la stessa regola, "un URL/sitemap di un sito live è SEMPRE
     * destinationPaths", a volte veniva dedotta correttamente e a volte no, nella stessa
     * conversazione). Il Contesto pagina invece è la PRIMA cosa che il modello controlla per
     * istruzione esplicita — la stessa regola lì è affidabile. Non duplicare qui la spiegazione
     * completa dei campi (quella resta nella card/nello schema): solo le regole che altrimenti
     * richiederebbero al modello di "scoprire" una logica che invece va data per scontata subito. */
    orchestratorHint?: string;
}

/** Descrizione pubblica e discoverable via CLI (nessuna chiamata LLM) di un subagent —
 * un modulo per cartella (es. domain/subagents/theme/manifest.ts), esportato
 * dal barrel della cartella ed elencato in subagentRegistry.ts. */
export interface SubagentManifest<TParams = any, TContext = any, TResult = any> {
    /** Id stabile, usato come chiave del registry e prefisso dei tool generati dall'orchestratore
     * Agentico (`${id}_${command.name}`) — mai esposto all'utente, solo a modello/codice. */
    id: string;
    /** Etichetta human-friendly, mostrata nella grid di /tools. */
    label: string;
    /** Nome icona del framework (@llmnative/react Icon), usato da grid e CLI header. */
    icon: string;
    /** Prosa più lunga — cosa fa e come, sezione DESCRIPTION del CLI help. */
    description: string;
    /** Le capability offerte — oggi tipicamente un solo comando primario per subagent. */
    commands: SubagentCommand[];
    /** Route dell'indice DUREVOLE di questo subagent — dove vivono le entità che ha prodotto/
     * modificato. Contratto condiviso a livello di ROUTING, non di componente React: le entità
     * di ogni subagent hanno esigenze reali diverse (redirects ha un indice leggero custom
     * scritto per questo, theme/html-to-liquid riusano le pagine già esistenti e più ricche —
     * ThemesPage/LibraryComponentsPage via Grid — invece di duplicarle in una lista povera solo
     * per uniformità visiva). Ogni subagent DEVE dichiararlo: `ToolsPage` naviga sempre qui al
     * click sulla card (non esiste un fallback generico allo storico-run — vedi menu.ts). */
    indexPath: string;
    /** Id dei ResultDestination (vedi destinationRegistry.ts) che accettano il TResult di
     * questo subagent — 'json-export' è sempre valido per qualunque TResult e non va elencato
     * qui esplicitamente (vedi ResultDestinationPicker). */
    destinationIds: string[];
    /** Sottoinsieme di `destinationIds` applicato AUTOMATICAMENTE (da SubagentRunner) a ogni
     * risultato/aggiornamento — non richiede un click su ResultDestinationPicker. Per subagent
     * dove il risultato stesso È il dato definitivo (oggi solo redirects: vedi
     * redirectsSaveDestination/docs/30-redirects-system.md), non un export opzionale che
     * l'utente sceglie se e quando applicare. Assente/vuoto = comportamento invariato (solo
     * apply manuale via picker). */
    autoApplyDestinationIds?: string[];
    /** Sottoinsieme dei tool cross-agent condivisi (domain/services/tools/ — read_sitemap,
     * scrape_page, list_csv_columns, extract_csv_column) che QUESTO subagent usa davvero, per
     * nome (`AgentTool.name`). L'orchestratore Agentico (agenticoOrchestratorAgent.ts) li
     * espone TUTTI quando la conversazione non è ancora scoped a un subagent specifico (chat
     * generica — non si sa ancora quale servirà), ma li RESTRINGE a questo elenco quando la
     * pagina di partenza è pinnata a un subagent (vedi useAgenticoPageContext + `usageCard`) —
     * un subagent vede solo il proprio sottoinsieme, mai tutti gli strumenti disponibili
     * nell'app. Assente/vuoto = nessun tool di raccolta dati condiviso (es. theme/
     * html-to-liquid: i loro parametri arrivano già di mano dall'utente — url, markup — senza
     * bisogno di leggere una sitemap o un CSV). */
    crossAgentToolIds?: string[];
    /** Merges what the cross-agent tools collected in this conversation (see crossAgentTools.ts,
     * `collected`) into the command input right before the handoff — the collected values are
     * complete, while the copy the model passed may be truncated. Absent = input used as is. */
    withCollected?(input: Record<string, unknown>, collected: Record<string, unknown>): Record<string, unknown>;
    /** Il vero esecutore — lo stesso AgentDefinition consumato da useAgent altrove nell'app. */
    definition: AgentDefinition<TParams, TContext, TResult>;
    /** Converte l'input validato di un comando (raccolto in conversazione dall'orchestratore, o
     * passato da un futuro chiamante CLI) nei TParams che l'AgentDefinition si aspetta. */
    toParams(input: Record<string, unknown>): TParams;
    /** Percorso "senza AI" alternativo all'intera conversazione orchestratore — solo per un
     * subagent il cui INTERO input primario è un unico blob di testo grezzo (oggi solo
     * html-to-liquid: `markup`), mai per uno con più parametri distinti da raccogliere (theme
     * ha bisogno di un `url`, redirects di due liste di path — un singolo testo non basta a
     * riempirli, un form vero servirebbe, fuori scope per ora). Usato SOLO quando la
     * conversazione è già scoped a QUESTO subagent (vedi AgenticoContext.startOrchestrator
     * `scopedSubagentId`, un solo target possibile, niente da instradare) E l'orchestratore
     * stesso non riesce a partire (AI giù) — l'utente incolla il testo direttamente, zero
     * round-trip di rete, mai un tentativo AI (vedi ManualEntryRunner). `prompt` è il messaggio
     * statico mostrato in chat al posto del solito hint; `fromRawText` converte quel testo nei
     * TParams — può lanciare (es. testo vuoto), il chiamante lo mostra come errore. Assente =
     * nessun percorso manuale (comportamento invariato: serve comunque l'orchestratore). */
    manualEntry?: {
        prompt: string;
        fromRawText(rawText: string): TParams;
    };
    /** Titolo breve per l'header di Agentico/lo storico chat, derivato dai parametri RAW di
     * QUESTO subagent (lo stesso `Record<string, unknown>` grezzo passato a `toParams`, non il
     * TParams già convertito — SubagentRunner lo ha disponibile senza doverlo ri-convertire) —
     * es. theme: hostname da `params.url`; redirects: `params.siteHostname`. Agentico
     * (SubagentRunner) non conosce la forma dei parametri di nessun subagent specifico, quindi
     * non può indovinare quale campo mostrare: il manifest lo dichiara esplicitamente. Assente =
     * ripiega su `label` (comportamento corretto anche per subagent il cui unico campo (es.
     * html-to-liquid: `markup`, il testo incollato dall'utente) non è mai un titolo leggibile). */
    deriveHistoryTitle?(params: Record<string, unknown>): string | undefined;
    /** Punti di ancoraggio semantico subagent↔componente — keyed per nome componente scelto
     * liberamente dall'autore del subagent, ma per coerenza tra subagent (oggi solo `theme`,
     * futuri: redirects/html-to-liquid) usare la convenzione: 'indexList' per il componente che
     * elenca le entità (naviga verso un editor nuovo pre-compilato quando riceve un risultato) e
     * 'editor' per il componente che ne modifica una aperta (si popola da solo). Un consumer
     * indipendente che ascolta solo una fetta del risultato (es. SiteEditorPage per i soli campi
     * di site-branding) usa una chiave propria, descrittiva del suo ruolo (es. 'siteBranding'),
     * non una delle due sopra. Letto da
     * useSubagentComponentContext (presentation/hooks), chiamato DAL componente React stesso al
     * mount, mai dalla pagina che lo ospita: chi monta il componente ottiene il contesto
     * Agentico corretto gratis, senza ricostruirlo pagina per pagina (vedi SubagentCommand.
     * orchestratorHint/humanSummary* per il vecchio meccanismo a livello di pagina, ancora usato
     * da redirects/html-to-liquid finché non vengono migrati). */
    componentContexts?: Record<string, SubagentComponentContext>;
}

/** Coppia di messaggi per UN punto di ancoraggio componente↔subagent (vedi
 * SubagentManifest.componentContexts) — due pubblici diversi per lo stesso aggancio, mai lo
 * stesso testo per entrambi (stesso principio di SubagentCommand.humanSummary vs summary). */
export interface SubagentComponentContext {
    /** Per il prompt dell'orchestratore LLM — iniettato nel "Contesto pagina" quando questo
     * componente è montato (vedi AgenticoContext.componentAnchors). */
    agenticoHint: string;
    /** Mostrato in chat all'utente quando Agentico si aggancia a questo componente — sostituisce
     * la card a campi (SubagentUsageCardView) per gli anchor component-based: una frase, non un
     * modulo da compilare. */
    userMessage: string;
}
