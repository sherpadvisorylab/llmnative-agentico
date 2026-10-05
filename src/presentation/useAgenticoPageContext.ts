import { useEffect, useRef } from 'react';
import { useAgentico } from './AgenticoContext';
import type { SubagentUsageCard } from '../domain/subagentUsageCard';

/** Registra "dove si trova l'utente adesso" per Agentico — stesso pattern effect-based di
 * usePageBreadcrumb/usePageLeading (PageActionsContext.tsx): si registra al mount, si toglie da
 * solo allo smontaggio. Più istanze possono essere montate insieme (es. ToolsPage generico +
 * ToolHistoryPanel specifico sopra) — vince l'ultima registrata, vedi AgenticoContext.setPageContext.
 * `text === null` non registra nulla (utile per un contesto calcolato che a volte non è pronto).
 * `card` — opzionale, SOLO per la UI del pannello Agentico (vedi Agentico.tsx): quando presente
 * rimpiazza il paragrafo di prosa con una card strutturata (campi richiesti/opzionali), mentre
 * `text` resta comunque quello che arriva al prompt dell'orchestratore (vedi
 * AgenticoContext.pageContext) — due destinazioni diverse dello stesso "dove si trova l'utente",
 * mai lo stesso testo forzato a servire entrambe. */
export function useAgenticoPageContext(text: string | null, card?: SubagentUsageCard | null): void {
    const { setPageContext } = useAgentico();
    const id = useRef(crypto.randomUUID()).current;

    useEffect(() => {
        setPageContext(id, text, card ?? null);
        return () => setPageContext(id, null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, card]);
}
