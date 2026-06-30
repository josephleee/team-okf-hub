import type { CSSProperties } from 'react';
import { getService } from '../lib/service';
import { graphView } from '../lib/data';
import { typeColor } from '../lib/type-color';
import { GraphClient } from './graph-client';

export const dynamic = 'force-dynamic';

const LEGEND = ['Table', 'Dataset', 'Metric', 'Index'];

export default async function GraphPage() {
  const svc = await getService();
  const view = graphView(svc);
  return (
    <main className="okf-graph okf-screen">
      <div className="okf-graph__header">
        <span className="okf-graph__title">Graph</span>
        <span className="okf-graph__meta">nodes:{view.nodes.length} · edges:{view.edges.length} · layout:cose</span>
      </div>
      <div className="okf-graph__stage">
        <GraphClient nodes={view.nodes} edges={view.edges} />
        <div className="okf-legend">
          {LEGEND.map((label) => (
            <div className="okf-legend__row" key={label}>
              <span className="okf-legend__sw" style={{ '--okf-c': typeColor(label) } as CSSProperties} />
              {label}
            </div>
          ))}
        </div>
        <div className="okf-graph__hint">click node → open concept</div>
      </div>
    </main>
  );
}
