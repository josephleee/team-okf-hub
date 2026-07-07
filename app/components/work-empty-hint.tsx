'use client';
import { useEffect, useState } from 'react';
import { buildAgentCommands } from '../../lib/agent-commands';
import { CopyButton } from './copy-button';

// Runnable example for the empty Work timeline. Targets the legacy
// (default-workspace) URL, which is what this page serves.
export function WorkEmptyHint() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  if (!origin) return null;
  const { curlRecord } = buildAgentCommands(origin, null);
  return (
    <div className="okf-setup__copyrow">
      <pre><code>{curlRecord}</code></pre>
      <CopyButton text={curlRecord} />
    </div>
  );
}
