import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { ConceptView } from '../lib/data';
import { typeColor } from '../lib/type-color';

function colorVar(type: string): CSSProperties {
  return { '--okf-c': typeColor(type) } as CSSProperties;
}

function RailLinks({ label, items }: { label: string; items: { path: string; title: string; type: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="okf-rail__section">
      <div className="okf-rail__label">{label}</div>
      <div className="okf-rail__links">
        {items.map((i) => (
          <Link className="okf-rail__link" key={i.path} href={`/concept/${i.path}`}>
            <span className="okf-linkdot" style={colorVar(i.type)} aria-hidden="true" />
            {i.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ConceptDetail({ view, back }: { view: ConceptView; back?: ReactNode }) {
  return (
    <article className="okf-concept okf-screen">
      <div className="okf-concept__body">
        {back}
        <div className="okf-breadcrumb">
          <Link href="/">concepts</Link> / {view.title}
        </div>
        <div className="okf-badge" style={colorVar(view.type)}>
          <span className="okf-typedot" style={colorVar(view.type)} aria-hidden="true" />
          <span className="okf-badge__name">{view.type}</span>
        </div>
        <h1 className="okf-title">{view.title}</h1>
        {view.description && <p className="okf-desc">{view.description}</p>}
        <div className="okf-bodywrap">
          <div className="okf-prose" dangerouslySetInnerHTML={{ __html: view.html }} />
        </div>
      </div>

      <aside className="okf-concept__rail">
        {view.tags.length > 0 && (
          <div className="okf-rail__section">
            <div className="okf-rail__label">TAGS</div>
            <div className="okf-chips">
              {view.tags.map((t) => <span className="okf-chip" key={t}>{t}</span>)}
            </div>
          </div>
        )}
        {view.resource && (
          <div className="okf-rail__section">
            <div className="okf-rail__label">RESOURCE</div>
            <a className="okf-rail__resource" href={view.resource} target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true">↗</span> open external
            </a>
          </div>
        )}
        <RailLinks label="LINKS TO →" items={view.outbound} />
        <RailLinks label="← REFERENCED BY" items={view.backlinks} />
        {view.timestamp && <div className="okf-updated">// updated {view.timestamp}</div>}
      </aside>
    </article>
  );
}
