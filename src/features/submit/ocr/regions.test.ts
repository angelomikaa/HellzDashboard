// Region-map scaling + group-trimming tests (plan 05-01 task 1, TDD RED).
// Pure functions only — vitest runs node-env (no DOM), per the house pattern
// in ../auth/session.test.ts. Behavior source: 05-01-PLAN <behavior> +
// 05-RESEARCH §2 (canonical groups, trimming decision, conversion formula).
import { describe, expect, it } from 'vitest'
import { CAPTURES, GAME_UI_VERSION, rectToPixels, type PctRect } from './regions'

// The 57-stat catalog copied from supabase/seeds/stat_catalog.sql — the
// ground truth for the generator's group-trimming filter: every shipped
// region key must exist in the catalog AND belong to its capture's group.
const GENERAL_STATS = [
  'combat_power',
  'hp',
  'sp',
  'patk',
  'pdef',
  'matk',
  'mdef',
  'refine_patk',
  'refine_pdef',
  'refine_matk',
  'refine_mdef',
  'hp_recover',
  'sp_recover',
  'hit',
  'flee',
]
const QUASI_STATS = [
  'aspd',
  'mspd',
  'variable_ct',
  'variable_ct_pct',
  'fixed_ct',
  'fixed_ct_pct',
  'healing_done',
  'healing_taken',
  'crit',
  'crit_res',
  'crit_dmg',
  'crit_dmg_res',
  'pdmg',
  'pdmg_r',
  'mdmg',
  'mdmg_r',
  'ignore_pdef',
  'ignore_pdef_pct',
  'ignore_mdef',
  'ignore_mdef_pct',
  'pdmg_bonus',
  'mdmg_bonus',
  'pve_dmg_reduction',
  'pve_dmg_bonus',
  'pvp_dmg_reduction',
  'pvp_dmg_bonus',
]
const SPECIAL_STATS = [
  'max_sp_pct',
  'equip_patk_pct',
  'equip_matk_pct',
  'equip_pdef_pct',
  'equip_mdef_pct',
  'global_cd_pct',
  'dmg_vs_small',
  'dmg_vs_medium',
  'dmg_vs_large',
  'dmg_vs_brute',
  'dmg_vs_demi_human',
  'dmg_reduction_vs_small',
  'dmg_reduction_vs_medium',
  'dmg_reduction_vs_large',
  'dmg_reduction_vs_brute',
  'dmg_reduction_vs_demi_human',
]
const CATALOG = new Set([...GENERAL_STATS, ...QUASI_STATS, ...SPECIAL_STATS])

describe('rectToPixels', () => {
  it('scales a pct rect to a pixel rect (D-01)', () => {
    expect(rectToPixels({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 1000, 500)).toEqual({
      x: 100,
      y: 100,
      w: 300,
      h: 200,
    })
  })

  it('rounds without clamping when the rect lands inside the image', () => {
    // The plan's illustrative input: x = 0.99 * 200 = 198 (in bounds), so x is
    // NOT clamped; w = 100 shrinks only to the remaining width 200 - 198 = 2.
    expect(rectToPixels({ x: 0.99, y: 0.5, w: 0.5, h: 0.5 }, 200, 100)).toEqual({
      x: 198,
      y: 50,
      w: 2,
      h: 50,
    })
  })

  it('clamps x to the last pixel column and shrinks w to the remaining width', () => {
    // x lands ON the last column (199 of 200); w then clamps to 200 - 199 = 1
    // — the plan's stated clamp outcome.
    expect(rectToPixels({ x: 0.995, y: 0, w: 0.5, h: 0.5 }, 200, 100)).toEqual({
      x: 199,
      y: 0,
      w: 1,
      h: 50,
    })
  })

  it('keeps w and h at least 1px on degenerate rects', () => {
    expect(rectToPixels({ x: 0.5, y: 0.5, w: 0.0001, h: 0.0001 }, 100, 100)).toEqual({
      x: 50,
      y: 50,
      w: 1,
      h: 1,
    })
  })

  // The generator's exact conversion formula (05-RESEARCH §2):
  // pct = round((pixel / refDim) * 10000) / 10000, per axis.
  const toPct = (pixel: number, refDim: number): number =>
    Math.round((pixel / refDim) * 10000) / 10000
  const toPctRect = (
    rect: { x: number; y: number; w: number; h: number },
    ref: { width: number; height: number },
  ): PctRect => ({
    x: toPct(rect.x, ref.width),
    y: toPct(rect.y, ref.height),
    w: toPct(rect.w, ref.width),
    h: toPct(rect.h, ref.height),
  })

  it.each([
    // [spike pixel rect, reference resolution] — canonical samples only
    [{ x: 390, y: 358, w: 88, h: 30 }, { width: 691, height: 416 }], // sampbasic combat_power
    [{ x: 193, y: 151, w: 78, h: 30 }, { width: 648, height: 759 }], // sampideal1 hp
    [{ x: 218, y: 714, w: 70, h: 31 }, { width: 673, height: 759 }], // sampideal2 pvp_dmg_reduction
    [{ x: 472, y: 742, w: 93, h: 31 }, { width: 649, height: 782 }], // sampideal3 dmg_reduction_vs_demi_human
  ])('round-trips spike pixel rect %# within ±1px at the reference resolution', (rect, ref) => {
    const back = rectToPixels(toPctRect(rect, ref), ref.width, ref.height)
    expect(Math.abs(back.x - rect.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.y - rect.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.w - rect.w)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.h - rect.h)).toBeLessThanOrEqual(1)
  })
})

describe('CAPTURES (group-trimmed spike calibration)', () => {
  it('ships exactly the four wizard captures', () => {
    expect(Object.keys(CAPTURES).sort()).toEqual(['basic', 'general', 'quasi', 'special'])
  })

  it('basic keeps EXACTLY one region: combat_power (D-06 header fields dropped)', () => {
    expect(CAPTURES.basic.regions.map((r) => r.stat_key)).toEqual(['combat_power'])
  })

  it('general has 14 regions, all in the general group — the 10 shared quasi rows are trimmed', () => {
    const keys = CAPTURES.general.regions.map((r) => r.stat_key)
    expect(keys).toHaveLength(14)
    const quasi = new Set(QUASI_STATS)
    for (const key of keys) {
      expect(quasi.has(key)).toBe(false)
      expect(GENERAL_STATS).toContain(key)
    }
  })

  it('quasi has 26 regions, all in the quasi group', () => {
    const keys = CAPTURES.quasi.regions.map((r) => r.stat_key)
    expect(keys).toHaveLength(26)
    for (const key of keys) expect(QUASI_STATS).toContain(key)
  })

  it('special has 15 regions, all in the special group, without dmg_vs_demi_human', () => {
    const keys = CAPTURES.special.regions.map((r) => r.stat_key)
    expect(keys).toHaveLength(15)
    expect(keys).not.toContain('dmg_vs_demi_human')
    for (const key of keys) expect(SPECIAL_STATS).toContain(key)
  })

  it('every shipped region stat_key is a catalog stat (57 total)', () => {
    expect(CATALOG.size).toBe(57) // guard the fixture itself
    for (const capture of Object.values(CAPTURES)) {
      for (const region of capture.regions) {
        expect(CATALOG.has(region.stat_key)).toBe(true)
      }
    }
  })

  it('carries the reference aspect per capture (rounded to 4 decimals)', () => {
    expect(CAPTURES.basic.aspect).toBeCloseTo(691 / 416, 3)
    expect(CAPTURES.general.aspect).toBeCloseTo(648 / 759, 3)
    expect(CAPTURES.quasi.aspect).toBeCloseTo(673 / 759, 3)
    expect(CAPTURES.special.aspect).toBeCloseTo(649 / 782, 3)
  })

  it('tags a single active game UI version (D-21)', () => {
    expect(GAME_UI_VERSION).toBe('ro-origin-ui-2026-10')
  })
})
