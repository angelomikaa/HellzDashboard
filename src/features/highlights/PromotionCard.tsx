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
// Photo-crop on showcase cards: the promotion payload carries no member_id,
// so the crop falls back to the member's CLASS PORTRAIT (self-hosted ROO
// asset, D-15 — same-origin, canvas-taint-safe); the member's own uploaded
// screenshot rides on THEIR card via the Painel (CardPhotoUpload; plan
// 07.2-03 completes the member-side own-card). The ASST-01 monogram covers
// art-less classes (Rebellion) — never an empty hole, never a broken image.
//
// The 6 highlights are the class's KEY STATS (07.2-01 D-13 supersession),
// rendered by CardSvg in the owner's slot columns in SERVER order (catalog
// label order per D-13) — never re-sorted client-side. The big points
// number per column IS the entire celebration (round 5: the palette text
// fill replaced the tier-colored chips).
//
// Export contents (D-09/T-072-12 — the JPEG circulates OUTSIDE the guild):
// identity + the 6 key stats + points + Hellz mark. ZERO
// guild-average data. The button sits BELOW the card; while generating:
// disabled + 'Gerando…'; failure → inline enumeration-safe role=alert copy,
// never raw errors.
import { useMemo, useState } from 'react'
import type { PromotionCardRow } from '../../lib/api'
import { formatStatValue } from '../../lib/parseStatValue'
import { crestSrcFor } from '../assets/ClassCrest'
import { CardSvg } from '../cards/CardSvg'
import { cardFilename, downloadCard, type CardExportData } from '../export/cardExport'

// Enumeration-safe pt-BR copy: never expose HTTP codes or internals.
const DOWNLOAD_ERROR = 'Não foi possível gerar o card. Tente novamente.'

export function PromotionCard({ card, charClass }: { card: PromotionCardRow; charClass: string }) {
  // CardSvg derives the tier palette from the unit-locked tierForOvr
  // banding; ovr is ALWAYS non-null on a card (the RPC omits OVR-incapable
  // members), so the card always exists — no insufficient-data variant here.

  // D-08/D-03: the download assembles the export from the SAME verbatim
  // payload the card renders — values pre-formatted (formatStatValue),
  // photo = the class portrait (self-hosted, D-15 — the canvas can never be
  // tainted). CardSvg consumes the identical object.
  const [generating, setGenerating] = useState(false)
  const [failed, setFailed] = useState(false)

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
      photoSrc: crestSrcFor(charClass),
      monogramLetter: charClass.charAt(0).toUpperCase(),
    }),
    [card, charClass],
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
        <p role="alert" aria-live="polite" className="text-xs font-semibold text-destructive">
          {DOWNLOAD_ERROR}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          void handleDownload()
        }}
        disabled={generating}
        aria-label={`Baixar card de ${card.display_name} (JPEG)`}
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-content hover-control disabled:cursor-not-allowed disabled:opacity-60"
      >
        {generating ? 'Gerando…' : 'Baixar card'}
      </button>
    </div>
  )
}
