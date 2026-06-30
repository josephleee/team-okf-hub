import type { CSSProperties } from 'react';
import { typeColor } from '../lib/type-color';
import { GraphClient } from '../graph/graph-client';
import type { GraphView } from '../lib/data';

const LEGEND = ['Table', 'Dataset', 'Metric', 'Index'];

export function GraphPanel({ view }: { view: GraphView }) {
  return (
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
  );
}
