export function SearchForm({ defaultQuery = '' }: { defaultQuery?: string }) {
  return (
    <form action="/search" method="get">
      <input type="search" name="q" defaultValue={defaultQuery} placeholder="Search concepts…" aria-label="Search" />
      <button type="submit">Search</button>
    </form>
  );
}
