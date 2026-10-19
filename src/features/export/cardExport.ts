// cardExport.ts — the card JPEG export (plan 07.2-05, CARD-03 / D-09 /
// D-10 / D-12; checkpoint round 5, owner supersession: "this one file
// [card.svg] becomes the source of truth for card design"). Zero new npm
// dependencies (v1.1 invariant): native Canvas 2D + Path2D + the already
// self-hosted Orbitron woff2 + brand mark.
//
// ROUND 5 (owner verdict on round 4: "i couldnt get my idea through — check
// the new card.svg"): ONE design file for every tier. The parser
// (cardAssets.ts) extracts the plate silhouette, the crop-path photo area,
// the border-stroke geometry, and ALL placeholder TEXT slots (OVR / job /
// PLAYERNAME / 6 positional stat slots). Everything the round-4 per-tier
// SVGs carried that was COLOR now lives in code (TIER_PALETTE): plate fill,
// border gradient stops, text fill. Composition rules:
//   1. The member's screenshot is CLIPPED TO THE CROP PATH (round 5 brought
//      the crop path back — there are no guideline rects/safe areas).
//   2. Text slots are POSITIONAL: the parser's slot positions/sizes ARE the
//      layout. Code fills OVR + job (top-left, over the photo), PLAYERNAME
//      (on the plate), and the six stat columns (label / points / raw
//      own_value each).
//   3. Fonts: Bebas Neue was a placeholder — the site's Orbitron renders
//      everywhere (OVR number in 900, points/name/labels 700, values 600).
//      Orbitron is WIDER than Bebas, so every slot carries a fitText
//      maxWidth (shrink-to-fit) — the design positions are honored, the
//      type never overflows its column.
//   4. The PLAYERNAME slot is re-centered horizontally (the file's x=285
//      anchors a left-aligned Bebas string; a centered Orbitron name reads
//      as designed for any name length). Recorded as a round-5 decision.
//
// ONE PLAN, TWO SURFACES: buildCardPlan is the pure layout core; BOTH the
// on-page <svg> (CardSvg.tsx) and this canvas shell consume the SAME plan
// object — same path strings, same slot positions, same colors — so the
// downloaded JPEG is the on-page card by construction.
//
// Round-2 lessons KEPT: fail-fast aspect gate (27:40 — the card.svg design
// space), document.fonts await before first draw, scalePath mapping of
// design-space paths onto the backing store (Canvas 2D has no viewBox).
//
// Export content contract (D-09/T-072-12 — the JPEG circulates OUTSIDE the
// guild): identity (name, OVR + job name) + the 6 key stats (3-letter label
// + points + formatted own_value) + Hellz mark. NO guild-average data of
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
// Round 5: no per-stat tier field — the design renders points as palette
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

/** Top legibility scrim for the OVER-PHOTO OVR block: black fading out
 *  downward from the photo's top edge. Covers the OVR number + job name
 *  (65% of the crop area's height). Fractions of the crop bbox; the same
 *  spec is painted by BOTH surfaces from the plan. */
const SCRIM = { heightFraction: 0.65, alpha: 0.55 } as const

/** The Hellz brand mark, centered in the plate tip below the stat slots
 *  (kept from rounds 3-4; card.svg has no mark slot — this is an additive
 *  brand anchor, not part of the design-space contract). */
const MARK = { y: 1408, size: 54 } as const

// ---------------------------------------------------------------------------
// Layout plan. The design space is card.svg's own 1080×1600 viewBox; every
// number scales linearly with the requested width, so
// buildCardPlan(…, w) is exact at any resolution (downloadCard paints at 2×
// for retina crispness). Content positions are the PARSED SLOT POSITIONS —
// the owner's placement authority.

export type CardPlanPhoto =
  | { kind: 'image'; src: string }
  | { kind: 'monogram'; letter: string }

export interface CardPlanStatSlot {
  label: string
  /** Alphabetic-baseline text anchors (scaled design space) + fitText
   *  bounds. Points = the big rounded rank number (or '—'); value = the
   *  formatted raw own_value. */
  labelX: number
  labelY: number
  labelSize: number
  labelMaxW: number
  points: string
  pointsX: number
  pointsY: number
  pointsSize: number
  pointsMaxW: number
  value: string
  valueX: number
  valueY: number
  valueSize: number
  valueMaxW: number
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
    /** Fit bound for the big number (mirrors the job bound: from the slot's
     *  x to the card's right margin minus 40). Never binds at 2-3 digits —
     *  insurance for pathological inputs, shared by both surfaces. */
    maxW: number
    jobText: string
    jobX: number
    jobY: number
    jobSize: number
    jobMaxW: number
    color: string
  }
  /** Player name — on the plate between photo and stats, palette text
   *  fill, centered (round-5 decision). */
  name: { text: string; x: number; y: number; size: number; color: string; maxWidth: number }
  /** The 6 key stats in SERVER/highlight order, one per parsed slot
   *  column, each a self-contained label/points/value group. */
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
 */
export function buildCardPlan(data: CardExportData, width = CARD_DESIGN_WIDTH): CardPlan {
  const tier = tierOf(data.ovr)
  const card = CARD_GEOMETRY
  const palette = TIER_PALETTE[tier]
  const scale = width / CARD_DESIGN_WIDTH
  const height = (width * CARD_DESIGN_HEIGHT) / CARD_DESIGN_WIDTH

  const photoBBox = scaleRect(card.cropBBox, scale)
  const slots = card.slots

  // OVR block: the parsed slot (top-left, over the photo) — big number +
  // JOB NAME below, NO "OVR" tag (round 4). White with a shadow, backed by
  // the top scrim. The job name shrinks to fit from its x to the card's
  // right margin.
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

  // Player name: the parsed slot's baseline/size, RE-CENTERED horizontally
  // (round-5 decision — the file's x anchors a left-aligned Bebas string).
  const name = {
    text: data.name,
    x: width / 2,
    y: slots.name.y * scale,
    size: slots.name.size * scale,
    color: palette.textFill,
    maxWidth: CARD_DESIGN_WIDTH * 0.82 * scale,
  }

  // Stat slots: parsed positions verbatim; each column's fitText bound is
  // the distance to the NEXT column's label (the last runs to the plate's
  // inner right edge, mirrored from the crop bbox's left margin) minus a
  // real gutter — Orbitron is wider than the placeholder Bebas, so the
  // shrink-to-fit contract is what keeps the six columns collision-free.
  const statSlots: CardPlanStatSlot[] = data.stats.map((stat, i) => {
    const slot = slots.stats[i]
    const nextX =
      i < slots.stats.length - 1
        ? slots.stats[i + 1].label.x
        : CARD_DESIGN_WIDTH - card.cropBBox.x // mirrored left margin
    const colW = (nextX - slot.label.x - 8) * scale
    return {
      label: stat.label_short,
      labelX: slot.label.x * scale,
      labelY: slot.label.y * scale,
      labelSize: slot.label.size * scale,
      labelMaxW: colW,
      points: stat.points === null ? '—' : String(Math.round(stat.points)),
      pointsX: slot.points.x * scale,
      pointsY: slot.points.y * scale,
      pointsSize: slot.points.size * scale,
      pointsMaxW: colW,
      value: stat.value,
      valueX: slot.value.x * scale,
      valueY: slot.value.y * scale,
      valueSize: slot.value.size * scale,
      valueMaxW: colW,
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
// Export filename: 'hellz-<slugified name>.jpg' — diacritics stripped
// (NFD → combining marks removed), non-alphanumerics collapsed to single
// hyphens, no leading/trailing hyphen.
export function cardFilename(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `hellz-${slug}.jpg`
}

// ---------------------------------------------------------------------------
// THE SHARED FIT CONTRACT (round 6, the owner's overflow defect: "the card
// is overflowing — the shape was reduced but the letters were not").
//
// Round 5's SVG side decided the textLength squeeze with a 0.62em advance
// ESTIMATE — real Orbitron 700 advances are ~0.83em, so slots the estimate
// passed ("88" at 128px: est 158px vs a 161px column) render ~213px wide on
// the page and stick OUT of the plate silhouette, while the canvas side
// (which always measured real metrics) fit fine. One contract for BOTH
// surfaces now:
//
//   fitCardText: measure the string at its design size (REAL metrics —
//   canvas measureText with loaded Orbitron); if it fits, render untouched;
//   otherwise SHRINK THE FONT SIZE proportionally (glyph shape preserved —
//   the owner's proportion/readability rule) down to a readability floor
//   (CARD_FIT_FLOOR of the design size); only past the floor squeeze the
//   glyphs horizontally (SVG textLength+spacingAndGlyphs / canvas x-scale)
//   as the emergency clamp. Every slot thus fits its column at design
//   scale, and the viewBox scales the whole composition at any width.

/** Conservative advance estimate for when REAL metrics are unavailable
 *  (non-browser test environments; the on-page font-load flash). Deliberately
 *  WIDE (~0.8em ≈ real Orbitron's worst) — squeeze early rather than overflow. */
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

/** Readability floor: a fitted slot never shrinks below this fraction of its
 *  design size; beyond it the emergency glyph-squeeze takes over. */
export const CARD_FIT_FLOOR = 0.55

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

/** Await the exact Orbitron weights the card paints with (round-2 lesson:
 *  without this the first export renders the fallback font). Also awaits
 *  document.fonts.ready — belt-and-braces so a pending @font-face load can
 *  never race the first draw. Best-effort: a rejected load never blocks. */
async function loadCardFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('900 160px Orbitron'),
      document.fonts.load('700 48px Orbitron'),
      document.fonts.load('600 26px Orbitron'),
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
 *  lengthAdjust="spacingAndGlyphs". `center` squeezes around the anchor
 *  (the centered player name); otherwise the squeeze is anchored at x. */
function paintFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  weight: number,
  size: number,
  maxW: number,
  center = false,
): void {
  const fit = fitCardText(text, weight, size, maxW)
  ctx.font = `${weight} ${fit.size}px Orbitron`
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

  const { width, height } = plan
  const s = plan.scale
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Base: the tier plate fill edge-to-edge (no fringe at the plate path's
  // anti-aliased border), then the plate path itself.
  ctx.fillStyle = plan.palette.plateFill
  ctx.fillRect(0, 0, width, height)
  const plate = new Path2D(scalePath(plan.card.platePath, s))
  ctx.fill(plate)

  // Decorative border: the tier gradient stroked along the silhouette,
  // CLIPPED to it (only the inner half shows) — the same visual card.svg's
  // clipPath#clip-path-1 produces.
  ctx.save()
  ctx.clip(plate)
  ctx.strokeStyle = applyBorderGradient(ctx, plan.palette, plan.card.borderStroke.line, s)
  ctx.lineWidth = plan.card.borderStroke.width * s
  ctx.stroke(plate)
  ctx.restore()

  // --- Photo: the member screenshot (or fallback) CLIPPED TO THE CROP PATH
  // (round 5) — the SAME path the on-page SVG clips with.
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

  // --- OVR block (over the photo): big number + job name below, NO "OVR"
  // tag. White with a shadow — same legibility contract the SVG's
  // paint-order stroke delivers. Both slots under the SHARED fit contract.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = 14 * s
  ctx.fillStyle = plan.ovr.color
  paintFitted(ctx, plan.ovr.text, plan.ovr.x, plan.ovr.y, 900, plan.ovr.size, plan.ovr.maxW)
  paintFitted(ctx, plan.ovr.jobText, plan.ovr.jobX, plan.ovr.jobY, 700, plan.ovr.jobSize, plan.ovr.jobMaxW)
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  // --- Player name: on the plate, palette text fill, centered — the solid
  // card color guarantees contrast (no shadow needed).
  ctx.fillStyle = plan.name.color
  paintFitted(ctx, plan.name.text, plan.name.x, plan.name.y, 700, plan.name.size, plan.name.maxWidth, true)

  // --- The 6 key stats — one per parsed slot column (server order), each
  // column a label / big points number / small raw value stack, all under
  // the SHARED fit contract (real metrics — the round-6 overflow fix).
  ctx.fillStyle = plan.palette.textFill
  for (const cell of plan.stats) {
    paintFitted(ctx, cell.label, cell.labelX, cell.labelY, 700, cell.labelSize, cell.labelMaxW)
    paintFitted(ctx, cell.points, cell.pointsX, cell.pointsY, 700, cell.pointsSize, cell.pointsMaxW)
    paintFitted(ctx, cell.value, cell.valueX, cell.valueY, 600, cell.valueSize, cell.valueMaxW)
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
 * retina crispness) and trigger a JPEG download via a temporary anchor +
 * object URL. Same-origin images only (D-15/T-072-13) — a tainted canvas
 * would make the blob step throw loudly here, which the self-hosted rule
 * makes unreachable.
 */
export async function downloadCard(data: CardExportData, filename: string): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = 2160
  canvas.height = 3200
  await drawCard(canvas, data)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (blob === null) throw new Error('falha ao gerar o JPEG do card')
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
