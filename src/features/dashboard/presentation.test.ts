import { describe, expect, it } from 'vitest'
import type { MyReportStat } from '../../lib/api'
import {
  focusCandidates,
  percentilePhrase,
  tierForOvr,
  tierForPoints,
  TIER_BG,
  TIER_BORDER,
  TIER_TEXT,
} from './presentation'

// Plan 04-01 task 2 (TDD): the presentation-logic SPEC. Every worked example
// below locks an 04-CONTEXT decision — D-01/D-02 tier bands, D-09/D-10/D-11
// phrase banding, D-16 focus selection. The dashboard components (04-02/04-03)
// consume these pure functions, so the semantics can never drift during UI
// work. PURE presentation only: points/OVR arrive opaque from my_report()
// (RNK-02) — the 03-01 spec module is never imported here.

/** Minimal MyReportStat factory — every field typed, points drives sufficiency. */
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

describe('tierForPoints (D-01 top-heavy bands on the 0-99 points scale)', () => {
  it('null points -> no tier (Sem registro / Dados insuficientes)', () => {
    expect(tierForPoints(null)).toBe(null)
  })

  it('0 and 34.99 -> bronze', () => {
    expect(tierForPoints(0)).toBe('bronze')
    expect(tierForPoints(34.99)).toBe('bronze')
  })

  it('35 and 59.99 -> silver (boundary: 35 enters silver)', () => {
    expect(tierForPoints(35)).toBe('silver')
    expect(tierForPoints(59.99)).toBe('silver')
  })

  it('60 and 84.99 -> gold (boundary: 60 enters gold)', () => {
    expect(tierForPoints(60)).toBe('gold')
    expect(tierForPoints(84.99)).toBe('gold')
  })

  it('85 and 99 -> platinum (boundary: 85 enters platinum)', () => {
    expect(tierForPoints(85)).toBe('platinum')
    expect(tierForPoints(99)).toBe('platinum')
  })
})

describe('tierForOvr (D-02 EAFC bands on the 51-99 OVR scale)', () => {
  it('null OVR -> no tier (OVR indisponível)', () => {
    expect(tierForOvr(null)).toBe(null)
  })

  it('51, 64, 64.9 -> bronze (floor of 51 lands in bronze)', () => {
    expect(tierForOvr(51)).toBe('bronze')
    expect(tierForOvr(64)).toBe('bronze')
    expect(tierForOvr(64.9)).toBe('bronze')
  })

  it('65, 74, 74.6 -> silver (boundary: 65 enters silver)', () => {
    expect(tierForOvr(65)).toBe('silver')
    expect(tierForOvr(74)).toBe('silver')
    expect(tierForOvr(74.6)).toBe('silver')
  })

  it('75, 84, 84.4 -> gold (boundary: 75 enters gold)', () => {
    expect(tierForOvr(75)).toBe('gold')
    expect(tierForOvr(84)).toBe('gold')
    expect(tierForOvr(84.4)).toBe('gold')
  })

  it('85 and 99 -> platinum (boundary: 85 enters platinum)', () => {
    expect(tierForOvr(85)).toBe('platinum')
    expect(tierForOvr(99)).toBe('platinum')
  })
})

describe('percentilePhrase (D-09/D-10/D-11: 10% steps, direct melhores/piores tone)', () => {
  it('72 -> entre os 30% melhores (ceil(2.8)=3)', () => {
    expect(percentilePhrase(72, 'CRIT')).toBe('Você está entre os 30% melhores em CRIT.')
  })

  it('85 -> entre os 20% melhores (ceil(1.5)=2)', () => {
    expect(percentilePhrase(85, 'CRIT')).toBe('Você está entre os 20% melhores em CRIT.')
  })

  it('99 -> entre os 10% melhores (B=10 at the top)', () => {
    expect(percentilePhrase(99, 'CRIT')).toBe('Você está entre os 10% melhores em CRIT.')
  })

  it('50 -> entre os 50% melhores (p >= 50 is the top half)', () => {
    expect(percentilePhrase(50, 'CRIT')).toBe('Você está entre os 50% melhores em CRIT.')
  })

  it('49.5 -> entre os 50% piores (bottom half, ceil(4.95)=5)', () => {
    expect(percentilePhrase(49.5, 'ATQ')).toBe('Você está entre os 50% piores em ATQ.')
  })

  it('30 -> entre os 30% piores (CMP-02 literal example)', () => {
    expect(percentilePhrase(30, 'CRIT')).toBe('Você está entre os 30% piores em CRIT.')
  })

  it('10 -> entre os 10% piores (B=10 at the bottom)', () => {
    expect(percentilePhrase(10, 'CRIT')).toBe('Você está entre os 10% piores em CRIT.')
  })

  it('0 -> entre os 10% piores (B=0 clamps up to 10 — never "0%")', () => {
    expect(percentilePhrase(0, 'CRIT')).toBe('Você está entre os 10% piores em CRIT.')
  })
})

describe('focusCandidates (D-16: 3 weakest eligible stats, stable ascending)', () => {
  it('filters nulls and takes the 3 lowest points, ascending', () => {
    const stats = [null, 80, 60, 10, 5, 3, 45].map((points, i) =>
      stat(points, { stat_key: `s${i}`, label: `S${i}` }),
    )
    expect(focusCandidates(stats).map((s) => s.points)).toEqual([3, 5, 10])
  })

  it('breaks ties by original array order (stable)', () => {
    const a = stat(10, { stat_key: 'a', label: 'A' })
    const b = stat(10, { stat_key: 'b', label: 'B' })
    const c = stat(5, { stat_key: 'c', label: 'C' })
    expect(focusCandidates([a, b, c]).map((s) => s.stat_key)).toEqual(['c', 'a', 'b'])
  })

  it('returns [] when no stats are eligible (all points null)', () => {
    const stats = [stat(null), stat(null, { stat_key: 's2' })]
    expect(focusCandidates(stats)).toEqual([])
  })

  it('returns 1-2 items when only that many are eligible', () => {
    const two = [stat(90, { stat_key: 'a' }), stat(20, { stat_key: 'b' })]
    expect(focusCandidates(two).map((s) => s.stat_key)).toEqual(['b', 'a'])
    const one = [stat(90, { stat_key: 'a' }), stat(null, { stat_key: 'b' })]
    expect(focusCandidates(one).map((s) => s.stat_key)).toEqual(['a'])
  })

  it('does NOT mutate the input array', () => {
    const stats = [stat(50, { stat_key: 'a' }), stat(10, { stat_key: 'b' }), stat(null, { stat_key: 'c' })]
    const snapshot = JSON.parse(JSON.stringify(stats))
    focusCandidates(stats)
    expect(stats).toEqual(snapshot)
  })
})

describe('tier class maps (literal Tailwind names for v4 JIT)', () => {
  it('cover all four tiers for border/text/bg', () => {
    expect(TIER_BORDER).toEqual({
      bronze: 'border-tier-bronze',
      silver: 'border-tier-silver',
      gold: 'border-tier-gold',
      platinum: 'border-tier-platinum',
    })
    expect(TIER_TEXT).toEqual({
      bronze: 'text-tier-bronze',
      silver: 'text-tier-silver',
      gold: 'text-tier-gold',
      platinum: 'text-tier-platinum',
    })
    expect(TIER_BG).toEqual({
      bronze: 'bg-tier-bronze',
      silver: 'bg-tier-silver',
      gold: 'bg-tier-gold',
      platinum: 'bg-tier-platinum',
    })
  })
})
