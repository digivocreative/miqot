// Read every row of a PostgREST query in 1000-row range() pages.
//
// Pages are only disjoint under a TOTAL order. Postgres guarantees no order
// without ORDER BY, and ties in a non-unique ORDER BY (sisa, tgl_berangkat, nama)
// may land differently on each page request — so a read over 1000 rows silently
// skips some rows and repeats others. Found 2026-09-17: nikita's 1172 jamaah read
// back as 290 rows for 1448 (163 phantom "missing") in the jamaah count audit.
// The table's unique key is appended as a final tiebreaker for known tables.
export const FETCH_ALL_ROWS_TIEBREAKERS = {
  jamaah: ['id'],
  jamaah_haji: ['agent_id', 'id_haji', 'id_jamaah'],
};

const PAGE_SIZE = 1000;

export function withStableOrder(queryBuilder) {
  const url = queryBuilder?.url;
  const table = url?.pathname?.split('/').pop();
  const tiebreakers = FETCH_ALL_ROWS_TIEBREAKERS[table];
  if (!tiebreakers) return queryBuilder;
  const ordered = new Set(
    String(url.searchParams.get('order') || '')
      .split(',')
      .map(part => part.split('.')[0])
      .filter(Boolean),
  );
  let query = queryBuilder;
  for (const column of tiebreakers) {
    if (!ordered.has(column)) query = query.order(column, { ascending: true });
  }
  return query;
}

export async function fetchAllRows(queryBuilder) {
  const query = withStableOrder(queryBuilder);
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }
  return allRows;
}
