'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ValidationIssue } from '../../lib/okf-core/types';

export type ValidateFn = (path: string, content: string) => Promise<{ issues: ValidationIssue[]; html: string }>;
export type SaveFn = (path: string, content: string) => Promise<{ ok: boolean; issues: ValidationIssue[] }>;

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="okf-issues">
      {issues.map((i, n) => (
        <div className={`okf-issue ${i.severity}`} key={n}>
          {i.severity.toUpperCase()}{i.field ? ` [${i.field}]` : ''}: {i.message}
        </div>
      ))}
    </div>
  );
}

export function ConceptEditor({
  path, initialContent, onValidate, onSave,
}: { path: string; initialContent: string; onValidate: ValidateFn; onSave: SaveFn }) {
  const [content, setContent] = useState(initialContent);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      onValidate(path, content).then((res) => {
        if (!active) return;
        setIssues(res.issues);
        setHtml(res.html);
      });
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [content, path, onValidate]);

  const hasError = issues.some((i) => i.severity === 'error');

  async function handleSave() {
    setSaving(true);
    setSaved('');
    const res = await onSave(path, content);
    setSaving(false);
    if (res.ok) {
      setSaved('Saved ✓ — commit with git to persist.');
      router.refresh();
    } else {
      setIssues(res.issues);
    }
  }

  return (
    <div className="okf-editor okf-screen">
      <textarea
        className="okf-editor__area"
        value={content}
        spellCheck={false}
        aria-label="Concept source"
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="okf-editor__side">
        <button className="okf-btn" type="button" onClick={handleSave} disabled={saving || hasError}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <p className="okf-editor__saved">{saved}</p>}
        <IssueList issues={issues} />
        {html && <div className="okf-editor__preview okf-prose" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
}
