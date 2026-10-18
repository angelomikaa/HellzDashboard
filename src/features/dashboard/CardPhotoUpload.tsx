// CardPhotoUpload — the member's character-screenshot area on the Painel
// (07.2-05 checkpoint round 3, owner decision 1: member SELF-upload on their
// own card area). The uploaded screenshot is clipped into the photo-crop
// layer of the member's crest card — on the page and in the JPEG export.
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
// crop renders at ~1000 design px, so this is lossless-in-practice at a
// fraction of the bytes, and it keeps the bucket's 2 MB object cap
// unreachable through the UI.
//
// Preview: a live CrestCard fed by my_card + the current photo (or the
// class-portrait fallback / ASST-01 monogram) — the exact component the
// Destaques showcase uses and plan 07.2-03 will reuse for the member
// Painel EAFC strip + own-card download.
import { useEffect, useRef, useState } from 'react'
import {
  deleteCardPhoto,
  fetchCardPhoto,
  fetchMyCard,
  uploadCardPhoto,
  type MyCard,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { tierForPoints } from '../dashboard/presentation'
import { formatStatValue } from '../../lib/parseStatValue'
import { crestSrcFor } from '../assets/ClassCrest'
import { CrestCard } from '../cards/CrestCard'
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

export function CardPhotoUpload({ session }: { session: NeoFootSession }) {
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

  // Live crest-card preview: my_card's key stats + OVR, the stored photo
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
            tier: tierForPoints(k.points),
          })),
          photoSrc: photoUrl ?? crestSrcFor(card.char_class),
          monogramLetter: card.char_class.charAt(0).toUpperCase(),
        }
      : null

  return (
    <section
      aria-label="Foto do personagem"
      className="rounded-lg border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-content">Foto do personagem</h2>
          <p className="mt-1 text-sm text-muted">
            Envie um print do seu personagem no jogo — ele aparece na janela do seu card.
            JPG ou PNG, a imagem é otimizada automaticamente.
          </p>
          {photoUrl !== null && (
            <img
              src={photoUrl}
              alt="Seu print de personagem atual"
              className="mt-3 h-24 w-24 rounded-md border border-line object-cover"
            />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
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
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="h-11 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover-primary disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {busy ? 'Enviando…' : photoUrl === null ? 'Enviar foto' : 'Alterar foto'}
            </button>
            {photoUrl !== null && (
              <button
                type="button"
                onClick={() => {
                  void handleRemove()
                }}
                disabled={busy}
                className="h-11 rounded-md border border-line px-4 text-sm font-semibold text-content hover-control disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Remover
              </button>
            )}
          </div>
          {error !== null && (
            <p role="alert" aria-live="polite" className="mt-3 text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
        </div>
        {preview !== null && (
          <div className="w-full max-w-64 shrink-0 self-center sm:self-auto">
            <p className="mb-2 text-center text-xs font-semibold tracking-wide text-muted">
              Pré-visualização do seu card
            </p>
            <CrestCard data={preview} className="h-auto w-full" />
          </div>
        )}
      </div>
    </section>
  )
}
