'use client';
import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
  return (
    <button type="button" className="okf-setup__copy" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
  );
}
