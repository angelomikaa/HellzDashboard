// Tooltip line parser tests (Phase 9.1, DEF-02).
// Pure function — vitest node-env (no DOM).
import { describe, expect, it } from 'vitest'
import { parseTooltipValue } from './tooltip'

describe('parseTooltipValue — extract value from "Equipment PDEF/MDEF" line', () => {
  it('reads an integer value after the colon', () => {
    expect(parseTooltipValue('Equipment PDEF:4913')).toBe('4913')
  })

  it('reads an integer value with pt-BR thousands dot', () => {
    expect(parseTooltipValue('Equipment PDEF:4.913')).toBe('4.913')
  })

  it('reads MDEF value', () => {
    expect(parseTooltipValue('Equipment MDEF:1564')).toBe('1564')
  })

  it('tolerates a space after the colon', () => {
    expect(parseTooltipValue('Equipment PDEF: 4913')).toBe('4913')
  })

  it('returns null when there is no numeric token', () => {
    expect(parseTooltipValue('Equipment PDEF')).toBeNull()
    expect(parseTooltipValue('Base PDEF:134')).toBe('134') // line itself has digits; label check excludes it upstream
    expect(parseTooltipValue('')).toBeNull()
    expect(parseTooltipValue('Reduces your PDMG taken.')).toBeNull()
  })
})
