// Phase 10.13 pure-model locks: evidence order/dedupe, the progress join with
// its my_report fallback, the chronological series, the flat-domain safety and
// the hover date format. Node environment, zero new dependencies.
import { describe, expect, it } from 'vitest'
import type {
  CardKeyStat,
  MyCard,
  MyReport,
  MyReportStat,
  MyStatProgress,
  StatProgressRow,
} from '../../lib/api'
import {
  buildProgressEvidence,
  chartDomain,
  evidenceStatKeys,
  formatHistoryDate,
  historySeries,
  signedDelta,
} from './statProgress'

function keyStat(stat_key: string, overrides?: Partial<CardKeyStat>): CardKeyStat {
  return {
    stat_key,
    label: stat_key.toUpperCase(),
    label_short: stat_key.slice(0, 3).toUpperCase(),
    value_type: 'flat',
    own_value: 100,
    points: 50,
    ...overrides,
  }
}

function card(overrides?: Partial<MyCard>): MyCard {
  return {
    char_class: 'Assassin Cross',
    char_function: 'dps',
    ovr: { value: 77.2, data_sufficient: true },
    key_stats: ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => keyStat(k)),
    relevant_stat_keys: [],
    ...overrides,
  }
}

function reportStat(stat_key: string, overrides?: Partial<MyReportStat>): MyReportStat {
  return {
    stat_key,
    label: stat_key.toUpperCase(),
    group_name: 'general',
    value_type: 'flat',
    own_value: 10,
    class_average: 20,
    best: 30,
    points: 40,
    data_sufficient: true,
    ...overrides,
  }
}

function report(stats: MyReportStat[]): MyReport {
  return {
    char_class: 'Assassin Cross',
    char_function: 'dps',
    stats,
    ovr: { value: 77.2, data_sufficient: true },
    last_validated_at: null,
  }
}

function progressRow(stat_key: string, overrides?: Partial<StatProgressRow>): StatProgressRow {
  return {
    stat_key,
    label: `${stat_key} label`,
    label_short: `${stat_key}-short`,
    group_name: 'general',
    value_type: 'flat',
    stat_direction: 'higher',
    own_value: 120,
    history: [
      { value: 120, submitted_at: '2026-11-05T10:00:00Z' },
      { value: 110, submitted_at: '2026-11-03T10:00:00Z' },
      { value: 100, submitted_at: '2026-11-01T10:00:00Z' },
    ],
    class_average: 90,
    class_sample_size: 12,
    function_average: 95,
    function_sample_size: 30,
    cohort_average: 99,
    cohort_sample_size: 4,
    ...overrides,
  }
}

function progress(rows: StatProgressRow[]): MyStatProgress {
  return { char_class: 'Assassin Cross', char_function: 'dps', stats: rows }
}

describe('evidenceStatKeys', () => {
  it('keeps the six keys in SERVER ORDER, then the foco order', () => {
    const focus = [reportStat('z'), reportStat('y')]
    expect(evidenceStatKeys(card(), focus)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'z', 'y'])
  })

  it('de-duplicates a foco stat that is already a key', () => {
    const focus = [reportStat('c'), reportStat('z')]
    expect(evidenceStatKeys(card(), focus)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'z'])
  })

  it('caps the evidence at 12 (6 keys + 6 foco)', () => {
    const focus = ['g', 'h', 'i', 'j', 'k', 'l', 'm'].map((k) => reportStat(k))
    expect(evidenceStatKeys(card(), focus)).toHaveLength(12)
    expect(evidenceStatKeys(card(), focus).at(-1)).toBe('l')
  })

  it('degrades to the foco list when my_card failed', () => {
    expect(evidenceStatKeys(null, [reportStat('z')])).toEqual(['z'])
  })

  it('returns [] with no card and no focus', () => {
    expect(evidenceStatKeys(null, [])).toEqual([])
  })
})

describe('buildProgressEvidence', () => {
  it('uses the progress row for history + the three references and my_card for points', () => {
    const [item] = buildProgressEvidence(['a'], progress([progressRow('a')]), card(), report([]))
    expect(item.label).toBe('a label')
    expect(item.label_short).toBe('a-short')
    expect(item.points).toBe(50)
    expect(item.own_value).toBe(120)
    expect(item.history).toHaveLength(3)
    expect(item.class_average).toBe(90)
    expect(item.function_average).toBe(95)
    expect(item.cohort_average).toBe(99)
    expect(item.class_sample_size).toBe(12)
    expect(item.best).toBeNull()
  })

  it('joins my_report.best as the direction-aware cohort best', () => {
    const [item] = buildProgressEvidence(
      ['a'],
      progress([progressRow('a')]),
      card(),
      report([reportStat('a', { best: 140 })]),
    )
    expect(item.best).toBe(140)
  })

  it('falls back to my_report (points + cohort average) when the progress fetch failed', () => {
    const [item] = buildProgressEvidence(
      ['z'],
      null,
      card(),
      report([reportStat('z', { points: 33, class_average: 42 })]),
    )
    expect(item.history).toEqual([])
    expect(item.points).toBe(33)
    expect(item.own_value).toBe(10)
    expect(item.class_average).toBeNull()
    expect(item.function_average).toBeNull()
    // my_report.class_average IS the cohort basis.
    expect(item.cohort_average).toBe(42)
    // my_report.best backs the "Melhor da coorte" line even without progress.
    expect(item.best).toBe(30)
  })

  it('keeps an unknown key addressable instead of crashing', () => {
    const [item] = buildProgressEvidence(['ghost'], null, card(), report([]))
    expect(item.stat_key).toBe('ghost')
    expect(item.label).toBe('ghost')
    expect(item.value_type).toBe('flat')
    expect(item.points).toBeNull()
  })

  it('prefers my_card points for a key stat over the report points', () => {
    const [item] = buildProgressEvidence(
      ['a'],
      null,
      card(),
      report([reportStat('a', { points: 99 })]),
    )
    expect(item.points).toBe(50)
  })
})

describe('historySeries', () => {
  it('reverses the newest-first payload into a chronological series', () => {
    const series = historySeries([
      { value: 3, submitted_at: '2026-11-05T00:00:00Z' },
      { value: 2, submitted_at: '2026-11-03T00:00:00Z' },
      { value: 1, submitted_at: '2026-11-01T00:00:00Z' },
    ])
    expect(series.map((point) => point.value)).toEqual([1, 2, 3])
  })

  it('never mutates the payload and passes an empty series through', () => {
    const input = [{ value: 1, submitted_at: '2026-11-01T00:00:00Z' }]
    const copy = [...input]
    historySeries(input)
    expect(input).toEqual(copy)
    expect(historySeries([])).toEqual([])
  })
})

describe('chartDomain', () => {
  it('pads a real range so the line never touches the edges', () => {
    const domain = chartDomain([10, 20])
    expect(domain.min).toBeLessThan(10)
    expect(domain.max).toBeGreaterThan(20)
  })

  it('keeps a flat series drawable', () => {
    const domain = chartDomain([50, 50, 50])
    expect(domain.min).toBeLessThan(50)
    expect(domain.max).toBeGreaterThan(50)
  })

  it('yields the neutral 0..1 domain for an empty input', () => {
    expect(chartDomain([])).toEqual({ min: 0, max: 1 })
  })

  it('ignores non-finite values', () => {
    expect(chartDomain([Number.NaN, 10, 20])).toEqual(chartDomain([10, 20]))
  })
})

describe('signedDelta / formatHistoryDate', () => {
  it('returns null when either side is unknown', () => {
    expect(signedDelta(null, 10)).toBeNull()
    expect(signedDelta(10, null)).toBeNull()
  })

  it('returns own − reference', () => {
    expect(signedDelta(120, 90)).toBe(30)
  })

  it('formats the ISO date part as dd/mm without timezone drift', () => {
    expect(formatHistoryDate('2026-11-05T23:30:00-03:00')).toBe('05/11')
    expect(formatHistoryDate('nope')).toBe('—')
  })
})
