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
      layout: { name: 'cose', padding: 50 },
      minZoom: 0.4,
      maxZoom: 2.5,
      style: [
        {
          selector: 'node',
          style: {
            shape: 'roundrectangle',
            'background-color': '#ffffff',
            'border-width': 2.5,
            'border-color': 'data(color)',
            label: 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 7,
            'font-family': 'Geist, system-ui, sans-serif',
            'font-size': 12,
            'font-weight': 600,
            color: '#0f2747',
            'text-background-color': '#ffffff',
            'text-background-opacity': 1,
            'text-background-shape': 'roundrectangle',
            'text-background-padding': '4px',
            'text-border-width': 1.2,
            'text-border-color': 'data(color)',
            'text-border-opacity': 1,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.4,
            'line-color': '#9fbce0',
            'target-arrow-color': '#8fa6c4',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.9,
            'curve-style': 'straight',
          },
        },
        { selector: 'node:selected', style: { 'border-color': '#2563eb' } },
      ],
    });
    cy.on('tap', 'node', (evt) => router.push(`/concept/${evt.target.id()}`));
    return () => cy.destroy();
  }, [nodes, edges, router]);

  return <div className="okf-graph__cy" ref={ref} />;
}
