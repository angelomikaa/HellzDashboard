import { describe, expect, it } from 'vitest'
import { MIN_COHORT_SIZE, ovrFromPoints, percentilePoints } from './rankMath'

// Plan 03-01: the rank-math EXECUTABLE SPEC. Every worked example below is a
// locked test vector — the Postgres RPC (plan 03-03) and scripts/smoke-rank.mjs
// must reproduce these EXACT values (74.25, 49.5, 99, 51, 75, 95, 61).
// All values are exact decimals by construction: percentile points are
// (k/2)/(n-1) * 99 with n >= 3, and OVR rescales by *48/99 — binary-exact here.
//
// PRODUCTION NOTE: these functions are spec/test vectors only. Production rank
// truth lives in Postgres RPCs; no UI may import rankMath to compute points.

describe('MIN_COHORT_SIZE (D-12 single source of truth)', () => {
  it('is 3 — at n=3 the formula yields a genuine middle value (0/49.5/99)', () => {
    expect(MIN_COHORT_SIZE).toBe(3)
  })
})

describe('percentilePoints (RNK-04 rank-based, average-rank ties)', () => {
  it('best of 5 distinct -> 99', () => {
    expect(percentilePoints(50, [10, 20, 30, 40])).toEqual({
      points: 99,
      dataSufficient: true,
    })
  })

  it('worst of 5 -> 0', () => {
    expect(percentilePoints(10, [20, 30, 40, 50])).toEqual({
      points: 0,
      dataSufficient: true,
    })
  })

  it('middle of 5 -> 49.5', () => {
    expect(percentilePoints(30, [10, 20, 40, 50])).toEqual({
      points: 49.5,
      dataSufficient: true,
    })
  })

  it('n=3 middle -> 49.5 (the 0/49.5/99 trio, D-12)', () => {
    expect(percentilePoints(20, [10, 30])).toEqual({
      points: 49.5,
      dataSufficient: true,
    })
  })

  it('tie at top of 3 -> 74.25 ((1 + 0.5)/2 x 99)', () => {
    expect(percentilePoints(10, [10, 5])).toEqual({
      points: 74.25,
      dataSufficient: true,
    })
  })

  it('tie in middle of 4 -> 49.5 ((1 + 0.5)/3 x 99)', () => {
    expect(percentilePoints(20, [20, 10, 30])).toEqual({
      points: 49.5,
      dataSufficient: true,
    })
  })

  it('all three tied -> 49.5 ((0 + 2/2)/2 x 99) — equal values, equal points', () => {
    expect(percentilePoints(7, [7, 7])).toEqual({
      points: 49.5,
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

  it('[0, 74.25, 0, 49.5, 0, 0] -> 61.0 exactly (mean 20.625)', () => {
    expect(ovrFromPoints([0, 74.25, 0, 49.5, 0, 0])).toBe(61)
  })

  it('throws RangeError on 5 points (D-11 all-6-or-nothing is the caller gate; function is strict)', () => {
    expect(() => ovrFromPoints([99, 99, 99, 99, 99])).toThrow(RangeError)
  })

  it('throws RangeError on 7 points', () => {
    expect(() => ovrFromPoints([0, 0, 0, 0, 0, 0, 0])).toThrow(RangeError)
  })
})
