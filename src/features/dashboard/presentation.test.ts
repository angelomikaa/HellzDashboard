import { describe, expect, it } from 'vitest'
import type { MyReportStat } from '../../lib/api'
import {
  focusCandidates,
  improvementFocus,
  LOWER_IS_BETTER_STATS,
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

describe('improvementFocus (07.2 D-07: key∪relevant stats, most-behind vs class average, scale-free)', () => {
  // The key∪relevant set my_card() delivers (D-07 eligible universe). Deliberately
  // EXCLUDES healing_done — the owner's verbatim example ("no need for an assassin
  // to improve his cura realizada stat") locks the priority filter below.
  const KEYS = new Set(['patk', 'crit', 'fixed_ct_pct', 'global_cd_pct', 'flat1', 'pct1', 'a', 'b', 'c', 'd'])

  it('flags a higher-is-better stat behind when own < average — ordering follows the NORMALIZED gap (−1/3 < −0.2 < −1/6)', () => {
    const sixth = stat(50, { stat_key: 'a', own_value: 100, class_average: 120 }) // −0.1667
    const fifth = stat(50, { stat_key: 'b', own_value: 80, class_average: 100 }) // −0.2
    const third = stat(50, { stat_key: 'c', own_value: 100, class_average: 150 }) // −0.3333
    expect(improvementFocus([sixth, fifth, third], KEYS).map((s) => s.stat_key)).toEqual(['c', 'b', 'a'])
  })

  it('a higher-is-better stat above average is NOT behind — it only fills after every behind stat', () => {
    const behind = stat(50, { stat_key: 'a', own_value: 100, class_average: 120 })
    const ahead = stat(80, { stat_key: 'b', own_value: 130, class_average: 120 }) // +0.0833
    expect(improvementFocus([ahead, behind], KEYS).map((s) => s.stat_key)).toEqual(['a', 'b'])
  })

  it('lower-is-better (D-07): a lower-than-average negative stat is BETTER (not behind); higher-than-average is behind', () => {
    // fixed_ct_pct own −55 vs avg −49.4: LOWER than average → better → filler last.
    const better = stat(50, {
      stat_key: 'fixed_ct_pct',
      value_type: 'percentual',
      own_value: -55,
      class_average: -49.4,
    })
    // global_cd_pct own −4 vs avg −10: HIGHER than average → worse → gap (−4+10)×−1 = −6, normalized −0.6 → most behind.
    const worse = stat(50, {
      stat_key: 'global_cd_pct',
      value_type: 'percentual',
      own_value: -4,
      class_average: -10,
    })
    const behindHigher = stat(50, { stat_key: 'patk', own_value: 100, class_average: 120 }) // −0.1667
    expect(improvementFocus([better, worse, behindHigher], KEYS).map((s) => s.stat_key)).toEqual([
      'global_cd_pct',
      'patk',
      'fixed_ct_pct',
    ])
  })

  it('direction comes from the lowerIsBetter set — LOWER_IS_BETTER_STATS covers exactly the three CT/CD stats', () => {
    expect([...LOWER_IS_BETTER_STATS].sort()).toEqual(['fixed_ct_pct', 'global_cd_pct', 'variable_ct_pct'])
    const s = stat(50, {
      stat_key: 'fixed_ct_pct',
      value_type: 'percentual',
      own_value: -40, // higher than avg −49.4 → behind under the default (lower-is-better) direction
      class_average: -49.4,
    })
    const companion = stat(50, { stat_key: 'patk', own_value: 100, class_average: 120 }) // −0.1667
    // Default set: fixed_ct_pct is direction-aware behind (−0.19) → ranks before patk.
    expect(improvementFocus([s, companion], KEYS).map((x) => x.stat_key)).toEqual(['fixed_ct_pct', 'patk'])
    // Override with an empty set: the same stat reads as higher-is-better (+0.19) → filler after patk.
    expect(improvementFocus([s, companion], KEYS, new Set()).map((x) => x.stat_key)).toEqual(['patk', 'fixed_ct_pct'])
  })

  it('excludes stats outside priorityKeys even with terrible points (assassin’s cura realizada)', () => {
    const irrelevant = stat(1, { stat_key: 'healing_done', own_value: 0, class_average: 500 }) // would be −1 if eligible
    const priority = stat(60, { stat_key: 'patk', own_value: 10, class_average: 100 })
    expect(improvementFocus([irrelevant, priority], KEYS).map((s) => s.stat_key)).toEqual(['patk'])
  })

  it('normalization is scale-free: flat behind 20% of average outranks percentual behind 5% despite the smaller raw gap', () => {
    const flat = stat(50, { stat_key: 'flat1', value_type: 'flat', own_value: 80, class_average: 100 }) // gap −20, normalized −0.2
    const pct = stat(50, { stat_key: 'pct1', value_type: 'percentual', own_value: 950, class_average: 1000 }) // gap −50, normalized −0.05
    expect(improvementFocus([pct, flat], KEYS).map((s) => s.stat_key)).toEqual(['flat1', 'pct1'])
  })

  it('falls back to the raw signed gap when |class_average| < 1e-9 — no division blowup', () => {
    const behindRaw = stat(50, { stat_key: 'a', own_value: -5, class_average: 0 })
    const aheadRaw = stat(50, { stat_key: 'b', own_value: 5, class_average: 1e-12 })
    const focus = improvementFocus([aheadRaw, behindRaw], KEYS)
    expect(focus.map((s) => s.stat_key)).toEqual(['a', 'b'])
    expect(focus.every((s) => Number.isFinite(s.points as number))).toBe(true)
  })

  it('excludes null points (data insufficient) and null own_value', () => {
    const noPoints = stat(null, { stat_key: 'a', own_value: 1, class_average: 2 })
    const noOwn = stat(50, { stat_key: 'b', own_value: null, class_average: 2 })
    const ok = stat(50, { stat_key: 'c', own_value: 1, class_average: 2 })
    expect(improvementFocus([noPoints, noOwn, ok], KEYS).map((s) => s.stat_key)).toEqual(['c'])
  })

  it('returns at most 3, most-behind first, stable tie-break by input (catalog) order', () => {
    const stats = ['d', 'c', 'b', 'a'].map((k) =>
      stat(50, { stat_key: k, own_value: 90, class_average: 100 }), // identical gaps
    )
    expect(improvementFocus(stats, KEYS).map((s) => s.stat_key)).toEqual(['d', 'c', 'b'])
  })

  it('returns what exists when fewer than 3 are eligible, and [] when none are', () => {
    const one = [stat(50, { stat_key: 'a', own_value: 90, class_average: 100 })]
    expect(improvementFocus(one, KEYS).map((s) => s.stat_key)).toEqual(['a'])
    expect(improvementFocus([], KEYS)).toEqual([])
    const allExcluded = [stat(null, { stat_key: 'a' }), stat(1, { stat_key: 'zzz', own_value: 1, class_average: 2 })]
    expect(improvementFocus(allExcluded, KEYS)).toEqual([])
  })

  it('does NOT mutate the input array', () => {
    const stats = [
      stat(50, { stat_key: 'a', own_value: 90, class_average: 100 }),
      stat(50, { stat_key: 'b', own_value: 10, class_average: 100 }),
    ]
    const snapshot = JSON.parse(JSON.stringify(stats))
    improvementFocus(stats, KEYS)
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
