import React from 'react';
import type { AgentControlState } from './useAgent';
import { useAgenticoI18n } from '../i18n';

/** Switch + select modello per un agente useAgent — nato per evitare una duplicazione identica
 * tra due modali di import legacy (tema in SiteEditorPage, HTML/JSX in ComponentEditPage),
 * entrambe da allora ritirate in favore del flusso chat-only via Agentico (SubagentRunner,
 * sempre AI-on, nessuno switch pre-run) — vedi il piano di unificazione. Nessun chiamante
 * attuale nel CMS, tenuto come primitiva riusabile se un futuro flusso avesse di nuovo bisogno
 * di uno switch AI on/off + selezione modello prima di eseguire. Accetta `AgentControlState`
 * (non `UseAgentResult<T>` intero): non ha
 * bisogno di conoscere il tipo di risposta del chiamante, solo lo stato di gating/selezione —
 * TypeScript accetta struttalmente un `UseAgentResult<T>` qui senza cast.
 *
 * Switch a sinistra (non a destra come una prima versione, che schiacciava label/hint in una
 * colonna stretta quando il testo "nessun provider" — non troncabile per `shrink-0` — occupava
 * quasi tutta la larghezza): `min-w-0`+`truncate` qui tengono il testo su una riga sola, con
 * `title` per il testo completo al passaggio del mouse se troncato. */
export function AgentControls({
    agent, label, hint, disabledHint,
    forceSwitchDisabled = false,
}: {
    agent: AgentControlState;
    label: string;
    hint?: string;
    disabledHint?: string;
    /** Blocca lo switch acceso senza possibilità di spegnerlo (es. JSX che richiede AI
     * obbligatoriamente) — il chiamante resta comunque responsabile di forzare
     * `agent.setEnabled(true)`, questo prop riguarda solo l'interazione dello switch. */
    forceSwitchDisabled?: boolean;
}) {
    // Stringhe interne del componente (non label/hint, quelle restano del chiamante) — prima
    // hardcoded in italiano, mai passate dal sistema di internazionalizzazione del CMS che
    // ogni verticale (theme, liquid import) già usa per le proprie stringhe.
    const t = useAgenticoI18n();
    const switchDisabled = forceSwitchDisabled || !agent.hasProviders;
    const subtitle = agent.hasProviders ? hint : (disabledHint ?? t.noProviderConnected);

    return (
        <div className="rounded-lg border border-border p-3 space-y-2.5">
            <div className="flex items-center gap-3">
                <label className={'inline-flex shrink-0 items-center ' + (switchDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
                    <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
                        <input
                            type="checkbox"
                            checked={agent.enabled}
                            disabled={switchDisabled}
                            onChange={(e) => agent.setEnabled(e.target.checked)}
                            aria-label={label}
                            className={'peer absolute inset-0 m-0 h-full w-full opacity-0 ' + (switchDisabled ? 'cursor-not-allowed' : 'cursor-pointer')}
                        />
                        <span
                            aria-hidden="true"
                            className={'pointer-events-none absolute inset-0 rounded-full transition-colors duration-200 ease-out ' + (agent.enabled ? 'bg-primary' : 'bg-muted-foreground/35')}
                        >
                            <span className={'pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out ' + (agent.enabled ? 'translate-x-4' : '')} />
                        </span>
                    </span>
                </label>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={label}>{label}</p>
                    {subtitle && <p className="text-xs text-muted-foreground truncate" title={subtitle}>{subtitle}</p>}
                </div>
            </div>
            {agent.enabled && agent.hasProviders && (
                <div className="flex items-center gap-2 pl-[3rem]">
                    <label className="text-xs text-muted-foreground shrink-0">{t.modelLabel}</label>
                    {agent.modelsLoading ? (
                        <span className="text-xs text-muted-foreground">{t.modelsLoading}</span>
                    ) : (
                        <select
                            value={agent.selectedModel}
                            onChange={(e) => agent.setSelectedModel(e.target.value)}
                            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            {Object.keys(agent.modelsByProvider).length === 0
                                ? <option value="">{t.noModelsAvailable}</option>
                                : Object.entries(agent.modelsByProvider).map(([provider, models]) => (
                                    <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                                        {models.map((m) => <option key={m.id} value={m.id}>{m.model}</option>)}
                                    </optgroup>
                                ))}
                        </select>
                    )}
                </div>
            )}
        </div>
    );
}
