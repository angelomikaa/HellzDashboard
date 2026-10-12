// CropOverlay — the optional crop prompt (D-05, 05-UI-SPEC). The
// free-form box, the dashed example rectangle, the confirm-time aspect
// gate and the decline relabel are OWNER-RATIFIED DEVIATIONS from the
// locked spec (2026-10-12, 05-UAT.md round-2 dispositions D-05-UAT-4/5 —
// they supersede the Phase 5 planning discretion that made the crop box
// aspect-locked hard). Rendered ONLY when the uploaded image's aspect
// deviates >5% (owner-ratified threshold, 2026-10-11) from the capture's
// reference aspect ("excessive information" — a full screenshot or bad
// crop vs the expected panel crop): the player freely drags and resizes
// the crop box to ANY shape over their uploaded image, guided by a
// dashed EXAMPLE rectangle at the step's CAPTURE aspect — the framing
// the read expects (region fractions are calibrated to that frame;
// harness-proven: a frame-exact crop reads 14/14 exact, a forced 1:1
// square 0/14).
//
// Confirm is GATED (non-negotiable physics): a crop whose aspect
// deviates from the capture aspect beyond the ~2% frame tolerance
// (inclusive + epsilon, the needsCrop convention) is NOT consumed — an
// inline message directs the player to match the example and the
// overlay stays open to fix or cancel. Within tolerance, confirm draws
// the cropped region to a canvas and hands it to the read. Decline
// (outline button or Escape) CANCELS the read entirely — the player
// lands in manual entry with fields untouched, never a garbage
// scaled-to-wrong-frame read (05-RESEARCH §6 pitfall 7), and the capture
// step surfaces a visible cancelled-feedback status line (ratified
// deviation, handled by the parent). Plain pointer events — no library;
// react is the only import.
import { useEffect, useRef, useState } from 'react'

interface CropOverlayProps {
  bitmap: ImageBitmap
  aspect: number
  onConfirm: (cropped: HTMLCanvasElement) => void
  onCancel: () => void
}

/** Crop box in DISPLAYED pixels over the rendered image. Free-form: w and h are independent. */
export interface CropBox {
  x: number
  y: number
  w: number
  h: number
}

/** Free-crop manipulation bounds in DISPLAYED pixels. */
export interface BoxBounds {
  minW: number
  minH: number
  maxW: number
  maxH: number
}

const MIN_BOX_FRACTION = 0.4

// Confirm gate: the crop must match the step's CAPTURE aspect within the
// ~2% frame tolerance evidenced in the round-2 debug session (region
// rects tolerate only ~2% frame displacement). Inclusive boundary + a
// tiny epsilon that absorbs IEEE-754 representation noise — the needsCrop
// convention — so a mathematically exact 2% deviation stays on the
// CONFIRM side of the boundary; real deviations (2.1% and up) are orders
// of magnitude above it.
const CONFIRM_TOLERANCE = 0.02
const CONFIRM_FLOAT_EPSILON = 1e-9

const HEADING = 'Ajuste o recorte da captura'
const CONFIRM_LABEL = 'Usar recorte'
// Ratified relabel (D-05-UAT-5): the decline button cancels the read —
// its label now says so.
const DECLINE_LABEL = 'Cancelar leitura'
// Helper copy (D-05-UAT-4): reproduce the dashed example's framing with
// the crop box.
const EXAMPLE_HINT = 'Ajuste a área de recorte no formato do exemplo tracejado'
// Inline confirm-gate message: the crop's shape is off the example's
// format — the read is not consumed, the overlay stays open.
const FIT_MESSAGE = 'Ajuste o recorte ao formato do exemplo'

/**
 * Widest capture-aspect rectangle that fits the image (the example's
 * width). The capture aspect is ALWAYS the step's CAPTURES aspect (see
 * CropOverlay.test.ts).
 */
export function maxBoxWidth(imgW: number, imgH: number, aspect: number): number {
  return Math.min(imgW, imgH * aspect)
}

/** Tallest capture-aspect rectangle that fits the image (the example's height). */
export function maxBoxHeight(imgW: number, imgH: number, aspect: number): number {
  return Math.min(imgH, imgW / aspect)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

/**
 * Free-crop manipulation bounds: each axis spans the full image, floored
 * at 40% of the capture-frame extent on that axis (the old lock's minimum
 * footprint — every box the aspect-locked tool allowed stays reachable,
 * plus every other shape, which the confirm gate governs).
 */
export function boxBounds(imgW: number, imgH: number, aspect: number): BoxBounds {
  return {
    minW: MIN_BOX_FRACTION * maxBoxWidth(imgW, imgH, aspect),
    minH: MIN_BOX_FRACTION * maxBoxHeight(imgW, imgH, aspect),
    maxW: imgW,
    maxH: imgH,
  }
}

/** Keep the box fully inside the image at its current size and shape. */
export function clampPosition(box: CropBox, imgW: number, imgH: number): CropBox {
  return {
    ...box,
    x: clamp(box.x, 0, Math.max(0, imgW - box.w)),
    y: clamp(box.y, 0, Math.max(0, imgH - box.h)),
  }
}

/** Free resize anchored top-left: each axis follows its pointer delta independently. */
export function resizeBox(
  box: CropBox,
  dx: number,
  dy: number,
  imgW: number,
  imgH: number,
  aspect: number,
): CropBox {
  const b = boxBounds(imgW, imgH, aspect)
  return clampPosition(
    { ...box, w: clamp(box.w + dx, b.minW, b.maxW), h: clamp(box.h + dy, b.minH, b.maxH) },
    imgW,
    imgH,
  )
}

/**
 * The opening crop box: centered, 80% of the capture-frame extents, at
 * the CAPTURE aspect — a good starting point that already matches the
 * example, now freely adjustable.
 */
export function defaultBox(imgW: number, imgH: number, aspect: number): CropBox {
  const w = 0.8 * maxBoxWidth(imgW, imgH, aspect)
  return clampPosition({ w, h: w / aspect, x: (imgW - w) / 2, y: (imgH - w / aspect) / 2 }, imgW, imgH)
}

/**
 * The dashed EXAMPLE rectangle: centered, full capture-frame size, at
 * the CAPTURE aspect — the framing the read expects, rendered behind the
 * player's crop box.
 */
export function exampleBox(imgW: number, imgH: number, aspect: number): CropBox {
  const w = maxBoxWidth(imgW, imgH, aspect)
  return clampPosition({ w, h: w / aspect, x: (imgW - w) / 2, y: (imgH - w / aspect) / 2 }, imgW, imgH)
}

/**
 * Confirm gate: the crop confirms only when its aspect matches the step's
 * CAPTURE aspect within the 2% frame tolerance (inclusive; the epsilon
 * absorbs float noise so a mathematically exact 2% deviation confirms).
 */
export function cropAspectMatches(cropW: number, cropH: number, captureAspect: number): boolean {
  return Math.abs(cropW / cropH / captureAspect - 1) <= CONFIRM_TOLERANCE + CONFIRM_FLOAT_EPSILON
}

export function CropOverlay({ bitmap, aspect, onConfirm, onCancel }: CropOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState<CropBox | null>(null)
  const [fitError, setFitError] = useState(false)
  const dragRef = useRef<null | { kind: 'move' | 'resize'; startX: number; startY: number; box: CropBox }>(null)

  // Draw the decoded bitmap (bytes stay on-device, T-05-11), measure the
  // rendered size, and open with a centered 80% box at the capture aspect.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.drawImage(bitmap, 0, 0)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    setImgSize({ w, h })
    setBox(defaultBox(w, h, aspect))
  }, [bitmap, aspect])

  // Focus moves to the confirm button on open (keyboard-safe primary
  // path); Escape maps to decline.
  useEffect(() => {
    confirmBtnRef.current?.focus()
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function startDrag(kind: 'move' | 'resize', e: React.PointerEvent<HTMLElement>): void {
    e.preventDefault()
    if (kind === 'resize') e.stopPropagation() // don't bubble into the move drag
    if (box === null) return
    setFitError(false) // manipulating the box retries the fit
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { kind, startX: e.clientX, startY: e.clientY, box }
  }

  function onDragMove(e: React.PointerEvent<HTMLElement>): void {
    const drag = dragRef.current
    if (drag === null || imgSize === null) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (drag.kind === 'move') {
      setBox(clampPosition({ ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy }, imgSize.w, imgSize.h))
      return
    }
    // Free resize: each axis follows its pointer delta independently —
    // the box can take any shape; the confirm gate governs what reaches
    // the read.
    setBox(resizeBox(drag.box, dx, dy, imgSize.w, imgSize.h, aspect))
  }

  function endDrag(): void {
    dragRef.current = null
  }

  function handleConfirm(): void {
    if (box === null || imgSize === null) return
    // Ratified confirm gate: an off-example shape never reaches the read
    // (a wrong-frame read is parseable-but-garbage — harness E). Keep the
    // overlay open so the player fixes the crop or cancels.
    if (!cropAspectMatches(box.w, box.h, aspect)) {
      setFitError(true)
      return
    }
    const scaleX = bitmap.width / imgSize.w
    const scaleY = bitmap.height / imgSize.h
    const cropped = document.createElement('canvas')
    cropped.width = Math.max(1, Math.round(box.w * scaleX))
    cropped.height = Math.max(1, Math.round(box.h * scaleY))
    const ctx = cropped.getContext('2d')
    if (!ctx) {
      // A 2d context is always available on a fresh canvas; if it somehow
      // is not, decline is the complete, safe exit (never a garbage read).
      onCancel()
      return
    }
    ctx.drawImage(
      bitmap,
      box.x * scaleX,
      box.y * scaleY,
      box.w * scaleX,
      box.h * scaleY,
      0,
      0,
      cropped.width,
      cropped.height,
    )
    onConfirm(cropped)
  }

  const ghost = imgSize === null ? null : exampleBox(imgSize.w, imgSize.h, aspect)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={HEADING}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-4 overflow-auto rounded-lg bg-surface p-6">
        <h2 className="text-xl font-semibold text-content">{HEADING}</h2>
        <p className="text-sm text-muted">{EXAMPLE_HINT}</p>
        <div className="relative mx-auto">
          <canvas ref={canvasRef} className="block max-h-[80vh] max-w-full" />
          {ghost !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute border-2 border-dashed border-muted"
              style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }}
            />
          )}
          {box !== null && (
            <div
              className="absolute cursor-move border-2 border-accent"
              style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                touchAction: 'none',
              }}
              onPointerDown={(e) => startDrag('move', e)}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span
                aria-hidden="true"
                className="absolute -bottom-1 -right-1 h-4 w-4 cursor-se-resize bg-accent"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => startDrag('resize', e)}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            </div>
          )}
        </div>
        {fitError && (
          <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
            {FIT_MESSAGE}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {DECLINE_LABEL}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {CONFIRM_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}
