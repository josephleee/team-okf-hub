// Derive the public origin from request headers, for building copy-paste agent
// commands on the server. Takes the first value of comma-chained proxy headers.
export function originFromHeaders(h: { get(name: string): string | null }): string {
  const proto = (h.get('x-forwarded-proto') ?? 'http').split(',')[0]!.trim();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000').split(',')[0]!.trim();
  return `${proto}://${host}`;
}
