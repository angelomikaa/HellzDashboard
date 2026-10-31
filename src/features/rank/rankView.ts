// Rank view-aid sort (07.2-04, T-072-11 'accept'): the officials rank table
// may re-order the ALREADY-FETCHED array as an analysis convenience — this is
// a staff analysis surface, NOT a member-facing rank board. The DEFAULT view
// ('server') renders the role_rank payload VERBATIM in server order (ovr desc
// nulls last, display_name); member surfaces keep the strict server-order
// discipline (RNK-02) and never import this module.
//
// PURE: never mutates the input; non-'server' keys return a sorted COPY.
import type { RoleRankRow, StatOverviewRow } from '../../lib/api'

export type RankSortKey = 'server' | 'name' | 'class'
export type StatOrder = 'desc' | 'asc'

export function applyViewSort(rows: RoleRankRow[], sortKey: RankSortKey): RoleRankRow[] {
  if (sortKey === 'server') return rows
  const collator = new Intl.Collator('pt-BR')
  const sorted = [...rows]
  if (sortKey === 'name') {
    sorted.sort((a, b) => collator.compare(a.display_name, b.display_name))
  } else {
    // Class primary, name tie-break (stable within a class).
    sorted.sort(
      (a, b) =>
        collator.compare(a.char_class, b.char_class) ||
        collator.compare(a.display_name, b.display_name),
    )
  }
  return sorted
}

/**
 * Cross-cohort inspector order (0047): the server returns raw value descending
 * with no-value members last. 'desc' passes that payload through VERBATIM
 * (same reference); 'asc' reverses a COPY of the valued rows (name tie-break)
 * and keeps the no-value members last. Display-only view aid — never rank math.
 */
export function orderStatRows(rows: StatOverviewRow[], order: StatOrder): StatOverviewRow[] {
  if (order === 'desc') return rows
  const collator = new Intl.Collator('pt-BR')
  const valued = rows.filter((row) => row.value !== null)
  const missing = rows.filter((row) => row.value === null)
  valued.sort(
    (a, b) =>
      (a.value as number) - (b.value as number) ||
      collator.compare(a.display_name, b.display_name),
  )
  return [...valued, ...missing]
}
