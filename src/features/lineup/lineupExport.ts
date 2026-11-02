// lineupExport.ts — the Escalação JPG export (phase 10.4 / 0056, LNUP-05).
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
// Export content: the raid title, the filled/40 counter, the 8 party columns
// (role banner, 5 slots, N/5 footer) and a class colour legend. No stats, OVR
// or key-stat config — the closed field list is the roster payload's display
// fields only.
import markUrl from '../../assets/hellz-mark.svg'
import type { BattlefieldLineup, LineupParty, LineupSlot, WarMode } from '../../lib/api'
import { classLabel } from '../../lib/classLabels'
import { iconSrcFor } from '../assets/ClassCrest'
import {
  CLASS_ACCENT_HEX,
  PARTIES_PER_BATTLEFIELD,
  SLOTS_PER_PARTY,
  classAccentHex,
  isPartyFull,
  partyFilledCount,
  raidMeta,
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

/** Grid: at most 4 party cards per row (user request 2026-11-01) — 8 parties
 *  become 4×2, so each card is ~2× wider and the name/icon breathe. */
const GRID_COLS = 4
const GRID_ROW_GAP = 16

/** Width of one party card when the row holds `cols` cards. */
function columnWidth(partyCount: number): number {
  const cols = Math.min(GRID_COLS, Math.max(1, partyCount))
  return (LINEUP_EXPORT_WIDTH - 2 * MARGIN - (cols - 1) * GUTTER) / cols
}

/**
 * Vertical rhythm. Every card box is derived from these values, and the row
 * height comes from the space actually available between the header rule and
 * the legend — so no band is left empty and no inner padding is lost:
 *
 *   headerBandH + topPad + 5·slotH + 4·slotGap + footerGap + footerH + bottomPad
 *
 * With two rows (the 8-party case) that resolves to exactly 402px per card:
 *   40 + 8 + 280 + 28 + 8 + 30 + 8 = 402
 */
const LAYOUT = {
  markY: 32,
  markSize: 84,
  headerRuleY: 146,
  headerRuleH: 3,
  gridY: 172,
  headerBandH: 40,
  topPad: 8,
  slotH: 56,
  slotGap: 7,
  slotInset: 10,
  footerGap: 8,
  footerH: 30,
  bottomPad: 8,
  legendClearance: 24,
  legendY: 1016,
  legendH: 24,
} as const

/** Available height for the party grid (between the header rule and legend). */
function gridAvailableHeight(): number {
  return LAYOUT.legendY - LAYOUT.legendClearance - LAYOUT.gridY
}

/** Card height for a grid with `rows` rows, filling the available band. */
function rowHeight(rows: number): number {
  return (gridAvailableHeight() - (rows - 1) * GRID_ROW_GAP) / rows
}

/** Slot height that makes 5 slots + footer exactly fill one card. Derived from
 *  the row height, so a taller/shorter grid never breaks the inner padding. */
function slotHeight(cardH: number): number {
  const chrome =
    LAYOUT.headerBandH +
    LAYOUT.topPad +
    LAYOUT.footerGap +
    LAYOUT.footerH +
    LAYOUT.bottomPad +
    (SLOTS_PER_PARTY - 1) * LAYOUT.slotGap
  return (cardH - chrome) / SLOTS_PER_PARTY
}

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
  warMode: WarMode
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

function buildColumn(
  partyIndex: number,
  party: LineupParty | null,
  x: number,
  y: number,
  width: number,
  cardH: number,
): LineupExportColumn {
  const slots = normalizeSlots(party)
  const slotH = slotHeight(cardH)
  const slotsTop = y + LAYOUT.headerBandH + LAYOUT.topPad
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
      rect: { x, y, w: width, h: LAYOUT.headerBandH },
    },
    roleLabel:
      party?.role_label !== null && party?.role_label !== undefined && party.role_label !== ''
        ? {
            text: party.role_label,
            rect: { x: x + 76, y: y + 5, w: width - 76 - 8, h: LAYOUT.headerBandH - 10 },
          }
        : null,
    rect: { x, y, w: width, h: cardH },
    slots: slots.map((slot, k) => {
      const vacant = slot.member_id === null
      const charClass = slot.char_class
      return {
        slotIndex: slot.slot_index,
        rect: {
          x: x + LAYOUT.slotInset,
          y: slotsTop + k * (slotH + LAYOUT.slotGap),
          w: width - 2 * LAYOUT.slotInset,
          h: slotH,
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
      rect: {
        x: x + LAYOUT.slotInset,
        y:
          slotsTop +
          SLOTS_PER_PARTY * slotH +
          (SLOTS_PER_PARTY - 1) * LAYOUT.slotGap +
          LAYOUT.footerGap,
        w: width - 2 * LAYOUT.slotInset,
        h: LAYOUT.footerH,
      },
    },
  }
}

/**
 * Build the full 1920×1080 escalação layout plan for one raid. PURE — no
 * canvas, no DOM, no I/O. Missing parties or slots render as vacant, so the
 * plan always has N party cards × 5 slots in a 4-per-row grid (8 = 4×2).
 */
export function buildLineupExportPlan(
  lineup: BattlefieldLineup,
  warMode: WarMode = 'vigrid',
): LineupExportPlan {
  const meta = raidMeta(warMode, lineup.raid_index)
  const partiesByIndex = new Map(lineup.parties.map((p) => [p.party_index, p]))
  // Vigrid always paints the fixed 8-party battlefield. Emperium paints the
  // raid's actual 1..8 parties, so a 6/6/4 distribution prints 6/6/4 columns.
  const partyCount =
    warMode === 'emperium'
      ? Math.max(1, lineup.parties.length)
      : PARTIES_PER_BATTLEFIELD
  const width = columnWidth(partyCount)
  const rows = Math.ceil(partyCount / GRID_COLS)
  const cardH = rowHeight(rows)

  const columns = Array.from({ length: partyCount }, (_, col) => {
    const row = Math.floor(col / GRID_COLS)
    const colInRow = col % GRID_COLS
    const x = MARGIN + colInRow * (width + GUTTER)
    const y = LAYOUT.gridY + row * (cardH + GRID_ROW_GAP)
    return buildColumn(col + 1, partiesByIndex.get(col + 1) ?? null, x, y, width, cardH)
  })
  const filled = columns.reduce((sum, c) => sum + c.footer.filled, 0)
  const capacity = partyCount * SLOTS_PER_PARTY

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
    warMode,
    battlefield: lineup.battlefield,
    fileName: `hellz-escalacao-${meta.fileSlug}.jpg`,
    header: {
      mark: { src: markUrl, rect: { x: MARGIN, y: LAYOUT.markY, w: LAYOUT.markSize, h: LAYOUT.markSize } },
      kicker: { text: 'HELLZ — ESCALAÇÃO', x: MARGIN + LAYOUT.markSize + 20, y: 62 },
      title: {
        text: `${meta.title.toUpperCase()} — ${meta.subtitle.toUpperCase()}`,
        x: MARGIN + LAYOUT.markSize + 20,
        y: 116,
      },
      status: {
        text: `${filled} / ${capacity} ESCALADOS`,
        rect: { x: LINEUP_EXPORT_WIDTH - MARGIN - statusW, y: 50, w: statusW, h: 48 },
      },
      rule: { x: 0, y: LAYOUT.headerRuleY, w: LINEUP_EXPORT_WIDTH, h: LAYOUT.headerRuleH },
    },
    columns,
    legend,
  }
}

/** Export filename contract: hellz-escalacao-<mode>-<raid>.jpg. */
export function lineupFilename(lineup: BattlefieldLineup, warMode: WarMode = 'vigrid'): string {
  return buildLineupExportPlan(lineup, warMode).fileName
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

/** Rounded-rect path (the UI uses rounded-md cards and rounded-lg panels).
 *  Uses the native roundRect when present, else the arcTo equivalent. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  ctx.beginPath()
  const native = (ctx as CanvasRenderingContext2D & { roundRect?: Function }).roundRect
  if (typeof native === 'function') {
    native.call(ctx, x, y, w, h, r)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Pill: the UI's rounded-full chips (role label, N/5 counter, Líder badge). */
function pillPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  roundedRectPath(ctx, x, y, w, h, h / 2)
}

const SLOT_RADIUS = 9
const CARD_RADIUS = 12
/** Left class bar: 3px in the UI card, scaled to the 448px export card. */
const CLASS_BAR_W = 5

/** Slot geometry shared by the seated and vacant drawings. */
function slotNameBaseline(r: LineupRect): number {
  return r.y + 30
}

function drawSlot(ctx: CanvasRenderingContext2D, slot: LineupExportSlot, icon: HTMLImageElement | null): void {
  const r = slot.rect

  if (slot.vacant) {
    // UI: a dashed outline on the darker page colour, no class fill at all.
    roundedRectPath(ctx, r.x, r.y, r.w, r.h, SLOT_RADIUS)
    ctx.fillStyle = COLORS.background
    ctx.fill()
    ctx.save()
    ctx.setLineDash([7, 5])
    ctx.strokeStyle = COLORS.line
    ctx.lineWidth = 1.5
    roundedRectPath(ctx, r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, SLOT_RADIUS)
    ctx.stroke()
    ctx.restore()

    const tile = 40
    const tx0 = r.x + 12
    const ty0 = r.y + (r.h - tile) / 2
    roundedRectPath(ctx, tx0, ty0, tile, tile, 7)
    ctx.fillStyle = COLORS.column
    ctx.fill()
    ctx.strokeStyle = COLORS.line
    ctx.lineWidth = 1
    ctx.stroke()
    paintText(ctx, '—', tx0 + tile / 2, ty0 + tile / 2 + 7, tile - 10, {
      family: FONT.display,
      weight: 600,
      size: 18,
      color: COLORS.muted,
      align: 'center',
    })
    paintText(ctx, '— Vago —', tx0 + tile + 14, slotNameBaseline(r), r.x + r.w - 14 - (tx0 + tile + 14), {
      family: FONT.body,
      weight: 600,
      size: 21,
      color: COLORS.muted,
    })
    return
  }

  // --- Card shell: rounded, surface base, then the SAME horizontal class
  // gradient the web slot paints (26% → 12% → 7%), so the JPG card and the
  // on-screen card read as the same object.
  roundedRectPath(ctx, r.x, r.y, r.w, r.h, SLOT_RADIUS)
  ctx.fillStyle = COLORS.column
  ctx.fill()

  const tint = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y)
  tint.addColorStop(0, withAlpha(slot.accent, 0x42 / 255))
  tint.addColorStop(0.55, withAlpha(slot.accent, 0x1f / 255))
  tint.addColorStop(1, withAlpha(slot.accent, 0x12 / 255))
  ctx.fillStyle = tint
  ctx.fill()

  // 3px-in-the-UI class bar, clipped to the rounded shell.
  ctx.save()
  roundedRectPath(ctx, r.x, r.y, r.w, r.h, SLOT_RADIUS)
  ctx.clip()
  ctx.fillStyle = slot.accent
  ctx.fillRect(r.x, r.y, CLASS_BAR_W, r.h)
  ctx.restore()

  ctx.lineWidth = slot.leader ? 2 : 1
  ctx.strokeStyle = slot.leader ? COLORS.leader : COLORS.line
  roundedRectPath(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, SLOT_RADIUS)
  ctx.stroke()

  // --- Class tile: the UI renders a 32px rounded bordered img on surface.
  const tile = 40
  const ix = r.x + CLASS_BAR_W + 7
  const iy = r.y + (r.h - tile) / 2
  roundedRectPath(ctx, ix, iy, tile, tile, 7)
  ctx.fillStyle = COLORS.column
  ctx.fill()
  ctx.strokeStyle = COLORS.line
  ctx.lineWidth = 1
  ctx.stroke()
  if (icon !== null) {
    // object-contain inside the tile (the committed icons are square).
    const inset = 3
    const box = tile - inset * 2
    const scale = Math.min(box / icon.width, box / icon.height)
    const dw = icon.width * scale
    const dh = icon.height * scale
    ctx.save()
    roundedRectPath(ctx, ix, iy, tile, tile, 7)
    ctx.clip()
    ctx.drawImage(icon, ix + (tile - dw) / 2, iy + (tile - dh) / 2, dw, dh)
    ctx.restore()
  } else {
    paintText(ctx, slot.monogram, ix + tile / 2, iy + tile / 2 + 7, tile - 10, {
      family: FONT.display,
      weight: 600,
      size: 18,
      color: COLORS.muted,
      align: 'center',
    })
  }

  // --- Leader badge: the UI's amber "Líder" chip, right-aligned on the name
  // line so the name keeps the full left column.
  const chipH = 22
  let chipW = 0
  if (slot.leader) {
    ctx.font = `700 13px ${FONT.body}`
    chipW = ctx.measureText('LÍDER').width + 16
    const chipX = r.x + r.w - 12 - chipW
    const chipY = r.y + 8
    pillPath(ctx, chipX, chipY, chipW, chipH)
    ctx.fillStyle = COLORS.leader
    ctx.fill()
    paintText(ctx, 'LÍDER', chipX + chipW / 2, chipY + chipH / 2 + 5, chipW - 10, {
      family: FONT.body,
      weight: 700,
      size: 13,
      color: '#000000',
      align: 'center',
    })
  }

  const tx = ix + tile + 12
  const maxW = r.x + r.w - 14 - tx - (chipW > 0 ? chipW + 8 : 0)
  // Name: the UI's own type (system sans, semibold) — content colour with a
  // soft shadow so it survives the class tint at print size.
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.75)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 1
  paintText(ctx, slot.name ?? '', tx, slotNameBaseline(r), maxW, {
    family: FONT.body,
    weight: slot.leader ? 700 : 600,
    size: 24,
    color: COLORS.content,
  })
  ctx.restore()

  if (slot.classText !== '') {
    paintText(ctx, slot.classText, tx, r.y + r.h - 9, maxW, {
      family: FONT.body,
      weight: 400,
      size: 17,
      color: COLORS.muted,
    })
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
  pillPath(ctx, pill.x + 1, pill.y + 1, pill.w - 2, pill.h - 2)
  ctx.strokeStyle = COLORS.accent
  ctx.lineWidth = 2
  ctx.stroke()
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
    // Party card: rounded-lg shell + hairline, exactly like the web PartyCard
    // (no red header bar — the UI card has none; the red rule lives in the
    // page header only).
    roundedRectPath(ctx, col.rect.x, col.rect.y, col.rect.w, col.rect.h, CARD_RADIUS)
    ctx.fillStyle = COLORS.column
    ctx.fill()
    ctx.strokeStyle = COLORS.line
    ctx.lineWidth = 1
    roundedRectPath(ctx, col.rect.x + 0.5, col.rect.y + 0.5, col.rect.w - 1, col.rect.h - 1, CARD_RADIUS)
    ctx.stroke()

    // Header row: G# title left, optional role pill right (the UI's amber
    // rounded-full "Função da PT" chip).
    paintText(ctx, col.header.label, col.header.rect.x + 16, col.header.rect.y + 28, 90, {
      family: FONT.display,
      weight: 700,
      size: 22,
      color: COLORS.content,
    })
    if (col.roleLabel !== null) {
      const rl = col.roleLabel.rect
      const chipH = 24
      const chipY = rl.y + (rl.h - chipH) / 2
      ctx.font = `700 14px ${FONT.body}`
      const wanted = ctx.measureText(col.roleLabel.text).width + 22
      const chipW = Math.min(Math.max(60, wanted), rl.w)
      const chipX = rl.x + rl.w - chipW
      pillPath(ctx, chipX, chipY, chipW, chipH)
      ctx.strokeStyle = COLORS.warning
      ctx.lineWidth = 1.5
      ctx.stroke()
      paintText(ctx, col.roleLabel.text, chipX + chipW / 2, chipY + chipH / 2 + 5, chipW - 14, {
        family: FONT.body,
        weight: 700,
        size: 14,
        color: COLORS.warning,
        align: 'center',
      })
    }

    for (const slot of col.slots) {
      drawSlot(ctx, slot, slot.iconSrc === null ? null : (icons.get(slot.iconSrc) ?? null))
    }

    // N/5 footer pill: the UI's rounded-full counter in the success/amber ink.
    const f = col.footer.rect
    ctx.font = `700 16px ${FONT.body}`
    const footerTextW = ctx.measureText(col.footer.text).width + 26
    const fw = Math.min(Math.max(56, footerTextW), f.w)
    const fx = f.x + f.w - fw
    pillPath(ctx, fx, f.y, fw, f.h)
    ctx.strokeStyle = col.footer.color
    ctx.lineWidth = 2
    ctx.stroke()
    paintText(ctx, col.footer.text, fx + fw / 2, f.y + f.h / 2 + 6, fw - 12, {
      family: FONT.body,
      weight: 700,
      size: 16,
      color: col.footer.color,
      align: 'center',
    })
  }

  // Class colour legend strip. The swatch is rounded like the UI's chips and
  // the label gets a hard budget so one long pt-BR name can never run into the
  // next swatch.
  for (const item of plan.legend) {
    roundedRectPath(ctx, item.rect.x, item.rect.y + 6, 13, 13, 4)
    ctx.fillStyle = item.color
    ctx.fill()
    paintText(ctx, item.label, item.rect.x + 19, item.rect.y + 17, item.rect.w - 26, {
      family: FONT.body,
      weight: 400,
      size: 13,
      color: COLORS.muted,
    })
  }
}

/**
 * Render one raid to a 1920×1080 JPEG and trigger a browser download named by
 * the plan's filename contract. Same-origin images only, so the canvas is
 * never tainted and toBlob succeeds.
 */
export async function downloadLineupJpg(
  lineup: BattlefieldLineup,
  warMode: WarMode = 'vigrid',
): Promise<void> {
  const plan = buildLineupExportPlan(lineup, warMode)
  const canvas = document.createElement('canvas')
  canvas.width = plan.width
  canvas.height = plan.height
  await renderLineupCanvas(canvas, plan)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', LINEUP_EXPORT_JPEG_QUALITY),
  )
  if (blob === null) throw new Error('falha ao gerar o JPG da escalação')
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
