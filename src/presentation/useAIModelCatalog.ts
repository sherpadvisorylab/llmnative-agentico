// Estratto da useAgent.ts — la sola parte "catalogo modelli disponibili per il tenant",
// riusabile anche da chi non ha (ancora) una sessione useAgent attiva, es.
// AgenticoStarterComposer (Agentico.tsx): l'utente deve poter scegliere il modello ANCHE
// prima che l'orchestratore parta, non solo nei turni di follow-up.
import { useEffect, useState } from 'react';
import { getAIModelCatalog, useAIProviderRegistry } from '@llmnative/react';
import type { AIModelDescriptor, AIProviderAdapter } from '@llmnative/react';

export interface UseAIModelCatalogResult {
    hasProviders:     boolean;
    modelsByProvider: Record<string, AIModelDescriptor[]>;
    modelsLoading:    boolean;
    selectedModel:    string;
    setSelectedModel: (id: string) => void;
}

// Un solo modello selezionato per l'intera app (non per subagent/tab) — tutti gli usi
// dell'hook (starter composer, sessione useAgent attiva, ...) devono vedere la stessa scelta,
// quindi una chiave globale condivisa, non una per istanza.
const SELECTED_MODEL_STORAGE_KEY = 'llmnative-cms.selectedAIModel';

function readStoredModel(): string {
    try {
        return localStorage.getItem(SELECTED_MODEL_STORAGE_KEY) ?? '';
    } catch {
        return ''; // storage non disponibile (privacy mode, ecc.) — nessuna persistenza, non un errore fatale
    }
}

function writeStoredModel(id: string): void {
    try {
        if (id) localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, id);
        else localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
    } catch {
        // idem — persistenza best-effort
    }
}

export function useAIModelCatalog(): UseAIModelCatalogResult {
    const registry: Record<string, AIProviderAdapter> = useAIProviderRegistry()?.registry ?? {};
    const hasProviders = Object.keys(registry).length > 0;
    const [modelsByProvider, setModelsByProvider] = useState<Record<string, AIModelDescriptor[]>>({});
    const [modelsLoading, setModelsLoading] = useState(false);
    const [selectedModel, setSelectedModelState] = useState(readStoredModel);

    const setSelectedModel = (id: string) => {
        writeStoredModel(id);
        setSelectedModelState(id);
    };

    useEffect(() => {
        if (!hasProviders) { setModelsByProvider({}); return; }
        let cancelled = false;
        setModelsLoading(true);
        getAIModelCatalog(registry).then((catalog) => {
            if (cancelled) return;
            setModelsByProvider(catalog.modelsByProvider);
            const flat = Object.values(catalog.modelsByProvider).flat();
            // BUG FISSATO: prima, se la selezione corrente non era più nel catalogo, si
            // ripiegava sul `defaultModel` hardcoded del primo provider (o sul primo modello
            // qualunque) — un default scritto a mano nel file del provider framework, che
            // diventa obsoleto ogni volta che il catalogo dei modelli disponibili cambia
            // upstream (i modelli AI cambiano molto più spesso di quanto venga aggiornato il
            // codice). Nessun auto-fallback: se la selezione non è più valida, resta vuota —
            // l'utente è costretto a sceglierne uno esplicitamente dal menu (stesso principio
            // già in uso per il caso "nessuna selezione ancora fatta", vedi readyToStart in
            // OrchestratorRunner.tsx/SubagentRunner.tsx, che già gestiva selectedModel === '').
            // Stesso trattamento per il valore riletto da localStorage all'avvio: se il modello
            // salvato non esiste più nel catalogo (rimosso/rinominato upstream), si scarta e si
            // ripulisce anche lo storage — mai un ID stantio che farebbe fallire ogni richiesta
            // in silenzio finché l'utente non lo cambia a mano.
            setSelectedModelState((prev) => {
                if (flat.some((m) => m.id === prev)) return prev;
                writeStoredModel('');
                return '';
            });
        }).catch((error) => {
            // BUG FISSATO: questo catch azzerava modelsByProvider SENZA loggare nulla — un
            // fallimento qui (getAIModelCatalog rigettato) sembrava dal lato utente "nessun
            // errore in console, tendina modello sparita" senza alcuna pista per diagnosticarlo.
            // getAIModelCatalog ora isola i fallimenti per singolo provider (framework,
            // shared.ts), quindi questo ramo dovrebbe restare eccezionale — ma se scatta
            // comunque, deve almeno essere visibile.
            console.error('useAIModelCatalog: getAIModelCatalog failed', error);
            if (!cancelled) setModelsByProvider({});
        })
            .finally(() => { if (!cancelled) setModelsLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasProviders, JSON.stringify(Object.keys(registry).sort())]);

    return { hasProviders, modelsByProvider, modelsLoading, selectedModel, setSelectedModel };
}
