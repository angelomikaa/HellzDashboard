// CardPhotoCrop — the member's photo positioning step (owner 2026-11-05:
// "o position crop deve receber a foto como um upload normal, mostrar uma
// silhueta genérica e semitransparente do card com o crop-path, e permitir que
// o usuário dê zoom e arraste a foto como quiser. Após o OK, a foto no card
// fica do jeito que o usuário posicionou").
//
// THE PREVIEW IS THE ARTIFACT: the editor renders the REAL CardSvg (the same
// component the Painel and the Destaques showcase mount) with the pending
// image and the live transform, so the text the user must avoid (OVR + job
// over the photo) is exactly where it will land. When the member has no card
// yet (insufficient data) the editor falls back to the owner's generic
// silhouette: the plate shape + the crop-path outline.
//
// The veil outside the crop path dims the card body, so the photo area — the
// only region the screenshot controls — reads as the active canvas.
//
// Interaction: drag to pan, wheel/pinch/slider/± to zoom, arrows to nudge,
// "Centralizar" to reset. Pan is limited to the photo's own overflow, so the
// crop path can never show an empty corner.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  CARD_GEOMETRY,
  applyPhotoTransform,
  measurePhotoSubject,
  photoDestRect,
  type CardPhotoTransform,
  type CardRect,
  type PhotoSubjectBounds,
} from '../export/cardAssets'
import type { CardExportData } from '../export/cardExport'
import { CardSvg } from '../cards/CardSvg'
import { PHOTO_ZOOM_MAX, PHOTO_ZOOM_MIN, normalizePhotoTransform } from './photoTransformStore'

interface PhotoMeasure {
  width: number
  height: number
  subject: PhotoSubjectBounds | null
}

/** Decode the pending image once (dimensions + opaque subject bounds) so the
 *  pan limits match the framing the card will render. Failure → null, and the
 *  editor still allows zoom (pan limits fall back to zero). */
function measureImage(src: string): Promise<PhotoMeasure | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return resolve(null)
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        subject: measurePhotoSubject(img),
      })
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function CardPhotoCrop({
  imageUrl,
  preview,
  initial,
  busy = false,
  errorText = null,
  onCancel,
  onConfirm,
}: {
  /** Object URL of the photo being positioned (same-origin blob — T-072-13). */
  imageUrl: string
  /** The member's card with the REAL data (name, OVR, stats). Null when the
   *  card cannot exist yet — the generic silhouette is used instead. */
  preview: CardExportData | null
  /** The framing the editor opens with (repositioning keeps the last one). */
  initial?: CardPhotoTransform | null
  /** Upload in flight — the confirm button shows its progress and is locked. */
  busy?: boolean
  /** A failed upload from a previous attempt (shown INSIDE the modal so the
   *  member sees it without losing the framing). */
  errorText?: string | null
  onCancel: () => void
  onConfirm: (transform: CardPhotoTransform) => void
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const maskId = `crop-veil-${uid}`
  const clipId = `crop-clip-${uid}`
  const [transform, setTransform] = useState<CardPhotoTransform>(
    () => normalizePhotoTransform(initial) ?? { zoom: 1, x: 0, y: 0 },
  )
  const [measure, setMeasure] = useState<PhotoMeasure | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void measureImage(imageUrl).then((m) => {
      if (alive) setMeasure(m)
    })
    return () => {
      alive = false
    }
  }, [imageUrl])

  // Escape closes (cancel) — the editor is a modal surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const win: CardRect = CARD_GEOMETRY.cropBBox
  const base = useMemo<CardRect | null>(
    () =>
      measure === null
        ? null
        : photoDestRect(measure.width, measure.height, measure.subject, win),
    [measure, win],
  )

  // The pan range at the current zoom: the photo always covers the crop
  // window, so the free travel is its overflow on each axis (design px).
  const freeX = base === null ? 0 : Math.max(0, (base.w * transform.zoom - win.w) / 2)
  const freeY = base === null ? 0 : Math.max(0, (base.h * transform.zoom - win.h) / 2)

  const setZoom = useCallback((next: number) => {
    setTransform((t) => ({ ...t, zoom: clamp(next, PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX) }))
  }, [])

  // Pointer drag / pinch. Pointer capture keeps the gesture alive when the
  // finger leaves the card.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragStart = useRef<{ x: number; y: number; transform: CardPhotoTransform } | null>(null)
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null)

  function designScale(): number {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (rect === undefined || rect.width <= 0) return 1
    return 1080 / rect.width
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, transform }
      pinchStart.current = null
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      dragStart.current = null
      pinchStart.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: transform.zoom,
      }
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2 && pinchStart.current !== null) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      setZoom(pinchStart.current.zoom * (distance / pinchStart.current.distance))
      return
    }

    const start = dragStart.current
    if (start === null) return
    const scale = designScale()
    const dx = (e.clientX - start.x) * scale
    const dy = (e.clientY - start.y) * scale
    setTransform({
      zoom: start.transform.zoom,
      x: freeX > 0 ? clamp(start.transform.x + dx / freeX, -1, 1) : 0,
      y: freeY > 0 ? clamp(start.transform.y + dy / freeY, -1, 1) : 0,
    })
  }

  function endPointer(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) {
      dragStart.current = null
      pinchStart.current = null
    } else if (pointers.current.size === 1) {
      // Pinch → drag: restart the drag from the remaining finger.
      const [only] = [...pointers.current.values()]
      dragStart.current = { x: only.x, y: only.y, transform }
      pinchStart.current = null
    }
  }

  // Wheel zoom (non-passive so the page does not scroll under the gesture).
  useEffect(() => {
    const el = surfaceRef.current
    if (el === null) return
    const onWheel = (e: WheelEvent) => {
      if (busy) return
      e.preventDefault()
      setTransform((t) => ({
        ...t,
        zoom: clamp(t.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX),
      }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [busy])

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (busy) return
    const step = 0.06
    const pan = (dx: number, dy: number) =>
      setTransform((t) => ({ ...t, x: clamp(t.x + dx, -1, 1), y: clamp(t.y + dy, -1, 1) }))
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        pan(-step, 0)
        break
      case 'ArrowRight':
        e.preventDefault()
        pan(step, 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        pan(0, -step)
        break
      case 'ArrowDown':
        e.preventDefault()
        pan(0, step)
        break
      case '+':
      case '=':
        e.preventDefault()
        setZoom(transform.zoom + 0.1)
        break
      case '-':
        e.preventDefault()
        setZoom(transform.zoom - 0.1)
        break
      default:
        break
    }
  }

  const zoomPercent = Math.round(transform.zoom * 100)

  // The preview card: the real artifact when the member has one, otherwise the
  // owner's generic silhouette (plate + crop-path outline only).
  const previewData: CardExportData | null =
    preview === null
      ? null
      : { ...preview, photoSrc: imageUrl, photoTransform: transform }

  const genericDest: CardRect | null = useMemo(
    () => (base === null ? null : applyPhotoTransform(base, win, transform)),
    [base, transform, win],
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-crop-title"
        tabIndex={-1}
        className="w-full max-w-xs rounded-lg border border-line bg-surface p-3 shadow-2xl outline-none sm:max-w-sm"
      >
        <h2 id="card-crop-title" className="text-sm font-semibold text-content">
          Posicionar foto
        </h2>
        <p className="mt-1 text-xs text-muted">
          Arraste a foto e use o zoom para enquadrar o personagem. O texto do card fica
          visível para você não cobrir o rosto.
        </p>

        <div
          ref={surfaceRef}
          tabIndex={0}
          role="application"
          aria-label="Área de enquadramento da foto"
          className="relative mt-3 touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onKeyDown={onKeyDown}
        >
          {previewData !== null ? (
            <CardSvg data={previewData} className="pointer-events-none h-auto w-full" />
          ) : (
            <svg viewBox="0 0 1080 1600" className="pointer-events-none h-auto w-full" aria-hidden="true">
              <defs>
                <clipPath id={clipId}>
                  <path d={CARD_GEOMETRY.cropPath} />
                </clipPath>
              </defs>
              <path d={CARD_GEOMETRY.platePath} fill="#3D2A2B" fillOpacity={0.75} />
              {genericDest !== null && (
                <image
                  href={imageUrl}
                  x={genericDest.x}
                  y={genericDest.y}
                  width={genericDest.w}
                  height={genericDest.h}
                  preserveAspectRatio="none"
                  clipPath={`url(#${clipId})`}
                />
              )}
            </svg>
          )}

          {/* The positioning veil: the card body dims, the crop area (the only
              region the photo controls) stays lit, and the crop path is
              outlined so the boundary is unmistakable. */}
          <svg
            viewBox="0 0 1080 1600"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <mask id={maskId}>
                <rect x="0" y="0" width="1080" height="1600" fill="#fff" />
                <path d={CARD_GEOMETRY.cropPath} fill="#000" />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="1080"
              height="1600"
              fill="#000"
              fillOpacity={0.32}
              mask={`url(#${maskId})`}
            />
            <path
              d={CARD_GEOMETRY.cropPath}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.55}
              strokeWidth={4}
            />
          </svg>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom(transform.zoom - 0.15)}
            disabled={busy || transform.zoom <= PHOTO_ZOOM_MIN}
            aria-label="Diminuir zoom"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-dominant text-content hover-control disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg {...iconProps}>
              <path d="M3 8h10" />
            </svg>
          </button>
          <input
            type="range"
            min={PHOTO_ZOOM_MIN}
            max={PHOTO_ZOOM_MAX}
            step={0.01}
            value={transform.zoom}
            disabled={busy}
            aria-label="Zoom da foto"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="min-w-0 flex-1 accent-accent"
          />
          <button
            type="button"
            onClick={() => setZoom(transform.zoom + 0.15)}
            disabled={busy || transform.zoom >= PHOTO_ZOOM_MAX}
            aria-label="Aumentar zoom"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-dominant text-content hover-control disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg {...iconProps}>
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          <span className="w-10 text-right text-xs tabular-nums text-muted">{zoomPercent}%</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTransform({ zoom: 1, x: 0, y: 0 })}
            disabled={busy}
            className="rounded-md border border-line bg-dominant px-2.5 py-1.5 text-xs font-semibold text-content hover-control disabled:cursor-not-allowed disabled:opacity-60"
          >
            Centralizar
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-md border border-line bg-dominant px-3 py-1.5 text-xs font-semibold text-content hover-control disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirm(transform)}
              disabled={busy}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Enviando…' : 'OK'}
            </button>
          </div>
        </div>

        {errorText !== null && (
          <p role="alert" aria-live="polite" className="mt-2 text-center text-xs font-semibold text-error">
            {errorText}
          </p>
        )}
      </div>
    </div>
  )
}
