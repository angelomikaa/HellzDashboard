// Phase 10.5 (0046): the two pure anti-cheat helpers.
import { describe, expect, it } from 'vitest'
import type { DefenseBaseline, StatCatalogEntry } from '../../lib/api'
import {
  DEFENSE_SPIKE_RATIO,
  OVR_SWING_POINTS,
  buildProvenance,
  defenseSpikeWarnings,
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
  { stat_key: 'rpdef', average: 4000, sample_size: 5 },
  { stat_key: 'equip_pdef_pct', average: 20, sample_size: 4 },
  { stat_key: 'rmdef', average: 0, sample_size: 3 },
]

describe('defenseSpikeWarnings', () => {
  it('flags values at or above 1.5x the cohort average', () => {
    const warnings = defenseSpikeWarnings(
      catalog,
      { rpdef: '6000', equip_pdef_pct: '30' },
      baselines,
    )
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toMatchObject({
      stat_key: 'rpdef',
      label: 'RPDEF',
      value: 6000,
      baseline: 4000,
      ratio: DEFENSE_SPIKE_RATIO,
      sample_size: 5,
    })
    expect(warnings[1]).toMatchObject({
      stat_key: 'equip_pdef_pct',
      value_type: 'percentual',
      ratio: 1.5,
    })
  })

  it('uses the exact >= boundary and ignores values just below it', () => {
    expect(
      defenseSpikeWarnings(catalog, { rpdef: '5999' }, baselines).map((w) => w.stat_key),
    ).toEqual([])
    expect(
      defenseSpikeWarnings(catalog, { rpdef: '6000' }, baselines).map((w) => w.stat_key),
    ).toEqual(['rpdef'])
  })

  it('skips non-positive averages, missing baselines and unparseable values', () => {
    expect(defenseSpikeWarnings(catalog, { rmdef: '9999' }, baselines)).toEqual([])
    expect(defenseSpikeWarnings(catalog, { rpdef: 'abc' }, baselines)).toEqual([])
    expect(defenseSpikeWarnings(catalog, { equip_mdef_pct: '99' }, baselines)).toEqual([])
  })

  it('reads pt-BR thousands separators from the inputs', () => {
    const [warning] = defenseSpikeWarnings(catalog, { rpdef: '6.000' }, baselines)
    expect(warning.value).toBe(6000)
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
  it('matches the server constants (0046)', () => {
    expect(DEFENSE_SPIKE_RATIO).toBe(1.5)
    expect(OVR_SWING_POINTS).toBe(8)
  })
})
