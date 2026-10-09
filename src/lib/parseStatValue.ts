// NeoFoot pt-BR stat value parsing/formatting (plan 02-01).
//
// parseStatValue is a RULE-FOR-RULE TypeScript port of parseValue from
// scripts/ocr-spike.mjs (Phase 1 OCR spike, owner-validated on real guild
// screenshots). Change NOTHING in the rules: Phase 2 manual entry and Phase 5
// OCR output must normalize identically.

export interface StatParseResult {
  ok: boolean
  value: number | null
  isPercentual: boolean
}

const fail: StatParseResult = { ok: false, value: null, isPercentual: false }

/**
 * Parse one raw stat string honoring the game's Portuguese locale:
 * `.` groups thousands (`1.234.567`), `,` marks decimals (`12,34`), and a
 * trailing `%` marks a percentual stat. Negative values are real
 * (Variable/Fixed CT, Global CD).
 *
 * Rules (spike-identical):
 *  - trim; strip trailing `%` and record it as percentual
 *  - strip leading `-` and record it as negative
 *  - charset `[\d.,]+` only
 *  - mixed separators: `\d{1,3}(\.\d{3})+,\d+` (pt-BR full form)
 *  - single comma: `\d+,\d+` -> decimal
 *  - multiple dots: `\d{1,3}(\.\d{3})+` -> thousands groups
 *  - single dot: 3-digit tail = pt-BR thousands (`1.234` -> 1234),
 *    anything shorter = decimal (`12.34` -> 12.34)
 *  - anything else fails: `{ ok: false, value: null, isPercentual: false }`
 */
export function parseStatValue(raw: string): StatParseResult {
  if (typeof raw !== 'string') return { ...fail }
  let s = raw.trim()
  if (s === '') return { ...fail }

  let isPercentual = false
  if (s.endsWith('%')) {
    isPercentual = true
    s = s.slice(0, -1).trim()
  }
  if (s === '') return { ...fail }

  // Negative values exist in real data (Variable CT, Fixed CT, Global CD).
  let isNegative = false
  if (s.startsWith('-')) {
    isNegative = true
    s = s.slice(1)
  }
  if (s === '') return { ...fail }
  if (!/^[\d.,]+$/.test(s)) return { ...fail }

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')

  if (hasDot && hasComma) {
    // Mixed separators (pt-BR full form): dots group thousands, comma is decimal.
    if (!/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return { ...fail }
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    // Comma decimal only in the `\d+,\d+` single-comma shape (per spike).
    if (!/^\d+,\d+$/.test(s)) return { ...fail }
    s = s.replace(',', '.')
  } else if (hasDot) {
    const parts = s.split('.')
    if (parts.length > 2) {
      // Multiple dots = thousand separators (`1.234.567` -> 1234567).
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return { ...fail }
      s = parts.join('')
    } else {
      // Single dot: a 3-digit tail is a pt-BR thousand group (`1.234` -> 1234);
      // anything shorter is a decimal read (`12.34` -> 12.34).
      const [int, dec] = parts
      s = dec.length === 3 ? int + dec : int + '.' + dec
    }
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return { ...fail }
  const value = Number(s)
  if (!Number.isFinite(value)) return { ...fail }
  return { ok: true, value: isNegative ? -value : value, isPercentual }
}

const ptBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/**
 * Format a canonical number for display: pt-BR separators, up to 2 fraction
 * digits, trailing `%` for percentual stats (review-step preview + cards).
 */
export function formatStatValue(n: number, valueType: 'flat' | 'percentual'): string {
  const base = ptBr.format(n)
  return valueType === 'percentual' ? `${base}%` : base
}
