import Database from 'better-sqlite3';
import { readBundleFromDir } from './bundle-loader';
import { buildBundle } from './okf-core/bundle';
import type { ValidationIssue } from './okf-core/types';
import { buildIndex } from './db/build';
import {
  getConcept,
  listConcepts,
  searchConcepts,
  backlinks,
  graphNeighborhood,
  type ConceptRow,
  type ConceptSummary,
  type SearchHit,
  type GraphData,
} from './db/queries';

export interface OkfService {
  concepts(opts?: { type?: string; tag?: string }): ConceptSummary[];
  concept(path: string): ConceptRow | undefined;
  search(query: string): SearchHit[];
  backlinks(path: string): ConceptSummary[];
  graph(path: string, depth?: number): GraphData;
  issues(): ValidationIssue[];
  close(): void;
}

export async function createService(dir: string): Promise<OkfService> {
  const files = await readBundleFromDir(dir);
  const bundle = buildBundle(files);
  const db = new Database(':memory:');
  buildIndex(db, bundle);

  return {
    concepts: (opts) => listConcepts(db, opts),
    concept: (path) => getConcept(db, path),
    search: (query) => searchConcepts(db, query),
    backlinks: (path) => backlinks(db, path),
    graph: (path, depth) => graphNeighborhood(db, path, depth),
    issues: () => bundle.issues,
    close: () => db.close(),
  };
}
