export interface RawFile {
  path: string;
  content: string;
}

export interface Concept {
  path: string;
  type: string;
  title?: string;
  description?: string;
  resource?: string;
  tags: string[];
  timestamp?: string;
  frontmatter: Record<string, unknown>;
  body: string;
  parseError?: string;
}
