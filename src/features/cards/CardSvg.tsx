// CardSvg — the on-page card (07.2-05 checkpoint round 8, owner re-seed:
// ONE card.svg is the source of truth — placeholder text slots filled by
// code, photo clipped to the crop path (borderless), tier colors via
// code-driven TIER_PALETTE, Bebas Neue everywhere except the player name
// (Orbitron), the border stroking the PLATE silhouette over the photo,
// central column alignment, transparent background outside the shield
// plate).
//
// REUSABLE BY DESIGN: this is the ONE card both surfaces consume —
//   - PromotionCard (Destaques showcase) wraps it with the download button,
//   - CardPhotoUpload (Painel own-card preview, plan 07.2-03's EAFC strip +
//     own-card download) feeds it member data directly.
//
// SAME ARTIFACT AS THE EXPORT, BY CONSTRUCTION: the component renders
// buildCardPlan(data, 1080) — the EXACT pure plan the canvas export paints
// (cardExport.drawCard). Same path strings, same parsed slot positions,
// same tier palette: on-page card and downloaded PNG cannot drift apart.
//
// Round 7 composition (the owner's rules):
//   1. The plate (shield-shaped tier color) is painted FIRST — nothing
//      fills outside it, so the card has NO background: the downloaded PNG
//      is transparent around the shield, and the on-page card shows the
//      page backdrop through it.
//   2. The photo (member screenshot or class portrait) is CLIPPED TO THE
//      parsed crop path (round 5 brought it back — no guideline rects,
//      just the text to be edited).
//   3. The detached border (gradient stroke, width 48) is painted ON THE
//      PLATE SILHOUETTE — the file's three-layer background (round 8): the
//      border rings the whole shield, covering the photo's edges, while the
//      crop area itself stays BORDERLESS. CLIPPED to the plate silhouette
//      (the owner's clip-path-1): the outer half of the stroke is cut, the
//      inner band paints over the photo/plate edges.
//   4. The top scrim backs the over-photo OVR block. All text is Bebas Neue
//      EXCEPT the player name (Orbitron). Every text slot shrinks-to-fit
//      its column (real measured metrics) so labels 4–6 chars wide never
//      collide; the stat columns are CENTRALLY aligned (number / label /
//      value share one center x per column).
//
// Photo-crop contract: data.photoSrc (member screenshot or class portrait —
// always a same-origin asset/blob URL, T-072-13); null falls back to the
// ASST-01 monogram. Static neon only (07.1 D-05) — nothing animates; the
// svg is decorative (aria-hidden) because every consumer labels the
// surrounding article.
//
// Overflow guards (rounds 6-7): the canvas shell and this component share
// ONE fit contract (cardExport.fitCardText): REAL measured advance
// metrics (canvas measureText with the loaded font). Every slot shrinks its
// font size proportionally to fit its column (readability floor), with a
// textLength glyph-squeeze only as the emergency clamp past the floor.
// Text lives INSIDE the <svg viewBox> coordinate space, so the fitted
// composition scales with the card at any width.
import { useEffect, useId, useMemo, useState } from 'react'
import {
  buildCardPlan,
  estimateBebas,
  estimateOrbitron,
  fitCardText,
  measureBebas,
  measureOrbitron,
  type CardExportData,
  type CardTextFit,
  type TextMeasurer,
} from '../export/cardExport'

export function CardSvg({ data, className }: { data: CardExportData; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  // Real-metric fitting needs the loaded fonts (before that, measureText
  // measures the narrower fallback and under-fits). Gate the measurers on
  // the exact card weights + document.fonts.ready; until ready, the
  // conservative estimates squeeze early rather than overflowing during
  // the flash. Bebas Neue everywhere except the player name (Orbitron).
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all([
      document.fonts.load('400 48px Bebas Neue'),
      document.fonts.load('400 128px Bebas Neue'),
      document.fonts.load('700 48px Orbitron'),
    ])
      .then(() => document.fonts.ready)
      .then(() => {
        if (alive) setFontsReady(true)
      })
      .catch(() => {
        // Progressive enhancement: fit with whatever measurer is available.
        if (alive) setFontsReady(true)
      })
    return () => {
      alive = false
    }
  }, [])
  const beb: TextMeasurer = fontsReady ? measureBebas : estimateBebas
  const orb: TextMeasurer = fontsReady ? measureOrbitron : estimateOrbitron

  // The plan at the design space's own width — the <svg viewBox> does the
  // responsive mapping for free (canvas's scalePath job, done by the browser).
  // RE-DERIVED when the fonts land: the stat COLUMN CENTERS are derived from
  // the parsed points anchors + width('99')/2 (round 7 central alignment) —
  // with the gated measurer once Bebas Neue is really loaded, with the
  // conservative estimate only during the load flash (same contract as the
  // fit decisions below — the whole composition self-corrects on load).
  const plan = useMemo(() => buildCardPlan(data, 1080, beb), [data, beb])

  // THE shared fit contract (cardExport.fitCardText) applied per slot — the
  // SAME decision the canvas export paints with (identical measurer, floor,
  // clamp): on-page card and downloaded PNG cannot drift apart.
  const fits = useMemo(
    () => ({
      ovr: fitCardText(plan.ovr.text, 400, plan.ovr.size, plan.ovr.maxW, beb),
      job: fitCardText(plan.ovr.jobText, 400, plan.ovr.jobSize, plan.ovr.jobMaxW, beb),
      name: fitCardText(plan.name.text, 700, plan.name.size, plan.name.maxWidth, orb),
      stats: plan.stats.map((c) => ({
        label: fitCardText(c.label, 400, c.labelSize, c.labelMaxW, beb),
        points: fitCardText(c.points, 400, c.pointsSize, c.pointsMaxW, beb),
        value: fitCardText(c.value, 400, c.valueSize, c.valueMaxW, beb),
      })),
    }),
    [plan, beb, orb],
  )
  const textLengthOf = (fit: CardTextFit): number | undefined => fit.squeezeTo
  const cropClipId = `card-crop-clip-${uid}`
  const borderClipId = `card-border-clip-${uid}`
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
        {/* The tier border gradient (parsed geometry + palette stops). */}
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
        {/* Photo clip: THE crop path from card.svg (round 5). */}
        <clipPath id={cropClipId}>
          <path d={plan.card.cropPath} />
        </clipPath>
        {/* Border clip: the owner's clip-path-1 = the plate silhouette —
            the border-over stroke's outer half is cut (round 7). */}
        <clipPath id={borderClipId}>
          <path d={plan.card.borderStroke.clipPath} />
        </clipPath>
        {/* Top legibility scrim (backs the over-photo OVR block). */}
        <linearGradient id={scrimId} gradientUnits="userSpaceOnUse" x1="0" y1={plan.scrim.y1} x2="0" y2={plan.scrim.y2}>
          <stop offset="0" stopColor="#000000" stopOpacity={plan.scrim.alpha} />
          <stop offset="1" stopColor="#000000" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Plate: shield-shaped tier color fill — NOTHING fills outside it,
          so the card has no background: transparent PNG download, and the
          page backdrop shows through the on-page card. */}
      <path d={plan.card.platePath} fill={plan.palette.plateFill} />

      {/* Photo: member screenshot / class portrait CLIPPED TO THE CROP PATH
          (preserveAspectRatio slice over the crop bbox = cover-fit) — or
          the ASST-01 monogram (never an empty hole). */}
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

      {/* Detached border (round 8 FILE SEMANTICS): the gradient stroke ON
          THE PLATE SILHOUETTE — the border rings the WHOLE shield and
          covers the photo's edges; the crop area itself stays BORDERLESS
          (the owner's three-layer background: plate → photo → border →
          text). CLIPPED to the plate silhouette (the owner's clip-path-1):
          the stroke's outer half is cut, the inner ≈24px band paints over
          the photo (top/sides) and the plate (bottom). */}
      <path
        d={plan.card.borderStroke.strokePath}
        fill="none"
        stroke={`url(#${borderGradId})`}
        strokeWidth={plan.card.borderStroke.width}
        clipPath={`url(#${borderClipId})`}
      />

      {/* OVR block — big number + JOB NAME below, NO "OVR" tag, at the
          parsed slot positions over the photo. White + stroke (paint-order)
          is the SVG twin of the canvas's text shadow: legible over any
          screenshot. Bebas Neue (the player name is the only Orbitron slot);
          the Orbitron fallback covers a failed Google Fonts load (fit
          contract keeps the slot inside its column either way). */}
      <g fontFamily={`${plan.fonts.slots}, ${plan.fonts.name}, sans-serif`} fill={plan.ovr.color}>
        <text
          x={plan.ovr.x}
          y={plan.ovr.y}
          fontSize={fits.ovr.size}
          fontWeight="400"
          textLength={textLengthOf(fits.ovr)}
          lengthAdjust="spacingAndGlyphs"
          stroke="#000000"
          strokeOpacity="0.55"
          strokeWidth={fits.ovr.size * 0.06}
          paintOrder="stroke"
        >
          {plan.ovr.text}
        </text>
        <text
          x={plan.ovr.jobX}
          y={plan.ovr.jobY}
          fontSize={fits.job.size}
          fontWeight="400"
          textLength={textLengthOf(fits.job)}
          lengthAdjust="spacingAndGlyphs"
          stroke="#000000"
          strokeOpacity="0.55"
          strokeWidth={fits.job.size * 0.06}
          paintOrder="stroke"
        >
          {plan.ovr.jobText}
        </text>
      </g>

      {/* Player name — Orbitron only (round 7), palette text fill, centered
          on the plate's horizontal midline (the parsed x anchors the
          placeholder's left edge) on the plate between photo and stats. */}
      <text
        x={plan.name.x}
        y={plan.name.y}
        textAnchor="middle"
        fontFamily={`${plan.fonts.name}, sans-serif`}
        fontWeight="700"
        fontSize={fits.name.size}
        fill={plan.name.color}
        textLength={textLengthOf(fits.name)}
        lengthAdjust="spacingAndGlyphs"
      >
        {plan.name.text}
      </text>

      {/* The 6 key stats — one per parsed slot column (server order), each
          a label / big points number / small raw value stack, ALL THREE
          LINES CENTRALLY ALIGNED on the column center (round 7). Bebas
          Neue, shrink-to-fit per column. */}
      {plan.stats.map((cell, i) => (
        <g key={i} fontFamily={`${plan.fonts.slots}, ${plan.fonts.name}, sans-serif`} fill={plan.palette.textFill}>
          <text
            x={cell.centerX}
            y={cell.labelY}
            textAnchor="middle"
            fontWeight="400"
            fontSize={fits.stats[i].label.size}
            textLength={textLengthOf(fits.stats[i].label)}
            lengthAdjust="spacingAndGlyphs"
          >
            {cell.label}
          </text>
          <text
            x={cell.centerX}
            y={cell.pointsY}
            textAnchor="middle"
            fontWeight="400"
            fontSize={fits.stats[i].points.size}
            textLength={textLengthOf(fits.stats[i].points)}
            lengthAdjust="spacingAndGlyphs"
          >
            {cell.points}
          </text>
          <text
            x={cell.centerX}
            y={cell.valueY}
            textAnchor="middle"
            fontWeight="400"
            fontSize={fits.stats[i].value.size}
            textLength={textLengthOf(fits.stats[i].value)}
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
