// Raw defense calculation tests (Phase 9.1, DEF-03).
// Pure functions — vitest node-env (no DOM).
import { describe, expect, it } from 'vitest'
import { computeRawDefense, rawDefensesComplete, withDerivedDefenses } from './rawDefense'

describe('computeRawDefense — floor(equipment / (1 + pct / 100))', () => {
  it('computes raw defense from equipment + pct', () => {
    // 4913 / 1.294 = 3796.75... -> floor 3796
    expect(computeRawDefense('4913', '29.40%')).toBe(3796)
  })

  it('handles dot-thousands equipment read (4.913 -> 4913)', () => {
    expect(computeRawDefense('4.913', '29.40%')).toBe(3796)
  })

  it('pct 0% returns the equipment value unchanged', () => {
    expect(computeRawDefense('4913', '0%')).toBe(4913)
  })

  it('blank equipment -> null', () => {
    expect(computeRawDefense('', '29.40%')).toBeNull()
  })

  it('blank pct -> null', () => {
    expect(computeRawDefense('4913', '')).toBeNull()
  })

  it('negative equipment -> null', () => {
    expect(computeRawDefense('-100', '10%')).toBeNull()
  })

  it('pct -100% (denominator 0) -> null', () => {
    expect(computeRawDefense('4913', '-100%')).toBeNull()
  })

  it('pct below -100% (negative denominator) -> null', () => {
    expect(computeRawDefense('4913', '-150%')).toBeNull()
  })

  it('equipment 0 with valid pct -> 0', () => {
    expect(computeRawDefense('0', '29.40%')).toBe(0)
  })
})

describe('withDerivedDefenses — merges computed raw stats into inputs', () => {
  it('sets rpdef/rmdef strings when computable', () => {
    const out = withDerivedDefenses({
      equip_pdef_raw: '4913',
      equip_pdef_pct: '29.40%',
      equip_mdef_raw: '1564',
      equip_mdef_pct: '17.40%',
    })
    // rpdef: floor(4913/1.294)=3796 ; rmdef: floor(1564/1.174)=1332
    expect(out.rpdef).toBe('3796')
    expect(out.rmdef).toBe('1332')
  })

  it('leaves raw stats blank when inputs missing', () => {
    const out = withDerivedDefenses({ equip_pdef_raw: '4913' })
    expect(out.rpdef).toBe('')
    expect(out.rmdef).toBe('')
  })

  it('does not carry equipment keys into the catalog payload shape', () => {
    const out = withDerivedDefenses({
      equip_pdef_raw: '4913',
      equip_pdef_pct: '29.40%',
    })
    expect(out.rpdef).toBe('3796')
    // equipment keys preserved as inputs but raw is the derived catalog stat
    expect(out.equip_pdef_raw).toBe('4913')
  })
})

describe('rawDefensesComplete', () => {
  it('true when both raw stats present and parseable', () => {
    expect(
      rawDefensesComplete({ rpdef: '3796', rmdef: '1332' }),
    ).toBe(true)
  })

  it('false when a raw stat is blank or unparseable', () => {
    expect(rawDefensesComplete({ rpdef: '', rmdef: '1332' })).toBe(false)
    expect(rawDefensesComplete({ rpdef: '3796', rmdef: 'abc' })).toBe(false)
    expect(rawDefensesComplete({})).toBe(false)
  })
})
