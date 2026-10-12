// Crop-trigger boundary tests (plan 05-04 task 1, TDD RED; recalibrated
// 2026-10-11 to the owner-ratified 5% gate — debug session
// .planning/debug/d05-uat-ocr-defects.md, D-05-UAT-2 disposition). Pure
// helper only — vitest runs node-env (no DOM), per the house pattern in
// ../auth/session.test.ts. Behavior source: D-05 — the crop prompt appears
// only when the uploaded image's aspect deviates from the capture's
// reference aspect by MORE than 5% (exclusive boundary); optimal crops and
// the exact calibration frames (deviation ≤0.01%) skip cropping entirely.
//
// Why 5% (owner-ratified calibration change): at the old 12% gate, frames
// with 5-12% deviation (e.g. samp2 vs quasi = 9.4%) passed uncropped and
// produced parseable-but-wrong values — the regions are valid only on the
// calibration frame. Tightening routes those misaligned uploads to the
// crop overlay instead of reading garbage uncropped. The 11 calibration
// samples deviate at most 0.01% and must stay no-crop (pinned below +
// harness test A on the real bytes).
import { describe, expect, it } from 'vitest'
import { needsCrop, statusMessage } from './OcrCapture'

describe('needsCrop — D-05 aspect-deviation trigger (>5%, exclusive)', () => {
  it('an optimal crop (identical aspect) never triggers cropping', () => {
    expect(needsCrop(1.661, 1.661)).toBe(false)
  })

  it('a phone full screenshot vs the basic reference triggers cropping', () => {
    expect(needsCrop(0.9, 1.661)).toBe(true)
  })

  it('deviation of exactly 0.05 does not trigger (boundary is exclusive)', () => {
    expect(needsCrop(1.05, 1)).toBe(false)
    expect(needsCrop(0.95, 1)).toBe(false)
  })

  it('deviation just above 0.05 triggers', () => {
    expect(needsCrop(1.0501, 1)).toBe(true)
    expect(needsCrop(0.9499, 1)).toBe(true)
  })

  it('the samp2-vs-quasi misalignment (9.4% deviation) now triggers', () => {
    // 650x670 frame read against the 673x759 quasi calibration — the
    // D-05-UAT-2 case that passed the old 12% gate uncropped and produced
    // parseable-but-wrong values.
    expect(needsCrop(650 / 670, 673 / 759)).toBe(true)
  })

  it('the old 12% boundary cases now trigger', () => {
    expect(needsCrop(1.12, 1)).toBe(true)
    expect(needsCrop(0.88, 1)).toBe(true)
  })

  it('deviation of 0.121 still triggers', () => {
    expect(needsCrop(1.121, 1)).toBe(true)
    expect(needsCrop(0.879, 1)).toBe(true)
  })

  it('general reference: identical aspect skips; 17.1% deviation triggers', () => {
    expect(needsCrop(0.854, 0.854)).toBe(false)
    expect(needsCrop(1.0, 0.854)).toBe(true) // 17.1%
  })

  it('general reference: 11.2% deviation now triggers (above the 5% gate)', () => {
    expect(needsCrop(0.95, 0.854)).toBe(true)
  })

  it('the exact calibration frames (deviation ≤0.01%) stay no-crop', () => {
    expect(needsCrop(691 / 416, 1.6611)).toBe(false) // sampbasic -> basic
    expect(needsCrop(648 / 759, 0.8538)).toBe(false) // sampideal1 -> general
    expect(needsCrop(673 / 759, 0.8867)).toBe(false) // sampideal2 -> quasi
    expect(needsCrop(649 / 782, 0.8299)).toBe(false) // sampideal3 -> special
  })
})

describe('statusMessage — cancelled-read feedback line (D-05-UAT-5, owner-ratified 2026-10-12)', () => {
  it('declining the crop surfaces a visible cancelled status line — the return is no longer silent', () => {
    const line = statusMessage('cancelled')
    expect(line).not.toBe(null)
    expect(line?.tone).toBe('muted') // neutral notice, same weight as the failed-read line
  })

  it('each status renders exactly one distinct line (single status slot)', () => {
    const texts = new Set(
      (['reading', 'done', 'failed', 'cancelled'] as const).map((s) => statusMessage(s)?.text),
    )
    expect(texts.size).toBe(4)
  })

  it('idle renders no status line — the pure manual flow stays copy-free', () => {
    expect(statusMessage('idle')).toBe(null)
  })

  it('the next upload clears the cancelled line: the reading line replaces it in the single status slot', () => {
    // handleFile's first transition is to the reading status; rendering
    // switches on the one status slot, so the cancelled line is gone the
    // moment a new upload starts (and the CTA re-disables for the read).
    expect(statusMessage('reading')).not.toEqual(statusMessage('cancelled'))
  })
})
