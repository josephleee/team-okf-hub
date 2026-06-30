import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize) // strip dangerous tags/attrs and unsafe URL schemes (default GitHub schema)
  .use(rehypeStringify);

export function renderMarkdown(body: string): string {
  return String(processor.processSync(body));
}
