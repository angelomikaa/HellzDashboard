// PromotionCard — the Destaques showcase card wrapper (07.2-05, CARD-02/
// D-10/D-13; checkpoint round 3 superseding design). Pure presentational:
// the payload arrives opaque from the member-invocable get_promotion RPC
// and is rendered verbatim — nothing is recomputed here (rank math lives
// only in Postgres; tier banding via the unit-locked tierForOvr/tierForPoints
// presentation functions).
//
// ROUND 5 (owner supersession: "check the new card.svg — this one file
// becomes the source of truth for card design"): the card body is now
// CardSvg — the shared component that renders the owner's ONE card.svg
// (placeholder text slots filled by code, photo clipped to the crop path,
// tier colors applied via the code-driven TIER_PALETTE). This wrapper owns
// only the Destaques-specific affordance: the 'Baixar card' download button
// (D-08/D-03/D-09) wired to the SAME export module the card renders from.
//
// Photo-crop on showcase cards (round 7 CONSISTENCY DECISION, owner): both
// card surfaces show the member's SUBMITTED photo where available — the same
// fallback chain as the Painel own-card (CardPhotoUpload). The promotion
// payload (get_promotion) carries the member's card-photos STORAGE PATH
// (photo_path, server-composed); this wrapper fetches it as a BLOB (never a
// cross-origin URL — T-072-13, so the PNG export can never be canvas-tainted)
// and turns it into an object URL. Fallbacks: no path / fetch miss / 404 (no
// upload yet) → the member's CLASS PORTRAIT (self-hosted ROO asset, D-15 —
// same-origin) → the ASST-01 monogram inside CardSvg. Never an empty hole,
// never a broken image.
//
// The 6 highlights are the class's KEY STATS (07.2-01 D-13 supersession),
// rendered by CardSvg in the owner's slot columns in SERVER order (catalog
// label order per D-13) — never re-sorted client-side. The big points
// number per column IS the entire celebration (round 5: the palette text
// fill replaced the tier-colored chips).
//
// Export contents (D-09/T-072-12 — the PNG circulates OUTSIDE the guild):
// identity + the 6 key stats + points + Hellz mark. ZERO
// guild-average data. The button sits BELOW the card; while generating:
// disabled + 'Gerando…'; failure → inline enumeration-safe role=alert copy,
// never raw errors.
import { useEffect, useMemo, useState } from 'react'
import { fetchCardPhotoByPath, type PromotionCardRow } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { formatStatValue } from '../../lib/parseStatValue'
import { portraitSrcFor } from '../assets/ClassCrest'
import { CardSvg } from '../cards/CardSvg'
import { cardFilename, downloadCard, type CardExportData } from '../export/cardExport'

// Enumeration-safe pt-BR copy: never expose HTTP codes or internals.
const DOWNLOAD_ERROR = 'Não foi possível gerar o card. Tente novamente.'

export function PromotionCard({
  session,
  card,
  charClass,
}: {
  session: NeoFootSession
  card: PromotionCardRow
  charClass: string
}) {
  // CardSvg derives the tier palette from the unit-locked tierForOvr
  // banding; ovr is ALWAYS non-null on a card (the RPC omits OVR-incapable
  // members), so the card always exists — no insufficient-data variant here.

  // Round 7 photo consistency: fetch the member's submitted photo (the
  // payload's storage path) as a BLOB → object URL; null until it lands,
  // then the class portrait shows through (the fallback chain's middle rung)
  // and the card re-renders with the real photo. The object URL is revoked
  // on unmount/re-fetch.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    const path = typeof card.photo_path === 'string' ? card.photo_path : ''
    if (path !== '') {
      fetchCardPhotoByPath(session, path)
        .then((blob) => {
          if (!alive || blob === null) return
          objectUrl = URL.createObjectURL(blob)
          setPhotoUrl(objectUrl)
        })
        .catch(() => {
          /* unreachable (fetchCardPhotoByPath resolves null) — degrade to portrait */
        })
    }
    return () => {
      alive = false
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [session, card.photo_path])

  const [generating, setGenerating] = useState(false)
  const [failed, setFailed] = useState(false)

  // D-08/D-03: the download assembles the export from the SAME verbatim
  // payload the card renders — values pre-formatted (formatStatValue),
  // photo = the member's submitted screenshot (blob object URL) or the
  // class portrait (self-hosted, D-15) — both same-origin, the canvas can
  // never be tainted. CardSvg consumes the identical object.
  const exportData: CardExportData = useMemo(
    () => ({
      name: card.display_name,
      charClass,
      charFunction: card.char_function,
      ovr: Math.round(card.ovr),
      stats: card.highlights.map((h) => ({
        label_short: h.label_short,
        value: formatStatValue(h.value, h.value_type),
        points: h.points,
      })),
      photoSrc: photoUrl ?? portraitSrcFor(charClass),
      monogramLetter: charClass.charAt(0).toUpperCase(),
    }),
    [card, charClass, photoUrl],
  )

  async function handleDownload(): Promise<void> {
    setGenerating(true)
    setFailed(false)
    try {
      await downloadCard(exportData, cardFilename(card.display_name))
    } catch {
      setFailed(true)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <article
        aria-label={`${card.display_name} — ${charClass}`}
        className="w-full"
      >
        {/* Round 5: the owner's card.svg IS the card — portrait 27:40 (its
            1080×1600 viewBox), code-filled slot positions + code palette. */}
        <CardSvg data={exportData} className="h-auto w-full" />
      </article>
      {failed && (
        <p role="alert" aria-live="polite" className="text-xs font-semibold text-error">
          {DOWNLOAD_ERROR}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          void handleDownload()
        }}
        disabled={generating}
        aria-label={`Baixar card de ${card.display_name} (PNG)`}
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-content hover-control disabled:cursor-not-allowed disabled:opacity-60"
      >
        {generating ? 'Gerando…' : 'Baixar card'}
      </button>
    </div>
  )
}
