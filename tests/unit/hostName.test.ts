import { describe, expect, it } from 'vitest';
import { nameOfHost } from '../../src/presentation/hostName';

describe('the name of a runner or a memory, from its address', () => {
    it('is the main label of its domain, or the IP it carries', () => {
        expect(nameOfHost('https://runner.sherpalab.net')).toBe('sherpalab');
        expect(nameOfHost('https://memory.sherpalab.net/')).toBe('sherpalab');
        expect(nameOfHost('memory.codemegreen.com')).toBe('codemegreen');
        expect(nameOfHost('https://runner.acme.co.uk')).toBe('acme');
        expect(nameOfHost('https://runner-173-249-9-79.sslip.io')).toBe('173.249.9.79');
        expect(nameOfHost('https://161-97-140-94.sslip.io')).toBe('161.97.140.94');
        expect(nameOfHost('http://10.0.0.5:8080')).toBe('10.0.0.5');
        expect(nameOfHost('localhost')).toBe('localhost');
    });
});
