import { getService } from './lib/service';
import { homeView, graphView } from './lib/data';
import { ConceptList } from './components/concept-list';
import { GraphPanel } from './components/graph-panel';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const svc = await getService();
  const groups = homeView(svc);
  const graph = graphView(svc);
  const count = groups.reduce((n, g) => n + g.concepts.length, 0);
  return (
    <main className="okf-home okf-screen">
      <div className="okf-eyebrow">// knowledge base · x:0 y:0</div>
      <h1 className="okf-display">OKF Hub</h1>
      <p className="okf-subtitle">{count} concepts across {groups.length} types.</p>
      <section className="okf-graphcard">
        <div className="okf-graph__header">
          <span className="okf-graph__title">Graph</span>
          <span className="okf-graph__meta">nodes:{graph.nodes.length} · edges:{graph.edges.length} · layout:circle</span>
        </div>
        <GraphPanel view={graph} />
      </section>
      <ConceptList groups={groups} />
    </main>
  );
}
