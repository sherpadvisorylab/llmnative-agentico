import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registerSubagents, getSubagentRegistry, findSubagentManifest } from '../../src/domain/subagentRegistry';
import type { SubagentManifest } from '../../src/domain/subagentManifest';

function fakeManifest(id: string): SubagentManifest<{ text: string }, undefined, { text: string }> {
    return {
        id,
        label: id,
        icon: 'bot',
        description: 'fake',
        indexPath: '/tools',
        destinationIds: [],
        commands: [{
            name: 'run',
            summary: 'fake',
            inputSchema: z.object({ text: z.string() }),
            describeOutput: () => 'text',
        }],
        definition: {
            buildContext: () => undefined,
            buildPrompt: () => '',
            buildFollowUpPrompt: () => '',
            parseResponse: () => null,
            fallback: (params) => params,
        },
        toParams: (input) => ({ text: String(input.text ?? '') }),
    };
}

describe('subagentRegistry', () => {
    it('starts empty and getSubagentRegistry/findSubagentManifest reflect that until registerSubagents is called', () => {
        // Nessun registerSubagents ancora in questo test — verifica il caso "host non ha
        // ancora registrato nulla" (es. modulo host non importato prima di un uso prematuro).
        expect(findSubagentManifest('does-not-exist')).toBeUndefined();
    });

    it('populates the registry after registerSubagents, readable via both getSubagentRegistry and findSubagentManifest', () => {
        const a = fakeManifest('fake-a');
        const b = fakeManifest('fake-b');
        registerSubagents([a, b]);

        expect(getSubagentRegistry()).toEqual([a, b]);
        expect(findSubagentManifest('fake-a')).toBe(a);
        expect(findSubagentManifest('fake-b')).toBe(b);
        expect(findSubagentManifest('missing')).toBeUndefined();
    });

    it('a second registerSubagents call REPLACES the registry, never merges with the previous one', () => {
        registerSubagents([fakeManifest('first')]);
        registerSubagents([fakeManifest('second')]);

        expect(findSubagentManifest('first')).toBeUndefined();
        expect(findSubagentManifest('second')).toBeDefined();
        expect(getSubagentRegistry()).toHaveLength(1);
    });
});
