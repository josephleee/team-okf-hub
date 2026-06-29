'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import cytoscape from 'cytoscape';
import type { GraphView } from '../lib/data';
import { toCytoscapeElements } from './elements';

export function GraphClient({ nodes, edges }: GraphView) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!ref.current) return;
    const cy = cytoscape({
      container: ref.current,
      elements: toCytoscapeElements({ nodes, edges }),
      layout: { name: 'cose', animate: false },
      style: [
        { selector: 'node', style: { label: 'data(label)', 'background-color': '#818cf8',
          color: '#e7ecf6', 'font-size': 10, 'text-valign': 'bottom' } },
        { selector: 'edge', style: { width: 1, 'line-color': '#243049',
          'target-arrow-color': '#243049', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } },
      ],
    });
    cy.on('tap', 'node', (evt) => router.push(`/concept/${evt.target.id()}`));
    return () => cy.destroy();
  }, [nodes, edges, router]);

  return <div id="graph" ref={ref} />;
}
