import Link from 'next/link';

export function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="brand">OKF Hub</Link>
      <div className="nav-links">
        <Link href="/search">Search</Link>
        <Link href="/graph">Graph</Link>
      </div>
    </nav>
  );
}
