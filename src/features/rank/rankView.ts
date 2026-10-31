// Rank view-aid sort (07.2-04, T-072-11 'accept'): the officials rank table
// may re-order the ALREADY-FETCHED array as an analysis convenience — this is
// a staff analysis surface, NOT a member-facing rank board. The DEFAULT view
// ('server') renders the role_rank payload VERBATIM in server order (ovr desc
// nulls last, display_name); member surfaces keep the strict server-order
// discipline (RNK-02) and never import this module.
//
// PURE: never mutates the input; non-'server' keys return a sorted COPY.
import type { RoleRankRow, StatOverviewRow } from '../../lib/api'
import { cohortGroup } from '../../lib/classGroups'

export type RankSortKey = 'server' | 'name' | 'class'
export type StatOrder = 'desc' | 'asc'

/** Accent/case-insensitive search text (pt-BR names). */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

/** Filter OVR rows by player name or char ID (view aid, staff analysis). */
export function filterRankRows(rows: RoleRankRow[], query: string): RoleRankRow[] {
  const q = normalizeSearch(query)
  if (q === '') return rows
  return rows.filter((row) =>
    normalizeSearch(`${row.display_name} ${row.char_id ?? ''}`).includes(q),
  )
}

export interface RankSummary {
  total: number
  withOvr: number
  missingOvr: number
  averageOvr: number | null
}

/** Summary counts for the OVR board (raw values, display-only). */
export function summarizeRankRows(rows: readonly RoleRankRow[]): RankSummary {
  const values = rows.map((row) => row.ovr).filter((ovr): ovr is number => ovr !== null)
  return {
    total: rows.length,
    withOvr: values.length,
    missingOvr: rows.length - values.length,
    averageOvr:
      values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}

export interface StatFilters {
  query: string
  /** Stats cohort group (e.g. Artista) or '' for all. */
  classGroup: string
  /** Build role or '' for all. */
  charFunction: '' | 'dps' | 'mdps' | 'suporte'
}

/**
 * Filter the cross-cohort stat rows by name/ID, cohort group and build role.
 * Client-side view aid over the already-fetched staff payload; no server round
 * trip and no rank math.
 */
export function filterStatRows(
  rows: StatOverviewRow[],
  filters: StatFilters,
): StatOverviewRow[] {
  const q = normalizeSearch(filters.query)
  if (q === '' && filters.classGroup === '' && filters.charFunction === '') return rows
  return rows.filter((row) => {
    if (q !== '' && !normalizeSearch(`${row.display_name} ${row.char_id ?? ''}`).includes(q)) {
      return false
    }
    if (filters.classGroup !== '' && cohortGroup(row.char_class) !== filters.classGroup) {
      return false
    }
    if (filters.charFunction !== '' && row.char_function !== filters.charFunction) {
      return false
    }
    return true
  })
}

export interface StatValueSummary {
  total: number
  withValue: number
  median: number | null
  min: number | null
  max: number | null
}

/** Raw value summary of the filtered stat rows (display-only). */
export function summarizeStatRows(rows: readonly StatOverviewRow[]): StatValueSummary {
  const values = rows
    .map((row) => row.value)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)
  if (values.length === 0) {
    return { total: rows.length, withValue: 0, median: null, min: null, max: null }
  }
  const mid = Math.floor(values.length / 2)
  return {
    total: rows.length,
    withValue: values.length,
    median:
      values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid],
    min: values[0],
    max: values[values.length - 1],
  }
}

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
