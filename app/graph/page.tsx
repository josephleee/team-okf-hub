import { getService } from '../lib/service';
import { graphView } from '../lib/data';
import { GraphClient } from './graph-client';

export const dynamic = 'force-dynamic';

export default async function GraphPage() {
  const svc = await getService();
  const view = graphView(svc);
  return (
    <main>
      <h1>Graph</h1>
      <p className="muted">{view.nodes.length} concepts · {view.edges.length} links. Click a node to open it.</p>
      <GraphClient nodes={view.nodes} edges={view.edges} />
    </main>
  );
}
