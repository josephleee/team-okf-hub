import { getService } from './lib/service';
import { homeView } from './lib/data';
import { ConceptList } from './components/concept-list';
import { SearchForm } from './components/search-form';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const svc = await getService();
  const groups = homeView(svc);
  const count = groups.reduce((n, g) => n + g.concepts.length, 0);
  return (
    <main className="okf-home okf-screen">
      <div className="okf-eyebrow">// knowledge base · x:0 y:0</div>
      <h1 className="okf-display">OKF Hub</h1>
      <p className="okf-subtitle">{count} concepts across {groups.length} types.</p>
      <SearchForm />
      <ConceptList groups={groups} />
    </main>
  );
}
