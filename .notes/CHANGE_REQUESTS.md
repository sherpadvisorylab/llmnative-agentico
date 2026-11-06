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
