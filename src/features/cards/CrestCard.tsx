// CrestCard — the on-page crest card (07.2-05 checkpoint round 3, owner's
// superseding design: the card is the owner's hand-designed crest SVG with
// the content laid inside its guideline rects — the "fake rectangle").
//
// REUSABLE BY DESIGN: this is the ONE card both surfaces consume —
//   - PromotionCard (Destaques showcase) wraps it with the download button,
//   - the Painel card area (this plan's upload preview; plan 07.2-03's EAFC
//     strip + own-card download) feeds it member data directly.
//
// SAME ARTIFACT AS THE EXPORT, BY CONSTRUCTION: the component renders
// buildCardPlan(data, 1000) — the EXACT pure plan the canvas export paints
// (cardExport.drawCard). Same path strings, same guideline-rect positions,
// same colors: on-page card and downloaded JPEG cannot drift apart.
//
// Photo-crop contract: data.photoSrc (member screenshot or class portrait —
// always a same-origin asset/blob URL, T-072-13) is clipped into the crest's
// photo-crop layer via clipPath; null falls back to the ASST-01 monogram.
// The dark legibility scrim spec comes from the plan (same gradient the
// canvas paints).
//
// Static neon only (07.1 D-05) — nothing animates; the svg is decorative
// (aria-hidden) because every consumer labels the surrounding article.
//
// Overflow guards: the canvas shell shrinks long text via fitText (measure
// + shrink); SVG has no measuring, so text that would overflow its band
// gets textLength + lengthAdjust="spacingAndGlyphs" (a condensed squeeze —
// the same visual contract: the text stays inside the guideline rect).

/** Orbitron's average advance ≈ 0.62em — the estimate that decides whether
 *  a string needs the squeeze (slightly conservative: squeeze a touch early
 *  rather than overflow under a chip). */
const overflows = (text: string, size: number, maxWidth: number): boolean =>
  text.length * size * 0.62 > maxWidth

const squeeze = (text: string, size: number, maxWidth: number): number | undefined =>
  overflows(text, size, maxWidth) ? maxWidth : undefined
import { useId, useMemo } from 'react'
import { buildCardPlan, type CardExportData } from '../export/cardExport'

export function CrestCard({ data, className }: { data: CardExportData; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  // The plan at the design space's own size — the <svg viewBox> does the
  // responsive mapping for free (canvas's scalePath job, done by the browser).
  const plan = useMemo(() => buildCardPlan(data, 1000), [data])
  const cropId = `crest-crop-${uid}`
  const scrimId = `crest-scrim-${uid}`
  const plateId = `crest-plate-${uid}`

  return (
    <svg viewBox="0 0 1000 1000" className={className} aria-hidden="true" focusable="false">
      <defs>
        {/* Impecável plate: the owner's Soft_Spectrum gradient (parsed from
            the SVG — userSpaceOnUse line + stops) */}
        {plan.plateFill.kind === 'gradient' && (
          <linearGradient
            id={plateId}
            gradientUnits="userSpaceOnUse"
            x1={plan.plateFill.x1}
            y1={plan.plateFill.y1}
            x2={plan.plateFill.x2}
            y2={plan.plateFill.y2}
          >
            {plan.plateFill.stops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        )}
        <clipPath id={cropId}>
          <path d={plan.crest.photoCropPath} />
        </clipPath>
        <linearGradient
          id={scrimId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={plan.scrim.y1}
          x2="0"
          y2={plan.scrim.y2}
        >
          <stop offset="0" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity={plan.scrim.alpha} />
        </linearGradient>
      </defs>

      {/* The crest frame: the owner's Plate path, the tier's palette. */}
      <path
        d={plan.crest.platePath}
        fill={plan.plateFill.kind === 'solid' ? plan.plateFill.hex : `url(#${plateId})`}
      />

      {/* Photo crop: member screenshot / class portrait clipped into the
          crest's crop layer — or the ASST-01 monogram (never an empty hole). */}
      <g clipPath={`url(#${cropId})`}>
        {plan.photo.kind === 'image' ? (
          <image
            href={plan.photo.src}
            x="0"
            y="0"
            width="1000"
            height="1000"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <>
            <rect x="0" y="0" width="1000" height="1000" fill={plan.colors.monogramTile} />
            <text
              x="500"
              y="380"
              textAnchor="middle"
              fontFamily="Orbitron, sans-serif"
              fontWeight="700"
              fontSize="160"
              fill={plan.colors.monogramText}
            >
              {plan.photo.letter}
            </text>
          </>
        )}
        {/* Legibility scrim under the text bands (same spec the canvas paints). */}
        <rect x="0" y="0" width="1000" height="1000" fill={`url(#${scrimId})`} />
      </g>

      {/* OVR hero — inside the OVR-number guideline box. The stroked
          under-layer (paint-order) is the SVG twin of the canvas's text
          shadow: white type stays legible over any screenshot. */}
      <g fontFamily="Orbitron, sans-serif" fill={plan.ovr.color}>
        <text
          x={plan.ovr.captionX}
          y={plan.ovr.captionY}
          fontSize={plan.ovr.captionSize}
          fontWeight="700"
          stroke="#000000"
          strokeOpacity="0.55"
          strokeWidth={plan.ovr.captionSize * 0.14}
          paintOrder="stroke"
        >
          {plan.ovr.caption}
        </text>
        <text
          x={plan.ovr.x}
          y={plan.ovr.y}
          fontSize={plan.ovr.size}
          fontWeight="900"
          stroke="#000000"
          strokeOpacity="0.55"
          strokeWidth={plan.ovr.size * 0.06}
          paintOrder="stroke"
        >
          {plan.ovr.text}
        </text>
      </g>

      {/* Name + class·função — inside the Name-and-job guideline band. */}
      <g fontFamily="Orbitron, sans-serif" fill={plan.name.color} textAnchor="middle">
        <text
          x={plan.name.x}
          y={plan.name.y}
          fontSize={plan.name.size}
          fontWeight="700"
          textLength={squeeze(plan.name.text, plan.name.size, plan.name.maxWidth)}
          lengthAdjust="spacingAndGlyphs"
          stroke="#000000"
          strokeOpacity="0.55"
          strokeWidth={plan.name.size * 0.1}
          paintOrder="stroke"
        >
          {plan.name.text}
        </text>
        <text
          x={plan.subtitle.x}
          y={plan.subtitle.y}
          fontSize={plan.subtitle.size}
          fontWeight="600"
          textLength={squeeze(plan.subtitle.text, plan.subtitle.size, plan.name.maxWidth)}
          lengthAdjust="spacingAndGlyphs"
          stroke="#000000"
          strokeOpacity="0.55"
          strokeWidth={plan.subtitle.size * 0.12}
          paintOrder="stroke"
        >
          {plan.subtitle.text}
        </text>
      </g>

      {/* The 6 key stats — 2-col × 3-row inside the six-key-stats guideline
          band, server order, each cell a self-contained label/value/chip
          group (round-2 gutter discipline, derived from the owner's rects). */}
      {plan.stats.map((cell, i) => (
        <g key={i}>
          <text
            x={cell.labelX}
            y={cell.labelY}
            fontFamily="Orbitron, sans-serif"
            fontSize={cell.labelSize}
            fontWeight="700"
            fill={plan.colors.text}
            stroke="#000000"
            strokeOpacity="0.5"
            strokeWidth={cell.labelSize * 0.12}
            paintOrder="stroke"
          >
            {cell.label}
          </text>
          <text
            x={cell.valueX}
            y={cell.valueY}
            fontFamily="Orbitron, sans-serif"
            fontSize={cell.valueSize}
            fontWeight="700"
            textLength={squeeze(cell.value, cell.valueSize, cell.valueMaxW)}
            lengthAdjust="spacingAndGlyphs"
            fill={plan.colors.text}
            stroke="#000000"
            strokeOpacity="0.5"
            strokeWidth={cell.valueSize * 0.1}
            paintOrder="stroke"
          >
            {cell.value}
          </text>
          <rect
            x={cell.chipX}
            y={cell.chipY}
            width={cell.chipW}
            height={cell.chipH}
            rx={cell.chipH / 2}
            fill={cell.chipColor}
          />
          <text
            x={cell.chipX + cell.chipW / 2}
            y={cell.chipY + cell.chipH / 2}
            dominantBaseline="central"
            textAnchor="middle"
            fontFamily="Orbitron, sans-serif"
            fontSize={cell.chipH * 0.52}
            fontWeight="700"
            fill={cell.chipTextColor}
          >
            {cell.chipText}
          </text>
        </g>
      ))}

      {/* Hellz mark — brand anchor below the stat band. */}
      <image
        href={plan.mark.src}
        x={plan.mark.x - plan.mark.size / 2}
        y={plan.mark.y - plan.mark.size / 2}
        width={plan.mark.size}
        height={plan.mark.size}
      />
    </svg>
  )
}
