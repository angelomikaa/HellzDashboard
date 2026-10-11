// Sanity-range gate tests (plan 05-01 task 1, TDD RED).
// Pure functions only — vitest runs node-env (no DOM), per the house pattern.
// Behavior source: 05-01-PLAN <behavior> + 05-RESEARCH §3.4 (D-03/D-20:
// hardcoded ranges that reject absurd parses and accept every spike-plausible
// value; calibration-friendly constants, never admin-tweakable).
import { describe, expect, it } from 'vitest'
import {
  FLAT_DEFAULT,
  OCR_ACCEPT_CONFIDENCE,
  PERCENTUAL_DEFAULT,
  SANITY_OVERRIDES,
  sanityAccepts,
} from './sanity'

describe('sanity constants (D-16/D-20)', () => {
  it('ships the internal accept-confidence gate at 85 (D-16)', () => {
    expect(OCR_ACCEPT_CONFIDENCE).toBe(85)
  })

  it('ships the flat and percentual defaults (05-RESEARCH §3.4)', () => {
    expect(FLAT_DEFAULT).toEqual({ min: -100_000, max: 100_000_000 })
    expect(PERCENTUAL_DEFAULT).toEqual({ min: -1_000, max: 5_000 })
  })

  it('ships exactly 12 per-stat sanity overrides', () => {
    expect(Object.keys(SANITY_OVERRIDES)).toHaveLength(12)
  })
})

describe('sanityAccepts', () => {
  it('flat default accepts big legit values and rejects absurd ones', () => {
    expect(sanityAccepts(12_345_678, false, 'hp')).toBe(true)
    expect(sanityAccepts(200_000_000, false, 'hp')).toBe(false)
  })

  it('CT/CD overrides are negative-only (spike data confirmed negative reads)', () => {
    expect(sanityAccepts(-33.38, true, 'variable_ct_pct')).toBe(true)
    expect(sanityAccepts(5, true, 'variable_ct_pct')).toBe(false)
  })

  it('bounds are inclusive on both ends', () => {
    expect(sanityAccepts(0, false, 'combat_power')).toBe(true) // override min 0
    expect(sanityAccepts(-5, false, 'combat_power')).toBe(false)
    expect(sanityAccepts(100_000_000, false, 'combat_power')).toBe(true) // override max 1e8
    expect(sanityAccepts(100_000_001, false, 'combat_power')).toBe(false)
  })

  it('positive-only overrides reject negatives (aspd et al.)', () => {
    expect(sanityAccepts(-1, false, 'aspd')).toBe(false)
    expect(sanityAccepts(421, false, 'aspd')).toBe(true)
  })

  it('percentual default is generous for damage mods', () => {
    expect(sanityAccepts(2000, true, 'dmg_vs_demon')).toBe(true)
    expect(sanityAccepts(9000, true, 'dmg_vs_demon')).toBe(false)
  })

  it('unknown stat keys fall to the correct default by the percentual flag', () => {
    expect(sanityAccepts(2000, true, 'not_a_catalog_stat')).toBe(true)
    expect(sanityAccepts(6000, true, 'not_a_catalog_stat')).toBe(false)
    expect(sanityAccepts(99_000_000, false, 'not_a_catalog_stat')).toBe(true)
    expect(sanityAccepts(-200_000, false, 'not_a_catalog_stat')).toBe(false)
    expect(sanityAccepts(-500, true, 'not_a_catalog_stat')).toBe(true) // pct default min -1000
  })
})
