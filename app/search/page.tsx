import { getService } from '../lib/service';
import { searchView } from '../lib/data';
import { SearchForm } from '../components/search-form';
import { SearchResults } from '../components/search-results';

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? (sp.q[0] ?? '') : (sp.q ?? ''); // duplicate ?q= comes as string[]
  const svc = await getService();
  const view = searchView(svc, q);
  return (
    <main className="okf-search okf-screen">
      <SearchForm defaultQuery={q} />
      <SearchResults view={view} />
    </main>
  );
}
