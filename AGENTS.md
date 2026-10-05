# @llmnative/agentico — Agent Reference

Leggi `README.md` per cos'è il pacchetto e la sua API pubblica (`src/index.ts` è il confine).
Leggi `llms.txt` per l'orientamento rapido.
Leggi `.notes/STATUS.md` per lo stato attuale e le CR aperte.
Leggi `.notes/CHANGE_REQUESTS.md` per la lista completa delle CR (passate, in corso, future).

## Regole del pacchetto

- Agentico orchestra soltanto: non conosce nessun subagent, destinazione, report, tool, rotta o
  testo concreto di un host. Tutto ciò che è specifico arriva dall'host tramite le API di
  registrazione e configurazione (`registerSubagents`, `registerDestinations`,
  `registerSubagentReports`, `registerCrossAgentTools`, `configureAgenticoPrompts`,
  `configureEntityChatStore`, `<AgenticoProvider scope>`, `I18nDict.agentico`).
- Dipende solo dall'API pubblica di `@llmnative/react`: tutti gli import da `'@llmnative/react'`,
  mai da sottodirectory.
- La UI è composta con i componenti pubblici di `@llmnative/react` (stessa regola della direttiva
  UI consumer del framework: `../react/docs/directives/consumers/llm-rule-ui-consumer.md`). Se
  manca una capability, fermarsi e proporla al framework invece di scriverne una a mano.
- Testi per l'utente solo nel namespace i18n `agentico` (`src/i18n`, en/it/de). Testi per il
  modello solo nel pacchetto di prompt (`src/domain/prompts.ts`, en/it).
- `src/domain/` non importa React né `src/presentation/`.
- TypeScript strict, niente `any` (eccezioni annotate inline).

## Direttive

Ogni riga è una regola vincolante a file separato. Leggere il file solo quando il trigger
corrispondente si verifica — non caricarlo a priori. Questa tabella è l'unica fonte di verità
sull'elenco delle direttive: `CLAUDE.md` e `GEMINI.md` devono soltanto rimandare qui.

| Direttiva | File | Trigger |
|---|---|---|
| Change & release workflow | `docs/directives/maintainers/llm-rule-change-release.md` | La richiesta modifica `@llmnative/agentico` e poi chiede commit/push |
