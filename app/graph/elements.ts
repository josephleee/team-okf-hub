import type { ElementDefinition } from 'cytoscape';
import type { GraphView } from '../lib/data';

export function toCytoscapeElements(view: GraphView): ElementDefinition[] {
  const nodes: ElementDefinition[] = view.nodes.map((n) => ({
    data: { id: n.path, label: n.title, type: n.type },
  }));
  const edges: ElementDefinition[] = view.edges.map((e) => ({
    data: { id: `${e.from}->${e.to}`, source: e.from, target: e.to },
  }));
  return [...nodes, ...edges];
}
