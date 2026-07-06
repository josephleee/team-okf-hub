// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { WorkspaceDeleteButton } from './workspace-delete';

afterEach(() => { cleanup(); refresh.mockClear(); vi.restoreAllMocks(); });

describe('WorkspaceDeleteButton', () => {
  it('confirms, deletes, and refreshes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn(async () => ({ ok: true }));
    render(<WorkspaceDeleteButton slug="labs" name="Labs" onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('labs'));
    expect(refresh).toHaveBeenCalled();
  });

  it('does nothing when the confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDelete = vi.fn(async () => ({ ok: true }));
    render(<WorkspaceDeleteButton slug="labs" name="Labs" onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows the server refusal inline', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn(async () => ({ ok: false, error: 'cannot delete the last workspace' }));
    render(<WorkspaceDeleteButton slug="labs" name="Labs" onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(await screen.findByText(/last workspace/i)).toBeTruthy();
  });
});
