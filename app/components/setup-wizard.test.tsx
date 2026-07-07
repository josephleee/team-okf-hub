// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SetupWizard } from './setup-wizard';

afterEach(cleanup);

const okComplete = () => vi.fn(async () => ({ ok: true as const, slug: 'acme', token: 'TESTTOKEN123' }));

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

  // Fill name → pick local bundle → password, then click Finish. Returns after Finish is clicked.
  const walkToFinishWithLocal = (onComplete: ReturnType<typeof vi.fn>) => {
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));            // → bundle step
    fireEvent.click(screen.getByLabelText(/local directory path/i));           // pick local source
    fireEvent.change(screen.getByLabelText('local path'), { target: { value: '/srv/x' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));            // → password step
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
  };

  it('routes a bundle error (local/git source) back to the bundle step', async () => {
    const onComplete = vi.fn(async () => ({ ok: false as const, error: 'directory contains no .md files' }));
    walkToFinishWithLocal(onComplete);
    expect(await screen.findByText(/no \.md files/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /choose a knowledge bundle/i })).toBeTruthy(); // moved back to fix it
  });

  it('clears the routed bundle error when advancing again', async () => {
    const onComplete = vi.fn(async () => ({ ok: false as const, error: 'directory contains no .md files' }));
    walkToFinishWithLocal(onComplete);
    expect(await screen.findByText(/no \.md files/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // advance off the bundle step
    expect(screen.queryByText(/no \.md files/i)).toBeNull();        // stale error cleared
  });

  it('keeps a non-bundle error on the finish step for the example bundle', async () => {
    const onComplete = vi.fn(async () => ({ ok: false as const, error: 'setup already completed' }));
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // example is default → password step
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    expect(await screen.findByText(/already completed/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /set an admin password/i })).toBeTruthy(); // stayed on finish step
  });

  it('advances when the form is submitted (Enter) on a valid step', () => {
    const { container } = render(<SetupWizard onComplete={okComplete()} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('heading', { name: /choose a knowledge bundle/i })).toBeTruthy(); // Enter advanced to step 2
  });

  it('does not advance on submit when the current step is invalid', () => {
    const { container } = render(<SetupWizard onComplete={okComplete()} />);
    fireEvent.submit(container.querySelector('form')!); // step 1 invalid (empty name)
    expect(screen.getByLabelText(/workspace name/i)).toBeTruthy(); // still on step 1
    expect(screen.queryByRole('heading', { name: /choose a knowledge bundle/i })).toBeNull();
  });
});

describe('SetupWizard completion screen', () => {
  it('shows token + mcp with Copy buttons and a copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onComplete = vi.fn(async () => ({ ok: true as const, slug: 'acme', token: 'TESTTOKEN123' }));
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    expect(await screen.findByText('TESTTOKEN123')).toBeTruthy();
    // AgentSnippets renders its commands after mount — wait for one before counting copy buttons.
    expect(await screen.findByText(/okf-acme http:\/\/localhost:3000\/w\/acme\/api\/mcp/)).toBeTruthy();
    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    expect(copyButtons.length).toBeGreaterThanOrEqual(4); // token + 3 snippet rows
    fireEvent.click(copyButtons[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('TESTTOKEN123'));
    expect(await screen.findByText(/copied/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /manage settings/i }).getAttribute('href')).toBe('/setup');
    expect(screen.getByRole('link', { name: /read the guide/i }).getAttribute('href')).toBe('/guide');
    expect(screen.getByText(/not your code repo/i)).toBeTruthy(); // scope explainer present
  });
});
