// CropOverlay — the optional crop prompt (D-05, 05-UI-SPEC). Owner-ratified
// crop-UX change (2026-10-12, question "With the structural reader, the 2%
// confirm gate and the example enforcement in the crop tool are obsolete..."
// → answer: "Remove gate, keep crop"): the round-2 dashed example rectangle,
// its helper copy, and the 2% confirm gate are RETIRED — with the structural
// reader live (reads are scale/margin invariant; harness grid green) they
// would reject crops that read perfectly. The overlay stays as an OPTIONAL
// isolation tool for busy/large screenshots (rendered only when the
// uploaded image's aspect deviates >5% — owner-ratified threshold,
// 2026-10-11 — from the capture's reference aspect): the player freely drags
// and resizes the crop box to ANY shape, and `Usar recorte` ALWAYS confirms
// — whatever box the player drew — drawing the cropped region to a canvas
// and handing it to the read. The default opening box is the FULL image:
// confirming without adjusting equals reading the whole upload (sane
// semantics for an optional isolation tool); the player shrinks/moves the
// box only to isolate the panel on busy screenshots. Decline (outline
// button or Escape) CANCELS the read entirely — the player lands in manual
// entry with fields untouched, never a garbage read (05-RESEARCH §6 pitfall
// 7), and the capture step surfaces a visible cancelled-feedback status
// line (ratified deviation, handled by the parent). Plain pointer events —
// no library; react is the only import.
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

const HEADING = 'Ajuste o recorte da captura'
const CONFIRM_LABEL = 'Usar recorte'
// Ratified relabel (D-05-UAT-5): the decline button cancels the read —
// its label now says so.
const DECLINE_LABEL = 'Cancelar leitura'

/**
 * Widest capture-aspect rectangle that fits the image. Serves ONLY the
 * resize floor below — the isolation tool's sanity minimum (there is no
 * example rectangle and no confirm gate to serve anymore).
 */
export function maxBoxWidth(imgW: number, imgH: number, aspect: number): number {
  return Math.min(imgW, imgH * aspect)
}

/** Tallest capture-aspect rectangle that fits the image (the resize floor's basis). */
export function maxBoxHeight(imgW: number, imgH: number, aspect: number): number {
  return Math.min(imgH, imgW / aspect)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

/**
 * Free-crop manipulation bounds: each axis spans the full image, floored
 * at 40% of the capture-frame extent on that axis — an isolation-tool
 * sanity minimum against absurdly tiny crops (every box the old tools
 * allowed stays reachable, plus every other shape; confirm governs
 * nothing — the read is structural and shape-tolerant).
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
 * The opening crop box: the FULL image (owner-ratified 2026-10-12 — the
 * old centered-80% default was a pixel-map relic that would clip the panel
 * on tight screenshots). Confirming without adjusting reads the whole
 * upload; the player shrinks/moves the box only to isolate the panel.
 */
export function defaultBox(imgW: number, imgH: number): CropBox {
  return { x: 0, y: 0, w: imgW, h: imgH }
}

export function CropOverlay({ bitmap, aspect, onConfirm, onCancel }: CropOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState<CropBox | null>(null)
  const dragRef = useRef<null | { kind: 'move' | 'resize'; startX: number; startY: number; box: CropBox }>(null)

  // Draw the decoded bitmap (bytes stay on-device, T-05-11), measure the
  // rendered size, and open with the FULL image as the crop box.
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
    setBox(defaultBox(w, h))
  }, [bitmap])

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
    // the box can take any shape; every shape confirms (always-confirm,
    // 2026-10-12 ratification).
    setBox(resizeBox(drag.box, dx, dy, imgSize.w, imgSize.h, aspect))
  }

  function endDrag(): void {
    dragRef.current = null
  }

  function handleConfirm(): void {
    if (box === null || imgSize === null) return
    // Always-confirm (owner-ratified 2026-10-12): the drawn box — whatever
    // its shape — IS the read's input. The structural reader is
    // scale/margin invariant, so there is no aspect gate to reject it.
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={HEADING}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-4 overflow-auto rounded-lg bg-surface p-6">
        <h2 className="text-xl font-semibold text-content">{HEADING}</h2>
        <div className="relative mx-auto">
          <canvas ref={canvasRef} className="block max-h-[80vh] max-w-full" />
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {DECLINE_LABEL}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {CONFIRM_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}
