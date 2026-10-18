// cardExport.ts — the crest card JPEG export (plan 07.2-05, CARD-03 / D-09 /
// D-10 / D-12; checkpoint round 3 SUPERSEDING DESIGN). Zero new npm
// dependencies (v1.1 invariant): native Canvas 2D + Path2D + the already
// self-hosted Orbitron woff2 + brand mark.
//
// ROUND 3 (owner verdict on the round-2 shield cards: "chaotic in the
// interface, generic when downloaded"): the entire code-drawn frame approach
// is REPLACED by the owner's four hand-designed crest SVGs
// (bronze/silver/gold/pristine — src/assets/*-crest.svg). The card is now a
// "fake rectangle": a content rectangle (the owner's Content-safezone
// guideline) laid over the decorated crest frame. EVERY placement — OVR
// hero, name band, six-stat band, photo crop — reads the guideline rects
// parsed from those SVGs (crestAssets.ts), so the design lives in the
// owner's files, not in code.
//
// ONE PLAN, TWO SURFACES: buildCardPlan is the pure layout core; BOTH the
// on-page <svg> (CrestCard.tsx) and this canvas shell consume the SAME plan
// object — same path strings, same rects, same colors — so the downloaded
// JPEG is the on-page card by construction.
//
// Round-2 lessons KEPT: fail-fast aspect gate (now 1:1 — the crest design
// space), document.fonts.await before first draw, scalePath mapping of
// design-space paths onto the backing store (Canvas 2D has no viewBox), and
// the real stat-grid gutter discipline.
//
// Export content contract (D-09/T-072-12 — the JPEG circulates OUTSIDE the
// guild): identity (name, class·função, OVR hero) + the 6 key stats
// (3-letter label + value + points chip) + Hellz mark. NO guild-average
// data of any kind — the stat-cell field list is closed and cannot express
// an aggregate.
//
// Photo crop: the member's character screenshot (self-uploaded on the
// Painel, Supabase Storage + RLS) is clipped into the crest's photo-crop
// path. Fallback chain (never an empty hole): screenshot → class portrait
// (self-hosted ROO asset, D-15) → ASST-01 neutral monogram.
//
// Canvas-taint safety (T-072-13): every image drawn is same-origin — class
// portraits are committed '/assets/classes/...' files, member screenshots
// are fetched as blobs and passed as object URLs (the api.ts wrapper never
// hands out cross-origin URLs), and the mark is the bundled hellz-mark.svg.
import type { Tier } from '../dashboard/presentation'
import { FUNCTION_LABELS } from '../../lib/groups'
import markUrl from '../../assets/hellz-mark.svg'
import {
  CREST_DESIGN_SIZE,
  CREST_GEOMETRY,
  scalePath,
  scaleRect,
  type CrestGeometry,
  type CrestPlateFill,
  type CrestRect,
} from './crestAssets'

// ---------------------------------------------------------------------------
// Closed data contract (what callers assemble — PromotionCard from get_promotion
// rows, the Painel card from my_card; values arrive PRE-FORMATTED strings).
export interface CardExportStat {
  label_short: string
  value: string
  points: number | null
  tier: Tier | null
}

export interface CardExportData {
  name: string
  charClass: string
  charFunction: 'dps' | 'mdps' | 'suporte'
  ovr: number // rounded for display
  stats: CardExportStat[]
  /** Image clipped into the crest's photo-crop path (member screenshot or
   *  class portrait — same-origin blob/asset URL), null → ASST-01 monogram. */
  photoSrc: string | null
  /** Class initial for the monogram fallback (ASST-01). */
  monogramLetter: string
}

// ---------------------------------------------------------------------------
// Shared content palette (the owner's plates carry the color; text rides ON
// the photo, so it is white with a dark scrim beneath — see the scrim spec).
const TEXT_COLOR = '#FFFFFF'
const CHIP_TEXT_COLOR = '#241A10' // dark text on tier-hex chip fills
const MONOGRAM_TILE = '#1E1E1E'
const MONOGRAM_BORDER = '#3D2A2B'
const MONOGRAM_TEXT = '#9A8F8F'
/** Legibility scrim over the photo's lower area (inside the crop): black
 *  fading in from y1 to y2 (design space) up to `alpha`. Same spec painted
 *  by BOTH surfaces (SVG gradient / canvas gradient) from the plan. */
const SCRIM = { y1: 420, y2: 950, alpha: 0.62 } as const

// ---------------------------------------------------------------------------
// Layout plan. The design space is the crest SVGs' own 1000×1000 viewBox;
// every number scales linearly with the requested width, so
// buildCardPlan(…, w) is exact at any resolution (downloadCard paints at 2×
// for retina crispness). Content positions are DERIVED from the tier's
// guideline rects — the owner's placement authority.

export interface CardPlanStatCell {
  /** Cell rect (scaled) inside the tier's six-key-stats guideline band. */
  x: number
  y: number
  w: number
  h: number
  label: string
  value: string
  points: number | null
  tier: Tier | null
  /** Alphabetic-baseline text anchors (scaled design space). */
  labelX: number
  labelY: number
  labelSize: number
  valueX: number
  valueY: number
  valueSize: number
  valueMaxW: number
  /** Chip box right-aligned INSIDE this cell (round-2 gutter discipline:
   *  a chip never touches or underlaps the next column). */
  chipX: number
  chipY: number
  chipW: number
  chipH: number
  /** Rounded points, or the muted '—' slot marker when points is null. */
  chipText: string
  /** Chip fill: the stat's tier hex (site tokens — consistent with the rest
   *  of the UI), or muted for the '—' slot. */
  chipColor: string
  chipTextColor: string
}

export type CardPlanPhoto =
  | { kind: 'image'; src: string }
  | { kind: 'monogram'; letter: string }

export interface CardPlan {
  width: number
  height: number // === width (the crest design space is square)
  tier: Tier
  /** The tier's crest geometry — design-space path strings + parsed
   *  guideline rects (1000×1000; scale onto the backing store via
   *  plan.scale). */
  crest: CrestGeometry
  /** scale = width / CREST_DESIGN_SIZE — the one number every consumer
   *  multiplies design-space values by. */
  scale: number
  photo: CardPlanPhoto
  scrim: { y1: number; y2: number; alpha: number }
  ovr: {
    caption: string
    captionX: number
    captionY: number
    captionSize: number
    text: string
    x: number
    y: number
    size: number
    color: string
  }
  name: { text: string; x: number; y: number; size: number; color: string; maxWidth: number }
  subtitle: { text: string; x: number; y: number; size: number; color: string }
  /** The 6 key stats in SERVER/highlight order, 2-col × 3-row inside the
   *  tier's six-key-stats guideline band, with a real column gutter. */
  stats: CardPlanStatCell[]
  mark: { src: string; x: number; y: number; size: number }
  colors: {
    text: string
    chipText: string
    monogramTile: string
    monogramBorder: string
    monogramText: string
  }
  plateFill: CrestPlateFill
}

function tierOf(ovr: number): Tier {
  if (ovr < 65) return 'bronze'
  if (ovr < 75) return 'silver'
  if (ovr < 85) return 'gold'
  return 'platinum'
}

function tierOfOrCard(tier: Tier | null, cardTier: Tier): Tier {
  // Defensive: a stat cell with points but a somehow-null tier still gets a
  // color (the card's own tier). points === null never reaches here.
  return tier ?? cardTier
}

/** Site tier tokens (mirror of the @theme --color-tier-* values) — chip
 *  fills keep the rest-of-UI tier vocabulary; the crest plate carries the
 *  owner's own palette from the SVGs. */
export const TIER_CHIP_HEX: Record<Tier, string> = {
  bronze: '#C97F3F',
  silver: '#B8C0CC',
  gold: '#E9B44C',
  platinum: '#D7E3F0',
}

const CHIP_MUTED = '#9A8F8F'

/**
 * Build the full card layout plan. PURE — no canvas, no DOM, no I/O. The
 * square aspect is structural: height === width at ANY width.
 */
export function buildCardPlan(data: CardExportData, width = CREST_DESIGN_SIZE): CardPlan {
  const tier = tierOf(data.ovr)
  const crest = CREST_GEOMETRY[tier]
  const scale = width / CREST_DESIGN_SIZE

  // --- Content placement from the tier's guideline rects (owner authority)
  // — scaled onto the requested width (the plan's numbers live on the
  // backing store; plan.crest keeps the unscaled design-space originals for
  // the SVG surface, which maps them via its viewBox for free).
  const ovrRect = scaleRect(crest.guides.ovrNumber, scale)
  const nameRect = scaleRect(crest.guides.nameAndJob, scale)
  const statsRect = scaleRect(crest.guides.sixKeyStats, scale)

  // OVR hero: caption above the big number, left-aligned inside the box.
  const ovrPadX = ovrRect.w * 0.08
  const ovr = {
    caption: 'OVR',
    captionX: ovrRect.x + ovrPadX,
    captionY: ovrRect.y + ovrRect.h * 0.24,
    captionSize: ovrRect.h * 0.15,
    text: String(Math.round(data.ovr)),
    x: ovrRect.x + ovrPadX,
    y: ovrRect.y + ovrRect.h * 0.8,
    size: ovrRect.h * 0.6,
    color: TEXT_COLOR,
  }

  // Name band: centered name + class·função line.
  const name = {
    text: data.name,
    x: nameRect.x + nameRect.w / 2,
    y: nameRect.y + nameRect.h * 0.44,
    size: nameRect.h * 0.38,
    color: TEXT_COLOR,
    maxWidth: nameRect.w * 0.92,
  }
  const subtitle = {
    text: `${data.charClass} · ${FUNCTION_LABELS[data.charFunction]}`,
    x: nameRect.x + nameRect.w / 2,
    y: nameRect.y + nameRect.h * 0.82,
    size: nameRect.h * 0.2,
    color: TEXT_COLOR,
  }

  // Stat grid — 2 cols × 3 rows inside the six-key-stats band, with a REAL
  // column gutter (round-2 lesson: chips never underlap the next column).
  const padX = statsRect.w * 0.025
  const gutter = statsRect.w * 0.05
  const padY = statsRect.h * 0.06
  const rowGap = statsRect.h * 0.03
  const cellW = (statsRect.w - padX * 2 - gutter) / 2
  const cellH = (statsRect.h - padY * 2 - rowGap * 2) / 3
  const chipW = cellH * 0.72
  const chipH = cellH * 0.66

  const stats: CardPlanStatCell[] = data.stats.map((stat, i) => {
    const row = Math.floor(i / 2)
    const col = i % 2
    const x = statsRect.x + padX + col * (cellW + gutter)
    const y = statsRect.y + padY + row * (cellH + rowGap)
    return {
      x,
      y,
      w: cellW,
      h: cellH,
      label: stat.label_short,
      value: stat.value,
      points: stat.points,
      tier: stat.tier,
      labelX: x,
      labelY: y + cellH * 0.34,
      labelSize: cellH * 0.26,
      valueX: x,
      valueY: y + cellH * 0.9,
      valueSize: cellH * 0.52,
      valueMaxW: cellW - chipW - cellH * 0.2,
      chipX: x + cellW - chipW,
      chipY: y + (cellH - chipH) / 2,
      chipW,
      chipH,
      chipText: stat.points === null ? '—' : String(Math.round(stat.points)),
      chipColor: stat.points === null ? CHIP_MUTED : TIER_CHIP_HEX[tierOfOrCard(stat.tier, tier)],
      chipTextColor: CHIP_TEXT_COLOR,
    }
  })

  const photo: CardPlanPhoto =
    data.photoSrc !== null
      ? { kind: 'image', src: data.photoSrc }
      : { kind: 'monogram', letter: data.monogramLetter }

  // Hellz mark: centered in the gap between the safezone bottom and the
  // crest's bottom tip (scaled).
  const safezone = scaleRect(crest.guides.contentSafezone, scale)
  const markY = safezone.y + safezone.h + (width - (safezone.y + safezone.h)) * 0.5
  return {
    width,
    height: width,
    tier,
    crest,
    scale,
    photo,
    scrim: { ...SCRIM },
    ovr,
    name,
    subtitle,
    stats,
    mark: { src: markUrl, x: width / 2, y: markY, size: 64 * scale },
    colors: {
      text: TEXT_COLOR,
      chipText: CHIP_TEXT_COLOR,
      monogramTile: MONOGRAM_TILE,
      monogramBorder: MONOGRAM_BORDER,
      monogramText: MONOGRAM_TEXT,
    },
    plateFill: crest.plateFill,
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

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/** Draw text shrunk-to-fit within maxWidth (names/values can be long). */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  size: number,
): number {
  let px = size
  ctx.font = `${weight} ${px}px Orbitron`
  while (px > size * 0.45 && ctx.measureText(text).width > maxWidth) {
    px -= size * 0.05
    ctx.font = `${weight} ${px}px Orbitron`
  }
  return px
}

/** Canvas fill for the parsed plate fill spec (solid hex or the pristine
 *  gradient — same line + stops the on-page SVG renders). */
function applyPlateFill(ctx: CanvasRenderingContext2D, fill: CrestPlateFill, s: number): string | CanvasGradient {
  if (fill.kind === 'solid') return fill.hex
  const grad = ctx.createLinearGradient(fill.x1 * s, fill.y1 * s, fill.x2 * s, fill.y2 * s)
  for (const stop of fill.stops) grad.addColorStop(Math.min(1, Math.max(0, stop.offset)), stop.color)
  return grad
}

/** Solid base color of the plate (first gradient stop for the pristine
 *  crest) — painted edge-to-edge BEFORE the plate path so no background
 *  fringe shows at the frame's anti-aliased border. */
export function plateBaseColor(fill: CrestPlateFill): string {
  return fill.kind === 'solid' ? fill.hex : fill.stops[0].color
}

/**
 * Paint the card plan onto a canvas (canvas.width drives the plan width —
 * keep the canvas square). Awaits fonts and the photo/mark images; any
 * image failure degrades gracefully (monogram / omitted mark), never throws.
 */
export async function drawCard(canvas: HTMLCanvasElement, data: CardExportData): Promise<void> {
  // Aspect-ratio invariant (round-2 lesson, adapted to the crest's square
  // design space): a non-square backing store would stretch every draw.
  if (canvas.height !== canvas.width) {
    throw new Error(`card canvas must be square (got ${canvas.width}x${canvas.height})`)
  }
  await loadCardFonts()
  const plan = buildCardPlan(data, canvas.width)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 2d context unavailable')

  const { width, height } = plan
  const s = plan.scale
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Base: plate color edge-to-edge (no fringe), then the plate path itself.
  ctx.fillStyle = plateBaseColor(plan.plateFill)
  ctx.fillRect(0, 0, width, height)
  const plate = new Path2D(scalePath(plan.crest.platePath, s))
  ctx.fillStyle = applyPlateFill(ctx, plan.plateFill, s)
  ctx.fill(plate)

  // --- Photo crop: the member screenshot (or fallback) clipped into the
  // crest's photo-crop path — the SAME path string the on-page SVG clips.
  const crop = new Path2D(scalePath(plan.crest.photoCropPath, s))
  ctx.save()
  ctx.clip(crop)
  if (plan.photo.kind === 'image') {
    const img = await loadImage(plan.photo.src)
    if (img !== null && img.width > 0 && img.height > 0) {
      // Cover-fit: scale to cover the full design space, center, let the
      // clip crop the overflow (mirrors the SVG's preserveAspectRatio slice).
      const cover = Math.max(width / img.width, height / img.height)
      const dw = img.width * cover
      const dh = img.height * cover
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh)
    } else {
      drawMonogramFill(ctx, plan, data.monogramLetter, width)
    }
  } else {
    drawMonogramFill(ctx, plan, plan.photo.letter, width)
  }
  // Legibility scrim over the photo's lower area (spec shared with the SVG).
  const scrimGrad = ctx.createLinearGradient(0, plan.scrim.y1 * s, 0, plan.scrim.y2 * s)
  scrimGrad.addColorStop(0, 'rgba(0,0,0,0)')
  scrimGrad.addColorStop(1, `rgba(0,0,0,${plan.scrim.alpha})`)
  ctx.fillStyle = scrimGrad
  ctx.fillRect(0, 0, width, height)
  // The owner's decorative stroke on the photo window (updated pristine
  // crest: #e6e6e6 @ 20, clipped to the crop → only the inner half shows —
  // the same visual the SVG paints).
  if (plan.crest.photoCropStroke !== null) {
    ctx.strokeStyle = plan.crest.photoCropStroke.color
    ctx.lineWidth = plan.crest.photoCropStroke.width * s
    ctx.stroke(crop)
  }
  ctx.restore()

  // --- Text content, positioned by the guideline rects (design space
  // scaled onto the backing store). White over the scrim, like game UI.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${plan.ovr.captionSize}px Orbitron`
  ctx.fillStyle = plan.ovr.color
  ctx.fillText(plan.ovr.caption, plan.ovr.captionX, plan.ovr.captionY)
  ctx.font = `900 ${plan.ovr.size}px Orbitron`
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = 14 * s
  ctx.fillText(plan.ovr.text, plan.ovr.x, plan.ovr.y)
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  ctx.textAlign = 'center'
  ctx.fillStyle = plan.name.color
  fitText(ctx, plan.name.text, plan.name.maxWidth, 700, plan.name.size)
  ctx.fillText(plan.name.text, plan.name.x, plan.name.y)
  ctx.font = `600 ${plan.subtitle.size}px Orbitron`
  ctx.fillText(plan.subtitle.text, plan.subtitle.x, plan.subtitle.y)

  // The 6 key stats — 2-col × 3-row inside the guideline band (server
  // order), each cell a self-contained label/value/chip group.
  ctx.textAlign = 'left'
  for (const cell of plan.stats) {
    ctx.font = `700 ${cell.labelSize}px Orbitron`
    ctx.fillStyle = plan.colors.text
    ctx.fillText(cell.label, cell.labelX, cell.labelY)
    fitText(ctx, cell.value, cell.valueMaxW, 700, cell.valueSize)
    ctx.fillText(cell.value, cell.valueX, cell.valueY)

    // Points chip in the stat's tier color; null points → muted '—' slot.
    roundRectPath(ctx, cell.chipX, cell.chipY, cell.chipW, cell.chipH, cell.chipH / 2)
    ctx.fillStyle = cell.chipColor
    ctx.fill()
    ctx.fillStyle = cell.chipTextColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${cell.chipH * 0.52}px Orbitron`
    ctx.fillText(cell.chipText, cell.chipX + cell.chipW / 2, cell.chipY + cell.chipH / 2)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
  }

  // Hellz mark (brand anchor below the stat band).
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

function drawMonogramFill(ctx: CanvasRenderingContext2D, plan: CardPlan, letter: string, size: number): void {
  // ASST-01 neutral fallback: surface tile + class initial, centered in the
  // crop (the clip bounds it to the photo area — never an empty hole).
  ctx.fillStyle = plan.colors.monogramTile
  ctx.fillRect(0, 0, size, size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${size * 0.16}px Orbitron`
  ctx.fillStyle = plan.colors.monogramText
  ctx.fillText(letter, size / 2, size * 0.38)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
}

/**
 * Render the card offscreen at 2000×2000 (2× the 1000 design space for
 * retina crispness) and trigger a JPEG download via a temporary anchor +
 * object URL. Same-origin images only (D-15/T-072-13) — a tainted canvas
 * would make the blob step throw loudly here, which the self-hosted rule
 * makes unreachable.
 */
export async function downloadCard(data: CardExportData, filename: string): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = 2000
  canvas.height = 2000
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

// Re-exports for consumers that layout-annotate around the plan (guideline
// rects in design space; CrestCard renders everything from the plan).
export { CREST_DESIGN_SIZE, CREST_GEOMETRY, scaleRect, type CrestRect }
