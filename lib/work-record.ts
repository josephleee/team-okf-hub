import matter from 'gray-matter';

export interface WorkRecordInput {
  title: string;
  summary: string;
  actor: string;
  project?: string;
  timestamp?: string;
  tags?: string[];
  artifacts?: string[];
  links?: string[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function buildWorkRecordSource(
  input: WorkRecordInput,
  now: string,
): { path: string; content: string } {
  const timestamp = input.timestamp ?? now;
  const project = input.project?.trim() || 'general';
  const projectSlug = slugify(project) || 'general';
  const slug = slugify(input.title) || 'untitled';
  const date = timestamp.slice(0, 10);
  const hhmmss = timestamp.slice(11, 19).replace(/:/g, '') || '000000';
  const path = `work/${projectSlug}/${date}-${hhmmss}-${slug}.md`;

  const data = {
    type: 'WorkRecord',
    title: input.title,
    actor: input.actor,
    project,
    timestamp,
    tags: input.tags ?? [],
    artifacts: input.artifacts ?? [],
  };

  let body = input.summary.trim();
  const links = input.links ?? [];
  if (links.length > 0) {
    body += `\n\n## Related\n${links.map((p) => `- [${p}](${p})`).join('\n')}`;
  }

  return { path, content: matter.stringify(`${body}\n`, data) };
}
