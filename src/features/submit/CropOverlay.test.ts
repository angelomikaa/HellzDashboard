// CropOverlay geometry pins — D-05-UAT-4 (round 2 of the Phase 5 owner UAT
// debug session, .planning/debug/d05-uat-ocr-defects.md). The owner reported
// the crop box as "forced into a square"; these tests pin the ACTUAL contract
// from the binding spec (05-04-PLAN / 05-UI-SPEC): the lock ratio is the
// step's CAPTURE aspect from CAPTURES (basic 1.6611 / general 0.8538 /
// quasi 0.8867 / special 0.8299 — none is 1:1), and the default centered-80%
// opening box carries the SAME aspect. Pure helpers only — vitest runs
// node-env (no DOM), per the house pattern in OcrCapture.test.ts.
//
// Documented shapes (why the box can LOOK square-ish): general/quasi/special
// calibration frames are TALL rectangles (648x759 / 673x759 / 649x782), so
// their locked boxes are ~13-20% taller than wide — near-square by DESIGN and
// exactly matching the optimal capture frames. Only basic (691x416) is a wide
// rectangle. A literal square box is impossible with these aspects: a 1:1
// lock would make impliedH === w, which the pins below forbid.
import { describe, expect, it } from 'vitest'
import { CAPTURES } from './ocr/regions'
import { clampPosition, defaultBox, maxBoxWidth } from './CropOverlay'

// A tall full-phone screenshot as rendered in the overlay (80vh-capped
// canvas, ~1080x2280 device shot scaled down) — width-limited boxes.
const TALL_W = 340
const TALL_H = 720
// A landscape frame — height-limited boxes, where the aspect BINDS the width.
const WIDE_W = 720
const WIDE_H = 324

describe('CropOverlay geometry — D-05 aspect lock (D-05-UAT-4 pins)', () => {
  it('no capture locks a square: every CAPTURES aspect differs from 1', () => {
    for (const map of Object.values(CAPTURES)) {
      expect(map.aspect).not.toBe(1)
    }
  })

  it('the default centered-80% box locks to the step CAPTURE aspect for every capture', () => {
    for (const map of Object.values(CAPTURES)) {
      const aspect = map.aspect
      // Wide display: the aspect binds the box WIDTH (height-limited) —
      // a square lock would instead cap at min(imgW, imgH) = 324.
      const wide = defaultBox(WIDE_W, WIDE_H, aspect)
      expect(wide.w).toBeCloseTo(0.8 * Math.min(WIDE_W, WIDE_H * aspect), 6)
      // Tall display: the width caps at the image width; the implied height
      // w/aspect carries the lock — and is NEVER equal to w (no square).
      const tall = defaultBox(TALL_W, TALL_H, aspect)
      expect(tall.w).toBeCloseTo(0.8 * TALL_W, 6)
      const impliedH = tall.w / aspect
      expect(impliedH).not.toBe(tall.w)
      expect(tall.w / impliedH).toBeCloseTo(aspect, 6)
      // Centered on both axes.
      expect(tall.x).toBeCloseTo((TALL_W - tall.w) / 2, 6)
      expect(tall.y).toBeCloseTo((TALL_H - impliedH) / 2, 6)
    }
  })

  it('basic (691x416 calibration) locks a WIDE rectangle box', () => {
    const aspect = CAPTURES.basic.aspect
    const box = defaultBox(TALL_W, TALL_H, aspect)
    const impliedH = box.w / aspect
    expect(impliedH).toBeLessThan(box.w) // wide, never square
    expect(box.w / impliedH).toBeCloseTo(691 / 416, 3)
  })

  it('general/quasi/special lock tall near-square rectangles matching their tall calibration frames', () => {
    const frames = {
      general: 759 / 648, // sampideal1
      quasi: 759 / 673, // sampideal2
      special: 782 / 649, // sampideal3
    } as const
    for (const capture of ['general', 'quasi', 'special'] as const) {
      const aspect = CAPTURES[capture].aspect
      const box = defaultBox(TALL_W, TALL_H, aspect)
      const hOverW = box.w / aspect / box.w
      // Near-square TALL boxes (13-20% taller than wide) — the correct lock
      // for the tall optimal frames, NOT a 1:1 square.
      expect(hOverW).toBeGreaterThan(1.1)
      expect(hOverW).toBeLessThan(1.25)
      expect(hOverW).toBeCloseTo(frames[capture], 2)
    }
  })

  it('the lock holds identically on a wide (landscape) display', () => {
    for (const map of Object.values(CAPTURES)) {
      const aspect = map.aspect
      const box = defaultBox(WIDE_W, WIDE_H, aspect)
      expect(box.w).toBeCloseTo(0.8 * Math.min(WIDE_W, WIDE_H * aspect), 6)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.w).toBeLessThanOrEqual(WIDE_W)
      expect(box.y + box.w / aspect).toBeLessThanOrEqual(WIDE_H)
    }
  })

  it('maxBoxWidth caps at the limiting dimension', () => {
    expect(maxBoxWidth(340, 720, 1.6611)).toBe(340) // width-limited
    expect(maxBoxWidth(720, 324, 1.6611)).toBeCloseTo(324 * 1.6611, 6) // height-limited
    expect(maxBoxWidth(720, 324, 0.8538)).toBeCloseTo(324 * 0.8538, 6)
  })

  it('clampPosition keeps a mispositioned box fully inside the image at its size', () => {
    const aspect = CAPTURES.general.aspect
    const clamped = clampPosition({ x: -50, y: 99999, w: 200 }, 340, 720, aspect)
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBeCloseTo(720 - 200 / aspect, 6)
    expect(clamped.w).toBe(200)
  })
})
