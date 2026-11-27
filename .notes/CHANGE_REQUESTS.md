# Change Requests

> Ogni CR rappresenta un'unità di lavoro autonoma con motivazione, scope e checklist.
> Stato: `⬜ todo` · `🔄 in progress` · `✅ done` · `🚫 cancelled`

---

## Indice

| CR | Titolo | Priorità | Dipende da | Stato |
|----|--------|----------|-----------|-------|
| [CR-001](#cr-001--estrazione-di-agentico-come-pacchetto) | Estrazione di Agentico come pacchetto `@llmnative/agentico` | Alta | — | ✅ |
| [CR-002](#cr-002--ui-solo-con-componenti-del-framework) | UI di Agentico solo con componenti del framework | Media | CR-001 | ⬜ |
| [CR-003](#cr-003--subagent-remoti-avvio-diretto-chat-per-entità-azioni-del-pannello) | Subagent remoti, avvio diretto, chat per entità, azioni del pannello | Alta | CR-001 | ✅ |
| [CR-004](#cr-004--messaggi-a-parti-testo-ragionamento-passi-domande) | Messaggi a parti: testo, ragionamento, passi, domande | Alta | CR-109 (framework) | ✅ |
| [CR-005](#cr-005--pannello-ridimensionabile-e-domande-ancorate-in-fondo) | Pannello ridimensionabile e domande ancorate in fondo alla chat | Alta | CR-004 | ✅ |
| [CR-006](#cr-006--comandi-slash-del-subagent-nel-prompt) | Comandi slash del subagent nel prompt | Alta | CR-003 | ✅ |
| [CR-007](#cr-007--subagent-conversazionali) | Subagent conversazionali: la risposta è un messaggio della chat | Alta | CR-004 | ✅ |
| [CR-008](#cr-008--approvazione-della-persona-per-i-tool-rischiosi) | Approvazione della persona per i tool rischiosi | Alta | CR-005 | ✅ |
| [CR-009](#cr-009--esecutore-accanto-al-catalogo-ai) | Esecutore accanto al catalogo AI: un subagente sceglie per turno dove gira | Alta | CR-003, CR-121 (framework) | ✅ |
| [CR-010](#cr-010--data-dinizio-di-una-chat-e-catalogo-ai-limitato-per-chat) | Data d'inizio di una chat, e catalogo AI limitato per chat | Alta | CR-003, CR-009 | ✅ |
| [CR-011](#cr-011--titoli-delle-chat-scritti-dal-modello-modificabili) | Titoli delle chat scritti dal modello, modificabili; chat vuote non tenute | Alta | CR-010 | ✅ |
| [CR-012](#cr-012--livello-di-ragionamento-dei-turni-sul-catalogo-ai) | Livello di ragionamento dei turni sul catalogo AI | Alta | CR-010, CR-122 (framework) | ✅ |
| [CR-013](#cr-013--chat-salvate-tenute-anche-dallhost) | Chat salvate tenute anche dall'host (backend dello store) | Alta | CR-003 | ✅ |
| [CR-014](#cr-014--card-nei-messaggi-della-chat) | Card nei messaggi della chat, con le azioni dell'host | Alta | CR-004 | ✅ |
| [CR-015](#cr-015--continua-senza-ai-solo-se-lagente-ha-un-risultato-senza-modello) | Continua senza AI solo se l'agente ha un risultato senza modello | Media | — | ✅ |
| [CR-016](#cr-016--riprova-e-modifica-di-un-messaggio-della-persona) | Riprova e modifica di un messaggio della persona | Alta | CR-003, CR-009 | ✅ |
| [CR-017](#cr-017--allegati-per-lesecutore) | Allegati per l'esecutore | Alta | CR-003, CR-124 (framework) | ✅ |
| [CR-018](#cr-018--sessioni-di-una-chat-e-chi-parla) | Sessioni di una chat e chi parla (avatar) | Alta | CR-010, CR-013 | ✅ |
| [CR-019](#cr-019--attività-degli-altri-agenti-nella-chat) | Attività degli altri agenti nella chat (eventi dell'host) | Alta | CR-018 | ✅ |
| [CR-020](#cr-020--immagini-in-vista-ed-eventi-in-corso) | Immagini in vista ed eventi in corso | Media | CR-017, CR-019 | ✅ |
| [CR-021](#cr-021--azioni-sulle-card-degli-eventi-e-testo-precompilato) | Azioni sulle card degli eventi e testo precompilato nella chat | Alta | CR-019 | ✅ |
| [CR-022](#cr-022--impostazioni-di-agentico-in-una-sua-modale-con-i-connettori-ai) | Impostazioni di Agentico in una sua modale, con i connettori AI | Alta | CR-132, CR-134 (framework) | ✅ |
| [CR-023](#cr-023--routing-sottoagenti-strumenti-e-contesto-per-pagina) | Routing: sottoagenti, strumenti e contesto per pagina | Alta | — | ✅ |
| [CR-024](#cr-024--harness-dellhost-modelli-che-girano-col-loro-ciclo-di-strumenti-per-ogni-agente) | Harness dell'host: modelli col loro ciclo di strumenti, per ogni agente | Alta | CR-009, CR-016, CR-022 | ✅ |
| [CR-025](#cr-025--pacchetto-server-llmnativeagenticoserver) | Pacchetto server: connessioni, runner, memoria, progetti | Alta | CR-024, runner 1.2 | ✅ |
| [CR-026](#cr-026--impostazioni-connessioni-memoria-progetti) | Impostazioni: Connessioni, Memoria, Progetti sul backend dell'host | Alta | CR-025 | ✅ |
| [CR-027](#cr-027--memorie-di-proprietà-dei-namespace) | Memorie di proprietà dei namespace: ogni tenant amministra le sue | Alta | CR-025 | ✅ |
| [CR-028](#cr-028--runner-di-proprietà-dei-namespace) | Runner di proprietà dei namespace, e `tenantOwned` dell'host | Alta | CR-027 | ✅ |

---

## CR-030 — Abbonamenti nel runner: predefiniti per abbonamento, modali a destra

**Stato:** 🔄 in progress
**Issue:** [#30](https://github.com/sherpadvisorylab/llmnative-agentico/issues/30)
**Priorità:** Alta
**Dipende da:** CR-026, CR-028; @llmnative/runner 1.4.0

### Motivazione

Gli abbonamenti (Claude Code, OpenCode Go) funzionano con un harness: i turni e le chat li usano dagli account del
tenant sul runner. In Cloud c'era una copia dello studio (il dispatcher di prima), con una schermata migliore: più
account in ordine, stato, nome, modello e ragionamento predefiniti. Un posto solo: il runner.

### Scope

- Modali delle impostazioni a destra, sovrapposte (quella sotto si attenua).
- Nel runner del namespace, `RunnerAccounts` 1.4.0 e, sotto ogni abbonamento, modello e ragionamento predefiniti.
- Server `GET/PUT runner-defaults` per namespace (persone: lettura; admin: scrittura); backend `runnerDefaults`.
- Harness: la chat parte sul modello predefinito del primo abbonamento che ne ha uno; ragionamento come effort
  (Claude Code) o variante (opencode).

### Checklist

- [x] Server, backend, harness, UI, test
- [x] Docs, CHANGELOG
- [ ] Verifica in Playbook
- [ ] Release 0.28.0

---

## CR-029 — Modelli dell'host nelle impostazioni

**Stato:** ✅ done (0.27.0)
**Issue:** [#29](https://github.com/sherpadvisorylab/llmnative-agentico/issues/29)
**Priorità:** Media
**Dipende da:** CR-022, CR-026

### Motivazione

F7 del piano (Playbook): il CRM tiene i provider AI sul suo server (le chiavi non arrivano al browser), quindi il
catalogo AI del browser è vuoto e il *Modello predefinito* delle impostazioni non ha voci. Agentico nel CRM deve usare
il modello scelto nelle sue impostazioni, Cloud o runner, invece di uno fisso.

### Scope

- `AgenticoSettingsConfig.models?: AgentExecutorModel[]`: i modelli che l'host offre (valore = id dell'host, `group`
  = provider); dati, il modale li elenca per `defaultModel` al posto del catalogo del browser.
- `defaultModel` resta salvato dallo `store` dell'host, che lo usa sul suo server.

### Checklist

- [x] Config, contesto, modale, test
- [x] README, llms.txt, CHANGELOG
- [x] Verifica nel CRM (build locale: typecheck, 899 test, build web)
- [x] Release 0.27.0

---

## CR-028 — Runner di proprietà dei namespace

**Stato:** ✅ done (0.26.0)
**Issue:** [#28](https://github.com/sherpadvisorylab/llmnative-agentico/issues/28)
**Priorità:** Alta
**Dipende da:** CR-027

### Motivazione

F6 del piano (Playbook): un server lo vede chi l'ha creato e i membri delle organizzazioni che ci girano, lo modificano chi
l'ha creato e i loro admin. Come per le memorie (CR-027) serve che un tenant possieda i suoi runner. Nel CMS invece
assegnare l'infrastruttura resta un'azione della piattaforma: la proprietà dei tenant è un'opzione dell'host.

### Scope

- `RunnerRecord.owners`; un namespace lavora solo su runner del progetto o suoi (route, assign, `hasRunner`).
- Con `tenantOwned.runners`: l'admin collega (codice, richiesta, installazione), modifica e rimuove i runner del suo
  namespace e ci mette il suo namespace; il predefinito del progetto resta della piattaforma.
- `tenantOwned.memories` per CR-027; senza opzione, runner e memorie sono della piattaforma.
- `GET me` con `administers`; impostazioni: un admin vede i suoi runner e *Aggiungi un runner* quando può.

### Checklist

- [x] Proprietari, isolamento nel routing, permessi, test
- [x] Opzione `tenantOwned` e test con e senza
- [x] Interfaccia per l'admin
- [x] Verifica in Playbook (tenantOwned acceso, test della memoria e della rotta)
- [x] Release 0.26.0

---

## CR-027 — Memorie di proprietà dei namespace

**Stato:** ✅ done (0.25.0)
**Issue:** [#27](https://github.com/sherpadvisorylab/llmnative-agentico/issues/27)
**Priorità:** Alta
**Dipende da:** CR-025

### Motivazione

F5 del piano (Playbook, `docs/piano-agentico-connessioni.md`): in Playbook ogni organizzazione gestisce la propria memoria,
isolata dalle altre, e la memoria di un runner è condivisa dalle organizzazioni che ci girano. Il modello di CR-025
(memorie della piattaforma assegnate ai namespace) non basta: serve che un tenant possieda le sue.

### Scope

- `MemoryRecord.owners`: i namespace che la amministrano; nessuno = memoria del progetto (piattaforma).
- Admin di un namespace: vede, aggiunge, modifica e assegna al proprio namespace solo le memorie che possiede; uscire da
  una memoria condivisa la lascia agli altri proprietari; l'ultimo la rimuove se nessun namespace la usa.
- Piattaforma: tutte.
- Scheda Memoria anche per gli admin; in Progetti l'admin sceglie la memoria del proprio namespace.
- `createMemories`: `share`, `unshare`, `put`, `keyOf` per un host che prende in carico le sue memorie.
- `GET me` con `hasRunner`.

### Checklist

- [x] Proprietari, permessi nel server, test (memorie proprie, condivise, uscita, rimozione)
- [x] Interfaccia: Memoria per gli admin, Progetti con la memoria del proprio namespace
- [x] Verifica in Playbook (memorie delle organizzazioni prese in carico, test, build)
- [x] Release 0.25.0

---

## CR-025 — Pacchetto server `@llmnative/agentico/server`

**Stato:** ✅ done (0.24.0)
**Issue:** [#25](https://github.com/sherpadvisorylab/llmnative-agentico/issues/25)
**Priorità:** Alta
**Dipende da:** CR-024, `@llmnative/runner` 1.2

### Motivazione

Decisione del 26/11/2026 (piano in Playbook, `docs/piano-agentico-connessioni.md`): in ogni host (CRM, CMS, Playbook) i
modelli, i runner e la memoria stanno nelle impostazioni di Agentico, sempre uguali. Oggi ogni host ha la sua logica sul
server (connessioni AI, flotta dei runner, inoltro al runner, memoria). Agentico diventa portabile con il client **e** il
server: l'host fornisce solo dove tiene dati e segreti.

Cambia un principio di CR-024: il pacchetto ora conosce il runner (`@llmnative/runner`, client e setup) perché è la
porta per installarlo e collegarlo. Resta senza segreti nel browser: tutto ciò che è segreto sta nel pacchetto server.

### Scope

- **Ingresso** `@llmnative/agentico/server`: Node puro, nessun React, nessuna dipendenza da Firebase o Hono.
- **Namespace** `<project>` o `<project>-<tenant>` (progetto senza trattino): tenant del runner e contenitore della memoria.
- **Porte dell'host**:
  - `identity(request)`: persona (id, nome), ruolo (`platform` | `admin` | `member`), progetto, tenant;
  - `records`: documenti non segreti per collezione;
  - `secrets`: segreti per nome.
  - Adattatori di riferimento: in memoria (test) e file JSON 0600 (Node).
- **`createAgenticoServer(options).handle(request)`**, rotte sotto un prefisso:
  - connessioni cloud del framework: il lato server di `AIConnectionStore` (verifica della chiave col provider prima di
    tenerla, account, ordine), proxy delle chiavi (CR-102) e risposta di un modello (`complete`);
  - runner: elenco, stato, collegamento chiedendo al runner (device flow, con il progetto) o con un codice, installazione
    via SSH con log, aggiornamento (predefinito, svuotamento), rimozione, assegnazione di un namespace (tenant e chiave sul
    runner), inoltro delle richieste di una persona al runner del suo namespace (`act-as-user`, chat in streaming);
  - memorie: elenco, aggiunta (indirizzo API, MCP, chiave), verifica, rimozione; ricerca e scrittura nel namespace;
  - progetti: namespace → runner, memoria.
- **Client del browser** `createAgenticoBackend({ baseUrl })`: `AIConnectionStore`, `RunnerFleet` di
  `@llmnative/runner/ui`, client del runner del namespace, memorie, progetti.

### Checklist

- [x] Porte, namespace, adattatori in memoria e su file
- [x] Connessioni cloud: store, verifica, proxy CR-102, complete
- [x] Runner: flotta (dal CMS), collegamento con progetto, installazione, assegnazione, inoltro
- [x] Memorie: store, verifica, ricerca e scrittura
- [x] Progetti
- [x] `handle(Request)` con i permessi per ruolo; nessun segreto nelle risposte né nei log
- [x] Client del browser
- [x] Test (provider, runner e memoria finti), build dell'ingresso server
- [x] README, llms.txt, CHANGELOG, STATUS

## CR-026 — Impostazioni: Connessioni, Memoria, Progetti

**Stato:** ✅ done (0.24.0)
**Issue:** [#26](https://github.com/sherpadvisorylab/llmnative-agentico/issues/26)
**Priorità:** Alta
**Dipende da:** CR-025

### Scope

- `<AgenticoProvider backend>`: con un backend, le impostazioni hanno le schede *Connessioni*, *Memoria*, *Progetti*.
- *Connessioni*: box cliccabili (`ListCard`) che aprono una `Modal`: *Cloud* (`AIConnections`), uno per runner (stato,
  versione, carico, account del runner con `RunnerAccounts`, svuota, rimuovi), *Aggiungi un runner* (`RunnersSettings` di
  `@llmnative/runner/ui`: installazione automatica o guidata, collegamento con la challenge).
- *Memoria*: box per memoria (indirizzo API, MCP, chiave che si scrive e non si rilegge, *Verifica*), *Aggiungi*.
- *Progetti*: namespace → runner, memoria, modificabili da chi amministra la piattaforma.
- Switch al posto delle checkbox (anche i provider del catalogo); l'harness del runner (CR-024) costruito da Agentico.

### Checklist

- [x] Prop `backend`, schede e permessi per ruolo
- [x] Connessioni a box, modali, Aggiungi un runner
- [x] Memoria, Progetti
- [x] Harness del runner dal backend; menu dei modelli dalle connessioni
- [x] Switch al posto delle checkbox
- [x] Test, verifica in un host (CMS sulla build locale: typecheck, 569 test, build), README, CHANGELOG, STATUS

---

## CR-024 — Harness dell'host: modelli che girano col loro ciclo di strumenti, per ogni agente

**Stato:** ✅ done (0.23.0)
**Issue:** [#24](https://github.com/sherpadvisorylab/llmnative-agentico/issues/24)
**Priorità:** Alta
**Dipende da:** CR-009, CR-016, CR-022

### Motivazione

Emersa il 26/11/2026 dal runner (`@llmnative/runner`, design in Playbook `docs/runner-extraction.md` §8). Le persone
collegano il proprio abbonamento (Claude Code) su un runner dell'host. Vogliono usarlo in Agentico come un modello qualunque,
accanto ai modelli API del tenant, con **tutti** gli agenti: l'orchestratore e i sottoagenti, con i loro strumenti.

Un esecutore (CR-003/CR-009) è per agente e lo scrive l'host. L'orchestratore, però, nasce dentro Agentico, e ripetere per
ogni sottoagente lo stesso ponte (prompt, strumenti via MCP, approvazioni, card) sarebbe codice duplicato in ogni host.
Agentico non deve conoscere il runner: niente dipendenze oltre al framework. Serve quindi una porta.

### Scope

- **Porta `AgenticoHarness`** (`<AgenticoProvider harness>`), che l'host implementa:
  - `models()`: i modelli che l'harness esegue adesso per la persona, per esempio «Claude Code · il tuo abbonamento».
    Una lista vuota vuol dire che non offre niente;
  - `turn()`: un turno, con prompt, strumenti, `callTool`, modello, allegati e stream di testo, ragionamento e passi;
  - `close?(chatId)`: la chat finita.
- **Esecutore costruito da Agentico**: per ogni agente senza `executor` proprio, Agentico ne compone uno accanto al
  catalogo (CR-009) a partire dalla porta.
  - **Prompt:** usa quelli dell'agente, `buildPrompt` al primo turno e `buildFollowUpPrompt` dopo.
  - **Strumenti:** sono quelli di `getTools`, serializzati in JSON Schema.
  - **Risposta:** la legge `parseResponse`.
  - **Riprova e modifica (CR-016):** l'esecutore riparte dalla chat così com'è in quel punto.
  - **Allegati:** passano all'harness.
  - **Modelli:** quelli dell'harness compaiono nel composer nel loro gruppo, accanto ai modelli API.
- **`runHostTool`** (esportato): esegue uno strumento chiamato da un harness come farebbe sul catalogo.
  - Chiede l'approvazione della persona quando serve (CR-008).
  - Mostra il passo, valida l'input e aggiunge la card (CR-014).
  - È ciò che fa oggi a mano `runOnServer` in Playbook, che potrà usarlo.
- **Schede dell'host nelle impostazioni** (`<AgenticoProvider settingsTabs>`): schede in più nella modale di CR-022,
  per esempio «I miei abbonamenti» del CMS, disegnate dall'host.
- Gli errori dell'harness (credito finito, nessun abbonamento) arrivano come errore del turno con il testo dell'host. La
  persona sceglie un modello API dal menu: il passaggio automatico è un'evoluzione successiva.

### Checklist

- [x] Tipi `AgenticoHarness`, `AgenticoHarnessTurn`, `AgenticoSettingsTab`; prop `harness` e `settingsTabs` del provider
- [x] `createHarnessExecutor(definition, harness)` e uso in `useAgent` per gli agenti senza esecutore
- [x] `runHostTool` (approvazione, passo, card, validazione) esportato
- [x] Schede dell'host nella modale delle impostazioni
- [x] Test: esecutore dall'harness (primo turno, seguito, strumenti con approvazione, parse), schede
- [x] README, llms.txt, CHANGELOG, STATUS; release; verifica nel CMS

## CR-023 — Routing: sottoagenti, strumenti e contesto per pagina

**Stato:** ✅ done (0.22.0)
**Issue:** [#23](https://github.com/sherpadvisorylab/llmnative-agentico/issues/23)
**Priorità:** Alta
**Dipende da:** —

### Motivazione

Emersa il 25/11/2026 dal CMS. Oggi cosa Agentico sa e offre in un punto dell'app è implicito e sparso nel codice
dell'host: il contesto arriva solo dalle pagine che chiamano `useAgenticoPageContext` o montano un anchor
(`useSubagentComponentContext`); l'orchestratore offre tutti i sottoagenti ovunque (salvo `onlyWhenAnchored`) e tutti i
cross-agent tools finché la chat non è legata a un sottoagente. Non c'è modo di vedere, né di cambiare, chi è attivo dove.

### Scope

Rivisto il 25/11/2026 dopo la prima prova: le regole per percorso che limitavano insieme sottoagenti e tools erano
difficili da leggere. Il modello segue come le persone ragionano ("cosa fa X e dove"):

- **Sottoagenti**: per ognuno i percorsi che lo attivano (espressioni regolari sul percorso, senza query e hash; assenti =
  ovunque, lista vuota = solo quando la chat è legata a lui) e i tools di raccolta dati che usa (assenti = i
  `crossAgentToolIds` del manifest).
- **Tools**: uno strumento può essere usato da tutti i sottoagenti (`everywhere`); altrimenti dai sottoagenti che lo
  nominano. Le due viste modificano la stessa relazione, tenuta dal lato del sottoagente.
- **Pagine**: il contesto per il modello per percorso, lista ordinata, vince la **prima** regola che corrisponde (gruppi
  `{nome}`, `{1}`, `{path}`); precede il contesto delle pagine/anchor nel prompt.
- **Dominio**: `resolveAgenticoRoute` (cosa è offerto su un percorso), `matchAgenticoPage`, `mergeAgenticoRouting` /
  `diffAgenticoRouting` (predefiniti dell'host + modifiche salvate altrove, solo le differenze), `validateAgenticoRouting`.
- **Provider**: `<AgenticoProvider route={{ path, defaults, store?, readOnly? }}>` — il percorso lo dà l'host (Agentico
  non dipende da un router). `useAgentico().route` e `useAgentico().routing`. Senza `route`: tutto offerto, come prima.
- **Orchestratore**: offre i sottoagenti i cui percorsi corrispondono e i tools che usano (più quelli usati ovunque). Un
  sottoagente a cui la chat è legata resta offerto con i suoi tools (`toolsOf`).
- **Impostazioni** (le regole si vedono dove si vede Agentico, non in una pagina dell'host): schede **Sottoagenti**
  (un riquadro per sottoagente: percorsi, descrizione, tools come badge; clic → modale sopra le impostazioni per
  cambiare percorsi e tools, provare un percorso, ripristinare), **Strumenti** (un riquadro per tool con i sottoagenti
  che lo usano o "tutti"; clic → modale per sceglierli), **Pagine** (contesto per percorso: prova, modifica, riordina,
  ripristina). Modifiche salvate dall'host (`route.store`, `route.readOnly`).
- Decide cosa Agentico **propone**, non è un controllo di accesso.

### Checklist

- [x] Dominio: tipi, resolve, match pagine, merge, diff, validate
- [x] Provider: prop `route`, cosa è offerto nel contesto
- [x] Orchestratore: filtro sottoagenti e tools, tools del sottoagente legato, contesto della pagina nel prompt
- [x] Impostazioni: schede Sottoagenti, Strumenti, Pagine con le modali di modifica impilate
- [x] Test (122 verdi)
- [x] README, llms.txt, CHANGELOG
- [x] Verifica sul CMS: typecheck, 549 test e build verdi sulla build locale; provata nel browser (schede, modali impilate, switch Attivo)
- [x] Release 0.22.0
- [x] 0.22.1: «Prova un percorso» come pulsante che filtra i riquadri (in Pagine: «Vale» / «Superata dalla n.»), switch «Attivo» nella testata dell'editor, niente campo Flag né riquadro «In questa pagina»

---

## CR-022 — Impostazioni di Agentico in una sua modale, con i connettori AI

**Stato:** ✅ done (0.21.0)
**Issue:** [#22](https://github.com/sherpadvisorylab/llmnative-agentico/issues/22)
**Priorità:** Alta
**Dipende da:** CR-132, CR-134 (framework)

### Motivazione

Emersa il 15/11/2026. Oggi le impostazioni di Agentico (modello di partenza, ragionamento, provider ammessi, ordine) arrivano
dall'host: in parte fisse nel codice, in parte da variabili che Agentico non gestisce. Agentico deve avere le sue impostazioni
e una modale per cambiarle, e da lì anche collegare i provider AI, abbonamenti compresi, come fa lo studio.

### Scope

- **Schema delle impostazioni** dichiarato da Agentico (modello di partenza per provider, ragionamento, provider e modelli ammessi,
  ordine, titoli automatici delle chat, allegati…), con valori di partenza.
- **Mostra o fissa, dal codice dell'host**: per ogni impostazione l'host sceglie se mostrarla nella modale o fissarne il valore
  (non modificabile), come per le verticali di progetto. Senza indicazioni: mostrata.
- **Modale "Impostazioni"** dal pannello: le impostazioni mostrate, e la sezione **Connettori** con `AIConnections` del
  framework (CR-134): chiavi, account, ordine, e i connettori a abbonamento che l'host registra, con il runner configurabile.
- **Archivio**: impostazioni e connessioni passano dalla porta dell'host (lo store di CR-013 per le impostazioni,
  `AIConnectionStore` per i segreti): niente valori fissi nel pacchetto, niente variabili d'ambiente lette da Agentico.
- Un host senza runner non mostra gli abbonamenti (nessun connettore registrato).

### Checklist

- [x] Schema, contesto, modale, sezione Connettori
- [x] Test: 23 file / 104 test (5 nuovi)
- [x] Playbook come host: adottato con la release (connettori del framework, Claude Code come connettore dell'host)
- [x] README, llms.txt, CHANGELOG, versione 0.21.0

---

## CR-021 — Azioni sulle card degli eventi e testo precompilato

**Stato:** ✅ done (0.20.0)
**Issue:** [#21](https://github.com/sherpadvisorylab/llmnative-agentico/issues/21)
**Priorità:** Alta
**Dipende da:** CR-019 (eventi dell'host)

### Motivazione

Emersa nel Playbook il 12/11/2026. Quando una CR si blocca in attesa di una persona, la chat deve mostrare le domande
dell'agente e permettere di chiedere chiarimenti a Jonny e rispondere da lì, senza aprire GitHub.

### Scope

- `ThreadEvent.actions`: pulsanti sulla card dell'evento. `ThreadEvent.open`: corpo mostrato subito.
- `ThreadEventsSource.onAction(event, actionId, chat)`:
  - `chat.compose(text)` precompila il campo di testo della chat aperta;
  - `chat.send(text)` lo invia come messaggio della persona. Se un turno è in corso, lo precompila invece di inviarlo.
- `useAgentico().compose(text)` e `draft`.

### Checklist

- [x] Dominio, contesto (`compose`, `draft`), composer, card con le azioni
- [x] Test: 22 file / 98 test
- [x] Playbook come host contro la build locale (le domande delle CR bloccate, Chiedi a Jonny, Rispondi): typecheck, 90 file / 683 test
- [x] README, llms.txt, CHANGELOG, versione 0.20.0

---

## CR-020 — Immagini in vista ed eventi in corso

**Stato:** ✅ done (0.19.0)
**Issue:** [#20](https://github.com/sherpadvisorylab/llmnative-agentico/issues/20)
**Priorità:** Media
**Dipende da:** CR-017 (allegati), CR-019 (eventi dell'host)

### Motivazione

Emersa nel Playbook il 12/11/2026:
- un'immagine incollata in un messaggio, una volta inviato, restava solo come icona di allegato;
- nella chat non si capiva quali attività degli agenti fossero ancora in corso.

### Scope

- Anteprime delle immagini di un messaggio della persona (`attachmentPreviews`):
  - JPEG di al massimo 480 px per lato, le prime 4, disegnate nel browser e salvate con la chat;
  - un clic apre l'anteprima più grande; il file originale non viene mai salvato.
- `ThreadEvent.running`: uno spinner al posto dell'icona, la card evidenziata.

### Checklist

- [x] `imagePreview.ts`, useAgent, bolla della persona, card dell'evento
- [x] Test: 21 file / 96 test
- [x] Playbook come host contro la build locale: typecheck, 89 file / 681 test
- [x] README, llms.txt, CHANGELOG, versione 0.19.0

---

## CR-019 — Attività degli altri agenti nella chat

**Stato:** ✅ done (0.18.0)
**Issue:** [#19](https://github.com/sherpadvisorylab/llmnative-agentico/issues/19)
**Priorità:** Alta
**Dipende da:** CR-018 (sessioni di una chat, chi parla)

### Motivazione

Emersa nel Playbook il 12/11/2026. La chat di progetto, divisa in sessioni, deve diventare la cronologia di tutto
quello che succede: oltre ai messaggi della persona e di Jonny, anche il lavoro degli altri agenti, ognuno con il suo
avatar.

### Scope

- Ogni voce del log ha `at`, l'ora in cui nasce, salvata con la chat. La ripresa di una chat salvata non la inventa.
- `<AgenticoProvider threadEvents>`: `ThreadEventsSource` con `load(thread, from, to)` e `subscribe`. `ThreadEvent`
  ha `id`, `at`, `author`, `title` e, opzionali, `body`, `badge`, `href`, `icon`.
- Il pannello mostra gli eventi tra i turni in ordine di tempo (`placeEvents`), come card compatte con l'avatar nella
  colonna di sinistra:
  - nella sessione aperta, dall'ultimo messaggio della sessione precedente;
  - in ogni sessione precedente, fino al suo ultimo messaggio.
- Filtro "Solo la conversazione" nell'header, ricordato dal browser. Il modello non legge mai gli eventi.

### Checklist

- [x] `at` sulle voci, dominio `threadEvents.ts`, provider, `ThreadEvents.tsx`, log, pannello, sessioni precedenti
- [x] Test: 21 file / 93 test
- [x] Playbook come host contro la build locale (eventi dell'Attività del progetto): typecheck, 89 file / 678 test
- [x] README, llms.txt, CHANGELOG, versione 0.18.0

---

## CR-018 — Sessioni di una chat e chi parla

**Stato:** ✅ done (0.17.0)
**Issue:** [#18](https://github.com/sherpadvisorylab/llmnative-agentico/issues/18)
**Priorità:** Alta
**Dipende da:** CR-010 (inizio di una chat), CR-013 (chat tenute dall'host)

### Motivazione

Emersa nel Playbook il 12/11/2026. La persona vuole vivere la chat con l'orchestratore di un progetto come una
sola chat, divisa in sessioni di lavoro. Ogni sessione ha il suo contesto, e scorrendo in alto compare la sessione
precedente. Vuole anche capire chi parla: le chat sono dell'organizzazione e più persone scrivono nella stessa.

### Scope

- `SubagentManifest.thread(params)`: le chat salvate dello scope con la stessa chiave, anche di subagent diversi,
  sono sessioni di una chat.
  - Il pannello mostra le precedenti sopra quella aperta, solo da leggere, una per volta quando la persona scorre
    in cima. In cima c'è anche il pulsante "Sessione precedente".
  - Ogni sessione ha un separatore con titolo, inizio e "Continua questa sessione". Prima di quella aperta c'è
    "Questa sessione".
  - La posizione di scorrimento resta dov'era. Il modello legge solo la sessione aperta.
- `SubagentManifest.speaker(params)`: avatar e nome all'inizio di ogni turno dell'agente.
- `<AgenticoProvider person>`: un messaggio della persona porta `author`, salvato con la chat e mostrato accanto
  alla bolla. Senza immagine si usa `Identicon` del nome.
- `chatThreadOf`, `earlierSessions`, `ChatAuthor`; i18n in en, it, de.
- Fuori scope: le card delle attività di altri agenti nella chat, inserite dall'host. Va in una CR successiva.

### Checklist

- [x] Dominio (`chatThread.ts`), manifest, autore su useAgent e runner, provider
- [x] Pannello (`EarlierSessions`), avatar nel log
- [x] Test: 20 file / 88 test
- [x] Playbook come host contro la build locale: typecheck, 88 file / 677 test
- [x] README, llms.txt, CHANGELOG, versione 0.17.0

---

## CR-017 — Allegati per l'esecutore

**Stato:** ✅ done (0.16.0)
**Issue:** [#17](https://github.com/sherpadvisorylab/llmnative-agentico/issues/17)
**Priorità:** Alta
**Dipende da:** CR-003 (subagent remoti), CR-124 del framework (allegati incollati)

### Motivazione

Emersa nel Playbook l'11/11/2026: con Claude Code sul server il composer non offriva gli allegati; la persona vuole
trascinare un file o incollare uno screenshot come negli assistenti degli IDE.

### Scope

- `AgentExecutor.attachments`: il composer offre gli allegati anche sui modelli dell'esecutore; il turno li riceve come
  `attachments` (`AIAttachment[]`), i nomi sul messaggio. `useAgent().executorAttachments`.
- Riprova e Modifica rimandano il testo, non i file (non sono tenuti nella chat).

### Checklist

- [x] Contratto, turno, composer
- [x] Test: 19 file / 83 test
- [x] README, llms.txt, CHANGELOG, versione 0.16.0

---

## CR-016 — Riprova e modifica di un messaggio della persona

**Stato:** ✅ done (0.15.0)
**Issue:** [#16](https://github.com/sherpadvisorylab/llmnative-agentico/issues/16)
**Priorità:** Alta
**Dipende da:** CR-003 (subagent remoti), CR-009 (esecutore accanto al catalogo)

### Motivazione

Emersa nel Playbook l'11/11/2026: come negli assistenti degli IDE, la persona vuole tornare a un suo messaggio
(una risposta fermata, una domanda scritta male) e ripartire da lì, invece di aggiungere messaggi in coda.

### Scope

- Riprova da qui e Modifica accanto a ogni messaggio della persona, al passaggio del mouse (e da tastiera), spenti
  mentre un turno gira. Modifica rimette il testo nel composer ("Modifichi un messaggio · Annulla").
- `useAgent().rewind(entryId, text?)`: chat e history del modello tagliate al messaggio (`historyAt`, la lunghezza
  della history quando è stato inviato), poi il messaggio è rimandato. Messaggi senza `historyAt` (prima di 0.15.0,
  il messaggio d'apertura) senza azioni.
- Esecutore: `canRewind` per offrire il ritorno; il turno successivo porta `rewound: { activity }`, la chat com'è
  ora (dopo un turno sul catalogo, il log prima del messaggio inviato). Senza `canRewind`, niente azioni.
- Conferma quando dopo il messaggio ci sono passi fatti: restano fatti, la conferma li elenca.

### Checklist

- [x] rewind, historyAt, rewound, canRewind
- [x] Azioni sulla bolla, composer in modifica, conferma, i18n en/it/de
- [x] Test: 18 file / 79 test
- [x] README, llms.txt, CHANGELOG, versione 0.15.0

---

## CR-015 — Continua senza AI solo se l'agente ha un risultato senza modello

**Stato:** ✅ done (0.14.0)
**Issue:** [#15](https://github.com/sherpadvisorylab/llmnative-agentico/issues/15)
**Priorità:** Media

### Motivazione

Emersa nel Playbook il 06/11/2026: quando il modello fallisce (es. il limite settimanale di un abbonamento) una
chat offriva "Continua senza AI", che non dà nulla.

### Scope

- `AgentDefinition.offersFallback` (default true); false = solo Riprova. `useAgent().offersFallback`.

### Checklist

- [x] Flag, barra dell'errore
- [x] Test: 17 file / 75 test
- [x] README, llms.txt, CHANGELOG, versione 0.14.0

---

## CR-014 — Card nei messaggi della chat

**Stato:** ✅ done (0.13.0)
**Issue:** [#14](https://github.com/sherpadvisorylab/llmnative-agentico/issues/14)
**Priorità:** Alta
**Dipende da:** CR-004 (messaggi a parti)

### Motivazione

Emersa nel Playbook il 06/11/2026: ciò che un agente prepara per la persona (la bozza di una CR) si mostra meglio
dove nasce nella chat, come card con le sue azioni, che come avviso sopra il prompt.

### Scope

- Parte `card` (titolo, badge, corpo, `details` con Vedi in una modale laterale, azioni dell'host, `data`, `outcome`),
  salvata con la chat. `AgentTool.card`, `turn.onCard`, `AgentDefinition.onCardAction` (esito nella card, pulsanti
  spenti, anche su una chat riaperta), `useAgent().cardAction`. Componenti del framework.

### Checklist

- [x] Parte, agganci per strumento ed esecutore, azione
- [x] Resa, Vedi, i18n en/it/de
- [x] Test: 17 file / 73 test; verificato sul Playbook con la build locale
- [x] README, llms.txt, CHANGELOG, versione 0.13.0

---

## CR-013 — Chat salvate tenute anche dall'host

**Stato:** ✅ done (0.12.0)
**Issue:** [#13](https://github.com/sherpadvisorylab/llmnative-agentico/issues/13)
**Priorità:** Alta
**Dipende da:** CR-003 (chat per entità)

### Motivazione

Emersa nel Playbook il 06/11/2026: una chat è una sorgente del progetto dalla nascita; la devono vedere gli altri
dell'organizzazione e non deve perdersi cambiando browser. Lo store viveva nel localStorage di un browser.

### Scope

- `EntityChatBackend` (`load`, `save`, `remove`) in `configureEntityChatStore`; scritture anche al backend in
  background; `syncEntityChats(scopeId)` all'apertura dello scope (più recente vince per `changedAt`, tolte le chat
  sparite dal backend, mandate quelle mai mandate); una rimozione rifiutata torna con la sync.

### Checklist

- [x] Backend, sync, provider
- [x] Test: 16 file / 71 test
- [x] README, llms.txt, CHANGELOG, versione 0.12.0

---

## CR-012 — Livello di ragionamento dei turni sul catalogo AI

**Stato:** ✅ done (0.11.0)
**Issue:** [#12](https://github.com/sherpadvisorylab/llmnative-agentico/issues/12)
**Priorità:** Alta
**Dipende da:** CR-010, CR-122 del framework (`reasoning` sulla richiesta)

### Motivazione

Emersa nel Playbook il 06/11/2026: l'app imposta per provider quanto ragiona il modello delle sue chat; un turno sul
catalogo AI non mandava nulla.

### Scope

- `AgentExecutor.catalogReasoning(params, provider)`: il livello dei turni della chat su quel provider; ogni
  richiesta del turno (i suoi giri e quella di chiusura) lo porta come `reasoning`. Peer del framework invariato.

### Checklist

- [x] `catalogReasoning`, mandato su ogni richiesta di un turno sul catalogo
- [x] Test: 15 file / 68 test
- [x] README, llms.txt, CHANGELOG, versione 0.11.0

---

## CR-011 — Titoli delle chat scritti dal modello, modificabili

**Stato:** ✅ done (0.10.0)
**Issue:** [#11](https://github.com/sherpadvisorylab/llmnative-agentico/issues/11)
**Priorità:** Alta
**Dipende da:** CR-010 (catalogo limitato per chat)

### Motivazione

Emersa nel Playbook il 06/11/2026: lo storico (e le liste dell'host) chiamano una chat con i parametri con cui è
partita ("crm · Jonny"): molte chat sembrano uguali; una chat in cui la persona non ha mai scritto resta lo stesso.

### Scope

- `SubagentManifest.autoTitle`: dopo un turno una chat con un messaggio della persona e senza un titolo suo ne
  riceve uno dal modello, letto dalla chat intera (3-6 parole nella sua lingua, prompt `chatTitle` en/it), con un
  modello del catalogo che la chat può usare (quello scelto, altrimenti il primo ammesso); senza, il titolo resta.
- Una volta per scope e sessione: le chat salvate prima senza titolo lo ricevono; quelle conversazionali senza
  messaggi della persona sono tolte, e non si salvano più.
- `name`/`namedBy` nello snapshot, conservati; `chatTitle`, `chatHasPersonMessage`, `renameEntityChat` (il titolo
  della persona non è mai sostituito; vuoto: torna automatico), `onEntityChatsChange`.
- Storico: mostra `chatTitle`, azione Rinomina (modale del framework).

### Checklist

- [x] Store: name, namedBy, chatTitle, renameEntityChat, onEntityChatsChange
- [x] Titolo dopo un turno, passaggio una volta per sessione, prompt en/it
- [x] Storico: titolo, rinomina
- [x] Test: 15 file / 68 test; verificato sul Playbook con la build locale
- [x] README, llms.txt, CHANGELOG, versione 0.10.0

---

## CR-010 — Data d'inizio di una chat, e catalogo AI limitato per chat

**Stato:** ✅ done (0.9.0)
**Issue:** [#10](https://github.com/sherpadvisorylab/llmnative-agentico/issues/10)
**Priorità:** Alta
**Dipende da:** CR-003 (chat per entità, storico), CR-009 (esecutore accanto al catalogo)

### Motivazione

Emersa nel Playbook il 06/11/2026. (1) Una chat salvata tiene solo `savedAt`, riscritto a ogni turno: riaperta,
una chat di ore prima sale in cima allo storico come "adesso" e la persona non riconosce più quale fosse.
(2) L'host può ammettere in una chat solo alcuni provider (nel Playbook: quelli di un progetto), ma accanto a un
esecutore il composer offre ogni modello del catalogo.

### Scope

- `EntityChatSnapshot.startedAt`: messo al primo salvataggio, conservato da ogni salvataggio successivo (una chat
  salvata prima: il suo `savedAt`). `listEntityChats` ordina per inizio, il più recente prima.
- Storico: il tempo dall'inizio; nel tooltip inizio e ultimo messaggio (i18n en/it/de).
- `AgentExecutor.catalogProviders(params)`: i provider del catalogo AI su cui la chat può girare (assente: tutti).
  Il composer elenca solo i loro modelli; un modello scelto di un altro provider non si usa: il primo modello
  dell'esecutore, altrimenti il primo ammesso del catalogo.

### Checklist

- [x] `startedAt` nello store (`chatStartedAt`), storico (mostrato, ordinato, tooltip), i18n en/it/de
- [x] `catalogProviders`: modelli offerti, modello usato (anche al primo turno, prima del render)
- [x] Test: 14 file / 65 test; verificato sul Playbook (typecheck, 599 test, build) con la build locale
- [x] README, llms.txt, CHANGELOG, versione 0.9.0

---

## CR-009 — Esecutore accanto al catalogo AI

**Stato:** ✅ done (0.8.0)
**Issue:** [#9](https://github.com/sherpadvisorylab/llmnative-agentico/issues/9)
**Priorità:** Alta
**Dipende da:** CR-003 (subagent remoti), CR-121 del framework (badge del gruppo)

### Motivazione

Emersa nel Playbook il 06/11/2026: l'orchestratore del progetto in chat gira via API (con i suoi tool) o su un
harness sul server (Claude Code, opencode), scelto con il modello; un solo agente, un solo menu.

### Scope

- `AgentExecutor.alongside`: l'agente resta del catalogo AI; solo i turni con un modello dell'esecutore vanno a
  `executor.turn` (`first` al primo dei suoi turni nella chat, di nuovo dopo una riapertura).
- Il composer mostra i modelli dell'esecutore e poi quelli del catalogo; `catalogGroup(provider, label)` dà
  gruppo e badge ai modelli del catalogo; `groupBadge` sui modelli dell'esecutore. Allegati solo sul catalogo.
- `useAgent`: `alongside`, `catalogGroup`; `selectedModel` è un modello dell'uno o dell'altro.

### Checklist

- [x] `alongside`, `catalogGroup`, `AgentExecutorModel`, `AgentModelGroupBadge`; `useAgent`, composer
- [x] Test (turni all'esecutore solo con i suoi modelli, `first`, gruppi e badge): 13 file / 61 test
- [x] README, llms.txt, CHANGELOG, versione 0.8.0

---

## CR-008 — Approvazione della persona per i tool rischiosi

**Stato:** ✅ done (0.7.0)
**Issue:** [#8](https://github.com/sherpadvisorylab/llmnative-agentico/issues/8)
**Priorità:** Alta
**Dipende da:** CR-005 (domande ancorate)

### Motivazione

Emersa nel Playbook il 05/11/2026: l'orchestratore del progetto in chat agisce per la persona (chiude CR,
mette in pausa, rilascia). La conferma di un'azione rischiosa era affidata al modello (un parametro
`confirmed` dichiarato da lui): niente garantiva che la persona avesse detto sì a quell'azione.

### Scope

- `AgentTool.needsApproval?: boolean | ((input) => boolean)`, `describeApproval?(input)`.
- `useAgent`: prima di eseguire un tool che la chiede, il turno si ferma su una domanda in un messaggio
  suo (`approval-<id della chiamata>`, parte `approval`), ancorata in fondo come le altre (CR-005):
  "Approvi? <azione>", Approva / Rifiuta e un motivo libero. Le chiamate di un round: una alla volta,
  prima che ne giri una.
- Approvato: il tool gira. Rifiutato: non gira, il modello riceve `toolRejected` (pacchetto di prompt)
  con il motivo. Stop durante l'attesa: il turno si ferma.
- La risposta resta nella chat.

### Checklist

- [x] `needsApproval`, `describeApproval`, `src/domain/approval.ts`, domanda in `useAgent`, `toolRejected`, i18n en/it/de
- [x] Test (attesa e approvazione, rifiuto con motivo, stop, tool senza approvazione invariati): 13 file / 60 test
- [x] README, llms.txt, CHANGELOG, versione 0.7.0
- [x] Verificato nel Playbook (typecheck, test e build con 0.7.0)

---

## CR-007 — Subagent conversazionali

**Stato:** ✅ done (0.6.0)
**Issue:** [#7](https://github.com/sherpadvisorylab/llmnative-agentico/issues/7)
**Priorità:** Alta
**Dipende da:** CR-004 (messaggi a parti)

### Motivazione

Emersa nel Playbook il 04/11/2026 (orchestratore del progetto in chat). Un subagent non remoto che
conversa con il modello e usa dei tool, senza un risultato da applicare, mostrava ogni risposta come un
risultato: "Risposta ricevuta", anteprima JSON e "Salva il risultato in… / Esporta come JSON".

### Scope

- `AgentDefinition.conversational?: boolean`.
- `useAgent`: la risposta di testo di un agente conversazionale è una parte `text` del turno (resa con
  `ChatMarkdown`, salvata con la chat), non un dettaglio sotto "Risposta ricevuta".
- `SubagentRunner`: nessun risultato tenuto (niente anteprima né destinazioni), al primo turno, ai
  successivi e al Riprova. `parseResponse` gira comunque (ciò che risolvono `run`/`sendMessage`).
- Gli agenti senza il flag non cambiano.

### Checklist

- [x] `AgentDefinition.conversational`, parte di testo in `useAgent`, nessun risultato in `SubagentRunner`
- [x] Test (risposta come parte di testo al primo turno e al seguito; agenti senza flag invariati): 12 file / 56 test
- [x] README, llms.txt, CHANGELOG, versione 0.6.0
- [x] Verificato nel Playbook (typecheck, test e build con 0.6.0)

---

## CR-006 — Comandi slash del subagent nel prompt

**Stato:** ✅ done (0.5.0) — parte Agentico; verifica nel Playbook e pubblicazione npm a cura della sessione principale
**Issue:** [#6](https://github.com/sherpadvisorylab/llmnative-agentico/issues/6)
**Priorità:** Alta
**Dipende da:** CR-003 (controlli del subagent)

### Motivazione

Emersa nel Playbook il 27/10/2026 (agente di progettazione). L'agente remoto ha comandi propri
(es. `/to-spec`) che oggi la persona deve ricordare e scrivere a mano. Il `Chatbot` del framework ha
già `commands?: EditorCommand[]` e `commandsTrigger` (default `/`): un menu sul trigger, e un comando
senza handler inserisce `/nome ` nel testo. Agentico fa passare al composer di un task solo le azioni
(`SubagentControls.actions`) e il contenuto sopra il composer.

### Scope

- `SubagentControls.commands?: EditorCommand[]` (il tipo del framework, importato da `@llmnative/react` come `ChatbotAction`), portato come le
  azioni (identità stabile con `useMemo`, stesso hook `registerSubagentControls`) e passato al
  `Chatbot` del task (`commands`). Scelta: nei controlli e non nel manifest, perché il manifest è
  dominio (niente tipi della UI) e i controlli sono già il posto di ciò che l'host mette nel prompt;
  così i comandi possono anche dipendere dallo stato dell'host (parametri, task, `running`).
- Il testo del comando arriva al turno dell'esecutore come `text` del messaggio (es. `/to-spec`),
  senza nulla di speciale: cosa vuol dire lo decide l'host.
- Niente comandi mentre le domande ancorate (CR-005) sostituiscono il composer (il composer non c'è).
  Mentre un turno è in corso il composer resta scrivibile e l'invio aspetta (Stop): i comandi restano
  disponibili come il resto del testo.
- Test, README, llms.txt, CHANGELOG, versione 0.5.0.

### Checklist

- [x] `SubagentControls.commands`, `AgenticoTask.composerCommands`, `Chatbot commands`
- [x] Test (menu sul `/`, testo inviato all'esecutore, niente composer con domande ancorate): 11 file / 54 test
- [x] README, llms.txt, CHANGELOG, versione 0.5.0
- Nota: col framework 1.35 un `Chatbot` con `commands` non invia con Invio (solo col pulsante): da
  correggere nel framework, Agentico non ci può fare nulla
- [ ] Verificato nel Playbook: a cura della sessione principale
- [ ] Release: pronta in 0.5.0 (commit locale, niente tag/push/npm in questa sessione)

---

## CR-005 — Pannello ridimensionabile e domande ancorate in fondo

**Stato:** ✅ done (0.4.0) — parte Agentico; verifica nel Playbook e pubblicazione npm a cura della sessione principale
**Issue:** [#5](https://github.com/sherpadvisorylab/llmnative-agentico/issues/5)
**Priorità:** Alta
**Dipende da:** CR-004

### Motivazione

Emersa nel Playbook il 27/10/2026 (agente di progettazione). La colonna di Agentico ha una larghezza
fissa (420 px): stretta per tabelle e piani lunghi, larga su schermi piccoli. Le domande dell'agente
compaiono nel thread che scorre, sotto la bolla dell'utente fissata in cima, con il composer ancora
aperto: poco spazio per leggere, e non è chiaro che la conversazione aspetta una risposta. Claude Code
e Cursor ancorano le domande in fondo, al posto del prompt.

### Scope

- **Pannello ridimensionabile**: il bordo interno (verso la pagina) si trascina col puntatore; è un
  `role="separator"` focalizzabile (frecce, Shift, Home/End), doppio clic per il default; limiti min/max
  (320 px … 60vw); larghezza salvata per browser in `localStorage` (`agentico:panel-width`, try/catch).
  Props di `<Agentico>`: `defaultWidth`, `minWidth`, `maxWidth` (px o `'<n>vw'`), `onWidthChange`.
  Il framework non ha uno splitter: maniglia in Agentico, solo token del tema.
- **Domande ancorate**: le domande senza risposta dell'ultimo messaggio dell'agente (turno non fermato
  né fallito, rispondibili) vanno in fondo al pannello al posto del composer, alte quanto serve fino
  all'area della chat e poi con scroll interno; Stop mentre il turno è in corso. Intanto la bolla
  dell'utente non resta fissata in cima. Con la risposta (o il turno fermato) tornano nel thread in sola
  lettura e il composer ricompare. Domande senza risposta di una chat ricaricata: ancorate e
  rispondibili.
- Test, README, llms.txt, CHANGELOG, versione 0.4.0.

### Checklist

- [x] `usePanelWidth` + `AgenticoResizeHandle` (`src/presentation/panelWidth.ts`,
  `src/presentation/AgenticoResizeHandle.tsx`): trascinamento con pointer capture, tastiera, doppio clic,
  clamp anche al ridimensionamento della finestra, `localStorage` in try/catch
- [x] Props `defaultWidth`/`minWidth`/`maxWidth`/`onWidthChange`, export `AgenticoProps`,
  `AgenticoPanelSize`, `AGENTICO_MIN_WIDTH`, `AGENTICO_MAX_WIDTH`, `AGENTICO_WIDTH_STORAGE_KEY`
- [x] `findDockedQuestions` + `QuestionsPart` (`AgentActivityLog.tsx`); il thread salta la parte
  ancorata e non fissa la bolla dell'utente (`pinUserMessages`); sezione ancorata con `ChatQuestions`
  (`autoFocus`) e Stop al posto del composer
- [x] Chat ricaricata: già rispondibile (le voci del seed sono nella conversazione viva); ora ancorata,
  coperta da test (la risposta avvia un nuovo turno con `answers`)
- [x] i18n `resizePanel`, `resizePanelHint`, `pendingQuestions`, `stop` (en/it/de)
- [x] Test (11 file / 52 test, nuovo `tests/unit/panel.test.tsx`), README, llms.txt, CHANGELOG
- [ ] Verificato nel Playbook: a cura della sessione principale
- [ ] Release: pronta in 0.4.0 (commit locale, niente tag/push/npm in questa sessione)

---

## CR-004 — Messaggi a parti: testo, ragionamento, passi, domande

**Stato:** ✅ done (0.3.0) — parte Agentico; verifica nel Playbook e pubblicazione npm a cura della sessione principale
**Issue:** [#4](https://github.com/sherpadvisorylab/llmnative-agentico/issues/4)
**Priorità:** Alta
**Dipende da:** CR-109 di `@llmnative/react` (componenti di chat)

### Motivazione

Emersa nel Playbook il 26/10/2026 (agente di progettazione). Oggi un messaggio dell'agente è testo con
un parser Markdown fatto in casa (grassetto, codice, link): tabelle ed elenchi escono grezzi; il
ragionamento del modello, quando arriva, si mescola alla risposta; le domande sono testo. Gli altri
chatbot dividono una risposta in parti, ognuna con il suo componente.

### Scope

- **Modello a parti** del messaggio dell'agente, sul modello del Vercel AI SDK / AG-UI: `text`,
  `reasoning`, `tool` (i passi, raggruppati e richiudibili), `questions`. L'executor di un subagent
  remoto (CR-003) le emette: `onText` resta per compatibilità, si aggiungono `onReasoning` e
  `onQuestions`.
- **Rendering** con i componenti del framework (CR-109): `ChatMarkdown` per il testo (al posto
  dell'`InlineMarkdown` attuale), `ChatReasoning`, i passi raggruppati, `ChatQuestions`.
- **Risposta alle domande**: le risposte scelte tornano all'executor come messaggio strutturato
  (`answers`), non come testo da interpretare; il subagent decide come inoltrarle (il Playbook le passa
  allo strumento `question` di opencode).
- Il messaggio dell'utente fissato in cima (sticky) senza sovrapporsi al testo sotto.
- Chat salvate (`EntityChatSnapshot`) compatibili: le parti si salvano e si ricaricano.
- Test, README/docs, CHANGELOG.

### Checklist

- [x] Modello a parti ed executor (`onReasoning`, `onQuestions`, risposte strutturate): `AgentMessagePart`
  (`text` | `reasoning` | `tool` | `questions`) in `AgentActivityEntry.parts` (`src/domain/messageParts.ts`);
  `onText(text, { id?, done? })` compatibile, `onReasoning(text, { id?, done?, duration? })` con durata
  misurata, `onQuestions(questions, { id? }) → Promise<answers>`; risposte date dopo il turno → nuovo turno
  con `AgentExecutorTurn.answers = { id, answers }` e `text` vuoto; `useAgent().answerQuestions`
- [x] Rendering con `ChatMarkdown` (al posto di `InlineMarkdown`, `streaming` mentre arriva), `ChatReasoning`,
  passi consecutivi in un gruppo richiudibile (`Tree` del framework), `ChatQuestions` (sola lettura una volta
  risposto, resta nello storico)
- [x] Messaggio dell'utente in cima senza sovrapposizioni: sticky dentro il proprio turno (un `<li>` per
  turno), `z-20` e sfondo pieno; non spunta più sotto la bolla del turno dopo
- [x] Chat salvate compatibili: le parti si salvano e si ricaricano (`EntityChatActivityEntry.parts`); le chat
  senza parti mostrano `detail` in Markdown (test)
- [x] Test (10 file / 44 test, nuovo `tests/unit/messageParts.test.tsx`), README, llms.txt, CHANGELOG
- [ ] Verificato nel Playbook (domande di BMAD e di Matt interattive, tabelle, ragionamento richiudibile): a cura della sessione principale
- [ ] Release: pronta in 0.3.0 (commit e tag `v0.3.0`, `@llmnative/react` ^1.34). Gate: `tsc --noEmit` 0 errori,
  `npm test` 10 file / 44 test, `npm run build` OK, `npm pack --dry-run` OK. Pubblicazione npm: a cura della sessione principale

---

## CR-003 — Subagent remoti, avvio diretto, chat per entità, azioni del pannello

**Stato:** ✅ done — rilasciato in 0.2.0
**Issue:** [#3](https://github.com/sherpadvisorylab/llmnative-agentico/issues/3)
**Priorità:** Alta
**Dipende da:** CR-001

### Motivazione

Playbook ha un agente di progettazione che non è un modello: è una sessione opencode su un server,
con la sua memoria, che risponde a pezzi e intanto scrive file. Oggi ogni turno di un subagent va
al provider AI di Agentico (`useAgent` → `provider.complete`), e un subagent si avvia solo
dall'orchestratore. Un provider finto non va bene: niente streaming, prompt di Agentico da
ripulire, l'orchestratore che userebbe lo stesso modello. Servono:
- un esecutore dell'host per i turni;
- l'avvio diretto da una pagina;
- la chat legata all'entità;
- i pulsanti dell'host nel pannello.

### Scope

- `AgentDefinition.executor` (`AgentExecutor`). Quando c'è, `useAgent` gli passa i turni invece
  di passarli al provider: riceve il testo della persona, riporta la risposta mentre cresce
  (`onText`) e i passi dell'agente (`onStep`). Non servono modello, prompt né fallback, e la
  conversazione espone `remote: true`. Il composer nasconde modello e allegati, e il pannello
  nasconde "Continua senza AI".
- `useAgentico().startSubagent(subagentId, params, { taskId?, openingMessage? })`: avvia un
  subagent da una pagina, senza orchestratore.
- `SubagentManifest.chatEntityId(params)`: la chat si salva dopo ogni turno sotto quell'entità, ed
  è nello storico e si riprende con `resumeEntityChat`.
- `SubagentManifest.onlyWhenAnchored`: l'orchestratore offre il subagent solo quando la
  conversazione è legata a lui, cioè quando sulla pagina c'è un componente ancorato.
- `registerSubagentPanelActions`: un componente dell'host in fondo al pannello mentre il task è
  aperto. Riceve parametri, id del task, se un turno è in corso, e `close()`.

### Checklist

- [x] `AgentExecutor` + `useAgent` remoto (streaming, passi, stop, resume, snapshot)
- [x] Composer e pannello per un task remoto
- [x] `startSubagent`
- [x] `chatEntityId` con salvataggio a ogni turno
- [x] `onlyWhenAnchored` nell'orchestratore
- [x] Controlli del subagent (`registerSubagentControls`, al posto di `registerSubagentPanelActions`)
- [x] Test (35), README, llms.txt, CHANGELOG
- [x] Scroll del pannello che segue la risposta mentre cresce (streaming)
- [x] Storico: la chat aperta nel pannello è segnata (spunta, sfondo)
- [x] Verifica in playbook (tarball locale): sessione avviata dalla pagina del progetto, round in
  streaming, risposte, typecheck, test e build dello studio
- [x] Release 0.2.0 (24/10/2026)

### Seconda parte (todo, decisa il 24/10/2026)

Dipende dalla CR-107 del framework (`ChatbotAction.onClick`, `DropdownItem.actions`).

- [x] **Modelli di un subagent remoto:** `AgentExecutor.models` (opzioni `{ label, value, group? }`
  date dall'host) e `defaultModel(params)`. Il composer mostra il selettore anche per un task
  remoto, e il turno riceve `model`. L'host decide cosa vuol dire (per playbook: il modello della
  sessione, dal messaggio successivo).
- [x] **Azioni del subagent nel prompt:** `SubagentManifest`/registro presentation con azioni del
  composer (`ChatbotAction` con `onClick`, `disabled` mentre un turno è in corso). Sostituiscono
  `registerSubagentPanelActions` come posto dei comandi (es. "Concludi e apri la PR" apre la modale
  dell'host); la barra sopra il composer resta solo per stati e messaggi.
- [x] **Archivia nello storico:** icona al passaggio del mouse sulla riga (`DropdownItem.actions`).
  Toglie la chat dallo storico (`removeEntityChat`) e chiama `SubagentManifest.onArchive?(entityId,
  params)` per l'host (per playbook: chiude la sessione sul runner, senza PR). Chiede conferma solo
  se l'host lo dice (`confirmArchive?(entityId, params)` → testo o niente).
- [x] **Storico con tempo relativo:** "2 h fa" (Intl.RelativeTimeFormat, lingua corrente) al posto
  di data e ora; data e ora complete nel titolo al passaggio del mouse.

---

## CR-002 — UI solo con componenti del framework

**Stato:** ⬜ todo
**Issue:** [#2](https://github.com/sherpadvisorylab/llmnative-agentico/issues/2)
**Priorità:** Media
**Dipende da:** CR-001

### Motivazione

Ereditati dal CMS: `ResultDestinationPicker` usa `<button>` a mano, `AgenticoHistoryDropdown` un
`<input>` di ricerca a mano, `AgentControls` uno switch disegnato a mano. Il framework ha
`ActionButton`, `AsyncDropdown` con ricerca e `Switch`. Lasciati invariati nell'estrazione per non
cambiare il comportamento del CMS nello stesso passaggio.

### Checklist

- [ ] `ResultDestinationPicker` su `ActionButton`
- [ ] Ricerca dello storico su un componente del framework
- [ ] `AgentControls` su `Switch`
- [ ] Test e verifica sul CMS

## CR-001 — Estrazione di Agentico come pacchetto

**Stato:** ✅ done — rilasciato in 0.1.0
**Issue:** [#1](https://github.com/sherpadvisorylab/llmnative-agentico/issues/1)
**Priorità:** Alta

### Motivazione

Agentico viveva in `llmnative-cms/src/agentico`, isolato ma accoppiato al CMS (tenant, i18n del
CMS, tool e logica dei redirect nell'orchestratore, testi in italiano nel codice). Serve anche a
`llmnative-playbook`: diventa un pacchetto con vita propria usato da entrambi.

### Scope

- Codice e test spostati dal CMS.
- `AgenticoScope` al posto del tenant (`DestinationContext.scopeId`, chat per scope con chiave
  configurabile e lettura del vecchio `tenantId`).
- `registerCrossAgentTools` + `collected` + `SubagentManifest.withCollected`: nessun tool o
  subagent concreto nel pacchetto.
- Prompt per il modello configurabili (`agenticoPromptsEn` default, `agenticoPromptsIt`).
- i18n `agentico` (en/it/de), fallback inglese, override dell'host.
- Orchestratore come factory con etichette tradotte.
- Build Vite (ES/CJS/tipi), CI, regole e direttiva di release del framework, release check per il
  primo rilascio.

### Checklist

- [x] Codice senza import verso un host
- [x] Test portati (5 file, 21 test) + nuovi (orchestratore, store, i18n: 10 test)
- [x] Typecheck, build, pack
- [x] Regole, direttiva, CI, README, llms.txt, CHANGELOG
- [x] Release 0.1.0
