// Phase 10.8: pure statistical core for the MATK/PATK dashboard.
import { describe, expect, it } from 'vitest'
import type { RegressionMember } from '../../lib/api'
import {
  MODELS,
  REFERENCE_PAIR,
  classifyMembers,
  classifyReference,
  fitScatter,
  mad,
  median,
  ols,
  predict,
  referenceResiduals,
  theilSen,
} from './regression'

function member(partial: Partial<RegressionMember>): RegressionMember {
  return {
    member_id: partial.member_id ?? 'id',
    display_name: partial.display_name ?? 'Player',
    char_class: 'Biochemist',
    char_function: 'suporte',
    matk: null,
    matk_pct: null,
    patk: null,
    patk_pct: null,
    pdef: null,
    mdef: null,
    rpdef: null,
    rmdef: null,
    equip_pdef_pct: null,
    equip_mdef_pct: null,
    latest_submitted_at: null,
    validated_submissions: 1,
    ...partial,
  }
}

const NOISE = [-60, -30, 0, 30, 60, -45, -15, 15, 45, -50, -20, 20, 50, -40, -10, 10, 40]

describe('robust primitives', () => {
  it('median and MAD', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(mad([1, 2, 3, 4, 5])).toBe(1)
  })

  it('OLS recovers a perfect line', () => {
    const fit = ols([
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
    ])
    expect(fit).not.toBeNull()
    expect(fit?.slope).toBeCloseTo(2, 10)
    expect(fit?.intercept).toBeCloseTo(0, 10)
    expect(fit?.r2).toBeCloseTo(1, 10)
    expect(fit?.slopeCi).not.toBeNull()
  })

  it('Theil–Sen resists one extreme point', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
      { x: 4, y: 8 },
      { x: 10, y: 100 },
    ]
    const robust = theilSen(points)
    expect(robust?.slope).toBeCloseTo(2, 6)
    expect(predict(robust!, 5)).toBeCloseTo(10, 6)
  })

  it('fitScatter reports n, scale, LOO and sensitivity', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      x: 20 + i * 2,
      y: 1000 + 50 * (20 + i * 2) + NOISE[i % NOISE.length],
    }))
    const stats = fitScatter(points)
    expect(stats?.ols.n).toBe(20)
    expect(stats?.scale).toBeGreaterThan(0)
    expect(stats?.loocv.n).toBe(20)
    expect(Number.isFinite(stats?.loocv.rmse)).toBe(true)
    expect(stats?.sensitivity?.delta).toBeTypeOf('number')
  })
})

describe('classification — +35 p.p. hypothesis', () => {
  const normalMembers: RegressionMember[] = Array.from({ length: 24 }, (_, i) => {
    const x = 20 + i * 2
    return member({
      member_id: `normal-${i}`,
      display_name: `Normal ${i}`,
      matk_pct: x,
      matk: 1000 + 50 * x + NOISE[i % NOISE.length],
    })
  })

  // True MATK% 70, declared 105 (buff), total MATK as if the true % were 70.
  const buffed = member({
    member_id: 'buffed',
    display_name: 'Buffed',
    matk_pct: 105,
    matk: 1000 + 50 * 70,
  })

  const members = [...normalMembers, buffed]

  it('flags the buffed point and keeps normal points NORMAL', () => {
    const result = classifyMembers(members, MODELS.matk_pct)
    expect(result.stats?.ols.r2 ?? 0).toBeGreaterThan(0.5)
    const buffedItem = result.items.find((item) => item.member.member_id === 'buffed')
    expect(buffedItem?.verdict).toBe('POSSIBLE_BUFF')
    expect(buffedItem?.inferredMatkPct).toBeCloseTo(70, 6)
    expect(buffedItem?.score ?? 0).toBeGreaterThan(1.5)
    const normalItem = result.items.find((item) => item.member.member_id === 'normal-0')
    expect(normalItem?.verdict).toBe('NORMAL')
  })

  it('flags the buffed point on the MATK/PATK ratio control model', () => {
    const ratioMembers: RegressionMember[] = Array.from({ length: 24 }, (_, i) => {
      const diff = 10 + i * 2
      const ratio = 1.1 + 0.011 * diff + NOISE[i % NOISE.length] / 10000
      const patk = 4000 + i * 50
      return member({
        member_id: `r-${i}`,
        display_name: `Ratio ${i}`,
        matk_pct: 40 + diff,
        patk_pct: 40,
        patk,
        matk: ratio * patk,
      })
    })
    const trueDiff = 30
    const ratio = 1.1 + 0.011 * trueDiff
    const patk = 5000
    ratioMembers.push(
      member({
        member_id: 'ratio-buffed',
        display_name: 'Ratio Buffed',
        matk_pct: 40 + trueDiff + 35,
        patk_pct: 40,
        patk,
        matk: ratio * patk,
      }),
    )
    const result = classifyMembers(ratioMembers, MODELS.ratio_diff)
    const item = result.items.find((entry) => entry.member.member_id === 'ratio-buffed')
    expect(item?.verdict).toBe('POSSIBLE_BUFF')
  })

  it('flags an Angelus/Assumptio buff on the RPDEF curve (y × 1,95)', () => {
    const defenseMembers: RegressionMember[] = Array.from({ length: 24 }, (_, i) => {
      const pct = 18 + i
      return member({
        member_id: `def-${i}`,
        display_name: `Defense ${i}`,
        equip_pdef_pct: pct,
        rpdef: 1500 + 55 * pct + NOISE[i % NOISE.length],
      })
    })
    const truePct = 30
    const trueRpdef = 1500 + 55 * truePct
    defenseMembers.push(
      member({
        member_id: 'def-buffed',
        display_name: 'Defense Buffed',
        equip_pdef_pct: truePct,
        rpdef: trueRpdef * 1.95,
      }),
    )
    const result = classifyMembers(defenseMembers, MODELS.rpdef_pct)
    const item = result.items.find((entry) => entry.member.member_id === 'def-buffed')
    expect(item?.verdict).toBe('POSSIBLE_BUFF')
    expect(item?.inferredValue).toBeCloseTo(trueRpdef, 0)
    expect(item?.score ?? 0).toBeGreaterThan(1.5)
  })

  it('returns INCONCLUSIVE when the sample is too small', () => {
    const small = normalMembers.slice(0, 5)
    const result = classifyMembers(small, MODELS.matk_pct)
    expect(result.limitation).toContain('Amostra pequena')
    expect(result.items.every((item) => item.verdict === 'INCONCLUSIVE')).toBe(true)
  })

  it('keeps the physical control model INCONCLUSIVE', () => {
    const physical = normalMembers.map((m, i) =>
      member({
        ...m,
        patk: 4000 + i * 10,
        patk_pct: 20 + i,
      }),
    )
    const result = classifyMembers(physical, MODELS.patk_pct)
    expect(result.items.every((item) => item.verdict === 'INCONCLUSIVE')).toBe(true)
  })
})

describe('reference pair', () => {
  it('recognizes the owner +35 reference point on the MATK × MATK% curve', () => {
    const stats = { scale: 734.57 } as unknown as Parameters<typeof classifyReference>[1]
    const references = [
      {
        point: REFERENCE_PAIR[0],
        predicted: 6936.7,
        residual: -1138.7,
        debuffedPredicted: null,
        debuffedResidual: null,
      },
      {
        point: REFERENCE_PAIR[1],
        predicted: 9394.75,
        residual: -2182.75,
        debuffedPredicted: 6936.7,
        debuffedResidual: 275.3,
      },
    ]
    const result = classifyReference(references, stats)
    expect(result[0].verdict).toBe('NORMAL')
    expect(result[1].verdict).toBe('POSSIBLE_BUFF')
    expect(result[1].score ?? 0).toBeGreaterThan(1.5)
  })

  it('is external and only usable on the MATK × MATK% curve', () => {
    expect(REFERENCE_PAIR).toHaveLength(2)
    expect(REFERENCE_PAIR[1].matk_pct - REFERENCE_PAIR[0].matk_pct).toBeCloseTo(35, 6)
    const stats = fitScatter(
      Array.from({ length: 20 }, (_, i) => ({
        x: 20 + i * 2,
        y: 1000 + 50 * (20 + i * 2) + NOISE[i % NOISE.length],
      })),
    )
    const refs = referenceResiduals(stats)
    expect(refs).toHaveLength(2)
    expect(Number.isFinite(refs[0].predicted)).toBe(true)
    expect(refs[1].debuffedPredicted).not.toBeNull()
  })
})
