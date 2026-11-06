// CardPhotoUpload — the member's character-screenshot area on the Painel
// (07.2-05 checkpoint round 3, owner decision 1: member SELF-upload on their
// own card area). The uploaded screenshot fills the card's crop-path photo
// area — on the page and in the PNG export.
//
// POSITION CROP (owner 2026-11-05): picking a file opens CardPhotoCrop, the
// positioning step — the real card preview (or the generic silhouette when the
// member has no card yet) with the photo clipped to the crop path, where the
// member drags/zooms until the face is clear of the text. Only on OK does the
// photo upload; the framing is stored device-locally (photoTransformStore) and
// rides the preview AND the download. The photo itself keeps its UPLOAD
// DIMENSIONS — it is only clipped for display, never baked.
//
// Controlled surface (performance pass): DashboardPage owns the card payload,
// the photo object URL and the export assembly, and passes the one preview
// down — so the Painel fetches my_card and the photo ONCE, and an upload or
// removal here updates the download's photo too. Enforcement is 100% server-side (Storage RLS on
// storage.objects: a member writes ONLY their own path — top-level folder =
// the JWT member_id claim; every active member reads, because showcase cards
// in Destaques display the photo). The client adds no enforcement — errors
// surface as enumeration-safe pt-BR copy, never raw internals.
//
// Encoding: the bucket accepts image/jpeg up to 2 MB. The original pixel
// dimensions are kept and the quality ladder steps down until the encoded
// JPEG fits the cap (a final downscale only as the last resort, so the upload
// always lands).
//
// Preview: a live CardSvg fed by my_card + the current photo (or the
// class-portrait fallback / ASST-01 monogram) — the exact component the
// Destaques showcase uses and the member Painel's EAFC strip (07.2-03).
//
// Card actions (owner checkpoint round 6; always visible since 2026-11-05 —
// hover-only controls do not work on touch): alter photo / reposition photo /
// remove photo / download card sit IN FLOW under the card, icon-only with an
// accessible label plus a tooltip.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { deleteCardPhoto, fetchCardPhoto, uploadCardPhoto } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { CardSvg } from '../cards/CardSvg'
import type { CardExportData } from '../export/cardExport'
import type { CardPhotoTransform } from '../export/cardAssets'
import { CardPhotoCrop } from './CardPhotoCrop'

// Enumeration-safe pt-BR copy (shared UI contract): never expose HTTP codes
// or which check failed.
const UPLOAD_ERROR = 'Não foi possível enviar a imagem. Tente novamente.'
const REMOVE_ERROR = 'Não foi possível remover a imagem. Tente novamente.'
const LOAD_ERROR = 'Não foi possível carregar sua foto de personagem.'
const INVALID_FILE = 'Escolha um arquivo de imagem (JPG ou PNG).'

/** Hard input guard (defense in depth — the bucket also caps object size).
 *  Game screenshots beyond 25 MB are pathological; anything bigger is
 *  refused before decode. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024

/** The card-photos bucket's cap (image/jpeg only, 2 MB). */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

const JPEG_QUALITY_LADDER = [0.92, 0.86, 0.8, 0.72, 0.64, 0.56] as const

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = url
  })
}

function encodeJpeg(img: HTMLImageElement, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('encode failed')) : resolve(blob)),
      'image/jpeg',
      quality,
    )
  })
}

/** Re-encode the upload as JPEG at its OWN dimensions, stepping the quality
 *  down until it fits the bucket cap; a downscale is the last resort. */
async function encodeCardPhoto(file: File): Promise<Blob> {
  const srcUrl = URL.createObjectURL(file)
  try {
    const img = await decodeImage(srcUrl)
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (w <= 0 || h <= 0) throw new Error('empty image')
    for (const quality of JPEG_QUALITY_LADDER) {
      const blob = await encodeJpeg(img, w, h, quality)
      if (blob.size <= MAX_UPLOAD_BYTES) return blob
    }
    let scale = Math.min(1, 1600 / Math.max(w, h))
    while (scale > 0.05) {
      const blob = await encodeJpeg(img, w * scale, h * scale, 0.82)
      if (blob.size <= MAX_UPLOAD_BYTES) return blob
      scale *= 0.75
    }
    throw new Error('cannot fit the upload cap')
  } finally {
    URL.revokeObjectURL(srcUrl)
  }
}

/** Icon-only card action with a hover/focus tooltip (owner round 6). The
 *  tooltip is CSS-only (no JS state) and the accessible name lives on the
 *  button, so screen readers never depend on the tooltip being visible. */
function IconAction({
  label,
  onClick,
  disabled = false,
  tone = 'neutral',
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'accent' | 'neutral'
  children: ReactNode
}) {
  return (
    <span className="group/action relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
          tone === 'accent'
            ? 'bg-accent text-accent-foreground hover-primary'
            : 'border border-line bg-dominant text-content hover-control'
        }`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-dominant px-2 py-1 text-[11px] font-semibold text-content opacity-0 shadow-lg transition-opacity group-hover/action:opacity-100 group-focus-within/action:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** The photo waiting in the crop editor. `file` is null when the member is
 *  repositioning the already-stored photo (the URL belongs to the parent). */
interface PendingPhoto {
  url: string
  file: File | null
}

export function CardPhotoUpload({
  session,
  preview,
  photoUrl,
  photoLoadFailed = false,
  photoTransform = null,
  onPhotoChange,
  onPhotoTransformChange,
  onDownload,
  downloading = false,
  downloadError = null,
  className = '',
}: {
  session: NeoFootSession
  /** The live card preview, assembled by the owner (DashboardPage). Null while
   *  the card is insufficient (OVR null) — the upload UI still works. */
  preview: CardExportData | null
  /** Object URL of the stored screenshot (null = none uploaded — the designed
   *  empty state). The owner revokes it when it is replaced. */
  photoUrl: string | null
  photoLoadFailed?: boolean
  /** The member's stored framing (zoom + pan) for the current photo. */
  photoTransform?: CardPhotoTransform | null
  /** Receives the stored screenshot after an upload (fresh blob) or null after
   *  a removal, so the owner keeps one photo URL for every surface. */
  onPhotoChange: (photo: Blob | null) => void
  /** Receives the confirmed framing so the owner persists it and feeds the
   *  preview/export. */
  onPhotoTransformChange?: (transform: CardPhotoTransform) => void
  // Owner round 6: the own-card download joined the on-card action row
  // (icon-only). DashboardPage owns the export contract and passes the
  // handler/state down.
  onDownload?: () => void
  downloading?: boolean
  downloadError?: string | null
  // Owner checkpoint round 5: the preview lives INSIDE the Painel's OVR
  // strip, so the strip controls the width.
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingPhoto | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingUrlRef = useRef<string | null>(null)

  // A pending object URL created here must not leak when the card unmounts.
  useEffect(() => {
    return () => {
      if (pendingUrlRef.current !== null) URL.revokeObjectURL(pendingUrlRef.current)
    }
  }, [])

  function openCrop(file: File): void {
    const url = URL.createObjectURL(file)
    if (pendingUrlRef.current !== null) URL.revokeObjectURL(pendingUrlRef.current)
    pendingUrlRef.current = url
    setPending({ url, file })
  }

  function closeCrop(): void {
    if (pendingUrlRef.current !== null) URL.revokeObjectURL(pendingUrlRef.current)
    pendingUrlRef.current = null
    setPending(null)
  }

  function handleFile(file: File | undefined): void {
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/') || file.size > MAX_INPUT_BYTES) {
      setError(INVALID_FILE)
      return
    }
    openCrop(file)
  }

  async function handleConfirm(transform: CardPhotoTransform): Promise<void> {
    const current = pending
    if (current === null) return
    setError(null)
    // Repositioning an already-stored photo: no upload, just the framing.
    if (current.file === null) {
      onPhotoTransformChange?.(transform)
      closeCrop()
      return
    }
    setBusy(true)
    try {
      const jpeg = await encodeCardPhoto(current.file)
      await uploadCardPhoto(session, jpeg)
      // Refresh the preview from the STORED object (proves the write landed
      // — the preview is the round-trip proof, not the local file).
      onPhotoChange(await fetchCardPhoto(session))
      onPhotoTransformChange?.(transform)
      closeCrop()
    } catch {
      setError(UPLOAD_ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      await deleteCardPhoto(session)
      onPhotoChange(null)
      onPhotoTransformChange?.({ zoom: 1, x: 0, y: 0 })
    } catch {
      setError(REMOVE_ERROR)
    } finally {
      setBusy(false)
    }
  }

  // Owner 2026-11-05: ONE inline, icon-only action row — alter photo,
  // reposition, remove photo, download card — ALWAYS visible in normal flow
  // (hover-revealed controls are unusable on touch screens).
  const actionButtons = (
    <>
      <IconAction
        label={busy ? 'Enviando…' : photoUrl === null ? 'Enviar foto' : 'Alterar foto'}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        tone="accent"
      >
        <svg {...iconProps}>
          <path d="M8 11V3" />
          <path d="M4 7l4-4 4 4" />
          <path d="M2 13h12" />
        </svg>
      </IconAction>
      {photoUrl !== null && (
        <IconAction
          label="Reposicionar foto"
          onClick={() => {
            if (pendingUrlRef.current !== null) URL.revokeObjectURL(pendingUrlRef.current)
            pendingUrlRef.current = null
            setPending({ url: photoUrl, file: null })
          }}
          disabled={busy}
        >
          <svg {...iconProps}>
            <path d="M2.5 5.5V2.5h3" />
            <path d="M13.5 10.5v3h-3" />
            <path d="M2.5 2.5l4 4" />
            <path d="M13.5 13.5l-4-4" />
          </svg>
        </IconAction>
      )}
      {photoUrl !== null && (
        <IconAction
          label="Remover foto"
          onClick={() => {
            void handleRemove()
          }}
          disabled={busy}
        >
          <svg {...iconProps}>
            <path d="M2.5 4h11" />
            <path d="M6 4V2.5h4V4" />
            <path d="M4 4l.6 9.5h6.8L12 4" />
            <path d="M6.75 6.5v4.5M9.25 6.5v4.5" />
          </svg>
        </IconAction>
      )}
      {onDownload !== undefined && (
        <IconAction
          label={downloading ? 'Gerando…' : 'Baixar card'}
          onClick={onDownload}
          disabled={downloading}
          tone="accent"
        >
          <svg {...iconProps}>
            <path d="M8 2v8" />
            <path d="M4 6l4 4 4-4" />
            <path d="M2 13h12" />
          </svg>
        </IconAction>
      )}
    </>
  )

  const message = error ?? (photoLoadFailed ? LOAD_ERROR : null) ?? downloadError

  return (
    <div className={`flex flex-col ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          // Allow re-selecting the same file.
          if (inputRef.current) inputRef.current.value = ''
        }}
      />
      {preview !== null ? (
        <div role="group" aria-label="Foto do personagem no seu card">
          <CardSvg data={preview} className="h-auto w-full" />
          {/* Always-visible action strip under the card (owner 2026-11-05). */}
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">{actionButtons}</div>
        </div>
      ) : (
        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-3 text-center">
          <p className="text-xs text-muted">Envie um print do seu personagem.</p>
          <div className="flex flex-wrap justify-center gap-1.5">{actionButtons}</div>
        </div>
      )}
      {message !== null && (
        <p role="alert" aria-live="polite" className="mt-2 text-center text-xs font-semibold text-error">
          {message}
        </p>
      )}
      {pending !== null && (
        <CardPhotoCrop
          imageUrl={pending.url}
          preview={preview}
          initial={pending.file === null ? photoTransform : null}
          busy={busy}
          errorText={error}
          onCancel={closeCrop}
          onConfirm={(transform) => {
            void handleConfirm(transform)
          }}
        />
      )}
    </div>
  )
}
