// CardPhotoUpload — the member's character-screenshot area on the Painel
// (07.2-05 checkpoint round 3, owner decision 1: member SELF-upload on their
// own card area). The uploaded screenshot fills the card's crop-path photo
// area (round 5: card.svg's <path id="crop-path">) — on the page and in the
// JPEG export.
//
// Self-contained surface: owns its own data calls (fetchMyCard for the card
// preview + the photo read) so DashboardPage's "ONE fetch" report discipline
// stays untouched. Enforcement is 100% server-side (Storage RLS on
// storage.objects: a member writes ONLY their own path — top-level folder =
// the JWT member_id claim; every active member reads, because showcase cards
// in Destaques display the photo). The client adds no enforcement — errors
// surface as enumeration-safe pt-BR copy, never raw internals.
//
// Client-side compression (screenshots can be MBs): the file is decoded and
// re-encoded as a ≤1200px JPEG (q≈0.85) BEFORE upload — the card's photo
// area (the crop path, ~931×783 design-px bbox) renders at most at the
// 2160×3200 export backing store, so this is lossless-in-practice at a
// fraction of the bytes, and it keeps the bucket's 2 MB object cap
// unreachable through the UI.
//
// Preview: a live CardSvg fed by my_card + the current photo (or the
// class-portrait fallback / ASST-01 monogram) — the exact component the
// Destaques showcase uses and the member Painel's EAFC strip (07.2-03).
//
// Card actions (owner checkpoint round 6): alter photo / remove photo /
// download card are THREE icon-only buttons shown inline over the card's
// bottom edge on hover/focus (touch screens get the same row in normal
// flow). Each icon carries an accessible label plus a tooltip, so the
// strip stays free of button text.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  deleteCardPhoto,
  fetchCardPhoto,
  fetchMyCard,
  uploadCardPhoto,
  type MyCard,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { formatStatValue } from '../../lib/parseStatValue'
import { crestSrcFor } from '../assets/ClassCrest'
import { CardSvg } from '../cards/CardSvg'
import type { CardExportData } from '../export/cardExport'

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

/** Decode + downscale + re-encode: ≤1200px on the long edge, JPEG q 0.85. */
async function compressToJpeg(file: File, maxDim = 1200, quality = 0.85): Promise<Blob> {
  const srcUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = srcUrl
    })
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('canvas unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob === null) throw new Error('encode failed')
    return blob
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

export function CardPhotoUpload({
  session,
  onDownload,
  downloading = false,
  downloadError = null,
  className = '',
}: {
  session: NeoFootSession
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
  // Photo: object URL of the stored screenshot (null = none uploaded — the
  // designed empty state). Card: the my_card payload for the live preview.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [card, setCard] = useState<MyCard | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    let currentUrl: string | null = null
    // The two reads are independent surfaces: a photo failure must not take
    // down the card preview and vice-versa.
    fetchCardPhoto(session)
      .then((blob) => {
        if (cancelled || blob === null) return
        currentUrl = URL.createObjectURL(blob)
        setPhotoUrl(currentUrl)
      })
      .catch(() => {
        if (!cancelled) setError(LOAD_ERROR)
      })
    fetchMyCard(session)
      .then((c) => {
        if (!cancelled) setCard(c)
      })
      .catch(() => {
        // No card preview (e.g. no submission yet) — the upload UI still works.
        if (!cancelled) setCard(null)
      })
    return () => {
      cancelled = true
      if (currentUrl !== null) URL.revokeObjectURL(currentUrl)
    }
  }, [session])

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/') || file.size > MAX_INPUT_BYTES) {
      setError(INVALID_FILE)
      return
    }
    setBusy(true)
    try {
      const jpeg = await compressToJpeg(file)
      await uploadCardPhoto(session, jpeg)
      // Refresh the preview from the STORED object (proves the write landed
      // — the preview is the round-trip proof, not the local file).
      const stored = await fetchCardPhoto(session)
      setPhotoUrl((prev) => {
        if (prev !== null) URL.revokeObjectURL(prev)
        return stored === null ? null : URL.createObjectURL(stored)
      })
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
      setPhotoUrl((prev) => {
        if (prev !== null) URL.revokeObjectURL(prev)
        return null
      })
    } catch {
      setError(REMOVE_ERROR)
    } finally {
      setBusy(false)
    }
  }

  // Live card preview: my_card's key stats + OVR, the stored photo
  // (or the class-portrait fallback / monogram). OVR-null members (insufficient
  // data) get the upload UI without the card — tierForOvr needs a number.
  const preview: CardExportData | null =
    card !== null && card.char_class !== null && card.ovr.value !== null
      ? {
          name: session.display_name,
          charClass: card.char_class,
          charFunction: card.char_function,
          ovr: Math.round(card.ovr.value),
          stats: card.key_stats.map((k) => ({
            label_short: k.label_short,
            value: k.own_value === null ? '—' : formatStatValue(k.own_value, k.value_type),
            points: k.points,
          })),
          photoSrc: photoUrl ?? crestSrcFor(card.char_class),
          monogramLetter: card.char_class.charAt(0).toUpperCase(),
        }
      : null

  // Owner checkpoint round 6: ONE inline, icon-only action row — alter photo,
  // remove photo, download card — with tooltips (excessive text would clutter
  // the strip). Shown on hover/focus over the card at sm+, always in flow on
  // touch/narrow screens.
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

  return (
    <div className={`flex flex-col ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]).then(() => {
            // Allow re-selecting the same file.
            if (inputRef.current) inputRef.current.value = ''
          })
        }}
      />
      {preview !== null ? (
        <div
          className="group relative"
          role="group"
          aria-label="Foto do personagem no seu card"
        >
          <CardSvg data={preview} className="h-auto w-full" />
          {/* Owner checkpoint round 9: the actions are a STRIP pinned across
              the card's bottom edge; hover/focus reveals it, touch screens
              get the row in flow. */}
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:absolute sm:inset-x-0 sm:bottom-0 sm:mt-0 sm:border-t sm:border-line sm:bg-dominant/90 sm:p-1.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {actionButtons}
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-3 text-center">
          <p className="text-xs text-muted">Envie um print do seu personagem.</p>
          <div className="flex flex-wrap justify-center gap-1.5">{actionButtons}</div>
        </div>
      )}
      {(error !== null || downloadError !== null) && (
        <p role="alert" aria-live="polite" className="mt-2 text-center text-xs font-semibold text-destructive">
          {error ?? downloadError}
        </p>
      )}
    </div>
  )
}
