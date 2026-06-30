import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="okf-404 okf-screen">
      <div className="okf-404__code">404</div>
      <div className="okf-404__title">Concept not found</div>
      <div className="okf-404__msg">
        This path isn&apos;t in the current bundle. It may have been renamed or removed in git.
      </div>
      <Link href="/">← Browse all concepts</Link>
    </main>
  );
}
