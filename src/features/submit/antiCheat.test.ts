// Phase 10.5 (0046): the two pure anti-cheat helpers.
import { describe, expect, it } from 'vitest'
import type { DefenseBaseline, StatCatalogEntry } from '../../lib/api'
import {
  DEFENSE_MIN_SAMPLE,
  DEFENSE_SIGMA_THRESHOLD,
  OVR_SWING_POINTS,
  buildProvenance,
  defenseCurveWarnings,
  provenanceInputKeys,
} from './antiCheat'

const catalog = [
  { stat_key: 'rpdef', label: 'RPDEF', group_name: 'special', value_type: 'flat' },
  { stat_key: 'rmdef', label: 'RMDEF', group_name: 'special', value_type: 'flat' },
  { stat_key: 'equip_pdef_pct', label: 'Equip. PDEF %', group_name: 'special', value_type: 'percentual' },
  { stat_key: 'equip_mdef_pct', label: 'Equip. MDEF %', group_name: 'special', value_type: 'percentual' },
  { stat_key: 'pdef', label: 'PDEF', group_name: 'general', value_type: 'flat' },
] as StatCatalogEntry[]

const baselines: DefenseBaseline[] = [
  // scale = max(1.4826*100, 5% of 4000, 1) = 200 -> z 3.5 at 4700.
  { stat_key: 'rpdef', average: 4000, median: 4000, mad: 100, sample_size: 5 },
  // scale = max(1.4826*5, 1, 1) = 7.413 -> z 3.5 at ~45.95.
  { stat_key: 'equip_pdef_pct', average: 20, median: 20, mad: 5, sample_size: 6 },
  // Below the n >= 5 curve gate.
  { stat_key: 'rmdef', average: 1000, median: 1000, mad: 50, sample_size: 4 },
  // Degenerate median/MAD never produce a sigma.
  { stat_key: 'equip_mdef_pct', average: 0, median: 0, mad: 0, sample_size: 6 },
]

describe('defenseCurveWarnings', () => {
  it('flags values at or above 3.5 sigma from the cohort median', () => {
    const warnings = defenseCurveWarnings(
      catalog,
      { rpdef: '4700', equip_pdef_pct: '46' },
      baselines,
    )
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toMatchObject({
      stat_key: 'rpdef',
      label: 'RPDEF',
      value: 4700,
      median: 4000,
      mad: 100,
      z: DEFENSE_SIGMA_THRESHOLD,
      sample_size: 5,
    })
    expect(warnings[1]).toMatchObject({
      stat_key: 'equip_pdef_pct',
      value_type: 'percentual',
    })
    expect(warnings[1].z).toBeGreaterThanOrEqual(DEFENSE_SIGMA_THRESHOLD)
  })

  it('uses the exact >= boundary and ignores values just below it', () => {
    expect(
      defenseCurveWarnings(catalog, { rpdef: '4699' }, baselines).map((w) => w.stat_key),
    ).toEqual([])
    expect(
      defenseCurveWarnings(catalog, { rpdef: '4700' }, baselines).map((w) => w.stat_key),
    ).toEqual(['rpdef'])
  })

  it('skips small cohorts, degenerate medians/MADs and unparseable values', () => {
    expect(defenseCurveWarnings(catalog, { rmdef: '999999' }, baselines)).toEqual([])
    expect(defenseCurveWarnings(catalog, { equip_mdef_pct: '999' }, baselines)).toEqual([])
    expect(defenseCurveWarnings(catalog, { rpdef: 'abc' }, baselines)).toEqual([])
  })

  it('reads pt-BR thousands separators from the inputs', () => {
    const [warning] = defenseCurveWarnings(catalog, { rpdef: '4.700' }, baselines)
    expect(warning.value).toBe(4700)
    expect(warning.z).toBe(3.5)
  })
})

describe('buildProvenance', () => {
  it('marks unchanged OCR reads as ocr and edits as ocr_edited', () => {
    const out = buildProvenance(
      { pdef: '4.100', crit: '10' },
      { pdef: '4.100', crit: '12' },
      ['pdef', 'crit'],
    )
    expect(out).toEqual([
      { input_key: 'pdef', source: 'ocr', ocr_value: 4100, final_value: 4100 },
      { input_key: 'crit', source: 'ocr_edited', ocr_value: 10, final_value: 12 },
    ])
  })

  it('omits inputs that were never OCR-filled', () => {
    const out = buildProvenance({ pdef: '100' }, { pdef: '100', crit: '10' }, ['pdef', 'crit'])
    expect(out.map((e) => e.input_key)).toEqual(['pdef'])
  })

  it('treats a numerically identical retype as ocr, not an edit', () => {
    const [entry] = buildProvenance({ rpdef: '1.234' }, { rpdef: '1234' }, ['rpdef'])
    expect(entry.source).toBe('ocr')
  })

  it('tracks the transient equipment tooltip inputs', () => {
    const [entry] = buildProvenance(
      { equip_pdef_raw: '5.000' },
      { equip_pdef_raw: '6.200' },
      ['equip_pdef_raw'],
    )
    expect(entry).toEqual({
      input_key: 'equip_pdef_raw',
      source: 'ocr_edited',
      ocr_value: 5000,
      final_value: 6200,
    })
  })

  it('drops entries whose final value no longer parses', () => {
    expect(buildProvenance({ pdef: '100' }, { pdef: '' }, ['pdef'])).toEqual([])
    expect(buildProvenance({ pdef: '???' }, { pdef: '100' }, ['pdef'])).toEqual([])
  })
})

describe('provenanceInputKeys', () => {
  it('covers every catalog key plus the two equipment inputs', () => {
    const keys = provenanceInputKeys(catalog)
    expect(keys).toContain('pdef')
    expect(keys).toContain('equip_pdef_raw')
    expect(keys).toContain('equip_mdef_raw')
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('locked thresholds', () => {
  it('matches the server curve constants (0050)', () => {
    expect(DEFENSE_SIGMA_THRESHOLD).toBe(3.5)
    expect(DEFENSE_MIN_SAMPLE).toBe(5)
    expect(OVR_SWING_POINTS).toBe(8)
  })
})
