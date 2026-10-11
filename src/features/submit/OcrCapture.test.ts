// Crop-trigger boundary tests (plan 05-04 task 1, TDD RED). Pure helper
// only — vitest runs node-env (no DOM), per the house pattern in
// ../auth/session.test.ts. Behavior source: 05-04-PLAN <behavior> + D-05
// (crop prompt appears only when the uploaded image's aspect deviates from
// the capture's reference aspect by MORE than 12%; optimal crops skip
// cropping entirely).
//
// Deviation note (plan <behavior> is self-contradictory on one case): the
// plan lists an expectation of "true" for the 11.2% case while its own
// parenthetical and the binding formula in <action> (deviation strictly
// greater than 0.12) both yield false — 11.2% is below the 12% trigger.
// These tests pin the formula, the exact-boundary cases, and the UI-SPEC
// trigger definition; the contradiction is recorded in the plan SUMMARY.
import { describe, expect, it } from 'vitest'
import { needsCrop } from './OcrCapture'

describe('needsCrop — D-05 aspect-deviation trigger (>12%, exclusive)', () => {
  it('an optimal crop (identical aspect) never triggers cropping', () => {
    expect(needsCrop(1.661, 1.661)).toBe(false)
  })

  it('a phone full screenshot vs the basic reference triggers cropping', () => {
    expect(needsCrop(0.9, 1.661)).toBe(true)
  })

  it('deviation of exactly 0.12 does not trigger (boundary is exclusive)', () => {
    expect(needsCrop(1.12, 1)).toBe(false)
    expect(needsCrop(0.88, 1)).toBe(false)
  })

  it('deviation of 0.121 triggers', () => {
    expect(needsCrop(1.121, 1)).toBe(true)
    expect(needsCrop(0.879, 1)).toBe(true)
  })

  it('general reference: identical aspect skips; 17.1% deviation triggers', () => {
    expect(needsCrop(0.854, 0.854)).toBe(false)
    expect(needsCrop(1.0, 0.854)).toBe(true) // 17.1%
  })

  it('general reference: 11.2% deviation stays under the 12% trigger', () => {
    expect(needsCrop(0.95, 0.854)).toBe(false)
  })
})
