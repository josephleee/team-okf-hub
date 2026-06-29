import Link from 'next/link';
import type { SearchView } from '../lib/data';

export function SearchResults({ view }: { view: SearchView }) {
  if (view.query.trim() && view.hits.length === 0) {
    return <p className="muted">No results for "{view.query}".</p>;
  }
  return (
    <ul>
      {view.hits.map((h) => (
        <li key={h.path} className="card">
          <Link href={`/concept/${h.path}`}>{h.title}</Link>
          <div className="muted" dangerouslySetInnerHTML={{ __html: h.snippet }} />
        </li>
      ))}
    </ul>
  );
}
