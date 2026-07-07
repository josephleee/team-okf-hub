// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AgentSnippets } from './agent-snippets';

afterEach(cleanup);

describe('AgentSnippets', () => {
  it('renders connect + write-test + read-test commands with the real origin, slug, and token', async () => {
    render(<AgentSnippets slug="labs" token="SECRET42" />);
    // jsdom origin is http://localhost:3000
    expect(await screen.findByText(/okf-labs http:\/\/localhost:3000\/w\/labs\/api\/mcp/)).toBeTruthy();
    expect(screen.getByText(/POST http:\/\/localhost:3000\/w\/labs\/api\/v1\/work/)).toBeTruthy();
    expect(screen.getByText(/search\?q=hello/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /copy/i }).length).toBe(3);
    expect(screen.getByText(/Expect HTTP 201/i)).toBeTruthy();
  });
});
