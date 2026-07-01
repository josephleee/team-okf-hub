// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SetupWizard } from './setup-wizard';

afterEach(cleanup);

describe('SetupWizard', () => {
  it('submits the form and shows the one-time token + mcp command on success', async () => {
    const onComplete = vi.fn(async () => ({ ok: true as const, token: 'TESTTOKEN123', mcpCommand: 'claude mcp add ... Bearer TESTTOKEN123' }));
    render(<SetupWizard onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceName: 'Acme', bundleSource: 'example', adminPassword: 'longenough' }),
    ));
    expect(await screen.findByText('TESTTOKEN123')).toBeTruthy();
    expect(screen.getByText(/claude mcp add/i)).toBeTruthy();
  });

  it('shows the error when setup fails', async () => {
    const onComplete = vi.fn(async () => ({ ok: false as const, error: 'workspace name is required' }));
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    expect(await screen.findByText(/workspace name is required/i)).toBeTruthy();
  });
});
