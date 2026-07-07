import Link from 'next/link';
import type { WorkView } from '../lib/data';
import { WorkEmptyHint } from './work-empty-hint';

export function WorkTimeline({ view }: { view: WorkView }) {
  const { filter, groups, total } = view;
  const filtered = Boolean(filter.project || filter.actor);
  return (
    <section className="okf-work-timeline">
      <header className="okf-work-header">
        <h1>Work</h1>
        <p className="okf-work-count">
          {total} record{total === 1 ? '' : 's'}
          {filtered ? ' · filtered' : ''}
        </p>
        {filtered ? (
          <Link href="/work" className="okf-work-clear">Clear filters</Link>
        ) : null}
      </header>
      {groups.length === 0 ? (
        <div className="okf-work-empty">
          <p>
            No work records yet. Agents record work via the MCP tool <code>okf_record_work</code>{' '}
            or <code>POST /api/v1/work</code> — try it now (replace <code>&lt;TOKEN&gt;</code> with your ingestion token):
          </p>
          <WorkEmptyHint />
          <p><a href="/guide">Read the guide →</a></p>
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.date} className="okf-work-group">
            <h2 className="okf-work-date">{g.date}</h2>
            <ul className="okf-work-list">
              {g.items.map((it) => (
                <li key={it.path} className="okf-work-item">
                  <Link href={`/concept/${it.path}`} className="okf-work-title">{it.title}</Link>
                  <div className="okf-work-meta">
                    {it.actor ? (
                      <Link href={`/work?actor=${encodeURIComponent(it.actor)}`} className="okf-work-actor">{it.actor}</Link>
                    ) : null}
                    {it.project ? (
                      <Link href={`/work?project=${encodeURIComponent(it.project)}`} className="okf-work-project">{it.project}</Link>
                    ) : null}
                    {it.timestamp ? <time className="okf-work-time" dateTime={it.timestamp}>{it.timestamp}</time> : null}
                  </div>
                  {it.tags.length > 0 ? (
                    <div className="okf-work-tags">
                      {it.tags.map((t) => <span key={t} className="okf-work-tag">{t}</span>)}
                    </div>
                  ) : null}
                  {(() => {
                    const safeArtifacts = it.artifacts.filter((a) => {
                      try { const u = new URL(a); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
                    });
                    return safeArtifacts.length > 0 ? (
                      <ul className="okf-work-artifacts">
                        {safeArtifacts.map((a) => (
                          <li key={a}><a href={a} target="_blank" rel="noopener noreferrer nofollow">{a}</a></li>
                        ))}
                      </ul>
                    ) : null;
                  })()}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
