import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toJsonSchema, toMcpTool } from '../../src/domain/mcpTool';

describe('toJsonSchema', () => {
    it('strips $schema from the root — providers reject it inside tools[].function.parameters', () => {
        const schema = toJsonSchema(z.object({ name: z.string() }));
        expect(schema.$schema).toBeUndefined();
        expect(schema.type).toBe('object');
        expect(schema.properties).toEqual({ name: { type: 'string' } });
    });
});

describe('toMcpTool', () => {
    it('produces an inputSchema without $schema for the function-calling wire format', () => {
        const tool = toMcpTool('search', 'Search something', z.object({ query: z.string() }));
        expect(tool.inputSchema.$schema).toBeUndefined();
    });
});
