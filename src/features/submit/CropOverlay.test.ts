// CropOverlay geometry pins — owner-ratified crop-UX change (2026-10-12,
// question "With the structural reader, the 2% confirm gate and the example
// enforcement in the crop tool are obsolete..." → answer: "Remove gate, keep
// crop"). The round-2 dashed example + confirm gate (D-05-UAT-4) died with
// the pixel map: the STRUCTURAL reader is scale/margin invariant (harness
// grid green — native 56/56, rescales 16/16, margin pads 20/20, frame-exact
// crop 14/14), so a gate tuned to the capture aspect would REJECT crops that
// read perfectly. The crop stays as an OPTIONAL isolation tool for busy/large
// screenshots: free drag/resize to any shape (D-05-UAT-4 free-form, kept),
// `Usar recorte` ALWAYS confirms with the drawn box — whatever its shape (a
// square crop confirms fine; the always-confirm invariant is structural —
// the gate helper is deleted, no rejection branch exists) — and the default
// opening box is the FULL image (confirming unadjusted = reading the whole
// upload; the player shrinks/moves the box only to isolate the panel).
// Decline still cancels the read (D-05-UAT-5 relabel + cancelled status
// line, unchanged — pinned by OcrCapture.test.ts). Pure helpers only —
// vitest runs node-env (no DOM), per the house pattern in OcrCapture.test.ts.
import { describe, expect, it } from 'vitest'
import * as CropOverlayModule from './CropOverlay'
import { CAPTURES } from './ocr/regions'
import {
  boxBounds,
  clampPosition,
  defaultBox,
  maxBoxHeight,
  maxBoxWidth,
  resizeBox,
} from './CropOverlay'

// A tall full-phone screenshot as rendered in the overlay (80vh-capped
// canvas, ~1080x2280 device shot scaled down) — width-limited frames.
const TALL_W = 340
const TALL_H = 720
// A landscape frame — height-limited frames, where the capture aspect
// BINDS the resize floor.
const WIDE_W = 720
const WIDE_H = 324

// Bracket access keeps tsc -b green AFTER the GREEN commit removes the
// exports — the absence itself is the pin.
const mod = CropOverlayModule as unknown as Record<string, unknown>

describe('CropOverlay — obsolete gate/example machinery is GONE (dead premises, 2026-10-12 ratification)', () => {
  it('the 2% confirm-gate helper no longer exists — `Usar recorte` has no rejection path', () => {
    expect(mod.cropAspectMatches).toBeUndefined()
    expect(mod.CONFIRM_TOLERANCE).toBeUndefined()
    expect(mod.CONFIRM_FLOAT_EPSILON).toBeUndefined()
  })

  it('the dashed example rectangle helper no longer exists', () => {
    expect(mod.exampleBox).toBeUndefined()
  })
})

describe('CropOverlay geometry — optional isolation tool (full-image default, free-form crop)', () => {
  it('the default opening box is the FULL image — confirming unadjusted reads the whole upload', () => {
    for (const [w, h] of [
      [TALL_W, TALL_H],
      [WIDE_W, WIDE_H],
    ]) {
      const box = defaultBox(w, h)
      expect(box.x).toBe(0)
      expect(box.y).toBe(0)
      expect(box.w).toBe(w)
      expect(box.h).toBe(h)
    }
  })

  it('the box takes ARBITRARY shapes and every shape confirms: resizeBox grows each axis freely — no lock ratio, no gate', () => {
    const aspect = CAPTURES.basic.aspect
    // The realistic gesture: open at the FULL image, shrink to isolate the
    // panel, then shape the box freely.
    const start = defaultBox(TALL_W, TALL_H)
    const shrunk = resizeBox(start, -102, -288, TALL_W, TALL_H, aspect)
    expect(shrunk.w).toBeCloseTo(238, 6)
    expect(shrunk.h).toBeCloseTo(432, 6)
    // Drag the corner far off-ratio: a tall sliver the old lock could never produce.
    const sliver = resizeBox(shrunk, -100, 200, TALL_W, TALL_H, aspect)
    expect(sliver.w).toBeCloseTo(shrunk.w - 100, 6)
    expect(sliver.h).toBeCloseTo(shrunk.h + 200, 6)
    expect(sliver.w / sliver.h).not.toBeCloseTo(aspect, 2)
    // A square is equally reachable — and equally confirmable (always-confirm).
    const square = resizeBox(shrunk, 102, -92, TALL_W, TALL_H, aspect)
    expect(square.w).toBeCloseTo(square.h, 6)
  })

  it('resize bounds free each axis to the full image, floored at 40% of the capture-frame extents (isolation sanity — unchanged)', () => {
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
    const start = defaultBox(WIDE_W, WIDE_H)
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

  it('maxBoxWidth/maxBoxHeight cap the capture-frame extents on both display orientations (the resize floor basis)', () => {
    expect(maxBoxWidth(340, 720, 1.6611)).toBe(340) // width-limited
    expect(maxBoxWidth(720, 324, 1.6611)).toBeCloseTo(324 * 1.6611, 6) // height-limited
    expect(maxBoxWidth(720, 324, 0.8538)).toBeCloseTo(324 * 0.8538, 6)
    expect(maxBoxHeight(340, 720, 1.6611)).toBeCloseTo(340 / 1.6611, 6) // width-limited
    expect(maxBoxHeight(720, 324, 1.6611)).toBe(324) // height-limited
    expect(maxBoxHeight(340, 720, 0.8538)).toBeCloseTo(340 / 0.8538, 6)
  })
})
