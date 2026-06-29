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

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  path: string;
  severity: Severity;
  field?: string;
  message: string;
}
