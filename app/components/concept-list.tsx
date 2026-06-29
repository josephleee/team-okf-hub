import Link from 'next/link';
import type { HomeGroup } from '../lib/data';

export function ConceptList({ groups }: { groups: HomeGroup[] }) {
  return (
    <div>
      {groups.map((group) => (
        <section key={group.type}>
          <h2 className="type-label">{group.type}</h2>
          <ul>
            {group.concepts.map((c) => (
              <li key={c.path}>
                <Link href={`/concept/${c.path}`}>{c.title}</Link>{' '}
                <span className="muted">{c.path}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
