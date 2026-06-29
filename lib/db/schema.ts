import type Database from 'better-sqlite3';

export type DB = Database.Database;

export const SCHEMA = `
CREATE TABLE concepts (
  path TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  resource TEXT,
  timestamp TEXT,
  frontmatter_json TEXT NOT NULL,
  body_md TEXT NOT NULL,
  body_html TEXT NOT NULL,
  parse_error TEXT
);
CREATE TABLE tags (concept_path TEXT NOT NULL, tag TEXT NOT NULL);
CREATE INDEX idx_tags_tag ON tags(tag);
CREATE INDEX idx_tags_concept ON tags(concept_path);
CREATE TABLE links (
  src_path TEXT NOT NULL,
  dst_path TEXT,
  dst_raw TEXT NOT NULL,
  resolved INTEGER NOT NULL,
  external INTEGER NOT NULL
);
CREATE INDEX idx_links_src ON links(src_path);
CREATE INDEX idx_links_dst ON links(dst_path);
CREATE VIRTUAL TABLE concepts_fts USING fts5(
  path UNINDEXED, title, description, body, tags
);
CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT);
`;

export function initSchema(db: DB): void {
  db.exec(SCHEMA);
}
