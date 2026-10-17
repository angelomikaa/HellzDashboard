// cardExport.ts — the code-drawn JPEG EAFC card export (plan 07.2-05,
// CARD-03 / D-09 / D-10 / D-12 + checkpoint round 2 fixes). Zero new npm
// dependencies (v1.1 invariant): native Canvas 2D + Path2D + the already
// self-hosted Orbitron woff2 + brand mark.
//
// Architecture: a TESTABLE PURE CORE (buildCardPlan — all geometry, data
// selection and color decisions) + a thin DOM shell (drawCard/downloadCard —
// fonts, images, pixels, blob). The unit tests lock the core; the shell only
// transcribes the plan onto a canvas.
//
// Checkpoint round 2 (owner feedback "the downloaded cards look extremely
// distorted"): the first export's stat grid had ZERO column gutter (cells
// spanned the full card width, so every points chip sat glued to the NEXT
// column's label — scrambled text soup) and a dead void in the lower third.
// The composition now groups label+value+chip per cell with a real gutter,
// balances the vertical rhythm, and — per the owner's superseding design
// decision — frames everything in a tier-parametric SHIELD (shieldFrame.ts,
// simple bronze/silver vs ornate gold/Impecável) drawn with the same path
// strings the on-page SVG uses. The frame paths are scaled onto the backing
// store via scalePath (Canvas 2D has no viewBox — unscaled paths stroked at
// half size in the corner, with all content outside the frame). drawCard
// also fail-fasts on any non-2:3 canvas.
//
// Export content contract (D-09/T-072-12 — the JPEG circulates OUTSIDE the
// guild): full identity (name, class, build-role, OVR hero) + the 6 key stats
// (3-letter label + value + points chip) + tier treatment + Hellz mark.
// NO guild-average data of any kind — buildCardPlan cannot even express one
// (the stat-cell field list is closed and has no aggregate field).
//
// Canvas-taint safety (T-072-13): every image drawn is same-origin — the
// class crest is a committed '/assets/classes/...' file (D-15), the mark is
// the bundled hellz-mark.svg. Any http(s) src would make toBlob throw.
import type { Tier } from '../dashboard/presentation'
import { FUNCTION_LABELS } from '../../lib/groups'
import markUrl from '../../assets/hellz-mark.svg'
import {
  buildShieldFrame,
  PLATINUM_RAINBOW,
  scalePath,
  SHIELD_NEUTRALS,
  TIER_HEX,
  type ShieldFrame,
} from './shieldFrame'

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
  crestSrc: string | null // resolved same-origin asset URL, null → monogram
}

// ---------------------------------------------------------------------------
// Layout plan. Base geometry is authored at 750×1125 (2:3) and every number
// scales linearly with the requested width, so buildCardPlan(…, w) is exact
// at any resolution (downloadCard paints at 2× for retina crispness).
const BASE_W = 750

export type CardPlanCrest =
  | { kind: 'image'; src: string; x: number; y: number; size: number }
  | {
      kind: 'monogram'
      letter: string
      x: number
      y: number
      size: number
      tile: string
      border: string
      text: string
    }

export interface CardPlanStatCell {
  x: number
  y: number
  w: number
  h: number
  label: string
  value: string
  points: number | null
  tier: Tier | null
  /** Rounded points, or the muted '—' slot marker when points is null. */
  chipText: string
  /** Chip stroke/text color: the stat's tier hex, or muted for the '—' slot. */
  chipColor: string
  /** Chip box (right-aligned INSIDE this cell — never under the next column;
   *  the checkpoint round 2 gutter bug). */
  chipX: number
  chipY: number
  chipW: number
  chipH: number
}

export interface CardPlan {
  width: number
  height: number
  tier: Tier
  /** Tier hex driving glow/wash (platinum keeps #D7E3F0 for glow/wash; its
   *  frame stroke uses shield.rainbow). */
  tierColor: string
  background: { base: string; surface: string; wash: string }
  /** The tier-parametric shield frame (path strings in the 750×1125 design
   *  space — the SAME strings the on-page SVG renders). */
  shield: ShieldFrame
  /** Platinum (Impecável) renders the rainbow gradient stroke on the outer
   *  silhouette; other tiers stroke shield.outer with tierColor. */
  rainbow: readonly string[] | null
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
    glow: string
  }
  crest: CardPlanCrest
  name: { text: string; x: number; y: number; size: number; color: string; maxWidth: number }
  subtitle: { text: string; x: number; y: number; size: number; color: string }
  /** The 6 key stats in SERVER/highlight order — 2-col × 3-row, left first,
   *  with a real column gutter (chips never under the next column). */
  stats: CardPlanStatCell[]
  mark: { src: string; x: number; y: number; size: number }
}

/**
 * Build the full card layout plan. PURE — no canvas, no DOM, no I/O. The 2:3
 * aspect is structural: height === width × 1.5 at ANY width.
 */
export function buildCardPlan(data: CardExportData, width = BASE_W): CardPlan {
  const s = width / BASE_W
  const height = width * 1.5
  const tier: Tier = tierOf(data.ovr)
  const tierColor = TIER_HEX[tier]

  const scale = (n: number) => n * s

  // Stat grid — 2 cols × 3 rows with a REAL column gutter (checkpoint round
  // 2 bug: the old grid spanned the full width, gluing each chip to the next
  // column's label). Columns 115..340 / 395..620 (50px gutter at base scale);
  // rows at 500/630/760 end by y≈865, inside the shield taper.
  const colX = [scale(115), scale(395)]
  const colW = scale(225)
  const rowY = [scale(500), scale(630), scale(760)]
  const cellH = scale(105)
  const chipW = scale(76)
  const chipH = scale(44)

  const stats: CardPlanStatCell[] = data.stats.map((stat, i) => {
    const row = Math.floor(i / 2)
    const col = i % 2
    const x = colX[col]
    const y = rowY[row]
    return {
      x,
      y,
      w: colW,
      h: cellH,
      label: stat.label_short,
      value: stat.value,
      points: stat.points,
      tier: stat.tier,
      chipText: stat.points === null ? '—' : String(Math.round(stat.points)),
      chipColor: stat.points === null ? SHIELD_NEUTRALS.muted : TIER_HEX[stat.tier ?? tierOfOvrTier(stat.tier)],
      chipX: x + colW - chipW,
      chipY: y + scale(8),
      chipW,
      chipH,
    }
  })

  const crest: CardPlanCrest =
    data.crestSrc !== null
      ? { kind: 'image', src: data.crestSrc, x: scale(508), y: scale(88), size: scale(150) }
      : {
          kind: 'monogram',
          letter: data.charClass.charAt(0).toUpperCase(),
          x: scale(508),
          y: scale(88),
          size: scale(150),
          tile: SHIELD_NEUTRALS.surface,
          border: SHIELD_NEUTRALS.line,
          text: SHIELD_NEUTRALS.muted,
        }

  return {
    width,
    height,
    tier,
    tierColor,
    background: { base: SHIELD_NEUTRALS.dominant, surface: SHIELD_NEUTRALS.surface, wash: tierColor },
    shield: buildShieldFrame(tier),
    rainbow: tier === 'platinum' ? PLATINUM_RAINBOW : null,
    ovr: {
      caption: 'OVR',
      captionX: scale(115),
      captionY: scale(152),
      captionSize: scale(28),
      text: String(Math.round(data.ovr)),
      x: scale(115),
      y: scale(300),
      size: scale(124),
      color: tierColor,
      glow: tierColor,
    },
    crest,
    name: {
      text: data.name,
      x: width / 2,
      y: scale(400),
      size: scale(56),
      color: SHIELD_NEUTRALS.content,
      maxWidth: scale(520),
    },
    subtitle: {
      text: `${data.charClass} · ${FUNCTION_LABELS[data.charFunction]}`,
      x: width / 2,
      y: scale(452),
      size: scale(26),
      color: SHIELD_NEUTRALS.muted,
    },
    stats,
    mark: { src: markUrl, x: width / 2, y: scale(980), size: scale(60) },
  }
}

function tierOf(ovr: number): Tier {
  if (ovr < 65) return 'bronze'
  if (ovr < 75) return 'silver'
  if (ovr < 85) return 'gold'
  return 'platinum'
}

function tierOfOvrTier(tier: Tier | null): Tier {
  // Defensive: a stat cell with points but a somehow-null tier still gets a
  // color (the card's own tier). points === null never reaches here.
  return tier ?? 'bronze'
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

/** Await the exact Orbitron weights the card paints with (pitfall 8: without
 *  this the first export renders the fallback font). Also awaits
 *  document.fonts.ready — belt-and-braces so a pending @font-face load can
 *  never race the first draw (checkpoint round 2: a serif-fallback export is
 *  what the owner reads as "distorted"). Best-effort: a rejected load never
 *  blocks the draw. */
async function loadCardFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('900 124px Orbitron'),
      document.fonts.load('700 56px Orbitron'),
      document.fonts.load('600 34px Orbitron'),
    ])
    await document.fonts.ready
  } catch {
    // Font loading is progressive-enhancement; the draw proceeds with
    // whatever is available.
  }
}

/** Same-origin image loader with graceful skip — a failed load resolves null
 *  and the caller falls back (monogram / smaller mark), never throws. */
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

/** Draw text shrunk-to-fit within maxWidth (name/values can be long). */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, weight: number, size: number, family = 'Orbitron'): number {
  let px = size
  ctx.font = `${weight} ${px}px ${family}`
  while (px > size * 0.45 && ctx.measureText(text).width > maxWidth) {
    px -= size * 0.05
    ctx.font = `${weight} ${px}px ${family}`
  }
  return px
}

/**
 * Paint the card plan onto a canvas (canvas.width drives the plan width —
 * keep the canvas 2:3). Awaits fonts and the crest/mark images; any image
 * failure degrades gracefully (monogram / omitted mark), never throws.
 */
export async function drawCard(canvas: HTMLCanvasElement, data: CardExportData): Promise<void> {
  // Aspect-ratio invariant (would-have-caught distortion class #1): the plan
  // is authored 2:3 — a non-2:3 backing store would stretch every draw.
  if (canvas.height !== canvas.width * 1.5) {
    throw new Error(`card canvas must be 2:3 (got ${canvas.width}x${canvas.height})`)
  }
  await loadCardFonts()
  const plan = buildCardPlan(data, canvas.width)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 2d context unavailable')

  const { width, height } = plan
  const s = width / BASE_W
  const scale = (n: number) => n * s
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Page background outside the shield (the JPEG stays a rectangular 2:3).
  ctx.fillStyle = plan.background.base
  ctx.fillRect(0, 0, width, height)

  // --- Shield frame (same path strings the on-page SVG renders) ---
  // The frame paths are authored in the 750×1125 DESIGN space; the on-page
  // <svg viewBox> maps them to the element for free, but Canvas 2D has no
  // viewBox — so every path is scaled onto the backing store here (the
  // "extremely distorted" round-2 bug: unscaled paths stroked at half size
  // in the canvas corner, with all content drawn outside the frame).
  const outer = new Path2D(scalePath(plan.shield.outer, s))
  // Interior: surface fill + tier wash fading down, clipped to the silhouette.
  ctx.save()
  ctx.clip(outer)
  ctx.fillStyle = plan.background.surface
  ctx.fillRect(0, 0, width, height)
  const wash = ctx.createLinearGradient(0, 0, 0, height * 0.55)
  wash.addColorStop(0, `${plan.background.wash}26`) // ~15% alpha wash
  wash.addColorStop(1, `${plan.background.wash}00`)
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, width, height * 0.55)
  ctx.restore()

  // Outer silhouette — Impecável gets the rainbow gradient stroke.
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (plan.rainbow !== null) {
    const grad = ctx.createLinearGradient(scale(30), scale(30), scale(720), scale(1108))
    plan.rainbow.forEach((c, i) => grad.addColorStop(i / (plan.rainbow!.length - 1), c))
    ctx.strokeStyle = grad
  } else {
    ctx.strokeStyle = plan.tierColor
  }
  ctx.lineWidth = plan.shield.widths.outer * s
  ctx.stroke(outer)

  // Inner outline(s).
  ctx.strokeStyle = plan.tierColor
  ctx.globalAlpha = 0.7
  ctx.lineWidth = plan.shield.widths.inner * s
  ctx.stroke(new Path2D(scalePath(plan.shield.inner, s)))
  if (plan.shield.inner2 !== null) {
    ctx.globalAlpha = 0.45
    ctx.lineWidth = plan.shield.widths.inner2 * s
    ctx.stroke(new Path2D(scalePath(plan.shield.inner2, s)))
  }
  ctx.globalAlpha = 1

  // Ornate ornaments: filled studs + stroked flourish chevrons.
  for (const d of plan.shield.fills) {
    ctx.globalAlpha = 0.9
    ctx.fillStyle = plan.tierColor
    ctx.fill(new Path2D(scalePath(d, s)))
  }
  for (const d of plan.shield.strokes) {
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = plan.tierColor
    ctx.lineWidth = plan.shield.widths.ornament * s
    ctx.stroke(new Path2D(scalePath(d, s)))
  }
  ctx.globalAlpha = 1

  // OVR hero (Orbitron 900 + tier glow — static, like the site's glow-text-current).
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${plan.ovr.captionSize}px Orbitron`
  ctx.fillStyle = plan.ovr.color
  ctx.fillText(plan.ovr.caption, plan.ovr.captionX, plan.ovr.captionY)
  ctx.font = `900 ${plan.ovr.size}px Orbitron`
  ctx.shadowColor = plan.ovr.glow
  ctx.shadowBlur = 30 * s
  ctx.fillStyle = plan.ovr.color
  ctx.fillText(plan.ovr.text, plan.ovr.x, plan.ovr.y)
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  // Crest: same-origin image, or the D-16 monogram tile (identical language
  // to ClassCrest's fallback).
  if (plan.crest.kind === 'image') {
    const img = await loadImage(plan.crest.src)
    if (img !== null) {
      ctx.drawImage(img, plan.crest.x, plan.crest.y, plan.crest.size, plan.crest.size)
    } else {
      drawMonogram(ctx, plan.crest.x, plan.crest.y, plan.crest.size, 'A', width)
    }
  } else {
    drawMonogram(ctx, plan.crest.x, plan.crest.y, plan.crest.size, plan.crest.letter, width)
  }

  // Name + class · build-role line.
  ctx.textAlign = 'center'
  ctx.fillStyle = plan.name.color
  fitText(ctx, plan.name.text, plan.name.maxWidth, 700, plan.name.size)
  ctx.fillText(plan.name.text, plan.name.x, plan.name.y)
  ctx.font = `600 ${plan.subtitle.size}px Orbitron`
  ctx.fillStyle = plan.subtitle.color
  ctx.fillText(plan.subtitle.text, plan.subtitle.x, plan.subtitle.y)

  // The 6 key stats — EAFC 2-col × 3-row arrangement (server order), each
  // cell a self-contained label/value/chip group with a real gutter.
  for (const cell of plan.stats) {
    ctx.textAlign = 'left'
    ctx.font = `600 ${scale(24)}px Orbitron`
    ctx.fillStyle = SHIELD_NEUTRALS.muted
    ctx.fillText(cell.label, cell.x, cell.y + scale(28))
    ctx.fillStyle = SHIELD_NEUTRALS.content
    fitText(ctx, cell.value, cell.chipX - cell.x - scale(16), 600, scale(34))
    ctx.fillText(cell.value, cell.x, cell.y + scale(68))

    // Points chip in the stat's tier color; null points → muted '—' slot.
    roundRectPath(ctx, cell.chipX, cell.chipY, cell.chipW, cell.chipH, cell.chipH / 2)
    ctx.fillStyle = `${cell.chipColor}2E` // ~18% fill wash
    ctx.fill()
    ctx.strokeStyle = cell.chipColor
    ctx.lineWidth = 2 * s
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = `700 ${scale(26)}px Orbitron`
    ctx.fillStyle = cell.chipColor
    ctx.textBaseline = 'middle'
    ctx.fillText(cell.chipText, cell.chipX + cell.chipW / 2, cell.chipY + cell.chipH / 2 + scale(2))
    ctx.textBaseline = 'alphabetic'
  }

  // Hellz mark bottom-center (brand anchor, inside the shield taper).
  const mark = await loadImage(plan.mark.src)
  if (mark !== null) {
    ctx.drawImage(mark, plan.mark.x - plan.mark.size / 2, plan.mark.y - plan.mark.size / 2, plan.mark.size, plan.mark.size)
  }
}

function drawMonogram(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, letter: string, planWidth: number): void {
  const s = planWidth / BASE_W
  roundRectPath(ctx, x, y, size, size, 16 * s)
  ctx.fillStyle = SHIELD_NEUTRALS.surface
  ctx.fill()
  ctx.strokeStyle = SHIELD_NEUTRALS.line
  ctx.lineWidth = 2 * s
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${size * 0.42}px Orbitron`
  ctx.fillStyle = SHIELD_NEUTRALS.muted
  ctx.fillText(letter, x + size / 2, y + size / 2 + size * 0.02)
  ctx.textBaseline = 'alphabetic'
}

/**
 * Render the card offscreen at 1500×2250 (2× the 750 base for retina
 * crispness) and trigger a JPEG download via a temporary anchor + object URL.
 * Same-origin images only (D-15) — a tainted canvas would make the blob step
 * throw loudly here, which the self-hosted rule makes unreachable.
 */
export async function downloadCard(data: CardExportData, filename: string): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = 1500
  canvas.height = 2250
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
