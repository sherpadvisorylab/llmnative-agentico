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
