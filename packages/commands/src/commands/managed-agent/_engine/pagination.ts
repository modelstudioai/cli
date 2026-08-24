export interface PagedResult<T> {
  items: T[];
  hasMore: boolean;
  nextPage?: string;
}

/** Fetch the first page, then follow cursors while `all` is true. */
export async function fetchAllPages<T>(
  fetchPage: (page?: string) => Promise<PagedResult<T>>,
  all?: boolean,
  initialPage?: string,
): Promise<PagedResult<T>> {
  const first = await fetchPage(initialPage);
  const items = [...first.items];
  let hasMore = first.hasMore;
  let nextPage = first.nextPage;

  while (all && nextPage) {
    const next = await fetchPage(nextPage);
    items.push(...next.items);
    hasMore = next.hasMore;
    nextPage = next.nextPage;
  }

  return { items, hasMore, nextPage };
}
