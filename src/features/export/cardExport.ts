// cardExport.ts — the crest card JPEG export (plan 07.2-05, CARD-03 / D-09 /
// D-10 / D-12; checkpoint round 4, owner's READABILITY REDESIGN). Zero new
// npm dependencies (v1.1 invariant): native Canvas 2D + Path2D + the already
// self-hosted Orbitron woff2 + brand mark.
//
// ROUND 4 (owner verdict on the round-3 crest cards: "all the info was small
// and unreadable"): the crests were re-exported at 1080×1600 with a clearer
// layout, and the card composition follows the owner's NEW rules:
//   1. The photo area IS the Content-safezone rect (the round-3 dedicated
//      photo-crop path is gone) — the member's screenshot fills it.
//   2. Name-only and six-key-stats are SOLID tier-fill bands laid OVER the
//      photo — text contrast is guaranteed even when the screenshot is
//      visually hostile (no more text-on-photo scrimming for the bands).
//   3. The OVR box has NO "OVR" tag — just the big number with the JOB NAME
//      below it (top-left, over the photo, backed by a soft top scrim).
//   4. Type is sized for READABILITY — the entire point of this round
//      (value type ≈ 40% larger than round 3 relative to card width).
//
// ONE PLAN, TWO SURFACES: buildCardPlan is the pure layout core; BOTH the
// on-page <svg> (CrestCard.tsx) and this canvas shell consume the SAME plan
// object — same path strings, same rects, same colors — so the downloaded
// JPEG is the on-page card by construction.
//
// Round-2 lessons KEPT: fail-fast aspect gate (now 27:40 — the crest design
// space), document.fonts await before first draw, scalePath mapping of
// design-space paths onto the backing store (Canvas 2D has no viewBox), and
// the real stat-grid gutter discipline.
//
// Export content contract (D-09/T-072-12 — the JPEG circulates OUTSIDE the
// guild): identity (name, OVR + job name) + the 6 key stats (3-letter label
// + value + points chip) + Hellz mark. NO guild-average data of any kind —
// the stat-cell field list is closed and cannot express an aggregate.
//
// Photo fill: the member's character screenshot (self-uploaded on the
// Painel, Supabase Storage + RLS) fills the Content-safezone rect. Fallback
// chain (never an empty hole): screenshot → class portrait (self-hosted ROO
// asset, D-15) → ASST-01 neutral monogram.
//
// Canvas-taint safety (T-072-13): every image drawn is same-origin — class
// portraits are committed '/assets/classes/...' files, member screenshots
// are fetched as blobs and passed as object URLs (the api.ts wrapper never
// hands out cross-origin URLs), and the mark is the bundled hellz-mark.svg.
import type { Tier } from '../dashboard/presentation'
import markUrl from '../../assets/hellz-mark.svg'
import {
  CREST_DESIGN_HEIGHT,
  CREST_DESIGN_WIDTH,
  CREST_GEOMETRY,
  scalePath,
  scaleRect,
  type CrestGeometry,
  type CrestGradient,
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
  /** Image filling the Content-safezone photo area (member screenshot or
   *  class portrait — same-origin blob/asset URL), null → ASST-01 monogram. */
  photoSrc: string | null
  /** Class initial for the monogram fallback (ASST-01). */
  monogramLetter: string
}

// ---------------------------------------------------------------------------
// Palette. The crest SVGs carry the tier color (plate + solid bands); text
// contrast is a PER-TIER decision (round 4):
//   bronze #d1a972 / silver #e6e6e6 / gold #f9b745 are light-to-mid metals
//   → dark text; the pristine #cf1a87 deep magenta → white text.
export const BAND_TEXT_HEX: Record<Tier, string> = {
  bronze: '#241A10',
  silver: '#241A10',
  gold: '#241A10',
  platinum: '#FFFFFF',
}

/** Site tier tokens (mirror of the @theme --color-tier-* values) — chip
 *  fills keep the rest-of-UI tier vocabulary; the solid bands carry the
 *  owner's own palette from the SVGs. */
export const TIER_CHIP_HEX: Record<Tier, string> = {
  bronze: '#C97F3F',
  silver: '#B8C0CC',
  gold: '#E9B44C',
  platinum: '#D7E3F0',
}

const CHIP_TEXT_COLOR = '#241A10' // dark text on tier-hex chip fills
const CHIP_MUTED = '#9A8F8F'
const OVR_TEXT_COLOR = '#FFFFFF' // over the photo — white + shadow
const MONOGRAM_TILE = '#1E1E1E'
const MONOGRAM_TEXT = '#9A8F8F'

/** Top legibility scrim for the OVER-PHOTO OVR box: black fading out
 *  downward from the photo's top edge (the lower bands are SOLID now — no
 *  scrim needed there). Fractions of the photo rect; same spec painted by
 *  BOTH surfaces from the plan. */
const SCRIM = { heightFraction: 0.4, alpha: 0.55 } as const

// ---------------------------------------------------------------------------
// Layout plan. The design space is the crest SVGs' own 1080×1600 viewBox;
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
  /** height === width × 1600/1080 — the 27:40 crest design space. */
  height: number
  tier: Tier
  /** The tier's crest geometry — design-space path strings + parsed
   *  guideline rects (1080×1600; scale onto the backing store via
   *  plan.scale). */
  crest: CrestGeometry
  /** scale = width / CREST_DESIGN_WIDTH — the one number every consumer
   *  multiplies design-space values by. */
  scale: number
  photo: CardPlanPhoto
  /** The photo rect = the crest's Content-safezone (scaled). */
  photoRect: CrestRect
  /** Top legibility scrim spec (scaled; painted INSIDE the photo rect by
   *  both surfaces — backs the over-photo OVR box). */
  scrim: { y1: number; y2: number; alpha: number }
  /** The SOLID name band (scaled): tier fill + contrast-aware text color. */
  nameBand: { rect: CrestRect; fill: string; text: string }
  /** The SOLID stat band (scaled): tier fill. */
  statsBand: { rect: CrestRect; fill: string }
  /** OVR block over the photo: big number + job name below, NO "OVR" tag
   *  (round 4). White + shadow (over-photo legibility). */
  ovr: {
    text: string
    x: number
    y: number
    size: number
    jobText: string
    jobX: number
    jobY: number
    jobSize: number
    jobMaxW: number
    color: string
  }
  /** Player name — the ONLY content of the Name-only band (round 4). */
  name: { text: string; x: number; y: number; size: number; color: string; maxWidth: number }
  /** The 6 key stats in SERVER/highlight order, 2-col × 3-row inside the
   *  tier's six-key-stats guideline band, with a real column gutter. */
  stats: CardPlanStatCell[]
  mark: { src: string; x: number; y: number; size: number }
  colors: {
    chipText: string
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

function tierOfOrCard(tier: Tier | null, cardTier: Tier): Tier {
  // Defensive: a stat cell with points but a somehow-null tier still gets a
  // color (the card's own tier). points === null never reaches here.
  return tier ?? cardTier
}

/**
 * Build the full card layout plan. PURE — no canvas, no DOM, no I/O. The
 * 27:40 portrait aspect is structural: height === width × 1600/1080 at ANY
 * width.
 */
export function buildCardPlan(data: CardExportData, width = CREST_DESIGN_WIDTH): CardPlan {
  const tier = tierOf(data.ovr)
  const crest = CREST_GEOMETRY[tier]
  const scale = width / CREST_DESIGN_WIDTH
  const height = (width * CREST_DESIGN_HEIGHT) / CREST_DESIGN_WIDTH

  // --- Content placement from the tier's guideline rects (owner authority)
  // — scaled onto the requested width (the plan's numbers live on the
  // requested width; plan.crest keeps the unscaled design-space originals
  // for the SVG surface, which maps them via its viewBox for free).
  const photoRect = scaleRect(crest.guides.contentSafezone, scale)
  const ovrRect = scaleRect(crest.guides.ovrBox, scale)
  const nameRect = scaleRect(crest.guides.nameOnly, scale)
  const statsRect = scaleRect(crest.guides.sixKeyStats, scale)

  const bandFill = crest.tierFillHex
  const bandText = BAND_TEXT_HEX[tier]

  // OVR block: the big number with the JOB NAME below it — NO "OVR" tag
  // (round 4). Left-aligned number, centered job name, both white with a
  // shadow (they sit over the photo, backed by the top scrim).
  const ovr = {
    text: String(Math.round(data.ovr)),
    x: ovrRect.x + ovrRect.w * 0.08,
    y: ovrRect.y + ovrRect.h * 0.47,
    size: ovrRect.h * 0.36,
    jobText: data.charClass,
    jobX: ovrRect.x + ovrRect.w / 2,
    jobY: ovrRect.y + ovrRect.h * 0.8,
    jobSize: ovrRect.h * 0.1,
    jobMaxW: ovrRect.w * 0.92,
    color: OVR_TEXT_COLOR,
  }

  // Name band: SOLID tier fill — the name is its ONLY content (round 4),
  // contrast guaranteed by the per-tier band text color.
  const name = {
    text: data.name,
    x: nameRect.x + nameRect.w / 2,
    y: nameRect.y + nameRect.h / 2 + nameRect.h * 0.55 * 0.35,
    size: nameRect.h * 0.55,
    color: bandText,
    maxWidth: nameRect.w * 0.94,
  }

  // Stat grid — 2 cols × 3 rows inside the solid six-key-stats band, with a
  // REAL column gutter (round-2 lesson) and READABILITY-SIZED type
  // (round-4 point: value type ≈ 40% larger than round 3 relative to the
  // card width).
  const padX = statsRect.w * 0.028
  const gutter = statsRect.w * 0.056
  const padY = statsRect.h * 0.05
  const rowGap = statsRect.h * 0.045
  const cellW = (statsRect.w - padX * 2 - gutter) / 2
  const cellH = (statsRect.h - padY * 2 - rowGap * 2) / 3
  const chipH = cellH * 0.6
  const chipW = chipH * 1.5

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
      labelSize: cellH * 0.3,
      valueX: x,
      valueY: y + cellH * 0.95,
      valueSize: cellH * 0.58,
      valueMaxW: cellW - chipW - cellH * 0.22,
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

  // Hellz mark: centered in the plate tip below the solid stat band.
  const markY = statsRect.y + statsRect.h + 55 * scale
  return {
    width,
    height,
    tier,
    crest,
    scale,
    photo,
    photoRect,
    scrim: {
      y1: photoRect.y,
      y2: photoRect.y + photoRect.h * SCRIM.heightFraction,
      alpha: SCRIM.alpha,
    },
    nameBand: { rect: nameRect, fill: bandFill, text: bandText },
    statsBand: { rect: statsRect, fill: bandFill },
    ovr,
    name,
    stats,
    mark: { src: markUrl, x: width / 2, y: markY, size: 54 * scale },
    colors: {
      chipText: CHIP_TEXT_COLOR,
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

/** Canvas gradient for the parsed border-stroke spec (userSpaceOnUse line
 *  + stops, scaled onto the backing store). */
function applyBorderGradient(
  ctx: CanvasRenderingContext2D,
  gradient: CrestGradient,
  s: number,
): CanvasGradient {
  const grad = ctx.createLinearGradient(gradient.x1 * s, gradient.y1 * s, gradient.x2 * s, gradient.y2 * s)
  for (const stop of gradient.stops) grad.addColorStop(Math.min(1, Math.max(0, stop.offset)), stop.color)
  return grad
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

/**
 * Paint the card plan onto a canvas (canvas dims MUST match the 27:40 crest
 * design aspect — width : height = 1080 : 1600). Awaits fonts and the
 * photo/mark images; any image failure degrades gracefully (monogram /
 * omitted mark), never throws.
 */
export async function drawCard(canvas: HTMLCanvasElement, data: CardExportData): Promise<void> {
  // Aspect-ratio invariant (round-2 lesson, adapted to the round-4 portrait
  // design space 1080×1600 = 27:40): a wrong-aspect backing store would
  // stretch every draw.
  const expectedHeight = Math.round((canvas.width * CREST_DESIGN_HEIGHT) / CREST_DESIGN_WIDTH)
  if (canvas.height !== expectedHeight) {
    throw new Error(
      `card canvas must match the crest design aspect 27:40 (${canvas.width}x${expectedHeight}); got ${canvas.width}x${canvas.height}`,
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

  // Base: the tier fill edge-to-edge (no fringe at the plate path's
  // anti-aliased border), then the plate path itself.
  ctx.fillStyle = plan.crest.tierFillHex
  ctx.fillRect(0, 0, width, height)
  const plate = new Path2D(scalePath(plan.crest.platePath, s))
  ctx.fill(plate)

  // Decorative border: the tier gradient stroked along the silhouette,
  // CLIPPED to it (only the inner half shows) — the same visual the SVG's
  // clipPath#clip-path-1 produces.
  ctx.save()
  ctx.clip(plate)
  ctx.strokeStyle = applyBorderGradient(ctx, plan.crest.borderStroke.gradient, s)
  ctx.lineWidth = plan.crest.borderStroke.width * s
  ctx.stroke(plate)
  ctx.restore()

  // --- Photo: the member screenshot (or fallback) fills the
  // Content-safezone rect — the SAME rect the on-page SVG fills.
  const r = plan.photoRect
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  if (plan.photo.kind === 'image') {
    const img = await loadImage(plan.photo.src)
    if (img !== null && img.width > 0 && img.height > 0) {
      // Cover-fit: scale to cover the full safezone rect, center, let the
      // clip crop the overflow (mirrors the SVG's preserveAspectRatio slice).
      const cover = Math.max(r.w / img.width, r.h / img.height)
      const dw = img.width * cover
      const dh = img.height * cover
      ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh)
    } else {
      drawMonogramFill(ctx, plan, data.monogramLetter)
    }
  } else {
    drawMonogramFill(ctx, plan, plan.photo.letter)
  }
  // Top legibility scrim (backs the over-photo OVR box; the lower bands are
  // solid — no scrim needed there).
  const scrimGrad = ctx.createLinearGradient(0, plan.scrim.y1, 0, plan.scrim.y2)
  scrimGrad.addColorStop(0, `rgba(0,0,0,${plan.scrim.alpha})`)
  scrimGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = scrimGrad
  ctx.fillRect(r.x, r.y, r.w, plan.scrim.y2 - plan.scrim.y1)
  ctx.restore()

  // --- SOLID bands over the photo (round-4 contrast design): the tier fill
  // guarantees text legibility on any screenshot.
  ctx.fillStyle = plan.nameBand.fill
  ctx.fillRect(plan.nameBand.rect.x, plan.nameBand.rect.y, plan.nameBand.rect.w, plan.nameBand.rect.h)
  ctx.fillStyle = plan.statsBand.fill
  ctx.fillRect(plan.statsBand.rect.x, plan.statsBand.rect.y, plan.statsBand.rect.w, plan.statsBand.rect.h)

  // --- OVR block (over the photo): big number + job name below, NO "OVR"
  // tag (round 4). White with a shadow — same legibility contract the SVG's
  // paint-order stroke delivers.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = 14 * s
  ctx.font = `900 ${plan.ovr.size}px Orbitron`
  ctx.fillStyle = plan.ovr.color
  ctx.fillText(plan.ovr.text, plan.ovr.x, plan.ovr.y)
  ctx.textAlign = 'center'
  fitText(ctx, plan.ovr.jobText, plan.ovr.jobMaxW, 700, plan.ovr.jobSize)
  ctx.fillText(plan.ovr.jobText, plan.ovr.jobX, plan.ovr.jobY)
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  // --- Name band: the name only (round 4), solid-fill contrast — no shadow.
  ctx.textAlign = 'center'
  ctx.fillStyle = plan.name.color
  fitText(ctx, plan.name.text, plan.name.maxWidth, 700, plan.name.size)
  ctx.fillText(plan.name.text, plan.name.x, plan.name.y)

  // --- The 6 key stats — 2-col × 3-row inside the solid stat band (server
  // order), each cell a self-contained label/value/chip group.
  ctx.textAlign = 'left'
  for (const cell of plan.stats) {
    ctx.font = `700 ${cell.labelSize}px Orbitron`
    ctx.fillStyle = plan.nameBand.text
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

  // Hellz mark (brand anchor in the plate tip below the stat band).
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

function drawMonogramFill(ctx: CanvasRenderingContext2D, plan: CardPlan, letter: string): void {
  // ASST-01 neutral fallback: surface tile + class initial, centered in the
  // photo rect (the rect bounds it — never an empty hole).
  const r = plan.photoRect
  ctx.fillStyle = plan.colors.monogramTile
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${r.h * 0.22}px Orbitron`
  ctx.fillStyle = plan.colors.monogramText
  ctx.fillText(letter, r.x + r.w / 2, r.y + r.h * 0.45)
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

// Re-exports for consumers that layout-annotate around the plan (guideline
// rects in design space; CrestCard renders everything from the plan).
export { CREST_DESIGN_WIDTH, CREST_DESIGN_HEIGHT, CREST_GEOMETRY, scaleRect, type CrestRect }
