// Wizard core logic tests (plan 02-03 task 1; realigned by 05-03 task 1, TDD RED).
// Pure functions only — vitest runs node-env (no DOM), per the house pattern
// in ../auth/session.test.ts. Behavior source: 05-03-PLAN <behavior> + D-07:
// Especial is required exactly like Geral/Quasi and combat_power is the only
// optional stat (supersedes the Phase 2 P2D-C Special-optional rule).
import { describe, expect, it } from 'vitest'
import type { StatCatalogEntry } from '../../lib/api'
import { buildStatsPayload, groupComplete, REQUIRED_GROUPS, type GroupInputs } from './wizard'

// Minimal fixture catalog mirroring the real 57-stat catalog's shape:
// combat_power lives in 'general', each group mixes flat/percentual entries.
const CATALOG: StatCatalogEntry[] = [
  { stat_key: 'combat_power', label: 'Poder de Combate', label_short: 'PCB', group_name: 'general', value_type: 'flat' },
  { stat_key: 'hp', label: 'HP', label_short: 'HP', group_name: 'general', value_type: 'flat' },
  { stat_key: 'patk', label: 'PATK', label_short: 'PAT', group_name: 'general', value_type: 'flat' },
  { stat_key: 'aspd', label: 'ASPD', label_short: 'ASP', group_name: 'quasi', value_type: 'flat' },
  { stat_key: 'crit', label: 'CRIT', label_short: 'CRT', group_name: 'quasi', value_type: 'percentual' },
  { stat_key: 'variable_ct_pct', label: 'CT Variável', label_short: 'CVP', group_name: 'quasi', value_type: 'percentual' },
  { stat_key: 'max_sp_pct', label: 'SP Máx.', label_short: 'SPM', group_name: 'special', value_type: 'percentual' },
  { stat_key: 'dmg_vs_small', label: 'Dano vs Pequeno', label_short: 'DVP', group_name: 'special', value_type: 'percentual' },
]

// Every required group filled except combat_power (the only optional stat).
const ALL_REQUIRED_FILLED: GroupInputs = {
  hp: '1',
  patk: '2',
  aspd: '3',
  crit: '4',
  variable_ct_pct: '-5,5%',
  max_sp_pct: '10,5%',
  dmg_vs_small: '50%',
}

describe('REQUIRED_GROUPS (D-07: General+Quasi+Especial required; combat_power the only optional stat)', () => {
  it('is exactly general + quasi + special, in that order', () => {
    expect([...REQUIRED_GROUPS]).toEqual(['general', 'quasi', 'special'])
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

  it('special is false while any Especial field is blank (D-07)', () => {
    expect(groupComplete(CATALOG, 'special', {})).toBe(false)
    expect(groupComplete(CATALOG, 'special', { max_sp_pct: '10,5%', dmg_vs_small: '' })).toBe(false)
  })

  it('special is true when every Especial field parses (valid pt-BR forms)', () => {
    expect(groupComplete(CATALOG, 'special', { max_sp_pct: '10,5%', dmg_vs_small: '50%' })).toBe(
      true,
    )
  })

  it('special is false when a typed Especial value is unparseable', () => {
    expect(groupComplete(CATALOG, 'special', { max_sp_pct: 'abc', dmg_vs_small: '50%' })).toBe(
      false,
    )
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
      dmg_vs_small: '50%',
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
        { stat_key: 'dmg_vs_small', value: 50 },
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
      dmg_vs_small: '50%',
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

  it('with every group filled, a blank combat_power still yields ok and is omitted (optional entries drop when blank)', () => {
    const withCp = buildStatsPayload(CATALOG, { ...ALL_REQUIRED_FILLED, combat_power: '123.456' })
    expect(withCp.ok).toBe(true)
    if (withCp.ok) {
      expect(withCp.stats).toContainEqual({ stat_key: 'combat_power', value: 123456 })
    }
    const withoutCp = buildStatsPayload(CATALOG, { ...ALL_REQUIRED_FILLED })
    expect(withoutCp.ok).toBe(true)
    if (withoutCp.ok) {
      expect(withoutCp.stats.map((s) => s.stat_key)).not.toContain('combat_power')
    }
  })

  it('rejects with the Especial stat LABEL when an Especial field is blank (D-07)', () => {
    const inputs: GroupInputs = {
      hp: '1',
      patk: '2',
      aspd: '3',
      crit: '4',
      variable_ct_pct: '-5,5%',
      max_sp_pct: '10,5%',
      // dmg_vs_small intentionally blank -> required now (D-07)
    }
    expect(buildStatsPayload(CATALOG, inputs)).toEqual({
      ok: false,
      missingRequired: ['Dano vs Pequeno'],
    })
  })

  it('rejects with the missing required stat labels when a required field is blank or unparseable', () => {
    const result = buildStatsPayload(CATALOG, { hp: '99.716', patk: 'abc' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // hp parses; patk is invalid; all quasi AND Especial fields blank; combat_power optional.
      expect(result.missingRequired).toEqual([
        'PATK',
        'ASPD',
        'CRIT',
        'CT Variável',
        'SP Máx.',
        'Dano vs Pequeno',
      ])
    }
  })

  it('drops an unparseable combat_power (the only optional stat) but rejects an unparseable Especial value', () => {
    // Optional + unparseable -> dropped, never stored (blank = not captured).
    const withBadCp = buildStatsPayload(CATALOG, { ...ALL_REQUIRED_FILLED, combat_power: 'zzz' })
    expect(withBadCp.ok).toBe(true)
    if (withBadCp.ok) {
      expect(withBadCp.stats.map((s) => s.stat_key)).not.toContain('combat_power')
    }
    // Required (D-07) + unparseable -> rejected with the stat label.
    expect(buildStatsPayload(CATALOG, { ...ALL_REQUIRED_FILLED, max_sp_pct: 'zzz' })).toEqual({
      ok: false,
      missingRequired: ['SP Máx.'],
    })
  })
})
