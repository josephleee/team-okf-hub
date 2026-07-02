// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SetupWizard } from './setup-wizard';

afterEach(cleanup);

const okComplete = () => vi.fn(async () => ({ ok: true as const, token: 'TESTTOKEN123', mcpCommand: 'claude mcp add ... Bearer TESTTOKEN123' }));

describe('SetupWizard stepper', () => {
  it('gates Next on step 1 until a workspace name is entered', () => {
    render(<SetupWizard onComplete={okComplete()} />);
    const next = screen.getByRole('button', { name: /next/i });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });

  it('walks all 3 steps and submits the correct SetupInput (example bundle)', async () => {
    const onComplete = okComplete();
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));            // → step 2 (bundle)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));            // → step 3 (password)
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceName: 'Acme', bundleSource: 'example', adminPassword: 'longenough' }),
    ));
    expect(await screen.findByText('TESTTOKEN123')).toBeTruthy(); // interim done screen still shows the token
  });

  it('requires a git url before leaving the bundle step', () => {
    render(<SetupWizard onComplete={okComplete()} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // → step 2
    fireEvent.click(screen.getByLabelText(/clone a public git url/i));
    const next = screen.getByRole('button', { name: /next/i });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('git url'), { target: { value: 'https://github.com/org/b.git' } });
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the server error on the finish step', async () => {
    const onComplete = vi.fn(async () => ({ ok: false as const, error: 'directory contains no .md files' }));
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    expect(await screen.findByText(/no \.md files/i)).toBeTruthy();
  });
});
