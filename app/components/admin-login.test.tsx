// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AdminLogin } from './admin-login';

afterEach(() => { cleanup(); refresh.mockClear(); });

describe('AdminLogin', () => {
  it('shows an inline error on wrong password and does not refresh', async () => {
    const onLogin = vi.fn(async () => ({ ok: false, error: 'wrong password' }));
    render(<AdminLogin onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText(/wrong password/i)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes the route on a correct password', async () => {
    const onLogin = vi.fn(async () => ({ ok: true as const }));
    render(<AdminLogin onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'correct-pw' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
