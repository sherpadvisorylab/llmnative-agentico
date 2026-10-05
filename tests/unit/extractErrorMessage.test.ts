import { describe, expect, it } from 'vitest';
import { extractErrorMessage } from '../../src/domain/extractErrorMessage';

describe('extractErrorMessage', () => {
    it('returns the message of a real Error', () => {
        expect(extractErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('unwraps the OpenAI/Anthropic/Gemini { error: { message } } shape', () => {
        expect(extractErrorMessage({ error: { message: 'Incorrect API key provided' } })).toBe('Incorrect API key provided');
    });

    it('falls back to a top-level message field', () => {
        expect(extractErrorMessage({ message: 'Unauthorized' })).toBe('Unauthorized');
    });

    it('falls back to an HTTP status when nothing else is available', () => {
        expect(extractErrorMessage({ status: 401 })).toBe('HTTP 401');
    });

    it('unwraps a top-level string error field (e.g. local OpenCode proxy)', () => {
        expect(extractErrorMessage({ error: 'model not found' })).toBe('model not found');
    });

    it('JSON-dumps an unrecognized plain object instead of "[object Object]"', () => {
        expect(extractErrorMessage({ reason: 'timeout', code: 7 })).toBe('{"reason":"timeout","code":7}');
    });

    it('stringifies anything else as a last resort', () => {
        expect(extractErrorMessage('plain string error')).toBe('plain string error');
    });
});
