// lineupExport.ts — the battlefield lineup JPG export (phase 10.4, LNUP-05).
//
// Same architecture as the card export (src/features/export/cardExport.ts):
// a PURE layout planner (buildLineupExportPlan — no canvas, no DOM, testable)
// plus a Canvas 2D shell (renderLineupCanvas / downloadLineupJpg) that paints
// exactly that plan. Zero new npm dependencies.
//
// Visual identity: the Hellz dark/neon palette (#141414 page, #1E1E1E party
// columns, red accent rule and headers, Orbitron + Bebas Neue type, the
// bundled Hellz mark). Output: 1920×1080 JPEG (image/jpeg, q 0.94) for
// Discord/WhatsApp sharing.
//
// Canvas-taint safety: every image drawn is same-origin — the bundled
// hellz-mark.svg and the committed /assets/classes/*.webp icons resolved by
// iconSrcFor(). A class without an icon gets a monogram tile, never a broken
// image or a cross-origin URL. The JPEG has no alpha, so the background is
// painted over the full canvas first.
//
// Export content: the battlefield title, the filled/40 counter, the 8 party
// columns (role banner, 5 slots, N/5 footer) and a class colour legend. No
// stats, OVR or key-stat config — the closed field list is the roster
// payload's display fields only.
import markUrl from '../../assets/hellz-mark.svg'
import type { BattlefieldLineup, LineupParty, LineupSlot } from '../../lib/api'
import { classLabel } from '../../lib/classLabels'
import { iconSrcFor } from '../assets/ClassCrest'
import {
  BATTLEFIELD_META,
  CLASS_ACCENT_HEX,
  PARTIES_PER_BATTLEFIELD,
  SLOTS_PER_PARTY,
  TOTAL_CAPACITY_PER_BATTLEFIELD,
  classAccentHex,
  isPartyFull,
  partyFilledCount,
} from './lineupModel'

export const LINEUP_EXPORT_WIDTH = 1920
export const LINEUP_EXPORT_HEIGHT = 1080
export const LINEUP_EXPORT_JPEG_QUALITY = 0.94

const COLORS = {
  background: '#141414', // dominant — page
  column: '#1E1E1E', // surface — party columns
  line: '#3D2A2B', // red-tinted hairline
  accent: '#DC3538', // interactive red
  accentStrong: '#B70302', // neon glow core
  content: '#F0EDED',
  muted: '#9A8F8F',
  success: '#3FB950',
  warning: '#E9B44C',
  leader: '#E9B44C',
} as const

const FONT = {
  display: '"Orbitron", "Segoe UI", system-ui, sans-serif',
  condensed: '"Bebas Neue", "Orbitron", sans-serif',
  body: '"Segoe UI", system-ui, sans-serif',
} as const

/** Readability floor for fitted text: below this fraction of the design size
 *  the line is ellipsized instead of shrunk further. */
const TEXT_FIT_FLOOR = 0.6

const MARGIN = 40
const GUTTER = 16
const COLUMN_W = (LINEUP_EXPORT_WIDTH - 2 * MARGIN - (PARTIES_PER_BATTLEFIELD - 1) * GUTTER) / PARTIES_PER_BATTLEFIELD

const LAYOUT = {
  markY: 32,
  markSize: 84,
  headerRuleY: 146,
  headerRuleH: 3,
  roleBannerY: 170,
  roleBannerH: 36,
  columnY: 230,
  columnH: 730,
  headerBandH: 46,
  slotY: 290,
  slotH: 116,
  slotGap: 10,
  slotInset: 8,
  footerY: 922,
  footerH: 30,
  legendY: 1012,
  legendH: 24,
} as const

export interface LineupRect {
  x: number
  y: number
  w: number
  h: number
}

export interface LineupExportSlot {
  slotIndex: number
  rect: LineupRect
  /** Slot 1 is the party leader (★ LÍDER tag, gold border). */
  leader: boolean
  vacant: boolean
  name: string | null
  /** pt-BR class label; '' when the slot is vacant or has no class. */
  classText: string
  accent: string
  /** Same-origin icon URL, or null → the monogram tile. */
  iconSrc: string | null
  monogram: string
}

export interface LineupExportColumn {
  partyIndex: number
  header: { label: string; rect: LineupRect }
  roleLabel: { text: string; rect: LineupRect } | null
  rect: LineupRect
  slots: LineupExportSlot[]
  footer: { text: string; filled: number; full: boolean; color: string; rect: LineupRect }
}

export interface LineupExportLegendItem {
  charClass: string
  label: string
  color: string
  rect: LineupRect
}

export interface LineupExportPlan {
  width: number
  height: number
  battlefield: BattlefieldLineup['battlefield']
  fileName: string
  header: {
    mark: { src: string; rect: LineupRect }
    kicker: { text: string; x: number; y: number }
    title: { text: string; x: number; y: number }
    status: { text: string; rect: LineupRect }
    rule: LineupRect
  }
  columns: LineupExportColumn[]
  legend: LineupExportLegendItem[]
}

/** Slots 1..5 in order; a missing slot is a vacant placeholder so every party
 *  always renders five cards. */
function normalizeSlots(party: LineupParty | null): LineupSlot[] {
  return Array.from({ length: SLOTS_PER_PARTY }, (_, k) => {
    const found = party?.slots.find((s) => s.slot_index === k + 1)
    return (
      found ?? {
        slot_index: k + 1,
        member_id: null,
        display_name: null,
        char_class: null,
        char_function: null,
      }
    )
  })
}

function buildColumn(partyIndex: number, party: LineupParty | null, col: number): LineupExportColumn {
  const x = MARGIN + col * (COLUMN_W + GUTTER)
  const slots = normalizeSlots(party)
  const normalized: LineupParty = {
    party_index: partyIndex,
    role_label: party?.role_label ?? null,
    filled: 0,
    slots,
  }
  const filled = partyFilledCount(normalized)
  normalized.filled = filled
  const full = isPartyFull(normalized)

  return {
    partyIndex,
    header: {
      label: `G${partyIndex}`,
      rect: { x, y: LAYOUT.columnY, w: COLUMN_W, h: LAYOUT.headerBandH },
    },
    roleLabel:
      party?.role_label !== null && party?.role_label !== undefined && party.role_label !== ''
        ? {
            text: party.role_label,
            rect: { x, y: LAYOUT.roleBannerY, w: COLUMN_W, h: LAYOUT.roleBannerH },
          }
        : null,
    rect: { x, y: LAYOUT.columnY, w: COLUMN_W, h: LAYOUT.columnH },
    slots: slots.map((slot, k) => {
      const vacant = slot.member_id === null
      const charClass = slot.char_class
      return {
        slotIndex: slot.slot_index,
        rect: {
          x: x + LAYOUT.slotInset,
          y: LAYOUT.slotY + k * (LAYOUT.slotH + LAYOUT.slotGap),
          w: COLUMN_W - 2 * LAYOUT.slotInset,
          h: LAYOUT.slotH,
        },
        leader: slot.slot_index === 1,
        vacant,
        name: vacant ? null : (slot.display_name ?? ''),
        classText: vacant || charClass === null ? '' : classLabel(charClass),
        accent: classAccentHex(charClass),
        iconSrc: vacant ? null : iconSrcFor(charClass),
        monogram: charClass === null ? '—' : charClass.charAt(0).toUpperCase(),
      }
    }),
    footer: {
      text: `${filled}/${SLOTS_PER_PARTY}`,
      filled,
      full,
      color: full ? COLORS.success : COLORS.warning,
      rect: { x: x + LAYOUT.slotInset, y: LAYOUT.footerY, w: COLUMN_W - 2 * LAYOUT.slotInset, h: LAYOUT.footerH },
    },
  }
}

/**
 * Build the full 1920×1080 lineup layout plan for one battlefield. PURE — no
 * canvas, no DOM, no I/O. Missing parties or slots render as vacant, so the
 * plan always has 8 columns × 5 slots.
 */
export function buildLineupExportPlan(lineup: BattlefieldLineup): LineupExportPlan {
  const meta = BATTLEFIELD_META[lineup.battlefield]
  const partiesByIndex = new Map(lineup.parties.map((p) => [p.party_index, p]))

  const columns = Array.from({ length: PARTIES_PER_BATTLEFIELD }, (_, col) =>
    buildColumn(col + 1, partiesByIndex.get(col + 1) ?? null, col),
  )
  const filled = columns.reduce((sum, c) => sum + c.footer.filled, 0)

  const legendKeys = Object.keys(CLASS_ACCENT_HEX)
  const itemW = (LINEUP_EXPORT_WIDTH - 2 * MARGIN) / legendKeys.length
  const legend = legendKeys.map((key, i) => ({
    charClass: key,
    label: classLabel(key),
    color: CLASS_ACCENT_HEX[key] ?? COLORS.muted,
    rect: { x: MARGIN + i * itemW, y: LAYOUT.legendY, w: itemW, h: LAYOUT.legendH },
  }))

  const statusW = 320
  return {
    width: LINEUP_EXPORT_WIDTH,
    height: LINEUP_EXPORT_HEIGHT,
    battlefield: lineup.battlefield,
    fileName: `hellz-lineup-${meta.fileSlug}.jpg`,
    header: {
      mark: { src: markUrl, rect: { x: MARGIN, y: LAYOUT.markY, w: LAYOUT.markSize, h: LAYOUT.markSize } },
      kicker: { text: 'HELLZ — PAINEL GERAL', x: MARGIN + LAYOUT.markSize + 20, y: 62 },
      title: {
        text: `${meta.title.toUpperCase()} — ${meta.subtitle.toUpperCase()}`,
        x: MARGIN + LAYOUT.markSize + 20,
        y: 116,
      },
      status: {
        text: `${filled} / ${TOTAL_CAPACITY_PER_BATTLEFIELD} ESCALADOS`,
        rect: { x: LINEUP_EXPORT_WIDTH - MARGIN - statusW, y: 50, w: statusW, h: 48 },
      },
      rule: { x: 0, y: LAYOUT.headerRuleY, w: LINEUP_EXPORT_WIDTH, h: LAYOUT.headerRuleH },
    },
    columns,
    legend,
  }
}

/** Export filename contract: hellz-lineup-vigrid-field.jpg / hellz-lineup-ruinscape.jpg. */
export function lineupFilename(lineup: BattlefieldLineup): string {
  return buildLineupExportPlan(lineup).fileName
}

// ---------------------------------------------------------------------------
// DOM shell — everything below touches canvas/DOM only.

async function loadLineupFonts(): Promise<void> {
  try {
    await Promise.all([document.fonts.load('700 40px Orbitron'), document.fonts.load('400 40px "Bebas Neue"')])
    await document.fonts.ready
  } catch {
    // Progressive enhancement: the draw proceeds with the available fonts.
  }
}

/** Same-origin image loader with graceful skip — a failure resolves null and
 *  the caller falls back (monogram / omitted mark), never throws. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** #rrggbb + alpha → rgba(). Non-hex input passes through unchanged. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (match === null) return hex
  const n = parseInt(match[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

interface TextSpec {
  family: string
  weight: number
  size: number
  color: string
  align?: CanvasTextAlign
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

/** Paint one line within maxW: shrink proportionally to the readability floor,
 *  then ellipsize. Keeps every label inside its box. */
function paintText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, spec: TextSpec): void {
  const fontAt = (px: number) => {
    ctx.font = `${spec.weight} ${px}px ${spec.family}`
  }
  fontAt(spec.size)
  const natural = ctx.measureText(text).width
  let px = spec.size
  let shown = text
  if (natural > maxW) {
    const fitted = (spec.size * maxW) / natural
    if (fitted >= spec.size * TEXT_FIT_FLOOR) {
      px = fitted
    } else {
      px = spec.size * TEXT_FIT_FLOOR
      fontAt(px)
      shown = ellipsize(ctx, text, maxW)
    }
  }
  fontAt(px)
  ctx.textAlign = spec.align ?? 'left'
  ctx.fillStyle = spec.color
  ctx.fillText(shown, x, y)
}

function drawSlot(ctx: CanvasRenderingContext2D, slot: LineupExportSlot, icon: HTMLImageElement | null): void {
  const r = slot.rect
  if (slot.vacant) {
    ctx.fillStyle = COLORS.background
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.save()
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = COLORS.line
    ctx.lineWidth = 2
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    ctx.restore()
    paintText(ctx, '— VAGO —', r.x + r.w / 2, r.y + r.h / 2 + 10, r.w - 16, {
      family: FONT.condensed,
      weight: 400,
      size: 30,
      color: COLORS.muted,
      align: 'center',
    })
    return
  }

  // Surface, then the class tint over it (14%), then the 6px class bar.
  ctx.fillStyle = COLORS.column
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.fillStyle = withAlpha(slot.accent, 0.14)
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.fillStyle = slot.accent
  ctx.fillRect(r.x, r.y, 6, r.h)

  ctx.lineWidth = slot.leader ? 2 : 1
  ctx.strokeStyle = slot.leader ? COLORS.leader : COLORS.line
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

  const iconSize = 56
  const ix = r.x + 16
  const iy = r.y + (r.h - iconSize) / 2
  if (icon !== null) {
    ctx.drawImage(icon, ix, iy, iconSize, iconSize)
  } else {
    ctx.fillStyle = COLORS.background
    ctx.fillRect(ix, iy, iconSize, iconSize)
    ctx.strokeStyle = COLORS.line
    ctx.strokeRect(ix + 0.5, iy + 0.5, iconSize - 1, iconSize - 1)
    paintText(ctx, slot.monogram, ix + iconSize / 2, iy + 37, iconSize - 10, {
      family: FONT.display,
      weight: 700,
      size: 26,
      color: COLORS.muted,
      align: 'center',
    })
  }

  const tx = r.x + 84
  const maxW = r.x + r.w - 8 - tx
  if (slot.leader) {
    paintText(ctx, '★ LÍDER', tx, r.y + 28, maxW, { family: FONT.display, weight: 700, size: 13, color: COLORS.leader })
  }
  paintText(ctx, slot.name ?? '', tx, r.y + (slot.leader ? 56 : 54), maxW, {
    family: FONT.display,
    weight: 700,
    size: 20,
    color: COLORS.content,
  })
  if (slot.classText !== '') {
    paintText(ctx, slot.classText, tx, r.y + 82, maxW, { family: FONT.body, weight: 400, size: 15, color: COLORS.muted })
  }
}

/**
 * Paint the lineup plan onto a canvas of exactly plan.width × plan.height.
 * Awaits fonts and images; any image failure degrades to the monogram / no
 * mark, never throws. Throws only on a size mismatch or a missing 2D context.
 */
export async function renderLineupCanvas(canvas: HTMLCanvasElement, plan: LineupExportPlan): Promise<void> {
  if (canvas.width !== plan.width || canvas.height !== plan.height) {
    throw new Error(
      `lineup canvas must be ${plan.width}x${plan.height}; got ${canvas.width}x${canvas.height}`,
    )
  }
  await loadLineupFonts()
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 2d context unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // JPEG has no alpha: the page background covers the whole canvas first.
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, plan.width, plan.height)

  // Header.
  const mark = await loadImage(plan.header.mark.src)
  if (mark !== null) {
    const m = plan.header.mark.rect
    ctx.drawImage(mark, m.x, m.y, m.w, m.h)
  }
  paintText(ctx, plan.header.kicker.text, plan.header.kicker.x, plan.header.kicker.y, 900, {
    family: FONT.condensed,
    weight: 400,
    size: 30,
    color: COLORS.muted,
  })
  paintText(ctx, plan.header.title.text, plan.header.title.x, plan.header.title.y, 1000, {
    family: FONT.display,
    weight: 700,
    size: 40,
    color: COLORS.content,
  })
  const pill = plan.header.status.rect
  ctx.strokeStyle = COLORS.accent
  ctx.lineWidth = 2
  ctx.strokeRect(pill.x + 1, pill.y + 1, pill.w - 2, pill.h - 2)
  paintText(ctx, plan.header.status.text, pill.x + pill.w / 2, pill.y + pill.h / 2 + 9, pill.w - 24, {
    family: FONT.condensed,
    weight: 400,
    size: 30,
    color: COLORS.content,
    align: 'center',
  })

  // Neon accent rule under the header.
  ctx.save()
  ctx.shadowColor = COLORS.accent
  ctx.shadowBlur = 16
  ctx.fillStyle = COLORS.accentStrong
  const rule = plan.header.rule
  ctx.fillRect(rule.x, rule.y, rule.w, rule.h)
  ctx.restore()

  // Icons: load every unique same-origin class icon in parallel.
  const iconSrcs = [...new Set(plan.columns.flatMap((c) => c.slots.map((s) => s.iconSrc)))].filter(
    (src): src is string => src !== null,
  )
  const loaded = await Promise.all(iconSrcs.map((src) => loadImage(src)))
  const icons = new Map(iconSrcs.map((src, i) => [src, loaded[i] ?? null] as const))

  for (const col of plan.columns) {
    if (col.roleLabel !== null) {
      const rl = col.roleLabel.rect
      ctx.strokeStyle = COLORS.warning
      ctx.lineWidth = 2
      ctx.strokeRect(rl.x + 1, rl.y + 1, rl.w - 2, rl.h - 2)
      paintText(ctx, col.roleLabel.text, rl.x + rl.w / 2, rl.y + rl.h / 2 + 8, rl.w - 12, {
        family: FONT.condensed,
        weight: 400,
        size: 24,
        color: COLORS.warning,
        align: 'center',
      })
    }

    // Column body + hairline.
    ctx.fillStyle = COLORS.column
    ctx.fillRect(col.rect.x, col.rect.y, col.rect.w, col.rect.h)
    ctx.strokeStyle = COLORS.line
    ctx.lineWidth = 1
    ctx.strokeRect(col.rect.x + 0.5, col.rect.y + 0.5, col.rect.w - 1, col.rect.h - 1)

    // Header band: red accent line + G# label.
    ctx.fillStyle = COLORS.accent
    ctx.fillRect(col.header.rect.x, col.header.rect.y, col.header.rect.w, 4)
    paintText(ctx, col.header.label, col.header.rect.x + 16, col.header.rect.y + 32, col.header.rect.w - 32, {
      family: FONT.display,
      weight: 700,
      size: 24,
      color: COLORS.content,
    })

    for (const slot of col.slots) {
      drawSlot(ctx, slot, slot.iconSrc === null ? null : (icons.get(slot.iconSrc) ?? null))
    }

    // N/5 footer pill.
    const f = col.footer.rect
    ctx.fillStyle = withAlpha(col.footer.color, 0.14)
    ctx.fillRect(f.x, f.y, f.w, f.h)
    ctx.strokeStyle = col.footer.color
    ctx.lineWidth = 2
    ctx.strokeRect(f.x + 1, f.y + 1, f.w - 2, f.h - 2)
    paintText(ctx, col.footer.text, f.x + f.w / 2, f.y + f.h / 2 + 6, f.w - 16, {
      family: FONT.display,
      weight: 700,
      size: 16,
      color: col.footer.color,
      align: 'center',
    })
  }

  // Class colour legend strip.
  for (const item of plan.legend) {
    ctx.fillStyle = item.color
    ctx.fillRect(item.rect.x, item.rect.y + 5, 14, 14)
    paintText(ctx, item.label, item.rect.x + 20, item.rect.y + 17, item.rect.w - 24, {
      family: FONT.body,
      weight: 400,
      size: 14,
      color: COLORS.muted,
    })
  }
}

/**
 * Render one battlefield to a 1920×1080 JPEG and trigger a browser download
 * named by the plan's filename contract. Same-origin images only, so the
 * canvas is never tainted and toBlob succeeds.
 */
export async function downloadLineupJpg(lineup: BattlefieldLineup): Promise<void> {
  const plan = buildLineupExportPlan(lineup)
  const canvas = document.createElement('canvas')
  canvas.width = plan.width
  canvas.height = plan.height
  await renderLineupCanvas(canvas, plan)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', LINEUP_EXPORT_JPEG_QUALITY),
  )
  if (blob === null) throw new Error('falha ao gerar o JPG da lineup')
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = plan.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
