import { notFound } from 'next/navigation';
import { readConceptSource } from '../../../../lib/bundle-io';
import { ConceptEditor } from '../../../components/concept-editor';
import { validateAction, saveAction } from '../../../lib/actions';

export const dynamic = 'force-dynamic';

export default async function EditConceptPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const conceptPath = path.map(decodeURIComponent).join('/');
  let source: string;
  try {
    source = await readConceptSource(process.env.OKF_BUNDLE_DIR ?? 'bundles/example', conceptPath);
  } catch {
    notFound();
  }
  return (
    <main>
      <ConceptEditor path={conceptPath} initialContent={source} onValidate={validateAction} onSave={saveAction} />
    </main>
  );
}
