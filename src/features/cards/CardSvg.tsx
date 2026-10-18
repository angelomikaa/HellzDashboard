// CardSvg — the on-page card (07.2-05 checkpoint round 5, owner
// supersession: ONE card.svg is the source of truth for the card design).
//
// REUSABLE BY DESIGN: this is the ONE card both surfaces consume —
//   - PromotionCard (Destaques showcase) wraps it with the download button,
//   - the Painel card area (the upload preview; plan 07.2-03's EAFC strip +
//     own-card download) feeds it member data directly.
//
// SAME ARTIFACT AS THE EXPORT, BY CONSTRUCTION: the component renders
// buildCardPlan(data, 1080) — the EXACT pure plan the canvas export paints
// (cardExport.drawCard). Same path strings, same parsed slot positions,
// same tier palette: on-page card and downloaded JPEG cannot drift apart.
//
// Round-5 composition (the owner's rules):
//   1. The photo (member screenshot or class portrait) is CLIPPED TO THE
//      parsed crop path — round 5 brought the crop path back; there are no
//      guideline rects anymore.
//   2. All text is drawn into the PARSED placeholder-slot positions with
//      the tier's code-driven palette (plate fill / border stops / text
//      fill — TIER_PALETTE, the successors of the retired per-tier SVGs).
//   3. The OVR block (big number + job name, NO "OVR" tag) sits over the
//      photo, backed by the plan's top scrim, with the paint-order stroke
//      as the SVG twin of the canvas shadow.
//   4. Fonts: the file's Bebas Neue was a placeholder — the site's Orbitron
//      renders everywhere; textLength squeeze keeps wide Orbitron strings
//      inside their slots.
//
// Photo-crop contract: data.photoSrc (member screenshot or class portrait —
// always a same-origin asset/blob URL, T-072-13); null falls back to the
// ASST-01 monogram. Static neon only (07.1 D-05) — nothing animates; the
// svg is decorative (aria-hidden) because every consumer labels the
// surrounding article.
//
// Overflow guards: the canvas shell shrinks long text via fitText (measure
// + shrink); SVG has no measuring, so text that would overflow its slot
// gets textLength + lengthAdjust="spacingAndGlyphs" (a condensed squeeze —
// the same visual contract: the text stays inside its column).
import { useId, useMemo } from 'react'
import { buildCardPlan, type CardExportData } from '../export/cardExport'

/** Orbitron's average advance ≈ 0.62em — the estimate that decides whether
 *  a string needs the squeeze (slightly conservative: squeeze a touch early
 *  rather than overflow past the next column). */
const overflows = (text: string, size: number, maxWidth: number): boolean =>
  text.length * size * 0.62 > maxWidth

const squeeze = (text: string, size: number, maxWidth: number): number | undefined =>
  overflows(text, size, maxWidth) ? maxWidth : undefined

export function CardSvg({ data, className }: { data: CardExportData; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  // The plan at the design space's own width — the <svg viewBox> does the
  // responsive mapping for free (canvas's scalePath job, done by the browser).
  const plan = useMemo(() => buildCardPlan(data, 1080), [data])
  const plateClipId = `card-plate-clip-${uid}`
  const cropClipId = `card-crop-clip-${uid}`
  const borderGradId = `card-border-grad-${uid}`
  const scrimId = `card-scrim-${uid}`
  const b = plan.photoBBox

  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The tier border gradient (parsed geometry + palette stops) */}
        <linearGradient
          id={borderGradId}
          gradientUnits="userSpaceOnUse"
          x1={plan.card.borderStroke.line.x1}
          y1={plan.card.borderStroke.line.y1}
          x2={plan.card.borderStroke.line.x2}
          y2={plan.card.borderStroke.line.y2}
        >
          {plan.palette.borderStops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        {/* Border clip: the plate silhouette itself (the SVG twin of the
            canvas's ctx.clip(plate) — only the inner stroke half shows). */}
        <clipPath id={plateClipId}>
          <path d={plan.card.platePath} />
        </clipPath>
        {/* Photo clip: THE crop path from card.svg (round 5). */}
        <clipPath id={cropClipId}>
          <path d={plan.photoClipPath} />
        </clipPath>
        {/* Top legibility scrim (backs the over-photo OVR block) */}
        <linearGradient id={scrimId} gradientUnits="userSpaceOnUse" x1="0" y1={plan.scrim.y1} x2="0" y2={plan.scrim.y2}>
          <stop offset="0" stopColor="#000000" stopOpacity={plan.scrim.alpha} />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Base + plate: the tier palette fill edge-to-edge (no anti-aliasing
          fringe), then card.svg's silhouette in the same fill. */}
      <rect x="0" y="0" width={plan.width} height={plan.height} fill={plan.palette.plateFill} />
      <path d={plan.card.platePath} fill={plan.palette.plateFill} />

      {/* Decorative border: the tier gradient stroked along the silhouette,
          clipped to it (only the inner half shows). */}
      <g clipPath={`url(#${plateClipId})`}>
        <path
          d={plan.card.platePath}
          fill="none"
          stroke={`url(#${borderGradId})`}
          strokeWidth={plan.card.borderStroke.width}
        />
      </g>

      {/* Photo: member screenshot / class portrait CLIPPED TO THE CROP PATH
          (preserveAspectRatio slice over the crop bbox = cover-fit) — or the
          ASST-01 monogram (never an empty hole). */}
      <g clipPath={`url(#${cropClipId})`}>
        {plan.photo.kind === 'image' ? (
          <image
            href={plan.photo.src}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <>
            <path d={plan.photoClipPath} fill={plan.colors.monogramTile} />
            <text
              x={b.x + b.w / 2}
              y={b.y + b.h * 0.45}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="Orbitron, sans-serif"
              fontWeight="700"
              fontSize={b.h * 0.2}
              fill={plan.colors.monogramText}
            >
              {plan.photo.letter}
            </text>
          </>
        )}
        {/* Top legibility scrim over the photo (OVR block sits on it). */}
        <rect x={b.x} y={b.y} width={b.w} height={plan.scrim.y2 - plan.scrim.y1} fill={`url(#${scrimId})`} />
      </g>

      {/* OVR block — big number + JOB NAME below, NO "OVR" tag, at the
          parsed slot positions. The stroked under-layer (paint-order) is
          the SVG twin of the canvas's text shadow: white type stays legible
          over any screenshot. */}
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

      {/* Player name — on the plate between photo and stats, palette text
          fill, centered (round-5 decision); the solid card color guarantees
          contrast. */}
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

      {/* The 6 key stats — one per parsed slot column (server order), each
          a label / big points number / small raw value stack in the palette
          text fill. */}
      {plan.stats.map((cell, i) => (
        <g key={i} fontFamily="Orbitron, sans-serif" fill={plan.palette.textFill}>
          <text
            x={cell.labelX}
            y={cell.labelY}
            fontSize={cell.labelSize}
            fontWeight="700"
            textLength={squeeze(cell.label, cell.labelSize, cell.labelMaxW)}
            lengthAdjust="spacingAndGlyphs"
          >
            {cell.label}
          </text>
          <text
            x={cell.pointsX}
            y={cell.pointsY}
            fontSize={cell.pointsSize}
            fontWeight="700"
            textLength={squeeze(cell.points, cell.pointsSize, cell.pointsMaxW)}
            lengthAdjust="spacingAndGlyphs"
          >
            {cell.points}
          </text>
          <text
            x={cell.valueX}
            y={cell.valueY}
            fontSize={cell.valueSize}
            fontWeight="600"
            textLength={squeeze(cell.value, cell.valueSize, cell.valueMaxW)}
            lengthAdjust="spacingAndGlyphs"
          >
            {cell.value}
          </text>
        </g>
      ))}

      {/* Hellz mark — brand anchor in the plate tip below the stat slots. */}
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
