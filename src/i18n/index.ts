import { useI18n } from '@llmnative/react';
import { agenticoDe } from './de';
import { agenticoEn } from './en';
import { agenticoIt } from './it';
import type { AgenticoDict } from './types';

export type { AgenticoDict } from './types';
export { agenticoDe, agenticoEn, agenticoIt };

/** Merge into <App i18n={{ translations }}> — e.g. `it: { ...locales.it, ...agenticoTranslations.it, ...yourIt }`. */
export const agenticoTranslations = {
    en: { agentico: agenticoEn },
    it: { agentico: agenticoIt },
    de: { agentico: agenticoDe },
};

/** Agentico strings for the active locale: what the host registered, on top of English. */
export function useAgenticoI18n(): AgenticoDict {
    const { dict } = useI18n();
    const fromHost = (dict as { agentico?: Partial<AgenticoDict> }).agentico;
    return fromHost ? { ...agenticoEn, ...fromHost } : agenticoEn;
}
