// CropOverlay geometry pins — owner-ratified free-crop contract (round 2
// dispositions D-05-UAT-4/5, ratified 2026-10-12 — supersedes the Phase 5
// planning discretion that made the crop box aspect-locked hard; see
// .planning/debug/d05-uat-ocr-defects.md and 05-UAT.md). The crop box is
// now FREE-FORM: the player drags and resizes it to ANY shape. A dashed
// EXAMPLE rectangle at the step's CAPTURE aspect (the framing the read
// expects — region fractions are calibrated to that frame) shows the
// target framing, and confirm is GATED: a crop deviating from the capture
// aspect beyond the ~2% frame tolerance (inclusive + epsilon, the
// needsCrop convention) is NOT consumed — harness experiment E evidence:
// frame-exact crop → 14/14 exact; forced 1:1 square → 0/14; default rough
// box → 0/14. Pure helpers only — vitest runs node-env (no DOM), per the
// house pattern in OcrCapture.test.ts.
import { describe, expect, it } from 'vitest'
import { CAPTURES } from './ocr/regions'
import {
  boxBounds,
  clampPosition,
  cropAspectMatches,
  defaultBox,
  exampleBox,
  maxBoxHeight,
  maxBoxWidth,
  resizeBox,
} from './CropOverlay'

// A tall full-phone screenshot as rendered in the overlay (80vh-capped
// canvas, ~1080x2280 device shot scaled down) — width-limited frames.
const TALL_W = 340
const TALL_H = 720
// A landscape frame — height-limited frames, where the capture aspect
// BINDS the example width.
const WIDE_W = 720
const WIDE_H = 324

describe('CropOverlay geometry — free-form crop + dashed example (D-05-UAT-4 ratified pins)', () => {
  it('no capture expects a square: every CAPTURES aspect differs from 1', () => {
    for (const map of Object.values(CAPTURES)) {
      expect(map.aspect).not.toBe(1)
    }
  })

  it('the default opening box sits AT the capture aspect (a good starting point), centered at 80% of the frame extents', () => {
    for (const map of Object.values(CAPTURES)) {
      const aspect = map.aspect
      const wide = defaultBox(WIDE_W, WIDE_H, aspect)
      expect(wide.w).toBeCloseTo(0.8 * Math.min(WIDE_W, WIDE_H * aspect), 6)
      expect(wide.h).toBeCloseTo(wide.w / aspect, 6)
      const tall = defaultBox(TALL_W, TALL_H, aspect)
      expect(tall.w).toBeCloseTo(0.8 * TALL_W, 6)
      expect(tall.h).toBeCloseTo(tall.w / aspect, 6)
      // Centered on both axes.
      expect(tall.x).toBeCloseTo((TALL_W - tall.w) / 2, 6)
      expect(tall.y).toBeCloseTo((TALL_H - tall.h) / 2, 6)
    }
  })

  it('the example is a centered, FULL-SIZE capture-aspect rectangle — the framing the read expects', () => {
    for (const map of Object.values(CAPTURES)) {
      const aspect = map.aspect
      const tall = exampleBox(TALL_W, TALL_H, aspect)
      expect(tall.w).toBeCloseTo(Math.min(TALL_W, TALL_H * aspect), 6)
      expect(tall.h).toBeCloseTo(tall.w / aspect, 6)
      expect(tall.x).toBeCloseTo((TALL_W - tall.w) / 2, 6)
      expect(tall.y).toBeCloseTo((TALL_H - tall.h) / 2, 6)
      // Fully inside the image on both display orientations.
      expect(tall.x).toBeGreaterThanOrEqual(0)
      expect(tall.y).toBeGreaterThanOrEqual(0)
      expect(tall.x + tall.w).toBeLessThanOrEqual(TALL_W)
      expect(tall.y + tall.h).toBeLessThanOrEqual(TALL_H)
      const wide = exampleBox(WIDE_W, WIDE_H, aspect)
      expect(wide.w).toBeCloseTo(Math.min(WIDE_W, WIDE_H * aspect), 6)
      expect(wide.h).toBeCloseTo(wide.w / aspect, 6)
      expect(wide.x).toBeGreaterThanOrEqual(0)
      expect(wide.y).toBeGreaterThanOrEqual(0)
      expect(wide.x + wide.w).toBeLessThanOrEqual(WIDE_W)
      expect(wide.y + wide.h).toBeLessThanOrEqual(WIDE_H)
    }
  })

  it('the default box opens at 80% of the example, sharing its center', () => {
    const aspect = CAPTURES.quasi.aspect
    const ex = exampleBox(TALL_W, TALL_H, aspect)
    const def = defaultBox(TALL_W, TALL_H, aspect)
    expect(def.w).toBeCloseTo(0.8 * ex.w, 6)
    expect(def.h).toBeCloseTo(0.8 * ex.h, 6)
    expect(def.x).toBeCloseTo(ex.x + 0.1 * ex.w, 6)
    expect(def.y).toBeCloseTo(ex.y + 0.1 * ex.h, 6)
  })

  it('the box takes ARBITRARY shapes: resizeBox grows each axis freely — no lock ratio anywhere', () => {
    const aspect = CAPTURES.basic.aspect // the step behind the "forced square" report
    const start = defaultBox(TALL_W, TALL_H, aspect)
    // Drag the corner far off-ratio: a tall sliver the old lock could never produce.
    const sliver = resizeBox(start, -100, 300, TALL_W, TALL_H, aspect)
    expect(sliver.w).toBeCloseTo(start.w - 100, 6)
    expect(sliver.h).toBeCloseTo(start.h + 300, 6)
    expect(sliver.w / sliver.h).not.toBeCloseTo(aspect, 2)
    // A square is equally reachable (and equally unconfirmable — gate pins below).
    const square = resizeBox(start, 0, start.w - start.h, TALL_W, TALL_H, aspect)
    expect(square.w).toBeCloseTo(square.h, 6)
  })

  it('resize bounds free each axis to the full image, floored at 40% of the capture-frame extents', () => {
    for (const map of Object.values(CAPTURES)) {
      const aspect = map.aspect
      const tall = boxBounds(TALL_W, TALL_H, aspect)
      expect(tall.maxW).toBe(TALL_W)
      expect(tall.maxH).toBe(TALL_H)
      expect(tall.minW).toBeCloseTo(0.4 * Math.min(TALL_W, TALL_H * aspect), 6)
      expect(tall.minH).toBeCloseTo(0.4 * Math.min(TALL_H, TALL_W / aspect), 6)
      const wide = boxBounds(WIDE_W, WIDE_H, aspect)
      expect(wide.maxW).toBe(WIDE_W)
      expect(wide.maxH).toBe(WIDE_H)
    }
  })

  it('resizeBox honors the bounds: over-drags clamp instead of running off the image', () => {
    const aspect = CAPTURES.general.aspect
    const start = defaultBox(WIDE_W, WIDE_H, aspect)
    const huge = resizeBox(start, 10000, 10000, WIDE_W, WIDE_H, aspect)
    expect(huge.w).toBeCloseTo(WIDE_W, 6)
    expect(huge.h).toBeCloseTo(WIDE_H, 6)
    expect(huge.x).toBe(0)
    expect(huge.y).toBe(0)
    const tiny = resizeBox(start, -10000, -10000, WIDE_W, WIDE_H, aspect)
    expect(tiny.w).toBeCloseTo(0.4 * Math.min(WIDE_W, WIDE_H * aspect), 6)
    expect(tiny.h).toBeCloseTo(0.4 * Math.min(WIDE_H, WIDE_W / aspect), 6)
  })

  it('clampPosition keeps a mispositioned arbitrary-shape box fully inside without touching its proportions', () => {
    const square = clampPosition({ x: -50, y: 99999, w: 200, h: 200 }, TALL_W, TALL_H)
    expect(square.x).toBe(0)
    expect(square.y).toBeCloseTo(TALL_H - 200, 6)
    expect(square.w).toBe(200)
    expect(square.h).toBe(200) // the square survives — never forced to a lock ratio
    const sliver = clampPosition({ x: 99999, y: -1, w: 40, h: 500 }, WIDE_W, WIDE_H)
    expect(sliver.x).toBeCloseTo(WIDE_W - 40, 6)
    expect(sliver.y).toBe(0)
    expect(sliver.h).toBe(500)
  })

  it('maxBoxWidth/maxBoxHeight cap the capture-frame extents on both display orientations', () => {
    expect(maxBoxWidth(340, 720, 1.6611)).toBe(340) // width-limited
    expect(maxBoxWidth(720, 324, 1.6611)).toBeCloseTo(324 * 1.6611, 6) // height-limited
    expect(maxBoxWidth(720, 324, 0.8538)).toBeCloseTo(324 * 0.8538, 6)
    expect(maxBoxHeight(340, 720, 1.6611)).toBeCloseTo(340 / 1.6611, 6) // width-limited
    expect(maxBoxHeight(720, 324, 1.6611)).toBe(324) // height-limited
    expect(maxBoxHeight(340, 720, 0.8538)).toBeCloseTo(340 / 0.8538, 6)
  })
})

describe('cropAspectMatches — confirm gate (2% frame tolerance, inclusive + epsilon)', () => {
  it('a crop at the exact capture aspect confirms on every capture', () => {
    for (const map of Object.values(CAPTURES)) {
      expect(cropAspectMatches(340, 340 / map.aspect, map.aspect)).toBe(true)
    }
  })

  it('the calibration frames pass their own gate (deviation ≤0.01%)', () => {
    expect(cropAspectMatches(691, 416, CAPTURES.basic.aspect)).toBe(true)
    expect(cropAspectMatches(648, 759, CAPTURES.general.aspect)).toBe(true)
    expect(cropAspectMatches(673, 759, CAPTURES.quasi.aspect)).toBe(true)
    expect(cropAspectMatches(649, 782, CAPTURES.special.aspect)).toBe(true)
  })

  it('a 1%-off crop still confirms (inside the frame tolerance)', () => {
    expect(cropAspectMatches(1.01, 1, 1)).toBe(true)
    expect(cropAspectMatches(0.99, 1, 1)).toBe(true)
  })

  it('deviation of exactly 0.02 confirms (inclusive boundary; the epsilon absorbs IEEE-754 noise, needsCrop convention)', () => {
    expect(cropAspectMatches(1.02, 1, 1)).toBe(true)
    expect(cropAspectMatches(0.98, 1, 1)).toBe(true)
  })

  it('deviation just above 0.02 is rejected — the read is NOT consumed', () => {
    expect(cropAspectMatches(1.0201, 1, 1)).toBe(false)
    expect(cropAspectMatches(0.9799, 1, 1)).toBe(false)
  })

  it('a 1.5%-off real frame confirms; a 5%-off one does not (the crop-trigger band is unconfirmable)', () => {
    const aspect = CAPTURES.quasi.aspect
    expect(cropAspectMatches(673 * 1.015, 759, aspect)).toBe(true)
    expect(cropAspectMatches(673 * 1.05, 759, aspect)).toBe(false)
  })

  it('the D-05-UAT-4/6 case: a SQUARE crop never confirms on any capture (a forced square reads 0/14)', () => {
    for (const map of Object.values(CAPTURES)) {
      expect(cropAspectMatches(200, 200, map.aspect)).toBe(false)
    }
  })

  it('free manipulation and the gate compose: an off-ratio resize result is exactly what the gate rejects', () => {
    const aspect = CAPTURES.basic.aspect
    const start = defaultBox(TALL_W, TALL_H, aspect)
    const sliver = resizeBox(start, -100, 300, TALL_W, TALL_H, aspect)
    expect(cropAspectMatches(sliver.w, sliver.h, aspect)).toBe(false)
    const untouched = resizeBox(exampleBox(TALL_W, TALL_H, aspect), 0, 0, TALL_W, TALL_H, aspect)
    expect(cropAspectMatches(untouched.w, untouched.h, aspect)).toBe(true)
  })
})
