import { describe, expect, it } from 'vitest'
import { formatStatValue, parseStatValue } from './parseStatValue'

// Plan 02-01 task 3: parse rules ported VERBATIM from scripts/ocr-spike.mjs
// parseValue (Phase 1 OCR spike, owner-validated). Manual entry in Phase 2 and
// OCR output in Phase 5 must normalize identically — these are the same test
// shapes the spike proved against real guild screenshots.
const fail = { ok: false, value: null, isPercentual: false }

describe('parseStatValue (pt-BR rules, spike-identical)', () => {
  it("parses '99.716' -> ok, 99716, not percentual", () => {
    expect(parseStatValue('99.716')).toEqual({ ok: true, value: 99716, isPercentual: false })
  })

  it("parses '1.234.567' -> ok, 1234567 (multiple dots = thousands)", () => {
    expect(parseStatValue('1.234.567')).toEqual({ ok: true, value: 1234567, isPercentual: false })
  })

  it("parses '1.234.567,89' -> ok, 1234567.89 (mixed separators)", () => {
    expect(parseStatValue('1.234.567,89')).toEqual({ ok: true, value: 1234567.89, isPercentual: false })
  })

  it("parses '12,34%' -> ok, 12.34, percentual", () => {
    expect(parseStatValue('12,34%')).toEqual({ ok: true, value: 12.34, isPercentual: true })
  })

  it("parses '-33,38%' -> ok, -33.38, percentual (negative % stats are real)", () => {
    expect(parseStatValue('-33,38%')).toEqual({ ok: true, value: -33.38, isPercentual: true })
  })

  it("parses '1.234' -> ok, 1234 (3-digit tail = pt-BR thousands)", () => {
    expect(parseStatValue('1.234')).toEqual({ ok: true, value: 1234, isPercentual: false })
  })

  it("parses '12.34' -> ok, 12.34 (short tail = decimal)", () => {
    expect(parseStatValue('12.34')).toEqual({ ok: true, value: 12.34, isPercentual: false })
  })

  it("parses '16' -> ok, 16", () => {
    expect(parseStatValue('16')).toEqual({ ok: true, value: 16, isPercentual: false })
  })

  it("fails on '' (empty)", () => {
    expect(parseStatValue('')).toEqual(fail)
  })

  it("fails on 'abc' (non-numeric)", () => {
    expect(parseStatValue('abc')).toEqual(fail)
  })

  it("fails on '1,2,3' (not the single-comma shape)", () => {
    expect(parseStatValue('1,2,3')).toEqual(fail)
  })
})

describe('formatStatValue (pt-BR display)', () => {
  it("formats 1234567 flat -> '1.234.567'", () => {
    expect(formatStatValue(1234567, 'flat')).toBe('1.234.567')
  })

  it("formats 12.34 percentual -> '12,34%'", () => {
    expect(formatStatValue(12.34, 'percentual')).toBe('12,34%')
  })

  it("formats -33.38 percentual -> '-33,38%'", () => {
    expect(formatStatValue(-33.38, 'percentual')).toBe('-33,38%')
  })
})
