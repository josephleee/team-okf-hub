'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type LoginResult = { ok: boolean; error?: string };

export function AdminLogin({ onLogin }: { onLogin: (password: string) => Promise<LoginResult> }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await onLogin(password);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'login failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="okf-setup" onSubmit={submit}>
      <h1>Admin login</h1>
      <p className="okf-setup__lede">This hub is already configured. Enter the admin password to change settings.</p>
      <label>Password
        <input type="password" aria-label="admin password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  );
}
