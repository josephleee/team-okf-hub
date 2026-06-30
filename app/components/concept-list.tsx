import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { HomeGroup } from '../lib/data';
import { typeColor } from '../lib/type-color';

function Corners() {
  return (
    <>
      <span className="okf-corner tl" /><span className="okf-corner tr" />
      <span className="okf-corner bl" /><span className="okf-corner br" />
    </>
  );
}

export function ConceptList({ groups }: { groups: HomeGroup[] }) {
  return (
    <div className="okf-groups">
      {groups.map((group) => {
        const color = { '--okf-c': typeColor(group.type) } as CSSProperties;
        return (
          <section className="okf-group" key={group.type}>
            <Corners />
            <div className="okf-group__head">
              <span className="okf-typedot" style={color} aria-hidden="true" />
              <span className="okf-typename">{group.type}</span>
              <span className="okf-count">[{group.concepts.length}]</span>
            </div>
            {group.concepts.map((c) => (
              <Link className="okf-row" key={c.path} href={`/concept/${c.path}`}>
                <span className="okf-row__title">{c.title}</span>
                <span className="okf-row__path" aria-hidden="true">{c.path}</span>
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
