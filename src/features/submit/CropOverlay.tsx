// CropOverlay — the optional aspect-locked crop prompt (D-05, 05-UI-SPEC).
// Rendered ONLY when the uploaded image's aspect deviates >12% from the
// capture's reference aspect ("excessive information" — a full screenshot
// or bad crop vs the expected panel crop): the player drags an
// aspect-locked box over the image and resizes it via one corner handle,
// ratio always preserved, minimum 40% of the limiting dimension. Plain
// pointer events — no library; react is the only import.
//
// Confirm draws the cropped region to a canvas and hands it to the read;
// decline (outline button or Escape) CANCELS the read entirely — the
// player lands in manual entry with fields untouched, never a garbage
// scaled-to-wrong-frame read (05-RESEARCH §6 pitfall 7). The decline
// button is the full keyboard path; the drag gesture is pointer-only.
import { useEffect, useRef, useState } from 'react'

interface CropOverlayProps {
  bitmap: ImageBitmap
  aspect: number
  onConfirm: (cropped: HTMLCanvasElement) => void
  onCancel: () => void
}

/** Crop box in DISPLAYED pixels over the rendered image. Height is always w / aspect. */
interface CropBox {
  x: number
  y: number
  w: number
}

const MIN_BOX_FRACTION = 0.4

const HEADING = 'Ajuste o recorte da captura'
const CONFIRM_LABEL = 'Usar recorte'
const DECLINE_LABEL = 'Enviar sem recortar'

/** Widest box the ratio-locked crop can reach inside the image. */
function maxBoxWidth(imgW: number, imgH: number, aspect: number): number {
  return Math.min(imgW, imgH * aspect)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

/** Keep the box fully inside the image at its current size. */
function clampPosition(box: CropBox, imgW: number, imgH: number, aspect: number): CropBox {
  const h = box.w / aspect
  return {
    ...box,
    x: clamp(box.x, 0, Math.max(0, imgW - box.w)),
    y: clamp(box.y, 0, Math.max(0, imgH - h)),
  }
}

export function CropOverlay({ bitmap, aspect, onConfirm, onCancel }: CropOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState<CropBox | null>(null)
  const dragRef = useRef<null | { kind: 'move' | 'resize'; startX: number; startY: number; box: CropBox }>(null)

  // Draw the decoded bitmap (bytes stay on-device, T-05-11), measure the
  // rendered size, and open with a centered 80% box.
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
    const initialW = 0.8 * maxBoxWidth(w, h, aspect)
    setBox(clampPosition({ w: initialW, x: (w - initialW) / 2, y: (h - initialW / aspect) / 2 }, w, h, aspect))
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
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { kind, startX: e.clientX, startY: e.clientY, box }
  }

  function onDragMove(e: React.PointerEvent<HTMLElement>): void {
    const drag = dragRef.current
    if (drag === null || imgSize === null) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (drag.kind === 'move') {
      setBox(clampPosition({ ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy }, imgSize.w, imgSize.h, aspect))
      return
    }
    // Resize: width follows the pointer, ratio locked, anchored top-left,
    // bounded by [40% of the limiting dimension, the full limiting extent].
    const minW = MIN_BOX_FRACTION * maxBoxWidth(imgSize.w, imgSize.h, aspect)
    const maxW = maxBoxWidth(imgSize.w, imgSize.h, aspect)
    const w = clamp(drag.box.w + dx, minW, maxW)
    setBox(clampPosition({ ...drag.box, w }, imgSize.w, imgSize.h, aspect))
  }

  function endDrag(): void {
    dragRef.current = null
  }

  function handleConfirm(): void {
    if (box === null || imgSize === null) return
    const scaleX = bitmap.width / imgSize.w
    const scaleY = bitmap.height / imgSize.h
    const cropped = document.createElement('canvas')
    cropped.width = Math.max(1, Math.round(box.w * scaleX))
    cropped.height = Math.max(1, Math.round((box.w / aspect) * scaleY))
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
      (box.w / aspect) * scaleY,
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
                height: box.w / aspect,
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
