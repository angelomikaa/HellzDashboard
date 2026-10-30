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
//      parsed photo area — the round-8 crop path (the shield's top portion),
//      or, in the 2026-10-29 re-export that carries no crop path at all, THE
//      WHOLE SHIELD (owner decision 2026-10-29: "o escudo inteiro"). The plate
//      fill stays behind it as the no-photo fallback either way.
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
  measurePhotoSubject,
  photoDestRect,
  tierPlateFadeStops,
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
        ? photoDestRect(
            photoMeasure.measure.width,
            photoMeasure.measure.height,
            photoMeasure.measure.subject,
            frame,
          )
        : null,
    [photoMeasure, photoSrc, frame],
  )

  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The tier border gradient (parsed geometry + palette stops). Only a
            border DECLARING a gradient line gets a def; the owner's current
            file draws no border at all, and a url() to a missing gradient
            would paint black — so the def and the reference both disappear. */}
        {plan.card.borderStroke?.line !== undefined && (
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
        )}
        {/* Plate gradient (round 10): pristine paints the UI rainbow across
            the shield itself; other tiers keep the solid plateFill. */}
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
        {/* Photo clip: the photo area from card.svg — the round-8 crop path or,
            in the re-exports that carry none, the whole shield (the base
            plate). */}
        <clipPath id={cropClipId}>
          <path d={plan.card.cropPath} />
        </clipPath>
        {/* Border clip: the owner's clip-path-1 = the plate silhouette — the
            border-over stroke's outer half is cut (round 7). A file whose
            border declares no clip leaves the stroke unclipped, and the def is
            omitted entirely. */}
        {plan.card.borderStroke?.clipPath !== undefined && (
          <clipPath id={borderClipId}>
            <path d={plan.card.borderStroke.clipPath} />
          </clipPath>
        )}
        {/* Stats contrast plate gradient (owner 2026-10-29 "tier-color"): the
            plate behind the six stat columns, painted over the photo so the
            stat text reads against any screenshot. Geometry + FADE come from
            the file; the COLOR is the TIER's own ramp, reduced to 3 points
            (tierPlateFadeStops) — the SVG's ramp is the reference for how it
            fades, never what it paints. */}
        {plan.card.statsPlate !== undefined && (
          <linearGradient
            id={statsPlateGradId}
            gradientUnits="userSpaceOnUse"
            x1={plan.card.statsPlate.line.x1}
            y1={plan.card.statsPlate.line.y1}
            x2={plan.card.statsPlate.line.x2}
            y2={plan.card.statsPlate.line.y2}
          >
            {tierPlateFadeStops(plan.palette, plan.card.statsPlate.fades).map((stop, i) => (
              <stop key={i} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />
            ))}
          </linearGradient>
        )}
        {/* Top legibility scrim (backs the over-photo OVR block). */}
        <linearGradient id={scrimId} gradientUnits="userSpaceOnUse" x1="0" y1={plan.scrim.y1} x2="0" y2={plan.scrim.y2}>
          <stop offset="0" stopColor="#000000" stopOpacity={plan.scrim.alpha} />
          <stop offset="1" stopColor="#000000" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Plate: shield-shaped tier fill — the pristine rainbow gradient when
          the palette declares plateStops, else the solid tier color. NOTHING
          fills outside it, so the card has no background: transparent PNG
          download, and the page backdrop shows through the on-page card. */}
      <path
        d={plan.card.platePath}
        fill={plan.palette.plateStops !== undefined ? `url(#${plateGradId})` : plan.palette.plateFill}
      />

      {/* Photo: member screenshot / class portrait CLIPPED TO THE CROP PATH
          — or the ASST-01 monogram (never an empty hole). HEAD-SAFE framing
          (owner, card rounds 7-8): vertical-center cover-fit beheaded the
          full-body placeholders, so round 7 top-anchored the fit ("hide the
          legs, never the head"); round 8 goes further — subject art (class
          portraits with real alpha margins) gets a MEASURED head-to-thigh
          frame (cardAssets.photoDestRect: the character's opaque bounds
          expanded by margins, cut at mid-thigh, cover-fit), so the head
          keeps ~8-12% of window below the top border and the body fills the
          frame against the info bands. Opaque member screenshots keep the
          round-7 top-anchored cover. Measured rect → preserveAspectRatio
          "none" (the rect already matches the image aspect); fallback →
          round-7 "xMidYMin slice" until the measurement lands. */}
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

      {/* Stats contrast plate (owner re-export 2026-10-29 "tier-color"): the
          plate behind the six stat columns, painted over the photo so the stat
          text reads against any screenshot. Painted BEFORE the text, AFTER the
          photo and its scrim; the round-8 files have no such layer. Its fill is
          the TIER's color (see the gradient def above), not the SVG's. */}
      {plan.card.statsPlate !== undefined && (
        <path
          d={plan.card.statsPlate.path}
          fill={`url(#${statsPlateGradId})`}
        />
      )}

      {/* Detached border, WHEN THE FILE DRAWS ONE: the stroke ON THE PLATE
          SILHOUETTE — the border rings the WHOLE shield and covers the photo's
          edges; the photo area itself stays BORDERLESS (the owner's
          three-layer background: plate → photo → border → text). Round-8 file:
          the tier GRADIENT stroke, CLIPPED to the plate silhouette (clip-path-1)
          — the stroke's outer half is cut, the inner ≈24px band paints over the
          photo (top/sides) and the plate (bottom). First re-export: a SOLID
          per-tier ring (the palette's own first border stop — "largura do
          arquivo, cor por tier") at the file's width, UNCLIPPED. The owner's
          CURRENT file declares no border, so this layer is omitted. */}
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
