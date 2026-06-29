import { getService } from './lib/service';
import { homeView } from './lib/data';
import { ConceptList } from './components/concept-list';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const svc = await getService();
  const groups = homeView(svc);
  const count = groups.reduce((n, g) => n + g.concepts.length, 0);
  return (
    <main>
      <h1>OKF Hub</h1>
      <p className="muted">{count} concepts across {groups.length} types.</p>
      <ConceptList groups={groups} />
    </main>
  );
}
