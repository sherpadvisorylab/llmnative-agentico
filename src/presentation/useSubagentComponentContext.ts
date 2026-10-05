import { useEffect, useRef } from 'react';
import { useAgentico } from './AgenticoContext';

/** Registra "questo componente è il subagent X" per Agentico — chiamato DAL componente
 * portabile stesso (es. ThemeIndexList/ThemeEditor), mai dalla pagina che lo ospita: chi monta
 * il componente ottiene gratis il contesto/hint/scoping corretto, senza ricostruirlo pagina per
 * pagina (vedi ../domain/subagentManifest.ts SubagentManifest.componentContexts per
 * dove vivono `agenticoHint`/`userMessage`).
 *
 * `componentKey` deve combaciare con una chiave di `manifest.componentContexts` — se non
 * combacia, l'anchor si registra comunque (per `onResult`) ma senza hint/messaggio (nessun
 * crash, solo nessun aggancio di prosa per l'LLM/l'utente).
 *
 * `onResult`, opzionale — chiamato da SubagentRunner quando arriva un risultato per questo
 * `subagentId` MENTRE questo componente è montato: il componente popola se stesso (Form/stato
 * locale), mai un salvataggio automatico — l'utente resta libero di rivedere e premere Salva
 * come per un edit manuale. `meta` è il TParams con cui il subagent è stato lanciato (es.
 * `{ url }` per theme) — utile quando il risultato stesso non porta un dato che serve per
 * popolare il componente (es. l'URL sorgente, per derivare un nome di default). `taskId` è l'id
 * del task Agentico che ha prodotto questo risultato — un componente che vuole poter persistere
 * la chat al proprio salvataggio (vedi AgenticoContext.commitEntityChat) lo tiene da parte in un
 * ref, altrimenti può ignorarlo. Anche una pagina
 * non-portabile (es. SiteEditorPage, per i soli campi di site-branding dentro lo stesso
 * risultato) può chiamare questo hook con lo stesso `subagentId` di un componente già montato —
 * più listener indipendenti sullo stesso risultato, ciascuno responsabile della propria fetta di
 * dati. */
export function useSubagentComponentContext(
    subagentId: string,
    componentKey: string,
    onResult?: (result: unknown, meta: Record<string, unknown>, taskId: string) => void,
    /** Fatti live sull'entità che QUESTA istanza ha aperta ORA (es. `Il tema aperto si chiama
     * "ducatimilano.it".`) — accodati all'agenticoHint statico del manifest nel prompt
     * dell'orchestratore (vedi AgenticoContext.anchorTexts), cosi un "estrai il tema" senza URL
     * esplicito può dedurlo dal nome/hostname già noto invece di richiederlo sempre da capo.
     * Assente/undefined = comportamento invariato. A differenza di `onResult` (in un ref, mai
     * causa di ri-registrazione) QUESTO è una dipendenza vera dell'effect sotto: deve
     * ri-registrare quando cambia (es. il nome dell'entità arriva dopo un fetch asincrono). */
    contextInfo?: string,
    /** `false` = non registra nulla (o smonta l'anchor già registrato) — per un componente che
     * resta montato anche quando "non è più lui" ad ancorarsi (es. RedirectsIndexList, che non
     * smonta quando mostra il dettaglio di un host: senza questo, il suo anchor 'indexList'
     * resterebbe attivo ANCHE mentre RedirectsEditor registra 'editor' per lo stesso
     * subagentId, consegnando un risultato a entrambi). Default `true` — comportamento invariato
     * per chi non lo passa. */
    enabled: boolean = true,
    /** Id dell'entità a cui QUESTA istanza è vincolata (es. l'hostId di RedirectsEditor) — vedi
     * ComponentAnchor.pinnedEntityId per il perché (backstop deterministico contro un salvataggio
     * su un'entità sbagliata, non solo un'istruzione nel prompt). Assente = nessun vincolo,
     * comportamento invariato. */
    pinnedEntityId?: string,
): void {
    const { registerComponentAnchor } = useAgentico();
    const id = useRef(crypto.randomUUID()).current;
    // Ref, non una dipendenza diretta dell'effect sotto — altrimenti una onResult ricreata a
    // ogni render (comune, spesso una closure inline) farebbe ri-registrare l'anchor a ogni
    // render invece che solo quando cambia davvero subagentId/componentKey.
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;

    useEffect(() => {
        if (!enabled) return;
        registerComponentAnchor(id, {
            subagentId,
            componentKey,
            contextInfo,
            pinnedEntityId,
            onResult: (result: unknown, meta: Record<string, unknown>, taskId: string) => onResultRef.current?.(result, meta, taskId),
        });
        return () => registerComponentAnchor(id, null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subagentId, componentKey, contextInfo, enabled, pinnedEntityId]);
}
