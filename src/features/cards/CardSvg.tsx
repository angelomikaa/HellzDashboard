// CardSvg — the on-page card (07.2-05 checkpoint round 8, owner re-seed:
// ONE card.svg is the source of truth — placeholder text slots filled by
// code, photo clipped to the crop path, tier colors via code-driven
// TIER_PALETTE, Bebas Neue everywhere except the player name (Orbitron), the
// tier-colored border at the file's opacity, central column alignment,
// transparent background outside the shield plate).
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
//      parsed PHOTO AREA — the 2026-11-06 re-model's `mask` group clip (the
//      shield's top portion; earlier files used `crop-path`). The member's own
//      framing (zoom + pan, CardPhotoTransform) rides on the measured cover
//      fit, so the card shows exactly what the crop editor showed. The plate
//      fill stays behind it as the no-photo fallback.
//   3. The detached border is painted ON THE PLATE SILHOUETTE — the file's
//      three-layer background (round 8): the border rings the whole shield,
//      covering the photo's edges, while the photo area itself stays
//      BORDERLESS. Round-8 file: a GRADIENT stroke CLIPPED to the plate
//      silhouette (clip-path-1) — the outer half is cut, the inner band paints
//      over the photo/plate edges. 2026-10-29 re-export (plate-border): a
//      SOLID per-tier ring at the file's own width, UNCLIPPED, exactly as the
//      file draws it ("largura do arquivo, cor por tier", owner 2026-10-29).
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
  applyPhotoTransform,
  measurePhotoSubject,
  photoDestRect,
  scopedLogo,
  tierFadeStops,
  type CardRect,
  type PhotoSubjectBounds,
} from '../export/cardAssets'
import {
  buildCardPlan,
  CARD_PLATE_GRADIENT_LINE,
  estimateBebas,
  estimateOrbitron,
  fitCardText,
  measureBebas,
  measureOrbitron,
  type CardExportData,
  type CardTextFit,
  type TextMeasurer,
} from '../export/cardExport'

// Card fonts are loaded ONCE per page, not once per mounted card: the showcase
// mounts every card three times (the loop copies) and rotates through every
// class, so per-instance loads would repeat the same font requests endlessly.
// Real-metric fitting needs the loaded fonts (before that, measureText
// measures the narrower fallback and under-fits). Bebas Neue everywhere except
// the player name (Orbitron). Progressive enhancement: a failed load still
// resolves, and the fit uses whatever measurer is available.
let cardFontsReady = false
let cardFontsRequest: Promise<void> | null = null

function loadCardFontsOnce(): Promise<void> {
  cardFontsRequest ??= Promise.all([
    document.fonts.load('400 48px Bebas Neue'),
    document.fonts.load('400 128px Bebas Neue'),
    document.fonts.load('700 48px Orbitron'),
  ])
    .then(() => document.fonts.ready)
    .catch(() => undefined)
    .then(() => {
      cardFontsReady = true
    })
  return cardFontsRequest
}

// The photo's measured framing input (natural size + opaque subject bounds),
// cached per source: the decode + alpha scan runs once per photo per page
// instead of once per mounted card. A failed load is evicted so a transient
// failure can retry on the next mount.
interface PhotoMeasure {
  width: number
  height: number
  subject: PhotoSubjectBounds | null
}
const photoMeasureCache = new Map<string, Promise<PhotoMeasure | null>>()

function measurePhotoOnce(src: string): Promise<PhotoMeasure | null> {
  const cached = photoMeasureCache.get(src)
  if (cached !== undefined) return cached
  const request = new Promise<PhotoMeasure | null>((resolve) => {
    const probe = new Image()
    probe.onload = () => {
      if (probe.naturalWidth <= 0 || probe.naturalHeight <= 0) return resolve(null)
      resolve({
        width: probe.naturalWidth,
        height: probe.naturalHeight,
        subject: measurePhotoSubject(probe),
      })
    }
    probe.onerror = () => resolve(null)
    probe.src = src
  })
  photoMeasureCache.set(src, request)
  void request.then((measure) => {
    if (measure === null && photoMeasureCache.get(src) === request) photoMeasureCache.delete(src)
  })
  return request
}

export function CardSvg({ data, className }: { data: CardExportData; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [fontsReady, setFontsReady] = useState(cardFontsReady)
  useEffect(() => {
    if (cardFontsReady) return
    let alive = true
    void loadCardFontsOnce().then(() => {
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
  const plateGradId = `card-plate-grad-${uid}`
  const scrimId = `card-scrim-${uid}`
  const statsPlateGradId = `card-stats-plate-${uid}`
  const b = plan.photoBBox
  // The file's logo group, with its gradient ids scoped to THIS card instance
  // (the showcase mounts many cards; duplicate gradient ids would cross-wire).
  const logo = plan.card.logo === undefined ? undefined : scopedLogo(plan.card.logo, uid)

  // Round-8 photo framing: the dest rect is computed from the image's own
  // measured opaque bounds (cardAssets.measurePhotoSubject +
  // photoDestRect — the SAME pure contract the canvas export and the
  // harness reference use). SVG <image> elements expose NO natural size
  // (that is an HTMLImageElement API), so the measurement loads the same
  // URL in a throwaway HTMLImageElement — cache-hot, the SVG element just
  // fetched it. The fit is keyed by src (a new photo re-measures; a stale
  // fit never applies) and until it lands the image renders with the
  // round-7 head-safe top-anchored cover (xMidYMin slice over the crop
  // bbox).
  const [photoMeasure, setPhotoMeasure] = useState<{ src: string; measure: PhotoMeasure } | null>(
    null,
  )
  const photoSrc = plan.photo.kind === 'image' ? plan.photo.src : null
  useEffect(() => {
    if (photoSrc === null) {
      setPhotoMeasure(null)
      return
    }
    let alive = true
    void measurePhotoOnce(photoSrc).then((measure) => {
      if (alive && measure !== null) setPhotoMeasure({ src: photoSrc, measure })
    })
    return () => {
      alive = false
    }
  }, [photoSrc])
  // Keyed on the window's primitives, not the plan's bbox object: the plan is
  // rebuilt when the fonts land, and that must not re-derive the photo frame.
  const frame = useMemo<CardRect>(
    () => ({ x: b.x, y: b.y, w: b.w, h: b.h }),
    [b.x, b.y, b.w, b.h],
  )
  const measuredFit = useMemo<CardRect | null>(
    () =>
      photoMeasure !== null && photoMeasure.src === photoSrc
        ? applyPhotoTransform(
            photoDestRect(
              photoMeasure.measure.width,
              photoMeasure.measure.height,
              photoMeasure.measure.subject,
              frame,
            ),
            frame,
            plan.photoTransform,
          )
        : null,
    [photoMeasure, photoSrc, frame, plan.photoTransform],
  )

  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The border gradient: the ring paints the TIER's ramp along the
            file's own gradient line, at the file's own opacity (70% in the
            2026-11-06 re-model). A url() to a missing gradient would paint
            black, so the def and the reference both disappear when the file
            declares no border. */}
        {plan.card.borderStroke?.line !== undefined && (
          <linearGradient
            id={borderGradId}
            gradientUnits="userSpaceOnUse"
            x1={plan.card.borderStroke.line.x1}
            y1={plan.card.borderStroke.line.y1}
            x2={plan.card.borderStroke.line.x2}
            y2={plan.card.borderStroke.line.y2}
          >
            {(plan.card.borderStroke.stops ?? plan.palette.borderStops).map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        )}
        {/* Plate gradient (owner 2026-11-05): the Impecável tier paints the
            card.svg's own Magenta_to_Orange ramp across the shield; other
            tiers keep the solid plateFill. */}
        {plan.palette.plateStops !== undefined && (
          <linearGradient
            id={plateGradId}
            gradientUnits="userSpaceOnUse"
            x1={CARD_PLATE_GRADIENT_LINE.x1}
            y1={CARD_PLATE_GRADIENT_LINE.y1}
            x2={CARD_PLATE_GRADIENT_LINE.x2}
            y2={CARD_PLATE_GRADIENT_LINE.y2}
          >
            {plan.palette.plateStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        )}
        {/* Photo clip: the photo area from card.svg — the 2026-11-05 re-seed
            brought the crop path back (the shield's top portion); a file
            without one clips to the whole shield (the base plate). */}
        <clipPath id={cropClipId}>
          <path d={plan.card.cropPath} />
        </clipPath>
        {/* Border clip: the owner's clip-path-1 = the plate silhouette — the
            border stroke's outer half is cut, so the ring reads as an inner
            tint over the plate/photo edges. A file whose border declares no
            clip leaves the stroke unclipped, and the def is omitted. */}
        {plan.card.borderStroke?.clipPath !== undefined && (
          <clipPath id={borderClipId}>
            <path d={plan.card.borderStroke.clipPath} />
          </clipPath>
        )}
        {/* Top legibility scrim (backs the over-photo OVR block). */}
        <linearGradient id={scrimId} gradientUnits="userSpaceOnUse" x1="0" y1={plan.scrim.y1} x2="0" y2={plan.scrim.y2}>
          <stop offset="0" stopColor="#000000" stopOpacity={plan.scrim.alpha} />
          <stop offset="1" stopColor="#000000" stopOpacity={0} />
        </linearGradient>
        {/* The file's authored stats-plate fade: its offsets and opacities
            are the file's, while the COLOR rides the tier ramp (for Impecável
            that IS the file's magenta→orange). */}
        {plan.card.statsPlate !== undefined && (
          <linearGradient
            id={statsPlateGradId}
            gradientUnits="userSpaceOnUse"
            x1={plan.card.statsPlate.line.x1}
            y1={plan.card.statsPlate.line.y1}
            x2={plan.card.statsPlate.line.x2}
            y2={plan.card.statsPlate.line.y2}
          >
            {tierFadeStops(plan.palette, plan.card.statsPlate.fades).map((stop, i) => (
              <stop key={i} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />
            ))}
          </linearGradient>
        )}
      </defs>

      {/* Plate: shield-shaped tier fill — the tier's gradient ramp when the
          palette declares plateStops (Impecável = the file's
          Magenta_to_Orange), else the solid tier color. NOTHING fills outside
          it, so the card has no background: transparent PNG download, and the
          page backdrop shows through the on-page card. */}
      <path
        d={plan.card.platePath}
        fill={plan.palette.plateStops !== undefined ? `url(#${plateGradId})` : plan.palette.plateFill}
      />

      {/* Photo: member screenshot / class portrait CLIPPED TO THE CROP PATH
          — or the ASST-01 monogram (never an empty hole). HEAD-SAFE framing
          (owner, card rounds 7-8): vertical-center cover-fit beheaded the
          full-body placeholders, so round 7 top-anchored the fit ("hide the
          legs, never the head"); round 8 added the MEASURED subject frame
          (cardAssets.photoDestRect: the character's opaque bounds expanded by
          margins, cover-fit — top-anchored when the short crop window crops
          vertically). The MEMBER's own framing (zoom + pan,
          cardAssets.applyPhotoTransform) then rides on that base, so the card
          matches the photo-positioning editor exactly. The file's light wash
          paints over the photo inside the same clip. Measured rect →
          preserveAspectRatio "none" (the rect already matches the image
          aspect); fallback → round-7 "xMidYMin slice" until measurement
          lands. */}
      <g clipPath={`url(#${cropClipId})`}>
        {plan.photo.kind === 'image' ? (
          <image
            href={plan.photo.src}
            x={measuredFit ? measuredFit.x : b.x}
            y={measuredFit ? measuredFit.y : b.y}
            width={measuredFit ? measuredFit.w : b.w}
            height={measuredFit ? measuredFit.h : b.h}
            preserveAspectRatio={measuredFit ? 'none' : 'xMidYMin slice'}
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

      {/* STATS CONTRAST PLATE (owner 2026-11-06): the file's fade behind the
          six stat columns; it blends the photo edge into the plate. Geometry +
          fade offsets from the file; colors from the tier. Painted BEFORE the
          border (the file's own order: plate → photo → stats plate → border). */}
      {plan.card.statsPlate !== undefined && (
        <path d={plan.card.statsPlate.path} fill={`url(#${statsPlateGradId})`} />
      )}

      {/* Detached border, WHEN THE FILE DRAWS ONE: the stroke ON THE PLATE
          SILHOUETTE — the border rings the WHOLE shield and covers the photo's
          edges; the photo area itself stays BORDERLESS (the owner's
          background: plate → photo → stats plate → border → text). The current
          file (`tier-color-border`) draws a 48px TIER-ramp stroke clipped to
          the plate silhouette at full opacity; earlier files used 24/32px
          rings and 0.3/0.7 opacity. The layer is skipped only when the file
          declares no border. */}
      {plan.card.borderStroke !== undefined && (
        <path
          d={plan.card.borderStroke.strokePath}
          fill="none"
          stroke={
            plan.card.borderStroke.line !== undefined
              ? `url(#${borderGradId})`
              : plan.palette.borderStops[0].color
          }
          strokeWidth={plan.card.borderStroke.width}
          strokeOpacity={plan.card.borderStroke.opacity}
          clipPath={plan.card.borderStroke.clipPath !== undefined ? `url(#${borderClipId})` : undefined}
        />
      )}

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

      {/* "05-11 • atualizado" — the LAST_UPDATE line under the name (owner
          re-seed 2026-11-05). The date is the member's own last update; the
          bullet + word are the file's literals at their own anchors. The whole
          line is omitted when the caller has no date (the placeholder is never
          printed). */}
      {plan.lastUpdate !== null && (
        <g fontFamily={`${plan.fonts.slots}, ${plan.fonts.name}, sans-serif`} fill={plan.lastUpdate.color}>
          <text
            x={plan.lastUpdate.x}
            y={plan.lastUpdate.y}
            fontWeight="400"
            fontSize={plan.lastUpdate.size}
            textLength={textLengthOf(
              fitCardText(
                plan.lastUpdate.date,
                400,
                plan.lastUpdate.size,
                plan.lastUpdate.maxWidth,
                beb,
              ),
            )}
            lengthAdjust="spacingAndGlyphs"
          >
            {plan.lastUpdate.date}
          </text>
          {plan.lastUpdate.suffix.map((segment, i) => (
            <text key={i} x={segment.x} y={segment.y} fontWeight="400" fontSize={segment.size}>
              {segment.text}
            </text>
          ))}
        </g>
      )}

      {/* The 6 key stats — one per parsed slot column (server order), each
          a label / big points number / small raw value stack, ALL THREE
          LINES CENTRALLY ALIGNED on the column center (round 7). Bebas
          Neue, shrink-to-fit per column. */}
      {plan.stats.map((cell, i) => (
        <g key={i} fontFamily={`${plan.fonts.slots}, ${plan.fonts.name}, sans-serif`} fill={plan.textFill}>
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

      {/* Hellz mark — the logo the FILE draws (`logo-hellz`, owner 2026-11-05):
          vector paths + the file's own gradients, scoped per card so several
          cards on one page cannot collide. This replaces the old additive
          hellz-mark.svg overlay, which double-drew the logo. */}
      {logo !== undefined && (
        <g
          // The markup comes from the bundled card.svg (trusted build asset,
          // never user input) — the parser hands it over verbatim.
          dangerouslySetInnerHTML={{ __html: `${logo.gradients}${logo.markup}` }}
        />
      )}
    </svg>
  )
}
