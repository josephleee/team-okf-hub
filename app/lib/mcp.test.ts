import { describe, it, expect } from 'vitest';
import { mcpHandlerFor } from './mcp';

describe('mcpHandlerFor', () => {
  it('memoizes one handler per basePath and separates workspaces', () => {
    const a1 = mcpHandlerFor('a', '/w/a/api');
    const a2 = mcpHandlerFor('a', '/w/a/api');
    const b = mcpHandlerFor('b', '/w/b/api');
    const legacy = mcpHandlerFor(undefined, '/api');
    expect(a1).toBe(a2);        // memoized
    expect(a1).not.toBe(b);     // distinct mounts
    expect(a1).not.toBe(legacy);
    expect(typeof legacy).toBe('function');
  });
});
