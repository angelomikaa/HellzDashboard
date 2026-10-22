import { describe, expect, it } from 'vitest'
import { MIN_COHORT_SIZE, ovrFromPoints, percentilePoints } from './rankMath'

// Plan 09-02: the rank-math EXECUTABLE SPEC re-baselined for the Phase 9
// value-proportional scale. Every worked example below is a locked test
// vector — the Postgres RPC (migration 0018) and scripts/smoke-rank.mjs must
// reproduce these EXACT values.
//
// PRODUCTION NOTE: these functions are spec/test vectors only. Production rank
// truth lives in Postgres RPCs; no UI may import rankMath to compute points.

describe('MIN_COHORT_SIZE (D-12 single source of truth)', () => {
  it('is 3 — at n=3 the formula yields a genuine middle value (0/49.5/99)', () => {
    expect(MIN_COHORT_SIZE).toBe(3)
  })
})

describe('percentilePoints (Phase 9 SCALE-01 value-proportional, higher-is-better default)', () => {
  it('best of 3 distinct -> 99 (leader holds exactly 99)', () => {
    expect(percentilePoints(100, [50, 25])).toEqual({
      points: 99,
      dataSufficient: true,
    })
  })

  it('mid of 3 -> 49.5 (50/100*99)', () => {
    expect(percentilePoints(50, [100, 25])).toEqual({
      points: 49.5,
      dataSufficient: true,
    })
  })

  it('worst of 3 -> 24.75 (25/100*99)', () => {
    expect(percentilePoints(25, [100, 50])).toEqual({
      points: 24.75,
      dataSufficient: true,
    })
  })

  it('tie at top of 3 -> 99 both (equal values, equal points)', () => {
    expect(percentilePoints(100, [100, 50])).toEqual({
      points: 99,
      dataSufficient: true,
    })
    expect(percentilePoints(100, [100, 50])).toEqual({
      points: 99,
      dataSufficient: true,
    })
    expect(percentilePoints(50, [100, 100])).toEqual({
      points: 49.5,
      dataSufficient: true,
    })
  })

  it('all three tied -> 99 each (equal values, equal points at the top)', () => {
    expect(percentilePoints(7, [7, 7])).toEqual({
      points: 99,
      dataSufficient: true,
    })
  })

  it('clamp at 99 — own above best still yields 99, never more (n=3)', () => {
    expect(percentilePoints(200, [100, 50])).toEqual({
      points: 99,
      dataSufficient: true,
    })
  })

  it('clamp at 0 — own at 0 yields 0', () => {
    expect(percentilePoints(0, [100, 50])).toEqual({
      points: 0,
      dataSufficient: true,
    })
  })

  it('lower-is-better: best (most negative) gets 99', () => {
    expect(percentilePoints(-100, [-50, -25], 'lower')).toEqual({
      points: 99,
      dataSufficient: true,
    })
  })

  it('lower-is-better: mid (less negative than best) gets proportional points', () => {
    expect(percentilePoints(-50, [-100, -25], 'lower')).toEqual({
      points: 49.5,
      dataSufficient: true,
    })
  })

  it('lower-is-better: worst (least negative) gets 24.75', () => {
    expect(percentilePoints(-25, [-100, -50], 'lower')).toEqual({
      points: 24.75,
      dataSufficient: true,
    })
  })

  it('lower-is-better clamp at 99 — own below best still yields 99 (n=3)', () => {
    expect(percentilePoints(-200, [-100, -50], 'lower')).toEqual({
      points: 99,
      dataSufficient: true,
    })
  })

  it('n=1 (no others) -> points null, dataSufficient false (RNK-05)', () => {
    expect(percentilePoints(42, [])).toEqual({
      points: null,
      dataSufficient: false,
    })
  })

  it('n=2 (one other) -> points null, dataSufficient false (binary ranks rejected)', () => {
    expect(percentilePoints(42, [50])).toEqual({
      points: null,
      dataSufficient: false,
    })
  })

  it('n=3 exactly at threshold -> dataSufficient true', () => {
    expect(percentilePoints(10, [10, 5]).dataSufficient).toBe(true)
  })
})

describe('ovrFromPoints (D-09 mean of 6, D-10 linear rescale floor 51)', () => {
  it('six 99s -> 99.0 exactly (best in class)', () => {
    expect(ovrFromPoints([99, 99, 99, 99, 99, 99])).toBe(99)
  })

  it('six 0s -> 51.0 exactly (the floor — never below)', () => {
    expect(ovrFromPoints([0, 0, 0, 0, 0, 0])).toBe(51)
  })

  it('[99,99,99,0,0,0] -> 75.0 exactly (mean 49.5)', () => {
    expect(ovrFromPoints([99, 99, 99, 0, 0, 0])).toBe(75)
  })

  it('[99,99,99,49.5,99,99] -> 95.0 exactly (mean 90.75)', () => {
    expect(ovrFromPoints([99, 99, 99, 49.5, 99, 99])).toBe(95)
  })

  it('[0, 99, 0, 99, 0, 99] -> 75.0 exactly (mean 49.5)', () => {
    expect(ovrFromPoints([0, 99, 0, 99, 0, 99])).toBe(75)
  })

  it('throws RangeError on 5 points (D-11 all-6-or-nothing is the caller gate; function is strict)', () => {
    expect(() => ovrFromPoints([99, 99, 99, 99, 99])).toThrow(RangeError)
  })

  it('throws RangeError on 7 points', () => {
    expect(() => ovrFromPoints([0, 0, 0, 0, 0, 0, 0])).toThrow(RangeError)
  })
})
