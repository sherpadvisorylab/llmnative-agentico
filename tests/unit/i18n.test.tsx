import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@llmnative/react';
import { AgenticoProvider, AgenticoToggle, agenticoTranslations } from '../../src';

function renderToggle(config?: React.ComponentProps<typeof I18nProvider>['config']) {
    return render(
        <I18nProvider config={config}>
            <AgenticoProvider>
                <AgenticoToggle />
            </AgenticoProvider>
        </I18nProvider>
    );
}

describe('agentico i18n', () => {
    it('falls back to English when the host registers nothing', () => {
        renderToggle();
        expect(screen.getByRole('button', { name: 'Open agent panel' })).toBeInTheDocument();
    });

    it('uses the packaged translations the host merged in', () => {
        renderToggle({ locale: 'it', translations: { it: agenticoTranslations.it } });
        expect(screen.getByRole('button', { name: 'Apri pannello agente' })).toBeInTheDocument();
    });

    it('lets the host override a single string', () => {
        renderToggle({ locale: 'en', translations: { en: { agentico: { openPanel: 'Ask the assistant' } } } });
        expect(screen.getByRole('button', { name: 'Ask the assistant' })).toBeInTheDocument();
    });
});
