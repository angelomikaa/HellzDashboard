// PromotionCard — the portrait EAFC SHIELD showcase card (07.2-05, CARD-02/
// D-10/D-13 + checkpoint round 2). Pure presentational: the payload arrives
// opaque from the member-invocable get_promotion RPC and is rendered
// verbatim — nothing is recomputed here (rank math lives only in Postgres;
// tier banding via the unit-locked tierForOvr/tierForPoints presentation
// functions).
//
// Checkpoint round 2 (owner's superseding design decision): the rectangular
// bordered card is replaced by a SHIELD — tier-parametric complexity borders
// (bronze/silver simple, gold/Impecável ornate), inspired by the owner's
// ornate scrollwork-shield reference. The frame paths come from
// ../export/shieldFrame.ts — the EXACT same path strings the JPEG export
// strokes via Path2D, so on-page card and downloaded card are the same
// artifact by construction (no raster frame images anywhere).
//
// The 6 highlights are the class's KEY STATS since the 07.2-01 supersession
// (D-13 — same set as the member's own Painel card strip), rendered with the
// 3-letter label_short (D-11) in the 2-col × 3-row EAFC arrangement. They
// arrive in SERVER order (catalog label order per D-13) — never re-sorted
// client-side. Per RNK-02 (re-baselined 07.2 D-03/D-13) the highlights carry
// no special wording, icon or ordering explanation — the tier color of each
// points chip IS the entire celebration.
//
// All tier styling flows through the render-layer display maps in
// ../dashboard/tierDisplay.ts (the top band displays as "Impecável" with a
// static rainbow treatment per the 07.1-02 owner gate). Static neon only —
// nothing animates (07.1 D-05). The ONLY interactive element is the
// 'Baixar card' button (D-08: anyone may download any Impecável player's
// showcase card — the promotion point; D-09: the JPEG carries identity +
// the 6 key stats + points chips, ZERO guild-average data). The button sits
// BELOW the shield — the tapered silhouette must never clip interactive
// content.
import { useId, useState } from 'react'
import type { PromotionCardRow } from '../../lib/api'
import type { Tier } from '../dashboard/presentation'
import { tierForOvr, tierForPoints } from '../dashboard/presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY, TIER_TEXT_GLOW } from '../dashboard/tierDisplay'
import { FUNCTION_LABELS } from '../../lib/groups'
import { formatStatValue } from '../../lib/parseStatValue'
import { ClassCrest, crestSrcFor } from '../assets/ClassCrest'
import { cardFilename, downloadCard, type CardExportData } from '../export/cardExport'
import { buildShieldFrame, PLATINUM_RAINBOW, TIER_HEX } from '../export/shieldFrame'
import markUrl from '../../assets/hellz-mark.svg'

// Enumeration-safe pt-BR copy: never expose HTTP codes or internals.
const DOWNLOAD_ERROR = 'Não foi possível gerar o card. Tente novamente.'

/** The shield frame as an SVG layer — same path strings, same stroke widths
 *  (in the 750×1125 design space) the canvas export strokes. useId keeps the
 *  gradient defs unique per card instance (ids are document-global). */
function ShieldFrameSvg({ tier }: { tier: Tier }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const frame = buildShieldFrame(tier)
  const hex = TIER_HEX[tier]
  const rainbowId = `rainbow-${uid}`
  const washId = `wash-${uid}`
  const rainbow = tier === 'platinum'

  return (
    <svg
      viewBox="0 0 750 1125"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={rainbowId} x1="0" y1="0" x2="1" y2="1">
          {PLATINUM_RAINBOW.map((c, i) => (
            <stop key={c} offset={i / (PLATINUM_RAINBOW.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
        {/* Static tier wash fading down (07.1 D-04/D-05) — the same ~15%
            alpha wash the canvas paints, clipped to the silhouette by
            filling the outer path with the gradient itself. */}
        <linearGradient id={washId} x1="0" y1="0" x2="0" y2="0.55">
          <stop offset="0" stopColor={hex} stopOpacity="0.15" />
          <stop offset="1" stopColor={hex} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Interior: dominant fill (pops from the surface section panel) + wash */}
      <path d={frame.outer} fill="var(--color-dominant)" />
      <path d={frame.outer} fill={`url(#${washId})`} />
      {/* Outer silhouette — Impecável gets the rainbow gradient stroke */}
      <path
        d={frame.outer}
        fill="none"
        stroke={rainbow ? `url(#${rainbowId})` : hex}
        strokeWidth={frame.widths.outer}
        strokeLinejoin="round"
      />
      <path d={frame.inner} fill="none" stroke={hex} strokeOpacity="0.7" strokeWidth={frame.widths.inner} />
      {frame.inner2 !== null && (
        <path d={frame.inner2} fill="none" stroke={hex} strokeOpacity="0.45" strokeWidth={frame.widths.inner2} />
      )}
      {frame.fills.map((d) => (
        <path key={`f-${d.slice(0, 24)}`} d={d} fill={hex} fillOpacity="0.9" />
      ))}
      {frame.strokes.map((d) => (
        <path
          key={`s-${d.slice(0, 24)}`}
          d={d}
          fill="none"
          stroke={hex}
          strokeWidth={frame.widths.ornament}
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

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
    <div className="flex flex-col gap-2">
      <article
        aria-label={`${card.display_name} — ${charClass}`}
        className="relative aspect-[2/3]"
      >
        <ShieldFrameSvg tier={ovrTier} />
        {/* Content lives inside the shield's safe area: px-[15%] matches the
            design-space grid insets (x 112..638); the bottom taper stays
            clear for the mark. Percent paddings scale with the card, so the
            composition holds at every breakpoint. */}
        <div className="relative flex h-full flex-col px-[15%] pb-[8%] pt-[7.5%]">
          {/* Top block: OVR hero + class crest (D-10) */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={`text-xs font-semibold tracking-widest ${TIER_TEXT_DISPLAY[ovrTier]}`}>
                OVR
              </p>
              <p className={`font-display text-6xl font-semibold leading-none ${TIER_TEXT_GLOW[ovrTier]}`}>
                {Math.round(card.ovr)}
              </p>
            </div>
            <ClassCrest charClass={charClass} size="md" />
          </div>
          <h3 className="mt-[9%] truncate text-center text-xl font-semibold text-content">
            {card.display_name}
          </h3>
          <p className="truncate text-center text-xs text-muted">
            {charClass} · {FUNCTION_LABELS[card.char_function]}
          </p>
          {/* The 6 key stats (D-13) — 2-col × 3-row EAFC arrangement, server
              order preserved (filter/verbatim only, never sorted). Each cell
              is a self-contained label/value/chip group with a real gutter —
              the checkpoint round 2 fix mirrored from the export. */}
          <div className="mt-[7%] grid flex-1 grid-cols-2 content-start gap-x-[7%] gap-y-[6%]">
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
          {/* Hellz mark inside the taper — echoes the export's brand anchor */}
          <img
            src={markUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="mx-auto mt-auto h-[5.5%] w-auto"
          />
        </div>
      </article>
      {/* D-08/D-03: the only interactive element on the card. While generating:
          disabled + 'Gerando…'; failure surfaces the inline enumeration-safe
          copy — never raw errors. */}
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
