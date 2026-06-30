import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { SearchView } from '../lib/data';
import { typeColor } from '../lib/type-color';

export function SearchResults({ view }: { view: SearchView }) {
  const query = view.query.trim();

  if (!query) {
    return (
      <div className="okf-empty">
        <div className="okf-empty__icon" aria-hidden="true">⌕</div>
        <div className="okf-empty__title">Search the knowledge base</div>
        <div className="okf-empty__hint">Find tables, datasets, metrics &amp; indexes by name or content.</div>
      </div>
    );
  }

  if (view.hits.length === 0) {
    return (
      <div className="okf-empty">
        <div className="okf-empty__title">No results for &ldquo;{view.query}&rdquo;</div>
        <div className="okf-empty__hint">Check spelling, or try a broader term. Search covers titles, tags &amp; body.</div>
        <Link href="/">Browse all concepts →</Link>
      </div>
    );
  }

  return (
    <>
      <div className="okf-resultcount">// {view.hits.length} results · ranked bm25</div>
      <div className="okf-results">
        {view.hits.map((h) => (
          <Link
            className="okf-result"
            key={h.path}
            href={`/concept/${h.path}`}
            style={{ '--okf-c': typeColor(h.type) } as CSSProperties}
          >
            <div className="okf-result__head">
              <span className="okf-result__title">{h.title}</span>
              <span className="okf-result__path">{h.path}</span>
            </div>
            <p className="okf-result__snippet" dangerouslySetInnerHTML={{ __html: h.snippet }} />
          </Link>
        ))}
      </div>
    </>
  );
}
