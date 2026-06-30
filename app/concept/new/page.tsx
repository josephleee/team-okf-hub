import { ConceptEditor } from '../../components/concept-editor';
import { validateAction, saveAction } from '../../lib/actions';

export const dynamic = 'force-dynamic';

const STARTER = `---\ntype: Note\ntitle: New concept\ntags: []\n---\n\n# New concept\n\nWrite knowledge here. Link others with [text](other.md).\n`;

export default async function NewConceptPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path = 'notes/new-concept.md' } = await searchParams;
  return (
    <main>
      <p className="okf-breadcrumb okf-home" style={{ maxWidth: 1060, padding: '22px 34px 0' }}>
        new concept → <code>{path}</code> (change the path in the URL: <code>?path=dir/name.md</code>)
      </p>
      <ConceptEditor path={path} initialContent={STARTER} onValidate={validateAction} onSave={saveAction} />
    </main>
  );
}
