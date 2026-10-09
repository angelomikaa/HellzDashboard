// Wizard core logic tests (plan 02-03 task 1, TDD RED).
// Pure functions only — vitest runs node-env (no DOM), per the house pattern
// in ../auth/session.test.ts. Behavior source: 02-03-PLAN <behavior> +
// 02-RESEARCH §6 P2D-C (General+Quasi required, Special optional, combat_power
// special-cased optional).
import { describe, expect, it } from 'vitest'
import type { StatCatalogEntry } from '../../lib/api'
import { buildStatsPayload, groupComplete, REQUIRED_GROUPS, type GroupInputs } from './wizard'

// Minimal fixture catalog mirroring the real 57-stat catalog's shape:
// combat_power lives in 'general', each group mixes flat/percentual entries.
const CATALOG: StatCatalogEntry[] = [
  { stat_key: 'combat_power', label: 'Poder de Combate', group_name: 'general', value_type: 'flat' },
  { stat_key: 'hp', label: 'HP', group_name: 'general', value_type: 'flat' },
  { stat_key: 'patk', label: 'PATK', group_name: 'general', value_type: 'flat' },
  { stat_key: 'aspd', label: 'ASPD', group_name: 'quasi', value_type: 'flat' },
  { stat_key: 'crit', label: 'CRIT', group_name: 'quasi', value_type: 'percentual' },
  { stat_key: 'variable_ct_pct', label: 'CT Variável', group_name: 'quasi', value_type: 'percentual' },
  { stat_key: 'max_sp_pct', label: 'SP Máx.', group_name: 'special', value_type: 'percentual' },
  { stat_key: 'dmg_vs_small', label: 'Dano vs Pequeno', group_name: 'special', value_type: 'percentual' },
]

describe('REQUIRED_GROUPS (P2D-C: General+Quasi required, Special optional)', () => {
  it('is exactly general + quasi, in that order', () => {
    expect([...REQUIRED_GROUPS]).toEqual(['general', 'quasi'])
  })
})

describe('groupComplete', () => {
  it('general is false while any required field is blank', () => {
    const inputs: GroupInputs = { combat_power: '100', patk: '50' } // hp blank
    expect(groupComplete(CATALOG, 'general', inputs)).toBe(false)
  })

  it('general is false when a required field is filled but unparseable', () => {
    const inputs: GroupInputs = { combat_power: '100', hp: 'abc', patk: '50' }
    expect(groupComplete(CATALOG, 'general', inputs)).toBe(false)
  })

  it('general is true when every required field parses (combat_power may stay blank)', () => {
    const inputs: GroupInputs = { hp: '99.716', patk: '4.521' }
    expect(groupComplete(CATALOG, 'general', inputs)).toBe(true)
  })

  it('general is false when combat_power is filled but unparseable', () => {
    const inputs: GroupInputs = { combat_power: 'xx', hp: '1', patk: '2' }
    expect(groupComplete(CATALOG, 'general', inputs)).toBe(false)
  })

  it('quasi is true only when all quasi fields parse', () => {
    expect(
      groupComplete(CATALOG, 'quasi', { aspd: '193', crit: '12,34%', variable_ct_pct: '-33,38%' }),
    ).toBe(true)
    expect(
      groupComplete(CATALOG, 'quasi', { aspd: '193', crit: '12,34%' }), // variable_ct_pct blank
    ).toBe(false)
  })

  it('special is true even with all blanks', () => {
    expect(groupComplete(CATALOG, 'special', {})).toBe(true)
    expect(groupComplete(CATALOG, 'special', { max_sp_pct: '', dmg_vs_small: '' })).toBe(true)
  })

  it('special is false when a filled field does not parse', () => {
    expect(groupComplete(CATALOG, 'special', { max_sp_pct: 'zzz' })).toBe(false)
  })
})

describe('buildStatsPayload', () => {
  it('returns canonical numbers for exactly the stats with a parseable value (pt-BR forms)', () => {
    const inputs: GroupInputs = {
      combat_power: '1.234.567', // pt-BR thousands -> 1234567
      hp: '99.716', // single dot, 3-digit tail -> thousands
      patk: '4.521',
      aspd: '193',
      crit: '12,34%', // comma decimal + % -> 12.34
      variable_ct_pct: '-33,38%', // negative is real data -> -33.38
      max_sp_pct: '10,5%',
      // dmg_vs_small intentionally blank -> omitted
    }
    const result = buildStatsPayload(CATALOG, inputs)
    expect(result).toEqual({
      ok: true,
      stats: [
        { stat_key: 'combat_power', value: 1234567 },
        { stat_key: 'hp', value: 99716 },
        { stat_key: 'patk', value: 4521 },
        { stat_key: 'aspd', value: 193 },
        { stat_key: 'crit', value: 12.34 },
        { stat_key: 'variable_ct_pct', value: -33.38 },
        { stat_key: 'max_sp_pct', value: 10.5 },
      ],
    })
  })

  it('payload values are numbers only — no strings, no % anywhere', () => {
    const inputs: GroupInputs = {
      hp: '99.716',
      patk: '4.521',
      aspd: '193',
      crit: '12,34%',
      variable_ct_pct: '-33,38%',
      max_sp_pct: '10,5%',
    }
    const result = buildStatsPayload(CATALOG, inputs)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    for (const s of result.stats) {
      expect(typeof s.value).toBe('number')
      expect(Number.isFinite(s.value)).toBe(true)
    }
    expect(JSON.stringify(result)).not.toContain('%')
  })

  it('includes combat_power when provided and omits it when blank', () => {
    const base: GroupInputs = {
      hp: '1',
      patk: '2',
      aspd: '3',
      crit: '4',
      variable_ct_pct: '-5,5%',
    }
    const withCp = buildStatsPayload(CATALOG, { ...base, combat_power: '123.456' })
    expect(withCp.ok).toBe(true)
    if (withCp.ok) {
      expect(withCp.stats).toContainEqual({ stat_key: 'combat_power', value: 123456 })
    }
    const withoutCp = buildStatsPayload(CATALOG, { ...base })
    expect(withoutCp.ok).toBe(true)
    if (withoutCp.ok) {
      expect(withoutCp.stats.map((s) => s.stat_key)).not.toContain('combat_power')
    }
  })

  it('rejects with the missing required stat labels when a required field is blank or unparseable', () => {
    const result = buildStatsPayload(CATALOG, { hp: '99.716', patk: 'abc' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // hp parses; patk is invalid; all quasi fields blank; combat_power optional.
      expect(result.missingRequired).toEqual(['PATK', 'ASPD', 'CRIT', 'CT Variável'])
    }
  })

  it('omits unparseable optional values instead of rejecting (blank = not captured)', () => {
    const inputs: GroupInputs = {
      hp: '1',
      patk: '2',
      aspd: '3',
      crit: '4',
      variable_ct_pct: '-5,5%',
      max_sp_pct: 'zzz', // special group: optional -> dropped, not fatal
    }
    const result = buildStatsPayload(CATALOG, inputs)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.stats.map((s) => s.stat_key)).not.toContain('max_sp_pct')
    }
  })
})
