import { notFound } from 'next/navigation';
import { getService } from '../../lib/service';
import { conceptView } from '../../lib/data';
import { ConceptDetail } from '../../components/concept-detail';
import { BackButton } from '../../components/back-button';

export const dynamic = 'force-dynamic';

export default async function ConceptPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const conceptPath = path.map(decodeURIComponent).join('/');
  const svc = await getService();
  const view = conceptView(svc, conceptPath);
  if (!view) notFound();
  return <main><ConceptDetail view={view} back={<BackButton />} /></main>;
}
