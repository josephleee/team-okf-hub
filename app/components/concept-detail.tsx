import Link from 'next/link';
import type { ConceptView } from '../lib/data';

function LinkList({ items }: { items: { path: string; title: string }[] }) {
  return (
    <ul>
      {items.map((i) => (
        <li key={i.path}><Link href={`/concept/${i.path}`}>{i.title}</Link></li>
      ))}
    </ul>
  );
}

export function ConceptDetail({ view }: { view: ConceptView }) {
  return (
    <article>
      <p className="type-label">{view.type}</p>
      <h1>{view.title}</h1>
      {view.description && <p className="muted">{view.description}</p>}
      <div>{view.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
      {view.resource && (
        <p><a href={view.resource} target="_blank" rel="noopener noreferrer">{view.resource}</a></p>
      )}
      <div className="card prose" dangerouslySetInnerHTML={{ __html: view.html }} />
      {view.outbound.length > 0 && (
        <section><h2>Links to</h2><LinkList items={view.outbound} /></section>
      )}
      {view.backlinks.length > 0 && (
        <section><h2>Referenced by</h2><LinkList items={view.backlinks} /></section>
      )}
      {view.timestamp && <p className="muted">Updated {view.timestamp}</p>}
    </article>
  );
}
