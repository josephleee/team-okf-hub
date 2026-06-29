import Database from 'better-sqlite3';
import { readBundleFromDir } from '../lib/bundle-loader';
import { buildBundle } from '../lib/okf-core/bundle';
import { buildIndex } from '../lib/db/build';
import { createService } from '../lib/okf-service';

type Logger = (line: string) => void;
const stdout: Logger = (line) => process.stdout.write(line + '\n');

export async function runValidate(dir: string, log: Logger = stdout): Promise<number> {
  const bundle = buildBundle(await readBundleFromDir(dir));
  const errors = bundle.issues.filter((i) => i.severity === 'error');
  const warnings = bundle.issues.filter((i) => i.severity === 'warning');
  for (const issue of bundle.issues) {
    log(`${issue.severity.toUpperCase()} ${issue.path}${issue.field ? ` [${issue.field}]` : ''}: ${issue.message}`);
  }
  log(`${errors.length} error(s), ${warnings.length} warning(s) across ${bundle.concepts.length} concept(s)`);
  if (errors.length === 0) log('ok');
  return errors.length > 0 ? 1 : 0;
}

export async function runQuery(dir: string, query: string, log: Logger = stdout): Promise<number> {
  const svc = await createService(dir);
  try {
    const hits = svc.search(query);
    if (hits.length === 0) {
      log('(no matches)');
      return 0;
    }
    for (const hit of hits) log(`${hit.path}  —  ${hit.title ?? hit.type}`);
    return 0;
  } finally {
    svc.close();
  }
}

export async function runIndex(dir: string, outFile: string, log: Logger = stdout): Promise<number> {
  const bundle = buildBundle(await readBundleFromDir(dir));
  const db = new Database(outFile);
  buildIndex(db, bundle);
  db.close();
  log(`indexed ${bundle.concepts.length} concept(s) -> ${outFile}`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'validate':
      if (!rest[0]) return usage('validate <bundle-dir>');
      return runValidate(rest[0]);
    case 'query':
      if (!rest[0] || !rest[1]) return usage('query <bundle-dir> <terms...>');
      return runQuery(rest[0], rest.slice(1).join(' '));
    case 'index':
      if (!rest[0] || !rest[1]) return usage('index <bundle-dir> <out.sqlite>');
      return runIndex(rest[0], rest[1]);
    default:
      return usage('<validate|query|index> ...');
  }
}

function usage(msg: string): number {
  process.stderr.write(`usage: okf ${msg}\n`);
  return 2;
}

// Run only when invoked directly (e.g. `tsx scripts/okf.ts ...`), not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('okf.ts')) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
