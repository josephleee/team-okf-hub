'use client';
import { useState } from 'react';
import { CopyButton } from './copy-button';

type RotateResult = { ok: boolean; token?: string; error?: string };

export function RotateTokenPanel({ onRotate }: { onRotate: () => Promise<RotateResult> }) {
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    setBusy(true);
    setError(null);
    try {
      const res = await onRotate();
      if (res.ok && res.token) setToken(res.token);
      else setError(res.error ?? 'rotation failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'rotation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="okf-setup__row">
      <p>Rotate the ingestion token (the old token stops working immediately).</p>
      {token && (
        <>
          <p className="okf-setup__warn">Copy the new token now — it will not be shown again.</p>
          <div className="okf-setup__copyrow">
            <pre className="okf-setup__token"><code>{token}</code></pre>
            <CopyButton text={token} />
          </div>
        </>
      )}
      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="button" onClick={rotate} disabled={busy}>{busy ? 'Rotating…' : 'Rotate token'}</button>
    </div>
  );
}
