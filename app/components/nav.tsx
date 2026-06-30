import Link from 'next/link';

export function Nav() {
  return (
    <nav className="okf-nav">
      <Link href="/" className="okf-nav__brand">
        <span className="okf-logo" aria-hidden="true" />
        OKF Hub
      </Link>
      <form className="okf-nav__search" action="/search" method="get" role="search">
        <span className="okf-searchfield__icon" aria-hidden="true">⌕</span>
        <input type="search" name="q" placeholder="Search concepts…" aria-label="Search" />
      </form>
    </nav>
  );
}
