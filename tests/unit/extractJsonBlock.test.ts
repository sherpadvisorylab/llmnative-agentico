import { describe, expect, it } from 'vitest';
import { extractJsonBlock } from '../../src/domain/extractJsonBlock';

describe('extractJsonBlock', () => {
    it('extracts a ```json fenced block that is the entire response', () => {
        expect(extractJsonBlock('```json\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it('extracts a fenced block with trailing prose after it (closing-summary micro-prompt)', () => {
        const raw = '```json\n{"a":1}\n```\n\nHo estratto il colore principale e il logo.';
        expect(extractJsonBlock(raw)).toBe('{"a":1}');
    });

    it('extracts a fenced block with leading prose before it', () => {
        const raw = 'Ecco il risultato:\n\n```json\n{"a":1}\n```';
        expect(extractJsonBlock(raw)).toBe('{"a":1}');
    });

    it('falls back to the whole trimmed text when no fence is present', () => {
        expect(extractJsonBlock('{"a":1}')).toBe('{"a":1}');
    });

    it('isolates the first balanced JSON value when trailing prose has no fence at all', () => {
        const raw = '{"matches":[{"from":"/a","to":"/b"}]}\n\nRiepilogo: ho rimappato i path principali.';
        expect(extractJsonBlock(raw)).toBe('{"matches":[{"from":"/a","to":"/b"}]}');
    });

    it('handles braces/brackets inside string values without miscounting depth', () => {
        const raw = '{"matches":[{"from":"/a}[","to":"/b"}]}\n\nRiepilogo finale.';
        expect(extractJsonBlock(raw)).toBe('{"matches":[{"from":"/a}[","to":"/b"}]}');
    });
});
