// Plan 10-02 task 2 (TDD): HOME-01/HOME-02 pure-logic SPEC for InicioPage.
// Tests extractStaleBanner (strictly->7-days boundary) and extractTop3 (points
// desc selection + tier badge mapping). Node-env vitest, no DOM library.
import { describe, expect, it } from 'vitest'
import type { MyReport, MyReportStat } from '../../lib/api'
import { extractStaleBanner, extractTop3 } from './InicioPage'
import { tierForPoints } from './presentation'

const NOW = new Date('2026-10-24T12:00:00Z').getTime()

function stat(points: number | null, overrides?: Partial<MyReportStat>): MyReportStat {
  return {
    stat_key: 's1',
    label: 'S1',
    group_name: 'general',
    value_type: 'flat',
    own_value: 1,
    class_average: 1,
    best: 2,
    points,
    data_sufficient: points !== null,
    ...overrides,
  }
}

function reportWith(overrides: Partial<MyReport>): MyReport {
  return {
    char_class: 'Assassin Cross',
    char_function: 'dps',
    stats: [],
    ovr: { value: 77, data_sufficient: true },
    last_validated_at: null,
    ...overrides,
  }
}

describe('extractStaleBanner (HOME-02: strictly->7-days boundary)', () => {
  it('null last_validated_at -> first-submission variant', () => {
    expect(extractStaleBanner(reportWith({ last_validated_at: null }), NOW)).toBe('first')
  })

  it('exactly 7 days -> no banner (boundary: strictly greater)', () => {
    const sevenDaysAgo = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString()
    expect(extractStaleBanner(reportWith({ last_validated_at: sevenDaysAgo }), NOW)).toBe(null)
  })

  it('7 days + 1ms -> stale-data variant', () => {
    const sevenDaysPlusOneMs = new Date(NOW - 7 * 24 * 60 * 60 * 1000 - 1).toISOString()
    expect(extractStaleBanner(reportWith({ last_validated_at: sevenDaysPlusOneMs }), NOW)).toBe('stale')
  })

  it('within 7 days -> no banner', () => {
    const threeDaysAgo = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(extractStaleBanner(reportWith({ last_validated_at: threeDaysAgo }), NOW)).toBe(null)
  })
})

describe('extractTop3 (HOME-01: best-stats strip)', () => {
  it('selects top 3 by points desc, excluding null own_value/points', () => {
    const stats = [
      stat(90, { stat_key: 'a', own_value: 100, label: 'Ataque' }),
      stat(null, { stat_key: 'b', own_value: null, points: null, label: 'Vazio' }),
      stat(60, { stat_key: 'c', own_value: 50, label: 'Crit' }),
      stat(30, { stat_key: 'd', own_value: 30, label: 'Dano' }),
      stat(70, { stat_key: 'e', own_value: 70, label: 'Vida' }),
    ]
    const result = extractTop3(reportWith({ stats }))
    expect(result.map((s) => s.stat_key)).toEqual(['a', 'e', 'c'])
    expect(result).toHaveLength(3)
    // points are raw, tier badge derives from tierForPoints
    expect(result[0].points).toBe(90)
    expect(result[0].tier).toBe(tierForPoints(90))
    expect(result[1].points).toBe(70)
    expect(result[1].tier).toBe(tierForPoints(70))
    expect(result[2].points).toBe(60)
    expect(result[2].tier).toBe(tierForPoints(60))
  })

  it('tier badge matches tierForPoints(points) for each entry', () => {
    const stats = [
      stat(95, { stat_key: 'a', own_value: 100 }),
      stat(50, { stat_key: 'b', own_value: 50 }),
      stat(10, { stat_key: 'c', own_value: 10 }),
    ]
    const result = extractTop3(reportWith({ stats }))
    expect(result.map((s) => s.tier)).toEqual([tierForPoints(95), tierForPoints(50), tierForPoints(10)])
  })

  it('returns fewer than 3 when fewer eligible stats exist', () => {
    const stats = [stat(50, { stat_key: 'a', own_value: 100 })]
    const result = extractTop3(reportWith({ stats }))
    expect(result).toHaveLength(1)
    expect(result[0].stat_key).toBe('a')
  })

  it('returns empty array when no eligible stats', () => {
    const stats = [
      stat(null, { stat_key: 'a', own_value: null, points: null }),
      stat(null, { stat_key: 'b', own_value: 100, points: null }),
    ]
    const result = extractTop3(reportWith({ stats }))
    expect(result).toEqual([])
  })
})
