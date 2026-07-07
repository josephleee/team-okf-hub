// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { RotateTokenPanel } from './rotate-token';

afterEach(cleanup);

describe('RotateTokenPanel', () => {
  it('shows the new token once after rotating, with verify snippets', async () => {
    const onRotate = vi.fn(async () => ({ ok: true as const, token: 'NEWTOKEN999' }));
    render(<RotateTokenPanel onRotate={onRotate} slug="w1" />);
    fireEvent.click(screen.getByRole('button', { name: /rotate token/i }));
    await waitFor(() => expect(onRotate).toHaveBeenCalled());
    expect(await screen.findByText('NEWTOKEN999')).toBeTruthy();
    expect(screen.getByText(/will not be shown again/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /copy/i }).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/\/w\/w1\/api\/mcp/)).toBeTruthy(); // verify snippets present
    expect(screen.getByText(/update your agent/i)).toBeTruthy();
  });

  it('shows the error when rotation is refused', async () => {
    const onRotate = vi.fn(async () => ({ ok: false as const, error: 'admin login required' }));
    render(<RotateTokenPanel onRotate={onRotate} slug="w1" />);
    fireEvent.click(screen.getByRole('button', { name: /rotate token/i }));
    expect(await screen.findByText(/admin login required/i)).toBeTruthy();
  });
});
