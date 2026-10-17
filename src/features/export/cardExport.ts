// cardExport.ts — the code-drawn JPEG EAFC card export (plan 07.2-05,
// CARD-03 / D-09 / D-10 / D-12). Zero new npm dependencies (v1.1 invariant):
// native Canvas 2D + the already self-hosted Orbitron woff2 + brand mark.
//
// Architecture: a TESTABLE PURE CORE (buildCardPlan — all geometry, data
// selection and color decisions) + a thin DOM shell (drawCard/downloadCard —
// fonts, images, pixels, blob). The unit tests lock the core; the shell only
// transcribes the plan onto a canvas.
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
// Tier → canvas hex, mirroring the @theme tokens (src/index.css):
// --color-tier-bronze/silver/gold/platinum. Impecável's premium treatment is
// the white-rainbow gradient (#D7E3F0 + white text, rainbow frame) — the same
// palette as the tier-impecavel-* utilities.
const TIER_HEX: Record<Tier, string> = {
  bronze: '#C97F3F',
  silver: '#B8C0CC',
  gold: '#E9B44C',
  platinum: '#D7E3F0',
}

/** The Impecável rainbow (tier-impecavel-border palette) for the frame stroke. */
const PLATINUM_RAINBOW = ['#F26D6F', '#E9B44C', '#3FB950', '#58A6FF', '#B8C0CC'] as const

// Canvas palette constants (same values as the @theme tokens).
const CANVAS = {
  dominant: '#141414',
  surface: '#1E1E1E',
  line: '#3D2A2B',
  content: '#F0EDED',
  muted: '#9A8F8F',
} as const

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
}

export interface CardPlan {
  width: number
  height: number
  tier: Tier
  /** Tier hex driving frame/glow/wash (platinum keeps #D7E3F0 for glow/wash;
   *  its frame uses frameGradient). */
  tierColor: string
  background: { base: string; wash: string }
  frame: { x: number; y: number; w: number; h: number; color: string; gradient: readonly string[] | null }
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
  name: { text: string; x: number; y: number; size: number; color: string }
  subtitle: { text: string; x: number; y: number; size: number; color: string }
  /** The 6 key stats in SERVER/highlight order — 2-col × 3-row, left first. */
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
  const gridX = scale(70)
  const gridY = scale(520)
  const cellW = scale(305)
  const cellH = scale(104)

  const stats: CardPlanStatCell[] = data.stats.map((stat, i) => {
    const row = Math.floor(i / 2)
    const col = i % 2
    return {
      x: gridX + col * cellW,
      y: gridY + row * cellH,
      w: cellW,
      h: cellH,
      label: stat.label_short,
      value: stat.value,
      points: stat.points,
      tier: stat.tier,
      chipText: stat.points === null ? '—' : String(Math.round(stat.points)),
      chipColor: stat.points === null ? CANVAS.muted : TIER_HEX[stat.tier ?? tierOfOvrTier(stat.tier)],
    }
  })

  const crest: CardPlanCrest =
    data.crestSrc !== null
      ? { kind: 'image', src: data.crestSrc, x: scale(496), y: scale(96), size: scale(158) }
      : {
          kind: 'monogram',
          letter: data.charClass.charAt(0).toUpperCase(),
          x: scale(496),
          y: scale(96),
          size: scale(158),
          tile: CANVAS.surface,
          border: CANVAS.line,
          text: CANVAS.muted,
        }

  return {
    width,
    height,
    tier,
    tierColor,
    background: { base: CANVAS.dominant, wash: tierColor },
    frame: {
      x: scale(28),
      y: scale(28),
      w: width - scale(56),
      h: height - scale(56),
      color: tierColor,
      gradient: tier === 'platinum' ? PLATINUM_RAINBOW : null,
    },
    ovr: {
      caption: 'OVR',
      captionX: scale(96),
      captionY: scale(168),
      captionSize: scale(30),
      text: String(Math.round(data.ovr)),
      x: scale(96),
      y: scale(296),
      size: scale(116),
      color: tierColor,
      glow: tierColor,
    },
    crest,
    name: { text: data.name, x: width / 2, y: scale(404), size: scale(56), color: CANVAS.content },
    subtitle: {
      text: `${data.charClass} · ${FUNCTION_LABELS[data.charFunction]}`,
      x: width / 2,
      y: scale(456),
      size: scale(26),
      color: CANVAS.muted,
    },
    stats,
    mark: { src: markUrl, x: width / 2, y: scale(1010), size: scale(64) },
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
 *  this the first export renders the fallback font). Best-effort: a rejected
 *  load never blocks the draw. */
async function loadCardFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('900 116px Orbitron'),
      document.fonts.load('700 56px Orbitron'),
      document.fonts.load('600 30px Orbitron'),
    ])
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
  await loadCardFonts()
  const plan = buildCardPlan(data, canvas.width)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 2d context unavailable')

  const { width, height } = plan
  const s = width / BASE_W
  const scale = (n: number) => n * s

  // Background: dominant fill + subtle tier wash fading down (D-10).
  ctx.fillStyle = plan.background.base
  ctx.fillRect(0, 0, width, height)
  const wash = ctx.createLinearGradient(0, 0, 0, height * 0.55)
  wash.addColorStop(0, `${plan.background.wash}26`) // ~15% alpha wash
  wash.addColorStop(1, `${plan.background.wash}00`)
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, width, height * 0.55)

  // Tier frame (Impecável gets the rainbow gradient stroke).
  roundRectPath(ctx, plan.frame.x, plan.frame.y, plan.frame.w, plan.frame.h, 24 * (width / BASE_W))
  const rainbow = plan.frame.gradient
  if (rainbow !== null) {
    const grad = ctx.createLinearGradient(plan.frame.x, plan.frame.y, plan.frame.x + plan.frame.w, plan.frame.y + plan.frame.h)
    rainbow.forEach((c, i) => grad.addColorStop(i / (rainbow.length - 1), c))
    ctx.strokeStyle = grad
  } else {
    ctx.strokeStyle = plan.frame.color
  }
  ctx.lineWidth = 6 * (width / BASE_W)
  ctx.stroke()

  // OVR hero (Orbitron 900 + tier glow — static, like the site's glow-text-current).
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 ${plan.ovr.captionSize}px Orbitron`
  ctx.fillStyle = plan.ovr.color
  ctx.fillText(plan.ovr.caption, plan.ovr.captionX, plan.ovr.captionY)
  ctx.font = `900 ${plan.ovr.size}px Orbitron`
  ctx.shadowColor = plan.ovr.glow
  ctx.shadowBlur = 30 * (width / BASE_W)
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
  fitText(ctx, plan.name.text, width * 0.86, 700, plan.name.size)
  ctx.fillText(plan.name.text, plan.name.x, plan.name.y)
  ctx.font = `600 ${plan.subtitle.size}px Orbitron`
  ctx.fillStyle = plan.subtitle.color
  ctx.fillText(plan.subtitle.text, plan.subtitle.x, plan.subtitle.y)

  // The 6 key stats — EAFC 2-col × 3-row arrangement (server order).
  for (const cell of plan.stats) {
    const innerW = cell.w - scale(96)
    ctx.textAlign = 'left'
    ctx.font = `600 ${scale(26)}px Orbitron`
    ctx.fillStyle = CANVAS.muted
    ctx.fillText(cell.label, cell.x, cell.y + scale(34))
    ctx.fillStyle = CANVAS.content
    fitText(ctx, cell.value, innerW, 600, scale(34))
    ctx.fillText(cell.value, cell.x, cell.y + scale(80))

    // Points chip in the stat's tier color; null points → muted '—' slot.
    const chipW = scale(84)
    const chipH = scale(48)
    const chipX = cell.x + cell.w - chipW
    const chipY = cell.y + scale(10)
    roundRectPath(ctx, chipX, chipY, chipW, chipH, chipH / 2)
    ctx.fillStyle = `${cell.chipColor}2E` // ~18% fill wash
    ctx.fill()
    ctx.strokeStyle = cell.chipColor
    ctx.lineWidth = 2 * (width / BASE_W)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = `700 ${scale(28)}px Orbitron`
    ctx.fillStyle = cell.chipColor
    ctx.textBaseline = 'middle'
    ctx.fillText(cell.chipText, chipX + chipW / 2, chipY + chipH / 2 + scale(2))
    ctx.textBaseline = 'alphabetic'
  }

  // Hellz mark bottom-center (brand anchor of the composition).
  const mark = await loadImage(plan.mark.src)
  if (mark !== null) {
    ctx.drawImage(mark, plan.mark.x - plan.mark.size / 2, plan.mark.y - plan.mark.size / 2, plan.mark.size, plan.mark.size)
  }
}

function drawMonogram(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, letter: string, planWidth: number): void {
  roundRectPath(ctx, x, y, size, size, 16 * (planWidth / BASE_W))
  ctx.fillStyle = CANVAS.surface
  ctx.fill()
  ctx.strokeStyle = CANVAS.line
  ctx.lineWidth = 2 * (planWidth / BASE_W)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${size * 0.42}px Orbitron`
  ctx.fillStyle = CANVAS.muted
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
