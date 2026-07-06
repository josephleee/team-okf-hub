// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AddWorkspacePanel } from './add-workspace';

afterEach(() => { cleanup(); refresh.mockClear(); });

describe('AddWorkspacePanel', () => {
  it('creates a workspace and shows the one-time token + mcp command', async () => {
    const onAdd = vi.fn(async () => ({
      ok: true as const, slug: 'labs', token: 'WSTOKEN42',
    }));
    render(<AddWorkspacePanel onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText(/new workspace name/i), { target: { value: 'Labs' } });
    fireEvent.click(screen.getByRole('button', { name: /add workspace/i }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Labs', bundleSource: 'example' }),
    ));
    expect(await screen.findByText('WSTOKEN42')).toBeTruthy();
    expect(await screen.findByText(/\/w\/labs\/api\/mcp/)).toBeTruthy(); // command lives in AgentSnippets (renders after mount)
    expect(refresh).toHaveBeenCalled(); // list re-renders behind the panel
  });

  it('shows the error when creation fails', async () => {
    const onAdd = vi.fn(async () => ({ ok: false as const, error: 'workspace name is required' }));
    render(<AddWorkspacePanel onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: /add workspace/i }));
    expect(await screen.findByText(/name is required/i)).toBeTruthy();
  });
});
