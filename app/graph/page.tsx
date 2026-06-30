import { getService } from '../lib/service';
import { graphView } from '../lib/data';
import { GraphPanel } from '../components/graph-panel';

export const dynamic = 'force-dynamic';

export default async function GraphPage() {
  const svc = await getService();
  const view = graphView(svc);
  return (
    <main className="okf-graph okf-screen">
      <div className="okf-graph__header">
        <span className="okf-graph__title">Graph</span>
        <span className="okf-graph__meta">nodes:{view.nodes.length} · edges:{view.edges.length} · layout:circle</span>
      </div>
      <GraphPanel view={view} />
    </main>
  );
}
