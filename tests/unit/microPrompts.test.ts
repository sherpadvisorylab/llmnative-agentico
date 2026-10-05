import { describe, expect, it } from 'vitest';
import { applyMicroPrompts, SUMMARY_MICRO_PROMPT } from '../../src/domain/microPrompts';

describe('applyMicroPrompts', () => {
    it('returns the prompt unchanged when no ids are given', () => {
        expect(applyMicroPrompts('base prompt', undefined)).toBe('base prompt');
        expect(applyMicroPrompts('base prompt', [])).toBe('base prompt');
    });

    it('appends the resolved micro-prompt text after the base prompt', () => {
        const result = applyMicroPrompts('base prompt', [SUMMARY_MICRO_PROMPT.id]);
        expect(result.startsWith('base prompt\n\n')).toBe(true);
        expect(result).toContain(SUMMARY_MICRO_PROMPT.text);
    });

    it('silently ignores an unknown id instead of failing', () => {
        expect(applyMicroPrompts('base prompt', ['does-not-exist'])).toBe('base prompt');
    });
});
