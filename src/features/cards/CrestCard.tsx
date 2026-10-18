// CrestCard — the on-page crest card (07.2-05 checkpoint round 4, owner's
// READABILITY REDESIGN: the crests re-exported at 1080×1600 with solid
// content bands and bigger type, because round 3's info was "small and
// unreadable").
//
// REUSABLE BY DESIGN: this is the ONE card both surfaces consume —
//   - PromotionCard (Destaques showcase) wraps it with the download button,
//   - the Painel card area (the upload preview; plan 07.2-03's EAFC strip +
//     own-card download) feeds it member data directly.
//
// SAME ARTIFACT AS THE EXPORT, BY CONSTRUCTION: the component renders
// buildCardPlan(data, 1080) — the EXACT pure plan the canvas export paints
// (cardExport.drawCard). Same path strings, same guideline-rect positions,
// same colors: on-page card and downloaded JPEG cannot drift apart.
//
// Round-4 composition (the owner's rules):
//   1. The photo (member screenshot or class portrait) fills the
//      Content-safezone rect — no dedicated crop path anymore.
//   2. Name-only + six-key-stats are SOLID tier-fill bands laid OVER the
//      photo — text contrast is guaranteed on any screenshot (per-tier
//      band text color: dark on the light metals, white on the pristine
//      magenta). No scrim needed behind the bands.
//   3. The OVR block is the big number + the JOB NAME below it — NO "OVR"
//      tag. It sits over the photo, backed by the plan's top scrim, with
//      the paint-order stroke as the SVG twin of the canvas shadow.
//
// Photo-crop contract: data.photoSrc (member screenshot or class portrait —
// always a same-origin asset/blob URL, T-072-13); null falls back to the
// ASST-01 monogram. Static neon only (07.1 D-05) — nothing animates; the
// svg is decorative (aria-hidden) because every consumer labels the
// surrounding article.
//
// Overflow guards: the canvas shell shrinks long text via fitText (measure
// + shrink); SVG has no measuring, so text that would overflow its band
// gets textLength + lengthAdjust="spacingAndGlyphs" (a condensed squeeze —
// the same visual contract: the text stays inside the guideline rect).
import { useId, useMemo } from 'react'
import { buildCardPlan, type CardExportData } from '../export/cardExport'

/** Orbitron's average advance ≈ 0.62em — the estimate that decides whether
 *  a string needs the squeeze (slightly conservative: squeeze a touch early
 *  rather than overflow under a chip). */
const overflows = (text: string, size: number, maxWidth: number): boolean =>
  text.length * size * 0.62 > maxWidth

const squeeze = (text: string, size: number, maxWidth: number): number | undefined =>
  overflows(text, size, maxWidth) ? maxWidth : undefined

export function CrestCard({ data, className }: { data: CardExportData; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  // The plan at the design space's own width — the <svg viewBox> does the
  // responsive mapping for free (canvas's scalePath job, done by the browser).
  const plan = useMemo(() => buildCardPlan(data, 1080), [data])
  const plateClipId = `crest-plate-clip-${uid}`
  const borderGradId = `crest-border-grad-${uid}`
  const scrimId = `crest-scrim-${uid}`
  const photo = plan.photoRect

  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The tier border gradient (parsed from the SVG — userSpaceOnUse
            line + stops) */}
        <linearGradient
          id={borderGradId}
          gradientUnits="userSpaceOnUse"
          x1={plan.crest.borderStroke.gradient.x1}
          y1={plan.crest.borderStroke.gradient.y1}
          x2={plan.crest.borderStroke.gradient.x2}
          y2={plan.crest.borderStroke.gradient.y2}
        >
          {plan.crest.borderStroke.gradient.stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        {/* Border clip: the plate silhouette itself (the SVG twin of the
            canvas's ctx.clip(plate) — only the inner stroke half shows). */}
        <clipPath id={plateClipId}>
          <path d={plan.crest.platePath} />
        </clipPath>
        {/* Top legibility scrim (backs the over-photo OVR block) */}
        <linearGradient id={scrimId} gradientUnits="userSpaceOnUse" x1="0" y1={plan.scrim.y1} x2="0" y2={plan.scrim.y2}>
          <stop offset="0" stopColor="#000000" stopOpacity={plan.scrim.alpha} />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Base + plate: the tier fill edge-to-edge (no anti-aliasing fringe),
          then the owner's Plate silhouette in the same fill. */}
      <rect x="0" y="0" width={plan.width} height={plan.height} fill={plan.crest.tierFillHex} />
      <path d={plan.crest.platePath} fill={plan.crest.tierFillHex} />

      {/* Decorative border: the tier gradient stroked along the silhouette,
          clipped to it (only the inner half shows). */}
      <g clipPath={`url(#${plateClipId})`}>
        <path
          d={plan.crest.platePath}
          fill="none"
          stroke={`url(#${borderGradId})`}
          strokeWidth={plan.crest.borderStroke.width}
        />
      </g>

      {/* Photo: member screenshot / class portrait filling the
          Content-safezone rect (preserveAspectRatio slice = cover-fit) — or
          the ASST-01 monogram (never an empty hole). */}
      {plan.photo.kind === 'image' ? (
        <image
          href={plan.photo.src}
          x={photo.x}
          y={photo.y}
          width={photo.w}
          height={photo.h}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <rect x={photo.x} y={photo.y} width={photo.w} height={photo.h} fill={plan.colors.monogramTile} />
          <text
            x={photo.x + photo.w / 2}
            y={photo.y + photo.h * 0.45}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Orbitron, sans-serif"
            fontWeight="700"
            fontSize={photo.h * 0.22}
            fill={plan.colors.monogramText}
          >
            {plan.photo.letter}
          </text>
        </>
      )}
      {/* Top legibility scrim over the photo (OVR block sits on it). */}
      <rect x={photo.x} y={photo.y} width={photo.w} height={plan.scrim.y2 - plan.scrim.y1} fill={`url(#${scrimId})`} />

      {/* SOLID bands over the photo (round-4 contrast design): the tier fill
          guarantees text legibility on any screenshot. */}
      <rect
        x={plan.nameBand.rect.x}
        y={plan.nameBand.rect.y}
        width={plan.nameBand.rect.w}
        height={plan.nameBand.rect.h}
        fill={plan.nameBand.fill}
      />
      <rect
        x={plan.statsBand.rect.x}
        y={plan.statsBand.rect.y}
        width={plan.statsBand.rect.w}
        height={plan.statsBand.rect.h}
        fill={plan.statsBand.fill}
      />

      {/* OVR block — big number + JOB NAME below, NO "OVR" tag (round 4).
          The stroked under-layer (paint-order) is the SVG twin of the
          canvas's text shadow: white type stays legible over any screenshot. */}
      <g fontFamily="Orbitron, sans-serif" fill={plan.ovr.color}>
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
        <text
          x={plan.ovr.jobX}
          y={plan.ovr.jobY}
          textAnchor="middle"
          fontSize={plan.ovr.jobSize}
          fontWeight="700"
          textLength={squeeze(plan.ovr.jobText, plan.ovr.jobSize, plan.ovr.jobMaxW)}
          lengthAdjust="spacingAndGlyphs"
          stroke="#000000"
          strokeOpacity="0.55"
          strokeWidth={plan.ovr.jobSize * 0.12}
          paintOrder="stroke"
        >
          {plan.ovr.jobText}
        </text>
      </g>

      {/* Name — the ONLY content of the Name-only band (round 4), on the
          solid tier fill with the contrast-aware color. */}
      <text
        x={plan.name.x}
        y={plan.name.y}
        textAnchor="middle"
        fontFamily="Orbitron, sans-serif"
        fontSize={plan.name.size}
        fontWeight="700"
        fill={plan.name.color}
        textLength={squeeze(plan.name.text, plan.name.size, plan.name.maxWidth)}
        lengthAdjust="spacingAndGlyphs"
      >
        {plan.name.text}
      </text>

      {/* The 6 key stats — 2-col × 3-row inside the solid six-key-stats
          band, server order, each cell a self-contained label/value/chip
          group (round-2 gutter discipline, round-4 readability sizes). */}
      {plan.stats.map((cell, i) => (
        <g key={i}>
          <text
            x={cell.labelX}
            y={cell.labelY}
            fontFamily="Orbitron, sans-serif"
            fontSize={cell.labelSize}
            fontWeight="700"
            fill={plan.nameBand.text}
          >
            {cell.label}
          </text>
          <text
            x={cell.valueX}
            y={cell.valueY}
            fontFamily="Orbitron, sans-serif"
            fontSize={cell.valueSize}
            fontWeight="700"
            fill={plan.nameBand.text}
            textLength={squeeze(cell.value, cell.valueSize, cell.valueMaxW)}
            lengthAdjust="spacingAndGlyphs"
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

      {/* Hellz mark — brand anchor in the plate tip below the stat band. */}
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
