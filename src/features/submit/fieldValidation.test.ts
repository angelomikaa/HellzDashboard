// Per-field validation display rule (D-05-UAT-9, TDD RED).
// Pure functions only — vitest runs node-env (no DOM), per the house pattern.
// Behavior source: 05-UAT.md round-4, owner verbatim 2026-10-12: "the
// readings from the print must also get validated like typed in values" —
// ONE rule, ONE display: an OCR pre-fill engages a field's parse feedback
// exactly like a manual blur does, with no special-casing.
import { describe, expect, it } from 'vitest'
import { INVALID_HINT, isFieldEngaged, statFieldFeedback } from './fieldValidation'

describe('isFieldEngaged (D-05-UAT-9)', () => {
  it('engages on manual blur (typed-value path, unchanged)', () => {
    expect(isFieldEngaged('hp', { hp: true }, new Set())).toBe(true)
  })

  it('engages on an OCR pre-fill WITHOUT any blur (the parity fix)', () => {
    expect(isFieldEngaged('pdmg_bonus', {}, new Set(['pdmg_bonus']))).toBe(true)
  })

  it('stays disengaged before any blur or OCR fill', () => {
    expect(isFieldEngaged('hp', {}, new Set())).toBe(false)
  })

  it('engagement is per-field (another field\'s blur/fill does not leak)', () => {
    expect(isFieldEngaged('hp', { patk: true }, new Set(['patk']))).toBe(false)
  })
})

describe('statFieldFeedback — the ONE rule for typed and OCR-filled values', () => {
  it('an OCR pre-fill of a parseable value shows the same green check a blurred manual entry shows', () => {
    // Same raw, same value_type, both engaged (OCR fill vs blur — the rule
    // cannot tell the paths apart): identical feedback.
    expect(statFieldFeedback('699', 'flat', true)).toEqual({
      ok: true,
      invalid: false,
      checkText: '✓ 699',
    })
  })

  it('an OCR pre-fill of an unparseable value shows the same invalid hint a blurred manual entry shows', () => {
    const feedback = statFieldFeedback('12,34,56', 'flat', true)
    expect(feedback.ok).toBe(false)
    expect(feedback.invalid).toBe(true)
    expect(feedback.checkText).toBe('')
  })

  it('the invalid hint copy is the locked single definition (shared by both render sites)', () => {
    expect(INVALID_HINT).toBe('Valor inválido — use números (ex.: 1.234.567 ou 12,5%).')
  })

  it('a disengaged field with content shows NO feedback (pre-engagement silence, unchanged)', () => {
    expect(statFieldFeedback('699', 'flat', false)).toEqual({
      ok: false,
      invalid: false,
      checkText: '',
    })
  })

  it('an engaged BLANK field shows no feedback (the failure message is the parent failedFields concern)', () => {
    expect(statFieldFeedback('', 'flat', true)).toEqual({
      ok: false,
      invalid: false,
      checkText: '',
    })
    expect(statFieldFeedback('   ', 'percentual', true).ok).toBe(false)
  })

  it('percentual stats keep their % handling in the check line (genuinely percentual siblings unaffected)', () => {
    expect(statFieldFeedback('12,34', 'percentual', true).checkText).toBe('✓ 12,34%')
    expect(statFieldFeedback('12,34', 'flat', true).checkText).toBe('✓ 12,34')
  })

  it('negative flat values render the pt-BR sign (Variable/Fixed CT parity)', () => {
    expect(statFieldFeedback('-500', 'flat', true).checkText).toBe('✓ -500')
  })

  it('thousands-grouped values render pt-BR formatted (combat_power scale)', () => {
    expect(statFieldFeedback('288115', 'flat', true).checkText).toBe('✓ 288.115')
  })
})
