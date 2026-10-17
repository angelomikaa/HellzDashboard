// PromotionCard — the portrait EAFC showcase card (07.2-05, CARD-02/D-10/D-13).
// Pure presentational: the payload arrives opaque from the member-invocable
// get_promotion RPC and is rendered verbatim — nothing is recomputed here
// (rank math lives only in Postgres; tier banding via the unit-locked
// tierForOvr/tierForPoints presentation functions).
//
// 07.2 rework (D-14 register): classic Ultimate Team 2:3 portrait — OVR hero +
// class crest top block, name, class + build-role line, and the 6 highlights
// in the 2-col × 3-row EAFC arrangement. The highlights are the class's KEY
// STATS since the 07.2-01 supersession (D-13 — same set as the member's own
// Painel card strip), rendered with the 3-letter label_short (D-11). The
// typed closed-list PromotionHighlight contract blocks unknown payload fields
// at compile time (T-06-05).
//
// The 6 highlights arrive in SERVER order (catalog label order per D-13) —
// never re-sorted client-side. Per RNK-02 (re-baselined 07.2 D-03/D-13) the
// highlights carry no special wording, icon or ordering explanation — the
// tier color of each points chip IS the entire celebration.
//
// All tier styling flows through the render-layer display maps in
// ../dashboard/tierDisplay.ts (the top band displays as "Impecável" with a
// static rainbow treatment per the 07.1-02 owner gate). Static neon only —
// nothing animates (07.1 D-05). The ONLY interactive element is the
// 'Baixar card' button (D-08: anyone may download any Impecável player's
// showcase card — the promotion point; D-09: the JPEG carries identity +
// the 6 key stats + points chips, ZERO guild-average data).
import { useState } from 'react'
import type { PromotionCardRow } from '../../lib/api'
import { tierForOvr, tierForPoints } from '../dashboard/presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY, TIER_TEXT_GLOW } from '../dashboard/tierDisplay'
import { FUNCTION_LABELS } from '../../lib/groups'
import { formatStatValue } from '../../lib/parseStatValue'
import { ClassCrest, crestSrcFor } from '../assets/ClassCrest'
import { cardFilename, downloadCard, type CardExportData } from '../export/cardExport'

// Enumeration-safe pt-BR copy: never expose HTTP codes or internals.
const DOWNLOAD_ERROR = 'Não foi possível gerar o card. Tente novamente.'

export function PromotionCard({ card, charClass }: { card: PromotionCardRow; charClass: string }) {
  // ovr is ALWAYS non-null on a card (the RPC omits OVR-incapable members),
  // so the tier always exists — no insufficient-data variant here. The
  // non-null assertions below pin that contract (tierForOvr/tierForPoints
  // return Tier | null for the dashboard's nullable inputs).
  const ovrTier = tierForOvr(Math.round(card.ovr)) as NonNullable<ReturnType<typeof tierForOvr>>

  // D-08/D-03: the download assembles the export from the SAME verbatim
  // payload the card renders — values pre-formatted (formatStatValue), tiers
  // via tierForPoints, crest resolved by the same manifest lookup ClassCrest
  // uses (same-origin guaranteed, D-15 — the canvas can never be tainted).
  const [generating, setGenerating] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleDownload(): Promise<void> {
    setGenerating(true)
    setFailed(false)
    try {
      const exportData: CardExportData = {
        name: card.display_name,
        charClass,
        charFunction: card.char_function,
        ovr: Math.round(card.ovr),
        stats: card.highlights.map((h) => ({
          label_short: h.label_short,
          value: formatStatValue(h.value, h.value_type),
          points: h.points,
          tier: tierForPoints(h.points),
        })),
        crestSrc: crestSrcFor(charClass),
      }
      await downloadCard(exportData, cardFilename(card.display_name))
    } catch {
      setFailed(true)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <article
      aria-label={`${card.display_name} — ${charClass}`}
      className={`flex aspect-[2/3] flex-col rounded-xl border-2 bg-surface p-5 hover-card ${TIER_BORDER_DISPLAY[ovrTier]}`}
    >
      {/* Top block: OVR hero + class crest (D-10) */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted">OVR</p>
          <p className={`font-display text-6xl font-semibold leading-none ${TIER_TEXT_GLOW[ovrTier]}`}>
            {Math.round(card.ovr)}
          </p>
        </div>
        <ClassCrest charClass={charClass} size="md" />
      </div>
      <h3 className="mt-4 truncate text-xl font-semibold text-content">{card.display_name}</h3>
      <p className="truncate text-sm text-muted">
        {charClass} · {FUNCTION_LABELS[card.char_function]}
      </p>
      <div className="my-3 border-t border-line" />
      {/* The 6 key stats (D-13) — 2-col × 3-row EAFC arrangement, server order
          preserved (filter/verbatim only, never sorted). 3-letter labels keep
          the compact cells legible (the 07.1-02 single-column fallback was for
          the old full-label anatomy). */}
      <div className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-3">
        {card.highlights.map((h) => {
          const facetTier = tierForPoints(h.points) as NonNullable<ReturnType<typeof tierForPoints>>
          return (
            <div key={h.stat_key} className="flex items-center justify-between gap-1.5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wide text-muted">{h.label_short}</p>
                <p className="truncate text-sm text-content">{formatStatValue(h.value, h.value_type)}</p>
              </div>
              <span
                aria-label={`${Math.round(h.points)} pontos em ${h.label}`}
                className={`shrink-0 rounded-full border px-2 py-1 text-sm font-semibold ${TIER_BORDER_DISPLAY[facetTier]} ${TIER_TEXT_DISPLAY[facetTier]}`}
              >
                {Math.round(h.points)}
              </span>
            </div>
          )
        })}
      </div>
      {/* D-08/D-03: the only interactive element on the card. While generating:
          disabled + 'Gerando…'; failure surfaces the inline enumeration-safe
          copy — never raw errors. */}
      <div className="mt-4 flex flex-col items-stretch gap-1.5">
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
    </article>
  )
}
