import React from 'react';
import { ActionButton } from '@llmnative/react';
import { useAgentico } from './AgenticoContext';
import { useAgenticoI18n } from '../i18n';

/** L'unica icona che apre/chiude il pannello agente globale, Agentico (Agentico.tsx) — stile
 * icona-estensione-del-browser: sempre nello stesso angolo, sempre lo stesso significato, sia
 * che tu stia guardando il CMS a schermo pieno (nell'Header) sia che ci sia una modale right
 * aperta sopra (come `closeSlot` di quella Modal, al posto della sua ×). Un'unica istanza di
 * questo componente — mai una ricreata ad hoc — cosi il comportamento resta identico ovunque
 * compaia. `ActionButton` del framework (non un <button> a mano) per ereditare `cursor-pointer`
 * e lo stato hover/focus-visible già standard su ogni bottone del CMS dalla classe condivisa
 * `.btn` — solo sfondo/dimensione sono nostri via className, nessuna variante colore predefinita
 * si adatta a un'icona-toggle isolata come questa.
 *
 * Animata (icona pulsante) quando l'unico task attivo ha l'agente al lavoro — anche se il
 * pannello è chiuso, cosi si vede che sta succedendo qualcosa senza doverlo aprire apposta
 * (l'agente NON apre più da solo il pannello durante un run(), vedi AgenticoContext). */
export function AgenticoToggle({ className = '' }: { className?: string }) {
    const { isOpen, toggleOpen, task } = useAgentico();
    const t = useAgenticoI18n();
    const running = task?.agent.running ?? false;

    return (
        <ActionButton
            icon="bot"
            ariaLabel={isOpen ? t.closePanel : t.openPanel}
            title={isOpen ? t.closePanel : t.openPanel}
            onClick={toggleOpen}
            iconClassName={running ? 'animate-pulse' : undefined}
            className={`!h-9 !w-9 !p-0 rounded-md ${
                isOpen ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
            } ${className}`}
        />
    );
}
