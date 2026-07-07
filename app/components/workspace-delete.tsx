'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function WorkspaceDeleteButton({
  slug, name, onDelete,
}: { slug: string; name: string; onDelete: (slug: string) => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    if (!window.confirm(`Delete workspace "${name}" (/w/${slug})? Its agents will lose access. Bundle files on disk are kept.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onDelete(slug);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'delete failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="button" className="okf-setup__danger" onClick={del} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
    </>
  );
}
