# Agentico change and release workflow

Questa è la direttiva canonica per qualunque persona o agente AI che modifica
`@llmnative/agentico`. I file specifici degli strumenti (`AGENTS.md`, `CLAUDE.md`,
`GEMINI.md`) devono soltanto
rimandare qui e non duplicare questo processo.

## Trigger obbligatorio

Quando una richiesta include modifiche ad Agentico e successivamente chiede di
fare commit e push, applicare automaticamente l'intero workflow sottostante,
anche se l'utente non ripete esplicitamente CR, GitHub Issue, versione, tag o npm.

Una richiesta di solo commit/push non autorizza invece una release di Agentico
se Agentico non è stato modificato. Le modifiche agli host (CMS, playbook, …)
seguono il proprio commit nel proprio repository, separato da quello di Agentico.

## Fonte di verità

- `.notes/CHANGE_REQUESTS.md`: specifica e checklist completa delle CR.
- `.notes/STATUS.md`: fotografia sintetica dello stato reale.
- GitHub Issues: stato operativo e collaborazione esterna.
- `CHANGELOG.md`: contenuto delle versioni pubblicate.
- `package.json`: versione candidata alla pubblicazione.

Documentazione, issue e codice devono descrivere lo stesso stato reale. Non
marcare mai come completato ciò che non è stato implementato e verificato.

## 1. Classificare la modifica prima di implementarla

1. Leggere integralmente `.notes/STATUS.md` e le sezioni pertinenti di
   `.notes/CHANGE_REQUESTS.md`.
2. Ispezionare codice, diff corrente e GitHub Issues aperte/chiuse.
3. Classificare il lavoro:
   - **CR esistente**: la modifica ricade nello scope di una CR già documentata;
     aggiornare quella CR.
   - **Nuova CR**: nuova capability, modifica architetturale, nuova API pubblica,
     breaking change o lavoro composto che merita una checklist autonoma;
     assegnare il successivo numero libero.
   - **Modifica minore senza CR**: correzione locale, refactor interno o sola
     documentazione senza nuova capability/API. Registrarla comunque nel
     changelog della prossima versione.
4. Per una CR nuova o riaperta, creare/aggiornare la GitHub Issue **prima del
   codice** e collegarla nella CR.

Se la classificazione è ambigua, scegliere una nuova CR quando il cambiamento
tocca più moduli, modifica il contratto pubblico o richiede più condizioni di
accettazione verificabili.

## 2. Sincronizzare gli stati

Usare questa corrispondenza, senza stati impliciti o fallback:

| Stato reale | CHANGE_REQUESTS / STATUS | GitHub Issue |
|-------------|--------------------------|--------------|
| Non iniziata | `todo` | aperta, label `pending` |
| In lavorazione | `in progress` | aperta, label `in-progress` |
| Completata e verificata | `done` | chiusa, label `done` |

All'avvio dell'implementazione, aggiornare CR, STATUS e issue a `in progress`.
Al termine, aggiornare checklist ed evidenze, spostare la CR tra le completate in
STATUS, applicare `done` e chiudere l'issue con riferimenti a commit e versione.
Se il lavoro resta parziale, non chiudere l'issue e non usare `done`.

## 3. Implementare e verificare

- Preservare compatibilità e convenzioni indicate in `AGENTS.md` e nella
  documentazione tecnica.
- Aggiornare test, documentazione pubblica (`README.md`, `llms.txt`) quando cambia l'API o il
  comportamento osservabile.
- Prima della release eseguire almeno:

```bash
npx tsc --noEmit
npm test
npm run build
npm pack --dry-run --json
```

Quando cambia l'API pubblica, verificare anche un host reale (typecheck, test e build
del CMS o di playbook con la versione locale del pacchetto). Un gate fallito blocca
commit di completamento e pubblicazione.

## 4. Preparare la versione

Applicare SemVer rispetto all'ultima versione pubblicata su npm:

- `patch`: fix compatibile o modifica interna;
- `minor`: nuova funzionalità/API retrocompatibile;
- `major`: breaking change.

Verificare prima `npm view @llmnative/agentico version`, quindi aggiornare con
`npm version <version> --no-git-tag-version`. Allineare `CHANGELOG.md`,
`.notes/STATUS.md`, `package.json` e `package-lock.json`.

## 5. Commit, issue, push e pubblicazione

1. Fare un commit Agentico autonomo. Per una CR usare
   `CR-NNN: titolo breve`; per una modifica minore usare un Conventional Commit.
2. Aggiornare la GitHub Issue con evidenze e commit; chiuderla solo se la CR è
   davvero completa.
3. Creare il tag annotato `v<version>` sul commit di release.
4. Fare push del branch e del tag.
5. Eseguire il preflight:

```bash
npm run release:check -- --cr CR-NNN --issue <numero>
```

Per una modifica minore senza CR:

```bash
npm run release:check -- --no-cr
```

6. Pubblicare con `npm publish --access public`.
7. Verificare la propagazione con
   `npm view @llmnative/agentico version --json`.
8. Verificare infine che branch locale/remoto coincidano e il worktree sia
   pulito.

Non pubblicare se manca autenticazione npm/GitHub, la versione esiste già, il
tag non punta a HEAD, il branch non è sincronizzato, la issue non riflette lo
stato documentato o uno dei gate è fallito. Segnalare il blocco senza simulare
il completamento.

## 6. Handoff finale

Riportare sempre:

- CR e GitHub Issue interessate con stato finale;
- commit e tag pubblicati;
- versione npm verificata sul registry;
- gate eseguiti e relativo esito;
- eventuali parti rimaste `in progress`.
