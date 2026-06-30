import Link from 'next/link';

export function Nav() {
  return (
    <nav className="okf-nav">
      <Link href="/" className="okf-nav__brand">
        <span className="okf-logo" aria-hidden="true" />
        OKF Hub
      </Link>
      <div className="okf-nav__links">
        <Link href="/graph" className="okf-nav__link">graph</Link>
        <Link href="/search" className="okf-nav__link">search</Link>
      </div>
    </nav>
  );
}
