// Per-field validation display (D-05-UAT-9, owner-ratified 2026-10-12).
//
// ONE rule, ONE display, no special-casing: a field's parse feedback (the
// green per-field check / the invalid hint) shows once the field is ENGAGED
// and non-blank. A field is engaged when the player left it (blur) OR when
// the latest OCR read pre-filled it — owner verbatim: "the readings from the
// print must also get validated like typed in values". Both render sites
// (StatGroupStep rows and the SubmitPage step-1 combat_power field) consume
// this module so typed and OCR-filled values can never drift apart.
//
// Engagement is sticky, matching blur's existing semantics: a blur never
// unsets, so an OCR engagement never unsets either — the feedback then
// updates live on every edit, exactly like a manually touched field.
//
// Blank engaged fields show NO feedback here: an OCR-FAILED field renders
// the parent's locked failure message (failedFields, D-14), and a blank
// engaged field is the silent pre-fill state — the failure message and the
// parse feedback never coexist.
import { formatStatValue, parseStatValue } from '../../lib/parseStatValue'

/** Locked UI-SPEC copy (definition site, exported for both render sites). */
export const INVALID_HINT = 'Valor inválido — use números (ex.: 1.234.567 ou 12,5%).'

export interface StatFieldFeedback {
  /** the green check line is visible */
  ok: boolean
  /** the invalid-value hint line is visible */
  invalid: boolean
  /** the check line's text ('✓ …') when ok, '' otherwise */
  checkText: string
}

/**
 * Is the field's validation display engaged? Blurred by the player OR
 * pre-filled by the latest OCR read — the same trigger for both paths
 * (D-05-UAT-9 parity).
 */
export function isFieldEngaged(
  statKey: string,
  blurred: Readonly<Record<string, boolean>>,
  ocrFilled: ReadonlySet<string>,
): boolean {
  return blurred[statKey] === true || ocrFilled.has(statKey)
}

/**
 * The ONE per-field validation rule: engaged + non-blank -> parse via the
 * shared pt-BR parser; a parseable value renders the green check (formatted
 * by the catalog's value_type), anything else renders the invalid hint.
 * Disengaged or blank -> no feedback.
 */
export function statFieldFeedback(
  raw: string,
  valueType: 'flat' | 'percentual',
  engaged: boolean,
): StatFieldFeedback {
  const nonBlank = raw.trim() !== ''
  if (!engaged || !nonBlank) return { ok: false, invalid: false, checkText: '' }
  const parsed = parseStatValue(raw)
  if (parsed.ok && parsed.value !== null) {
    return {
      ok: true,
      invalid: false,
      checkText: `✓ ${formatStatValue(parsed.value, valueType)}`,
    }
  }
  return { ok: false, invalid: true, checkText: '' }
}
