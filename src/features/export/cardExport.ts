// cardExport.ts — the card PNG export (plan 07.2-05, CARD-03 / D-09 /
// D-10 / D-12; checkpoint round 7, owner supersession: ONE card.svg
// [src/assets/card.svg] becomes the source of truth for card design —
// placeholder TEXT slots filled by code, crop-path photo area, Bebas Neue
// everywhere except the player name (Orbitron), detached border over the
// crop, central column alignment, PNG export with NO background (the
// shield plate paints; everything outside it is transparent). Zero new npm
// dependencies (v1.1 invariant): native Canvas 2D + Path2D + the self-hosted
// Orbitron woff2 + Bebas Neue (Google Fonts @import in src/index.css —
// graceful fallback to Orbitron if it cannot load) + brand mark.
//
// ROUND 7 (owner verdict on round 6: "the card is overflowing ... keep a
// matching proportion and readability", then the new seeded card.svg):
//   1. The member's screenshot is CLIPPED TO THE CROP PATH (round 5 brought
//      the crop path back — there are no guideline rects/safe areas).
//   2. Text slots are POSITIONAL: the parser's slot positions/sizes ARE the
//      layout. Code fills OVR + job (top-left, over the photo), PLAYERNAME
//      (on the plate), and the six stat columns (label / points / raw
//      own_value each).
//   3. Fonts: Bebas Neue for every slot EXCEPT the player name (Orbitron).
//      Bebas Neue is WIDER than the old estimates, so every slot carries a
//      fitText maxWidth — the design positions are honored, the type never
//      overflows its column, and every slot shrinks proportionally
//      (matching proportion, readability floor, emergency squeeze last).
//   4. The PLAYERNAME slot is Orbitron, centered on the plate's horizontal
//      midline (the file's parsed x anchors the placeholder's left edge —
//      the owner drew 'PLAYERNAME' centered on the shield).
//   5. The stat columns are CENTRALLY aligned: number / label / value share
//      one center x per column (the owner's proportion rule).
//   6. Export is a PNG with NO background: canvas starts transparent, only
//      the shield plate path paints — nothing fills outside it.
//
// ONE PLAN, TWO SURFACES: buildCardPlan is the pure layout core; BOTH the
// on-page <svg> (CardSvg.tsx) and this canvas shell consume the SAME plan
// object — same path strings, same slot positions, same colors — so the
// downloaded PNG is the on-page card by construction.
//
// Round-2 lessons KEPT: fail-fast aspect gate (27:40 — the card.svg design
// space), document.fonts await before first draw, scalePath mapping of
// design-space paths onto the backing store (Canvas 2D has no viewBox).
//
// Export content contract (D-09/T-072-12 — the PNG circulates OUTSIDE the
// guild): identity (name, OVR + job name) + the 6 key stats (label +
// points + formatted own_value) + Hellz mark. NO guild-average data of
// any kind — the stat-slot field list is closed and cannot express an
// aggregate. NO "OVR" tag (round 4 decision, held).
//
// Photo fill: the member's character screenshot (self-uploaded on the
// Painel, Supabase Storage + RLS) fills the crop path. Fallback chain
// (never an empty hole): screenshot → class portrait (self-hosted ROO
// asset, D-15) → ASST-01 neutral monogram.
//
// Canvas-taint safety (T-072-13): every image drawn is same-origin — class
// portraits are committed '/assets/classes/...' files, member screenshots
// are fetched as blobs and passed as object URLs (the api.ts wrapper never
// hands out cross-origin URLs), and the mark is the bundled hellz-mark.svg.
import type { Tier } from '../dashboard/presentation'
import markUrl from '../../assets/hellz-mark.svg'
import {
  CARD_DESIGN_HEIGHT,
  CARD_DESIGN_WIDTH,
  CARD_GEOMETRY,
  TIER_PALETTE,
  scalePath,
  scaleRect,
  type CardGeometry,
  type CardRect,
  type TierPalette,
} from './cardAssets'

// ---------------------------------------------------------------------------
// Closed data contract (what callers assemble — PromotionCard from get_promotion
// rows, the Painel card from my_card; values arrive PRE-FORMATTED strings).
// Round 7: no per-stat tier field — the design renders points as palette
// text, there are no tier-colored chips in card.svg.
export interface CardExportStat {
  label_short: string
  value: string
  points: number | null
}

export interface CardExportData {
  name: string
  charClass: string
  charFunction: 'dps' | 'mdps' | 'suporte'
  ovr: number // rounded for display
  stats: CardExportStat[]
  /** Image filling the crop-path photo area (member screenshot or class
   *  portrait — same-origin blob/asset URL), null → ASST-01 monogram. */
  photoSrc: string | null
  /** Class initial for the monogram fallback (ASST-01). */
  monogramLetter: string
}

const OVR_TEXT_COLOR = '#FFFFFF' // over the photo — white + shadow, every tier
const MONOGRAM_TILE = '#1E1E1E'
const MONOGRAM_TEXT = '#9A8F8F'

/** The font split (round 7 owner decision): Bebas Neue everywhere except
 *  the player name, which stays Orbitron. Bebas loads from Google Fonts
 *  (src/index.css @import); if it cannot load, the SVG font stacks fall
 *  through to Orbitron and the canvas falls back to the system sans — the
 *  fit contract keeps every slot inside its column either way. */
export const CARD_FONTS = { slots: 'Bebas Neue', name: 'Orbitron' } as const

/** Top legibility scrim for the OVER-PHOTO OVR block: black fading out
 *  downward from the photo's top edge. Covers the OVR number + job name
 *  (65% of the crop area's height). Fractions of the crop bbox; the same
 *  spec is painted by BOTH surfaces from the plan. */
const SCRIM = { heightFraction: 0.65, alpha: 0.55 } as const

/** The Hellz brand mark, centered in the plate tip below the stat slots
 *  (kept from rounds 3-6; card.svg has no mark slot — this is an additive
 *  brand anchor, not part of the design-space contract). */
const MARK = { y: 1408, size: 54 } as const

// ---------------------------------------------------------------------------
// Layout plan. The design space is card.svg's own 1080×1600 viewBox; every
// number scales linearly with the requested width, so
// buildCardPlan(…, w) is exact at any resolution (downloadCard paints at
// 2× for retina crispness). Content positions are the PARSED SLOT POSITIONS
// — the owner's placement authority. Stat columns are CENTRALLY aligned:
// label / points / value share one center x per column (parsed label x),
// column width = gap to the next column's center minus a gutter.
export type CardPlanPhoto =
  | { kind: 'image'; src: string }
  | { kind: 'monogram'; letter: string }

export interface CardPlanStatSlot {
  /** Alphabetic-baseline text anchors (scaled design space) + fitText
   *  bounds. Points = the big rounded rank number (or '—'); value = the
   *  formatted raw own_value. All three lines share centerX / colW and are
   *  rendered centrally aligned on the column center (round 7). */
  label: string
  labelY: number
  labelSize: number
  labelMaxW: number
  points: string
  pointsY: number
  pointsSize: number
  pointsMaxW: number
  value: string
  valueY: number
  valueSize: number
  valueMaxW: number
  /** Column center x (scaled design space) — every line in the column
   *  renders centered here (round 7 central alignment). */
  centerX: number
  /** Column width bound (scaled design space) — gap to the next column's
   *  center minus a gutter. fitCardText shrinks proportionally to fit. */
  colW: number
}

export interface CardPlan {
  width: number
  /** height === width × 1600/1080 — the 27:40 card.svg design space. */
  height: number
  tier: Tier
  /** THE parsed card.svg geometry — design-space path strings + slot
   *  positions (1080×1600; scale onto the backing store via plan.scale). */
  card: CardGeometry
  /** The tier's CODE-DRIVEN palette (plate fill / border stops / text
   *  fill) applied over the one shared geometry. */
  palette: TierPalette
  /** The card's FONT SPLIT (round 7): Bebas Neue for every slot EXCEPT the
   *  player name (Orbitron). Both surfaces read the families from here so
   *  the split cannot drift between the SVG and the canvas. */
  fonts: { slots: string; name: string }
  /** scale = width / CARD_DESIGN_WIDTH — the one number every consumer
   *  multiplies design-space values by. */
  scale: number
  photo: CardPlanPhoto
  /** The photo area: the crop path (design space, for the SVG clip) +
   *  its bbox (scaled, for the canvas cover-fit). */
  photoClipPath: string
  photoBBox: CardRect
  /** Top legibility scrim spec (scaled; painted INSIDE the crop clip by
   *  both surfaces — backs the over-photo OVR block). */
  scrim: { y1: number; y2: number; alpha: number }
  /** OVR block over the photo: big number + job name below, NO "OVR"
   *  tag. White + shadow (over-photo legibility on any screenshot). */
  ovr: {
    text: string
    x: number
    y: number
    size: number
    maxW: number
    jobText: string
    jobX: number
    jobY: number
    jobSize: number
    jobMaxW: number
    color: string
  }
  /** Player name — ORBITRON on the plate between photo and stats, palette
   *  text fill, centered on the plate's horizontal midline (round 7 — the
   *  parsed x anchors the placeholder's left edge, not the center). */
  name: { text: string; x: number; y: number; size: number; color: string; maxWidth: number }
  /** The 6 key stats in SERVER/highlight order, one per parsed slot
   *  column, each a self-contained label/points/value group — all three
   *  lines centrally aligned on the column center (round 7). */
  stats: CardPlanStatSlot[]
  mark: { src: string; x: number; y: number; size: number }
  colors: {
    monogramTile: string
    monogramText: string
  }
}

function tierOf(ovr: number): Tier {
  if (ovr < 65) return 'bronze'
  if (ovr < 75) return 'silver'
  if (ovr < 85) return 'gold'
  return 'platinum'
}

/**
 * Build the full card layout plan. PURE — no canvas, no DOM, no I/O. The
 * 27:40 portrait aspect is structural: height === width × 1600/1080 at ANY
 * width.
 *
 * `measure` (default measureBebas) resolves the stat COLUMN CENTERS: the
 * file's points placeholders are the same '99' string in every column, so
 * each column's center = points anchor + width('99')/2 (design space).
 * Callers that gate on font readiness pass their gated measurer so the
 * centers use real metrics once the fonts land (before that, the
 * conservative estimate shifts all columns uniformly by <1% and corrects).
 */
export function buildCardPlan(
  data: CardExportData,
  width = CARD_DESIGN_WIDTH,
  measure: (text: string, weight: number, size: number) => number = measureBebas,
): CardPlan {
  const tier = tierOf(data.ovr)
  const card = CARD_GEOMETRY
  const palette = TIER_PALETTE[tier]
  const scale = width / CARD_DESIGN_WIDTH
  const height = (width * CARD_DESIGN_HEIGHT) / CARD_DESIGN_WIDTH

  const photoBBox = scaleRect(card.cropBBox, scale)
  const slots = card.slots

  // Column centers (round 7 central alignment): the points placeholder
  // '99' is the SAME string in every column, so the column center =
  // points anchor + width('99')/2 in design space — the owner's evenly
  // pitched center grid (parse-locked in cardAssets). Column width bound =
  // the span to the neighboring centers minus a gutter. Every line in a
  // column renders centered at its centerX.
  const centers = slots.stats.map(
    (slot) => slot.points.x + measure('99', 400, slot.points.size) / 2,
  )
  const colWs = centers.map((x, i) => {
    const leftGap = i === 0 ? 0 : x - centers[i - 1]
    const rightGap = i === centers.length - 1 ? 0 : centers[i + 1] - x
    const span = i === 0 ? rightGap : i === centers.length - 1 ? leftGap : (leftGap + rightGap) / 2
    return span - 8
  })

  // OVR block: the parsed slot (top-left, over the photo) — big number +
  // JOB NAME below, NO "OVR" tag (round 4). White with a shadow, backed by
  // the top scrim.
  const ovr = {
    text: String(Math.round(data.ovr)),
    x: slots.ovr.x * scale,
    y: slots.ovr.y * scale,
    size: slots.ovr.size * scale,
    maxW: (CARD_DESIGN_WIDTH - slots.ovr.x - 40) * scale,
    jobText: data.charClass,
    jobX: slots.job.x * scale,
    jobY: slots.job.y * scale,
    jobSize: slots.job.size * scale,
    jobMaxW: (CARD_DESIGN_WIDTH - slots.job.x - 40) * scale,
    color: OVR_TEXT_COLOR,
  }

  // Player name: ORBITRON (round 7), the parsed slot's baseline/size,
  // CENTERED on the plate bbox's horizontal midline — the file's parsed x
  // anchors the LEFT edge of the 'PLAYERNAME' placeholder, which the owner
  // drew centered on the shield (spans ~246..~830 → center ≈ the plate
  // midline ≈539.5). Centering at the raw anchor would hang the name off
  // the plate's left edge (headless-audit-proven). The fit bound is
  // symmetric inside the plate's inner span (gutter 14px per side) — a
  // long name squeezes INTO the shield, never past it.
  const plateMidX = (card.plateBBox.x + card.plateBBox.w / 2) * scale
  const plateInnerL = (card.plateBBox.x + 14) * scale
  const plateInnerR = (card.plateBBox.x + card.plateBBox.w - 14) * scale
  const name = {
    text: data.name,
    x: plateMidX,
    y: slots.name.y * scale,
    size: slots.name.size * scale,
    color: palette.textFill,
    maxWidth: 2 * Math.min(plateMidX - plateInnerL, plateInnerR - plateMidX),
  }

  // Stat slots: parsed positions verbatim; every line centered on the
  // column centerX; fitText bound = column width minus gutter.
  const statSlots: CardPlanStatSlot[] = data.stats.map((stat, i) => {
    const slot = slots.stats[i]
    return {
      label: stat.label_short,
      labelY: slot.label.y * scale,
      labelSize: slot.label.size * scale,
      labelMaxW: colWs[i] * scale,
      points: stat.points === null ? '—' : String(Math.round(stat.points)),
      pointsY: slot.points.y * scale,
      pointsSize: slot.points.size * scale,
      pointsMaxW: colWs[i] * scale,
      value: stat.value,
      valueY: slot.value.y * scale,
      valueSize: slot.value.size * scale,
      valueMaxW: colWs[i] * scale,
      centerX: centers[i] * scale,
      colW: colWs[i] * scale,
    }
  })

  const photo: CardPlanPhoto =
    data.photoSrc !== null
      ? { kind: 'image', src: data.photoSrc }
      : { kind: 'monogram', letter: data.monogramLetter }

  return {
    width,
    height,
    tier,
    card,
    palette,
    fonts: CARD_FONTS,
    scale,
    photo,
    photoClipPath: card.cropPath,
    photoBBox,
    scrim: {
      y1: photoBBox.y,
      y2: photoBBox.y + photoBBox.h * SCRIM.heightFraction,
      alpha: SCRIM.alpha,
    },
    ovr,
    name,
    stats: statSlots,
    mark: { src: markUrl, x: width / 2, y: MARK.y * scale, size: MARK.size * scale },
    colors: {
      monogramTile: MONOGRAM_TILE,
      monogramText: MONOGRAM_TEXT,
    },
  }
}

// ---------------------------------------------------------------------------
// THE SHARED FIT CONTRACT (rounds 6-7: "the card is overflowing — the shape
// was reduced but the letters were not" → keep a matching proportion and
// readability).
//
//   fitCardText: measure the string at its design size (REAL metrics —
//   canvas measureText with the LOADED font); if it fits, render untouched;
//   otherwise SHRINK THE FONT SIZE proportionally (glyph shape preserved —
//   the owner's proportion/readability rule) down to a readability floor
//   (CARD_FIT_FLOOR of the design size); only past the floor squeeze the
//   glyphs horizontally (SVG textLength+spacingAndGlyphs / canvas x-scale)
//   as the emergency clamp. Every slot thus fits its column at design
//   scale, and the viewBox/canvas scales the whole composition at any width.
/** Conservative advance estimate for when REAL metrics are unavailable
 *  (non-browser test environments; the on-page font-load flash). Bebas is
 *  NARROW-ish but tall: ~0.5em per char over-estimates the real advances of
 *  caps/digits (verified against a real render in scripts/card-render-check,
 *  which asserts estimate ≥ real for the live label widths) — squeeze early
 *  rather than overflow, but never crush 4–6-char labels to the floor. */
export const estimateBebas = (text: string, _weight: number, size: number): number =>
  text.length * size * 0.5
export const estimateOrbitron = (text: string, _weight: number, size: number): number =>
  text.length * size * 0.8

export type TextMeasurer = (text: string, weight: number, size: number) => number

/** Cached offscreen 2D context for real advance measurement. */
let measureCtx: CanvasRenderingContext2D | null = null

/** REAL Orbitron advance width (canvas measureText with the loaded font —
 *  the exact numbers the canvas draw uses). Callers must ensure the card
 *  fonts are loaded first (loadCardFonts / CardSvg's fonts.ready gate);
 *  pre-load this measures the narrower fallback, so both call sites gate on
 *  font readiness. Non-browser → the conservative estimate (pure tests). */
export function measureOrbitron(text: string, weight: number, size: number): number {
  if (typeof document === 'undefined') return estimateOrbitron(text, weight, size)
  if (measureCtx === null) {
    measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx === null) return estimateOrbitron(text, weight, size)
  }
  measureCtx.font = `${weight} ${size}px Orbitron`
  return measureCtx.measureText(text).width
}

/** REAL Bebas Neue advance width (canvas measureText with the loaded font —
 *  Bebas is WIDER than the old placeholder estimates; real metrics keep the
 *  stat columns collision-free). Same readiness contract as measureOrbitron. */
export function measureBebas(text: string, _weight: number, size: number): number {
  if (typeof document === 'undefined') return estimateBebas(text, _weight, size)
  if (measureCtx === null) {
    measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx === null) return estimateBebas(text, _weight, size)
  }
  measureCtx.font = `400 ${size}px "Bebas Neue"`
  return measureCtx.measureText(text).width
}

/** Readability floor: a fitted slot never shrinks below this fraction of its
 *  design size; beyond it the emergency glyph-squeeze takes over. */
export const CARD_FIT_FLOOR = 0.55

// ---------------------------------------------------------------------------
// Export filename: 'hellz-<slugified name>.png' — diacritics stripped
// (NFD → combining marks removed), non-alphanumerics collapsed to single
// hyphens, no leading/trailing hyphen.
export function cardFilename(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `hellz-${slug}.png`
}

export interface CardTextFit {
  /** The size to render at (design/scaled units — same space as `size`). */
  size: number
  /** Emergency clamp: render the glyphs squeezed to exactly this width
   *  (SVG textLength / canvas horizontal scale). Set only when the
   *  readability floor could not fit the string. */
  squeezeTo?: number
}

/** The ONE fit decision both surfaces share (see the section header). */
export function fitCardText(
  text: string,
  weight: number,
  size: number,
  maxW: number,
  measure: TextMeasurer = measureOrbitron,
  floor: number = CARD_FIT_FLOOR,
): CardTextFit {
  const natural = measure(text, weight, size)
  if (natural <= maxW) return { size }
  const fitted = (size * maxW) / natural
  if (fitted >= size * floor) return { size: fitted }
  return { size: size * floor, squeezeTo: maxW }
}

// ---------------------------------------------------------------------------
// DOM shell — everything below touches canvas/DOM only.

/** Await the exact fonts the card paints with (round-2 lesson: without this
 *  the first export renders the fallback font). Also awaits
 *  document.fonts.ready — belt-and-braces so a pending @font-face load can
 *  never race the first draw. Best-effort: a rejected load never blocks. */
async function loadCardFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('400 48px Bebas Neue'),
      document.fonts.load('400 128px Bebas Neue'),
      document.fonts.load('700 48px Orbitron'),
    ])
    await document.fonts.ready
  } catch {
    // Font loading is progressive-enhancement; the draw proceeds with
    // whatever is available.
  }
}

/** Same-origin image loader with graceful skip — a failed load resolves null
 *  and the caller falls back (monogram / omitted mark), never throws. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Paint one text slot under the SHARED fitCardText contract: fitted font
 *  size (shrink-to-fit, readability floor); past the floor, the emergency
 *  horizontal glyph-squeeze — the canvas twin of the SVG's textLength +
 *  lengthAdjust="spacingAndGlyphs". `center` squeezes AROUND the anchor
 *  (translate → scale → fillText(0,0) with textAlign 'center'): the glyphs
 *  compress symmetrically about the column center, never sliding left —
 *  the round-7 central-alignment rule survives the emergency clamp. */
function paintFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  family: string,
  weight: number,
  size: number,
  maxW: number,
  center = false,
): void {
  const fit = fitCardText(text, weight, size, maxW, (t, w, s) =>
    family === CARD_FONTS.slots ? measureBebas(t, w, s) : measureOrbitron(t, w, s),
  )
  ctx.font = `${weight} ${fit.size}px ${family}`
  ctx.textAlign = center ? 'center' : 'left'
  if (fit.squeezeTo === undefined) {
    ctx.fillText(text, x, y)
    return
  }
  const natural = ctx.measureText(text).width
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(natural > 0 ? fit.squeezeTo / natural : 1, 1)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** Canvas gradient for the tier palette stops along the parsed border
 *  gradient line (userSpaceOnUse geometry, scaled onto the backing store). */
function applyBorderGradient(
  ctx: CanvasRenderingContext2D,
  palette: TierPalette,
  line: { x1: number; y1: number; x2: number; y2: number },
  s: number,
): CanvasGradient {
  const grad = ctx.createLinearGradient(line.x1 * s, line.y1 * s, line.x2 * s, line.y2 * s)
  for (const stop of palette.borderStops) grad.addColorStop(Math.min(1, Math.max(0, stop.offset)), stop.color)
  return grad
}

/**
 * Paint the card plan onto a canvas (canvas dims MUST match the 27:40 card
 * design aspect — width : height = 1080 : 1600). Awaits fonts and the
 * photo/mark images; any image failure degrades gracefully (monogram /
 * omitted mark), never throws.
 */
export async function drawCard(canvas: HTMLCanvasElement, data: CardExportData): Promise<void> {
  // Aspect-ratio invariant (round-2 lesson — the design space is card.svg's
  // 1080×1600 = 27:40): a wrong-aspect backing store would stretch every draw.
  const expectedHeight = Math.round((canvas.width * CARD_DESIGN_HEIGHT) / CARD_DESIGN_WIDTH)
  if (canvas.height !== expectedHeight) {
    throw new Error(
      `card canvas must match the design aspect 27:40 (${canvas.width}x${expectedHeight}); got ${canvas.width}x${canvas.height}`,
    )
  }
  await loadCardFonts()
  const plan = buildCardPlan(data, canvas.width)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 2d context unavailable')

  const s = plan.scale
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // NO full-canvas fill: the PNG is TRANSPARENT around the shield. Paint
  // only the plate path — tier color inside, nothing outside.
  const plate = new Path2D(scalePath(plan.card.platePath, s))
  ctx.fillStyle = plan.palette.plateFill
  ctx.fill(plate)

  // --- Photo: the member screenshot (or fallback) CLIPPED TO THE CROP PATH
  // (round 5) — the SAME path the on-page SVG clips with. Painted BEFORE
  // the border so the border sits on top of the photo edges (round 7
  // deliberate order: plate → photo → scrim → border-over → texts).
  const crop = new Path2D(scalePath(plan.card.cropPath, s))
  const b = plan.photoBBox
  ctx.save()
  ctx.clip(crop)
  if (plan.photo.kind === 'image') {
    const img = await loadImage(plan.photo.src)
    if (img !== null && img.width > 0 && img.height > 0) {
      // Cover-fit within the crop bbox: scale to cover, center, let the
      // crop path clip the overflow (mirrors the SVG's slice behavior).
      const cover = Math.max(b.w / img.width, b.h / img.height)
      const dw = img.width * cover
      const dh = img.height * cover
      ctx.drawImage(img, b.x + (b.w - dw) / 2, b.y + (b.h - dh) / 2, dw, dh)
    } else {
      drawMonogramFill(ctx, plan)
    }
  } else {
    drawMonogramFill(ctx, plan)
  }
  // Top legibility scrim (backs the over-photo OVR block).
  const scrimGrad = ctx.createLinearGradient(0, plan.scrim.y1, 0, plan.scrim.y2)
  scrimGrad.addColorStop(0, `rgba(0,0,0,${plan.scrim.alpha})`)
  scrimGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = scrimGrad
  ctx.fillRect(b.x, b.y, b.w, plan.scrim.y2 - plan.scrim.y1)
  ctx.restore()

  // --- Detached border (round 7, the owner's deliberate design): the tier
  // gradient stroke ON the crop-path geometry, painted OVER the photo —
  // covering its edges. CLIPPED to the plate silhouette (the owner's
  // clip-path-1): the stroke's outer half is cut, the inner half covers the
  // photo. After the photo, before ALL text.
  ctx.save()
  ctx.clip(new Path2D(scalePath(plan.card.borderStroke.clipPath, s)))
  ctx.strokeStyle = applyBorderGradient(ctx, plan.palette, plan.card.borderStroke.line, s)
  ctx.lineWidth = plan.card.borderStroke.width * s
  ctx.stroke(crop)
  ctx.restore()

  // --- OVR block (over the photo): big number + job name below, NO "OVR"
  // tag. White with a shadow — same legibility contract the SVG's
  // paint-order stroke delivers. Both slots under the SHARED fit contract
  // (Bebas Neue — real measured metrics, round 6-7).
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = 14 * s
  ctx.fillStyle = plan.ovr.color
  paintFitted(ctx, plan.ovr.text, plan.ovr.x, plan.ovr.y, plan.fonts.slots, 400, plan.ovr.size, plan.ovr.maxW)
  paintFitted(ctx, plan.ovr.jobText, plan.ovr.jobX, plan.ovr.jobY, plan.fonts.slots, 400, plan.ovr.jobSize, plan.ovr.jobMaxW)
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  // --- Player name: Orbitron on the plate, palette text fill, centered at
  // its parsed slot x (round 7). The solid card color guarantees contrast
  // (no shadow needed).
  ctx.fillStyle = plan.name.color
  paintFitted(ctx, plan.name.text, plan.name.x, plan.name.y, plan.fonts.name, 700, plan.name.size, plan.name.maxWidth, true)

  // --- The 6 key stats — one per parsed slot column (server order), each
  // column a label / big points number / small raw value stack, ALL THREE
  // LINES CENTRALLY ALIGNED on the column centerX (round 7), all under the
  // SHARED fit contract (real metrics — the round 6-7 overflow fix).
  ctx.fillStyle = plan.palette.textFill
  for (const cell of plan.stats) {
    paintFitted(ctx, cell.label, cell.centerX, cell.labelY, plan.fonts.slots, 400, cell.labelSize, cell.labelMaxW, true)
    paintFitted(ctx, cell.points, cell.centerX, cell.pointsY, plan.fonts.slots, 400, cell.pointsSize, cell.pointsMaxW, true)
    paintFitted(ctx, cell.value, cell.centerX, cell.valueY, plan.fonts.slots, 400, cell.valueSize, cell.valueMaxW, true)
  }

  // Hellz mark (brand anchor in the plate tip below the stat slots).
  const mark = await loadImage(plan.mark.src)
  if (mark !== null) {
    ctx.drawImage(
      mark,
      plan.mark.x - plan.mark.size / 2,
      plan.mark.y - plan.mark.size / 2,
      plan.mark.size,
      plan.mark.size,
    )
  }
}

function drawMonogramFill(ctx: CanvasRenderingContext2D, plan: CardPlan): void {
  // ASST-01 neutral fallback: the crop path filled with the surface tile +
  // class initial, centered in the crop bbox (never an empty hole).
  const b = plan.photoBBox
  ctx.fillStyle = plan.colors.monogramTile
  ctx.fill(new Path2D(scalePath(plan.card.cropPath, plan.scale)))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${b.h * 0.2}px Orbitron`
  ctx.fillStyle = plan.colors.monogramText
  ctx.fillText(plan.photo.kind === 'monogram' ? plan.photo.letter : ' ', b.x + b.w / 2, b.y + b.h * 0.45)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
}

/**
 * Render the card offscreen at 2160×3200 (2× the 1080×1600 design space for
 * retina crispness) and trigger a PNG download via a temporary anchor +
 * object URL. Same-origin images only (D-15/T-072-13) — a tainted canvas
 * would make the blob step throw loudly here, which the self-hosted rule
 * makes unreachable. The PNG has NO background: transparent outside the
 * shield plate.
 */
export async function downloadCard(data: CardExportData, filename: string): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = 2160
  canvas.height = 3200
  await drawCard(canvas, data)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob === null) throw new Error('falha ao gerar o PNG do card')
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Re-exports for consumers that layout-annotate around the plan (design
// space constants; CardSvg renders everything from the plan).
export { CARD_DESIGN_WIDTH, CARD_DESIGN_HEIGHT, CARD_GEOMETRY, TIER_PALETTE, type CardRect }
