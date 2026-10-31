// Unit locks for the staff view-aid sort (07.2-04, T-072-11): the DEFAULT
// 'server' key must pass the payload through VERBATIM (same reference, no
// re-order); name/class keys sort a COPY and never mutate the input array.
import { describe, expect, it } from 'vitest'
import type { RoleRankRow, StatOverviewRow } from '../../lib/api'
import { applyViewSort, orderStatRows } from './rankView'

function row(partial: Partial<RoleRankRow>): RoleRankRow {
  return {
    member_id: 'id',
    display_name: 'nome',
    char_id: null,
    char_class: 'Classe',
    char_function: 'dps',
    ovr: null,
    stats: [],
    ...partial,
  }
}

// Already in server order (ovr desc, null-OVR row LAST — server discipline).
const serverOrder: RoleRankRow[] = [
  row({ member_id: 'a', display_name: 'Zeca', char_class: 'Assassin Cross', ovr: 91 }),
  row({ member_id: 'b', display_name: 'ana', char_class: 'Arcebispo', ovr: 77 }),
  row({ member_id: 'c', display_name: 'Bruno', char_class: 'Sumo Sacerdote', ovr: null }),
]

describe('applyViewSort', () => {
  it("'server' returns the payload verbatim — same reference, untouched order", () => {
    const result = applyViewSort(serverOrder, 'server')
    expect(result).toBe(serverOrder)
    expect(result.map((r) => r.member_id)).toEqual(['a', 'b', 'c'])
  })

  it("'name' sorts a COPY alphabetically (pt-BR collation) without mutating the input", () => {
    const result = applyViewSort(serverOrder, 'name')
    expect(result.map((r) => r.display_name)).toEqual(['ana', 'Bruno', 'Zeca'])
    // The default (server) order survives the view-aid sort.
    expect(serverOrder.map((r) => r.member_id)).toEqual(['a', 'b', 'c'])
  })

  it("'class' sorts by class primary with a display-name tie-break", () => {
    const result = applyViewSort(
      [
        row({ member_id: '1', display_name: 'Carlos', char_class: 'Sumo Sacerdote' }),
        row({ member_id: '2', display_name: 'Ana', char_class: 'Arcebispo' }),
        row({ member_id: '3', display_name: 'Bia', char_class: 'Arcebispo' }),
      ],
      'class',
    )
    expect(result.map((r) => r.member_id)).toEqual(['2', '3', '1'])
  })

  it("re-sorting back to 'server' restores the exact server order (no drift)", () => {
    const nameSorted = applyViewSort(serverOrder, 'name')
    expect(applyViewSort(nameSorted, 'server')).toBe(nameSorted)
    expect(nameSorted.map((r) => r.member_id)).not.toEqual(['a', 'b', 'c'])
  })
})

function statRow(partial: Partial<StatOverviewRow>): StatOverviewRow {
  return {
    member_id: 'id',
    display_name: 'nome',
    char_id: null,
    char_class: 'Classe',
    char_function: 'dps',
    value: null,
    submitted_at: null,
    class_average: null,
    class_median: null,
    class_mad: null,
    class_sample_size: null,
    class_z: null,
    class_sigma_outlier: false,
    cohort_ratio: null,
    guild_ratio: null,
    cohort_outlier: false,
    guild_outlier: false,
    ...partial,
  }
}

// Server contract: raw value desc, no-value members LAST.
const statServerOrder: StatOverviewRow[] = [
  statRow({ member_id: 'a', display_name: 'Zeca', value: 9000 }),
  statRow({ member_id: 'b', display_name: 'Ana', value: 4000 }),
  statRow({ member_id: 'c', display_name: 'Bruno', value: null }),
]

describe('orderStatRows', () => {
  it("'desc' returns the server payload verbatim — same reference", () => {
    const result = orderStatRows(statServerOrder, 'desc')
    expect(result).toBe(statServerOrder)
    expect(result.map((r) => r.member_id)).toEqual(['a', 'b', 'c'])
  })

  it("'asc' reverses valued rows and keeps no-value members last", () => {
    const result = orderStatRows(statServerOrder, 'asc')
    expect(result.map((r) => r.member_id)).toEqual(['b', 'a', 'c'])
    // input never mutated
    expect(statServerOrder.map((r) => r.member_id)).toEqual(['a', 'b', 'c'])
  })

  it("'asc' uses a pt-BR name tie-break for equal values", () => {
    const result = orderStatRows(
      [
        statRow({ member_id: '1', display_name: 'Zeca', value: 500 }),
        statRow({ member_id: '2', display_name: 'Ana', value: 500 }),
      ],
      'asc',
    )
    expect(result.map((r) => r.member_id)).toEqual(['2', '1'])
  })
})
