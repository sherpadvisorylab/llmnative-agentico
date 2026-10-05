# Change Requests

> Ogni CR rappresenta un'unità di lavoro autonoma con motivazione, scope e checklist.
> Stato: `⬜ todo` · `🔄 in progress` · `✅ done` · `🚫 cancelled`

---

## Indice

| CR | Titolo | Priorità | Dipende da | Stato |
|----|--------|----------|-----------|-------|
| [CR-001](#cr-001--estrazione-di-agentico-come-pacchetto) | Estrazione di Agentico come pacchetto `@llmnative/agentico` | Alta | — | ✅ |
| [CR-002](#cr-002--ui-solo-con-componenti-del-framework) | UI di Agentico solo con componenti del framework | Media | CR-001 | ⬜ |

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
