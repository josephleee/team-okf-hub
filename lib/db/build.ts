import { renderMarkdown } from '../okf-core/render';
import type { Bundle } from '../okf-core/types';
import { initSchema, type DB } from './schema';

export function buildIndex(db: DB, bundle: Bundle): void {
  initSchema(db);

  const insertConcept = db.prepare(`
    INSERT INTO concepts (path, type, title, description, resource, timestamp, frontmatter_json, body_md, body_html, parse_error)
    VALUES (@path, @type, @title, @description, @resource, @timestamp, @frontmatter_json, @body_md, @body_html, @parse_error)
  `);
  const insertTag = db.prepare('INSERT INTO tags (concept_path, tag) VALUES (?, ?)');
  const insertLink = db.prepare(
    'INSERT INTO links (src_path, dst_path, dst_raw, resolved, external) VALUES (?, ?, ?, ?, ?)',
  );
  const insertFts = db.prepare(
    'INSERT INTO concepts_fts (path, title, description, body, tags) VALUES (?, ?, ?, ?, ?)',
  );

  const tx = db.transaction(() => {
    for (const c of bundle.concepts) {
      const html = c.parseError ? '' : renderMarkdown(c.body);
      insertConcept.run({
        path: c.path,
        type: c.type,
        title: c.title ?? null,
        description: c.description ?? null,
        resource: c.resource ?? null,
        timestamp: c.timestamp ?? null,
        frontmatter_json: JSON.stringify(c.frontmatter),
        body_md: c.body,
        body_html: html,
        parse_error: c.parseError ?? null,
      });
      for (const tag of c.tags) insertTag.run(c.path, tag);
      insertFts.run(c.path, c.title ?? '', c.description ?? '', c.body, c.tags.join(' '));
    }
    for (const l of bundle.links) {
      insertLink.run(l.from, l.to ?? null, l.toRaw, l.resolved ? 1 : 0, l.external ? 1 : 0);
    }
  });

  tx();
}
