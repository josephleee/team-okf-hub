export function SearchForm({ defaultQuery = '' }: { defaultQuery?: string }) {
  return (
    <form className="okf-searchform" action="/search" method="get">
      <div className="okf-searchfield">
        <span className="okf-searchfield__icon" aria-hidden="true">⌕</span>
        <input type="search" name="q" defaultValue={defaultQuery} placeholder="Search concepts…" aria-label="Search" />
      </div>
      <button className="okf-btn" type="submit">Search</button>
    </form>
  );
}
