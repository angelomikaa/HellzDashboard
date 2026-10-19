// cardAssets.ts — SINGLE SOURCE OF TRUTH for the card design (07.2-05
// checkpoint round 7, owner supersession: "i seeded a new card ... border
// is now detached from the plate and over the crop ... Bebas Neue takes over
// the rest ... all our abreviation labels must go from 3 letter to 4-6
// chars ... this one file becomes the source of truth for card design").
//
// THE FILE: src/assets/card.svg (viewBox 1080×1600 — portrait 27:40), the
// owner's ONE design for every tier. Structure (verified against the file):
//   - <path id="base-plate"> cls-1 — solid recolorable plate fill, the full
//     shield silhouette. The plate is painted FIRST on both surfaces; the
//     area outside the shield stays transparent (PNG-transparent design).
//   - <path id="crop-path"> cls-2 — the PHOTO AREA: the top portion of the
//     silhouette closed at ~y=937 (full width). Its geometry also IS the
//     detached border: a gradient stroke (stroke:url(#Blue_to_Magenta),
//     width 40) drawn by the render layer AFTER the photo, covering the
//     photo's edges — deliberate design choice, round 7.
//   - Placeholder TEXT slots (Bebas Neue unless noted — family + fill are
//     placeholders; code substitutes):
//       · #OVR — cls-4 Bebas Neue, 8.503px × matrix 21.169 → ≈180px
//         effective at (137.029, 412.59), top-left over the photo
//       · Job class — cls-5 Bebas Neue, 72px at (137.029, 487.48), under
//         the number (no "OVR" tag, round 4 held)
//       · PLAYERNAME — cls-6 ORBITRON, 109.72px × matrix 0.656 → ≈72px
//         effective at (246.528, 1057.007). ORBITRON ONLY HERE: every other
//         slot is Bebas Neue (round 7).
//       · six stat columns, left → right (points anchors evenly pitched at
//         ≈141px: 136.177 / 277.158 / 418.138 / 559.118 / 700.099 / 841.079 —
//         the owner CENTERED the '99' placeholders on the column grid, so the
//         parse locks that even pitch), each: label cls-7 Bebas Neue 48px
//         (y≈1273.507), points cls-8 Bebas Neue 128px (y≈1199.703), value
//         cls-7 Bebas Neue 48px (y≈1319.255). All THREE lines are CENTRALLY
//         ALIGNED per column (round 7): the column CENTER is derived at
//         plan-build as the points anchor + width('99')/2 (the owner's own
//         centering of the placeholder proves the grid) — label 4–6 chars
//         (MATK / PDMG.R / PVP.R), points big hero number, value raw
//         own_value.
//
// TIER VARIANTS LIVE IN CODE: one TIER_PALETTE per tier (plate fill, border
// gradient stops, text fill) applied over the SAME parsed geometry.
//
// Parsed once at module load (pure string parsing — runs in node/vitest).
// Fail-fast on missing/malformed layers.

import type { Tier } from '../dashboard/presentation'
import cardRaw from '../../assets/card.svg?raw'

// ---------------------------------------------------------------------------
// Parsed geometry contract.

/** card.svg's viewBox — the card design space is PORTRAIT 1080×1600
 *  (27:40, not exactly 2:3 — do not "simplify" the ratio). */
export const CARD_DESIGN_WIDTH = 1080
export const CARD_DESIGN_HEIGHT = 1600

export interface CardRect {
  x: number
  y: number
  w: number
  h: number
}

/** A resolved text slot: design-space position + EFFECTIVE font size
 *  (matrix scale × class font-size — the OVR / name slot matrix hacks
 *  resolved once here, never reaching the render surfaces). */
export interface CardTextSlot {
  x: number
  y: number
  size: number
}

/** One of the six positional stat slots inside <g id="Stats">. All three
 *  lines (label / points / value) render centered on the column centerX —
 *  DERIVED at plan-build as points.x + width('99')/2 (the parse locks the
 *  points anchors' even pitch, proving the owner's center grid). */
export interface CardStatSlot {
  label: CardTextSlot
  points: CardTextSlot
  value: CardTextSlot
}

/** A linearGradient in the SAME design space (userSpaceOnUse line + stops)
 *  — the detached border stroke's GEOMETRY (line + width). The COLORS come
 *  from the tier palette; the file's Blue_to_Magenta stops are the pristine
 *  tier's palette source. */
export interface CardGradientLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CardBorderStroke {
  /** The gradient line (userSpaceOnUse geometry, scaled with everything). */
  line: CardGradientLine
  /** Stroke width — 40 in the owner's file (round 7). */
  width: number
  /** The border's CLIP path (clipPath#clip-path-1 — the plate silhouette).
   *  The owner clips the border-over stroke to the plate: its outer half is
   *  cut, the inner half paints OVER the photo edges (deliberate round-7
   *  design). Both surfaces must apply this clip. */
  clipPath: string
}

export interface CardGeometry {
  /** The solid plate silhouette (cls-1 path) — full shield. Painted first
   *  on both surfaces; nothing fills outside it (transparent design). */
  platePath: string
  /** Bounding box of the plate path (the name's center derives from its
   *  horizontal midline — see CardGeometry.slots.name). */
  plateBBox: CardRect
  /** The PHOTO AREA path (id="crop-path"): top portion of the shield closed
   *  at ~y=937. The screenshot is clipped to this path on BOTH surfaces,
   *  and its geometry IS the detached border stroke painted over it. */
  cropPath: string
  /** Bounding box of the crop path (cover-fit drawing bounds). */
  cropBBox: CardRect
  /** Detached border: stroke width + gradient line + plate-silhouette clip,
   *  painted over the photo (covering its edges — deliberate). The clip
   *  cuts the stroke's outer half; the inner half covers the photo. */
  borderStroke: CardBorderStroke
  slots: {
    /** Big OVR number — top-left, OVER the photo. */
    ovr: CardTextSlot
    /** Job class name, under the OVR number (still over the photo). */
    job: CardTextSlot
    /** Player name — ORBITRON only, on the plate between photo and stats.
     *  The parsed (x,y,size) give the BASELINE + type size; the RENDER
     *  CENTER is the plate bbox's horizontal midline (the file's x anchors
     *  the left edge of the 'PLAYERNAME' placeholder, which the owner drew
     *  centered on the shield — same placeholder-centering pattern as the
     *  stat columns; recorded r5 decision, held r7). */
    name: CardTextSlot
    /** The six positional stat slots, left → right. The COLUMN CENTER is
     *  derived by the renderer from the points anchor (+ width('99')/2 —
     *  the owner centered the placeholder on the grid); label/value raw x's
     *  are left-anchors of the owner's placeholder strings and only
     *  sanity-bound to their column. */
    stats: CardStatSlot[]
  }
}

// ---------------------------------------------------------------------------
// Tier palettes — the CODE-DRIVEN colors (the per-tier SVGs are retired;
// these palettes ARE their successors). Text fill follows the contrast
// rule: dark on the light metals, white on the deep magenta. The pristine
// border keeps card.svg's own Blue_to_Magenta stops verbatim.
export interface TierPalette {
  plateFill: string
  borderStops: { offset: number; color: string }[]
  textFill: string
}

export const TIER_PALETTE: Record<Tier, TierPalette> = {
  bronze: {
    plateFill: '#d1a972',
    borderStops: [
      { offset: 0, color: '#ed7b00' },
      { offset: 1, color: '#b49f00' },
    ],
    textFill: '#241a10',
  },
  silver: {
    plateFill: '#e6e6e6',
    borderStops: [
      { offset: 0, color: '#7e888e' },
      { offset: 1, color: '#cbd2d6' },
    ],
    textFill: '#241a10',
  },
  gold: {
    plateFill: '#f9b745',
    borderStops: [
      { offset: 0, color: '#ff635f' },
      { offset: 1, color: '#d38f00' },
    ],
    textFill: '#241a10',
  },
  platinum: {
    plateFill: '#cf1a87',
    borderStops: [
      { offset: 0, color: '#6e9aff' },
      { offset: 1, color: '#ff12f7' },
    ],
    textFill: '#ffffff',
  },
}

// ---------------------------------------------------------------------------
// Parsing (pure string work — card.svg is a tiny, hand-verified file).

function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const m of tag.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) attrs.set(m[1], m[2])
  return attrs
}

/** class → font-size from the file's <style> block (placeholder sizes — the
 *  SIZES are honored, the font family/fill are not). */
function classFontSizes(svg: string): Map<string, number> {
  const map = new Map<string, number>()
  const style = svg.match(/<style>([\s\S]*?)<\/style>/)
  if (!style) throw new Error('card.svg: no <style> block')
  for (const m of style[1].matchAll(/\.(\w[\w-]*)\{([^}]*)\}/g)) {
    const size = m[2].match(/font-size:(\d+(?:\.\d+)?)/)
    if (size) map.set(m[1], Number(size[1]))
  }
  return map
}

/** Resolve transform="matrix(a b c d e f)" → position (e,f) + uniform
 *  scale (a===d, b=c=0). Non-uniform matrices throw. Only the OVR slot
 *  (cls-4) and the PLAYERNAME slot (cls-6) carry design matrix scales;
 *  both are resolved ONCE here. */
function matrixTransform(transform: string | undefined): { x: number; y: number; scale: number } {
  if (!transform) return { x: 0, y: 0, scale: 1 }
  const m = transform.match(/matrix\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/)
  if (!m) throw new Error(`card.svg: unparseable text transform "${transform}"`)
  const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  if (b !== 0 || c !== 0 || Math.abs(a - d) > 1e-9) {
    throw new Error(`card.svg: non-uniform text matrix "${transform}" cannot be resolved to position+size`)
  }
  return { x: Number(m[5]), y: Number(m[6]), scale: a }
}

interface RawText {
  cls: string
  id: string | undefined
  x: number
  y: number
  scale: number
}

/** Every <text> in document order with its class + resolved transform. */
function textSlots(svg: string): RawText[] {
  const texts: RawText[] = []
  for (const m of svg.matchAll(/<text\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    const cls = attrs.get('class')
    if (!cls) throw new Error('card.svg: every text slot must carry a class')
    const { x, y, scale } = matrixTransform(attrs.get('transform'))
    texts.push({ cls, id: attrs.get('id'), x, y, scale })
  }
  return texts
}

function slotOf(t: RawText, fontSize: number): CardTextSlot {
  return { x: t.x, y: t.y, size: fontSize * t.scale }
}

/** The plate path: the FIRST cls-1 path in the document (the file has
 *  exactly two identical silhouette paths — cls-1 solid fill + cls-2
 *  stroked crop path; cls-1 is the recolorable fill). */
function pickPlatePath(svg: string): string {
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    if (attrs.get('class') === 'cls-1' && attrs.get('d')) return attrs.get('d') as string
  }
  throw new Error('card.svg: no cls-1 plate path found')
}

function pickCropPath(svg: string): string {
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    if (attrs.get('id') === 'crop-path' && attrs.get('d')) return attrs.get('d') as string
  }
  throw new Error('card.svg: no <path id="crop-path"> found — the photo area is required')
}

/** BBox of the crop path. The path uses ONLY absolute M/L/C/Z commands, so
 *  every numeric token is a coordinate. */
function pathBBox(d: string, what: string): CardRect {
  if (!d.trim().startsWith('M')) throw new Error(`card.svg: ${what} must start with an absolute M`)
  if (/[mlaz]/.test(d)) throw new Error(`card.svg: ${what} must use only absolute M/L/C/Z commands`)
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  if (nums.length < 8 || nums.length % 2 !== 0) throw new Error(`card.svg: ${what} is not a coordinate list`)
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** The border stroke, round 7: cls-3 = `fill:none;
 *  stroke:url(#<gradient>);stroke-width:40` on the path inside
 *  <g id="border-over">, which carries clip-path="url(#<clip>)" — the
 *  owner clips the stroke to the plate silhouette so the border covers the
 *  photo's edges without spilling outside the shield. Only the GEOMETRY is
 *  taken (line + width + clip path d) — the file's placeholder gradient
 *  stops stay in the file (pristine's live on in TIER_PALETTE). */
function borderStroke(svg: string): CardBorderStroke {
  const cls3 = svg.match(/\.cls-3\{([^}]*)\}/)
  if (!cls3) throw new Error('card.svg: no cls-3 border-over style found')
  const strokeRef = cls3[1].match(/stroke:url\(#([^)]+)\)/)
  const width = cls3[1].match(/stroke-width:(\d+(?:\.\d+)?)/)
  if (!strokeRef || !width) {
    throw new Error('card.svg: cls-3 must stroke:url(#gradient) with a stroke-width')
  }
  const grad = svg.match(new RegExp('<linearGradient\\b[^>]*id="' + strokeRef[1] + '"[^>]*>'))
  if (!grad) throw new Error(`card.svg: border gradient "${strokeRef[1]}" not found`)
  const attrs = attributes(grad[0])
  if (!attrs.get('x1') || !attrs.get('x2')) {
    throw new Error(`card.svg: border gradient "${strokeRef[1]}" needs a userSpaceOnUse line`)
  }
  // The clip: the border path must reference a clipPath whose single <path>
  // is the plate silhouette (the owner's clip-path-1).
  const borderPath = [...svg.matchAll(/<path\b([^>]*)>/g)]
    .map((m) => attributes(m[1]))
    .find((a) => a.get('class') === 'cls-3')
  const clipRef = borderPath?.get('clip-path')?.match(/url\(#([^)]+)\)/)?.[1]
  if (!clipRef) throw new Error('card.svg: the border-over path must clip to the plate silhouette')
  const clip = svg.match(new RegExp('<clipPath\\b[^>]*id="' + clipRef + '"[^>]*>[\\s\\S]*?</clipPath>'))
  const clipD = clip?.[0].match(/<path\b[^>]*\bd="([^"]+)"/)?.[1]
  if (!clipD) throw new Error(`card.svg: clipPath "${clipRef}" must contain the silhouette <path d>`)
  return {
    line: {
      x1: Number(attrs.get('x1')),
      y1: Number(attrs.get('y1')),
      x2: Number(attrs.get('x2')),
      y2: Number(attrs.get('y2')),
    },
    width: Number(width[1]),
    clipPath: clipD,
  }
}

function byX(a: RawText, b: RawText): number {
  return a.x - b.x
}

function expectCount(texts: RawText[], cls: string, n: number): void {
  const found = texts.filter((t) => t.cls === cls)
  if (found.length !== n) {
    throw new Error(`card.svg: expected exactly ${n} ${cls} text slot(s), found ${found.length}`)
  }
  return void found
}

function parseCard(svg: string): CardGeometry {
  const sizes = classFontSizes(svg)
  const need = (cls: string, what: string): number => {
    const s = sizes.get(cls)
    if (s === undefined) throw new Error(`card.svg: ${what} class ${cls} has no font-size in <style>`)
    return s
  }
  const ovrSize = need('cls-4', 'OVR')
  const jobSize = need('cls-5', 'job')
  const labelSize = need('cls-7', 'stat label / value')
  const pointsSize = need('cls-8', 'points')
  const nameSize = need('cls-6', 'player name')

  const texts = textSlots(svg)
  expectCount(texts, 'cls-4', 1)
  expectCount(texts, 'cls-5', 1)
  expectCount(texts, 'cls-6', 1)
  expectCount(texts, 'cls-7', 12) // 6 labels + 6 raw values
  expectCount(texts, 'cls-8', 6)

  // OVR: ONE OF THE TWO slots allowed a scaled matrix — resolve ONCE here
  // (8.503px × 21.169 ≈ 180px effective; the hack never reaches render).
  const ovrRaw = texts.find((t) => t.cls === 'cls-4')!
  if (ovrRaw.scale === 1) throw new Error('card.svg: the OVR slot must carry its design matrix scale')
  const ovr: CardTextSlot = { x: ovrRaw.x, y: ovrRaw.y, size: ovrSize * ovrRaw.scale }

  const job = slotOf(texts.find((t) => t.cls === 'cls-5')!, jobSize)

  // PLAYERNAME: the SECOND slot allowed a scaled matrix (0.656 → ≈72px).
  const nameRaw = texts.find((t) => t.cls === 'cls-6')!
  const name = slotOf(nameRaw, nameSize)

  // cls-7 is shared by the 6 stat labels and the 6 raw values (both 48px
  // Bebas Neue). Labels sit at y≈1283.5, values at y≈1329.25.
  const cls7 = texts.filter((t) => t.cls === 'cls-7').sort(byX)
  const labelRaw = cls7.filter((t) => t.y < 1300).sort(byX)
  const valueRaw = cls7.filter((t) => t.y >= 1300).sort(byX)
  if (labelRaw.length !== 6 || valueRaw.length !== 6) {
    throw new Error('card.svg: cls-7 must be exactly 6 stat labels (y<1300) + 6 raw values (y>=1300)')
  }

  const pointsRaw = texts.filter((t) => t.cls === 'cls-8').sort(byX)
  if (pointsRaw.length !== 6) {
    throw new Error('card.svg: cls-8 must be exactly 6 stat point values')
  }
  // THE COLUMN-CENTER GRID (round 7): the points placeholders are the SAME
  // string ('99') in every column, so their left anchors sit at
  // center − width('99')/2 — CONSTANT offset → the points x's are the
  // column centers' grid, evenly pitched. The label/value anchors are left-
  // anchors of DIFFERENT-width placeholder strings ('MATK' vs 'MDMG.R') and
  // are NOT centers. Lock the even pitch: a future file edit that breaks
  // the grid breaks the central-alignment design.
  for (let i = 1; i < pointsRaw.length; i++) {
    const pitch = pointsRaw[i].x - pointsRaw[i - 1].x
    const first = pointsRaw[1].x - pointsRaw[0].x
    if (Math.abs(pitch - first) > 1) {
      throw new Error(
        `card.svg: stat points anchors are not evenly pitched (column ${i + 1} pitch ${pitch.toFixed(3)} ≠ ${first.toFixed(3)}) — the center grid is broken`,
      )
    }
  }

  const stats: CardStatSlot[] = labelRaw.map((label, i) => {
    // Sanity bound (NOT centering): the points/value anchors are left-anchors
    // of the owner's PLACEHOLDER strings — they may differ from the label x
    // (different string widths) but must stay near their column. The COLUMN
    // CENTER is derived downstream (points anchor + width('99')/2, the
    // owner's own centering of the placeholder — see buildCardPlan).
    const span = Math.max(label.x, pointsRaw[i].x, valueRaw[i].x) - Math.min(label.x, pointsRaw[i].x, valueRaw[i].x)
    if (span > 20) throw new Error(`card.svg: stat slot ${i + 1} is not column-aligned (span ${span}px)`)
    return {
      label: slotOf(label, labelSize),
      points: slotOf(pointsRaw[i], pointsSize),
      value: slotOf(valueRaw[i], labelSize),
    }
  })

  const platePath = pickPlatePath(svg)
  const cropPath = pickCropPath(svg)

  return {
    platePath,
    plateBBox: pathBBox(platePath, 'base-plate'),
    cropPath,
    cropBBox: pathBBox(cropPath, 'crop-path'),
    borderStroke: borderStroke(svg),
    slots: { ovr, job, name, stats },
  }
}

// ---------------------------------------------------------------------------
// THE single parsed design (one file for every tier — palettes differ by
// code, geometry never does).

export const CARD_GEOMETRY: CardGeometry = parseCard(cardRaw)

// ---------------------------------------------------------------------------
// scalePath — THE CANVAS-MAPPING CONTRACT (kept from checkpoint round 2):
// the card paths are authored in the 1080×1600 design space; the on-page
// <svg viewBox> maps them to the element for free, but Canvas 2D has no
// viewBox — the JPEG/PNG shell MUST transform every path onto the backing
// store itself. Exact for our paths: every card path uses ONLY absolute
// M/L/C/Z commands (no relative commands, no arcs), so every numeric token
// is a coordinate.
export function scalePath(d: string, s: number): string {
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(parseFloat(n) * s * 1000) / 1000))
}

/** Scale a design-space rect onto a backing store (companion to scalePath). */
export function scaleRect(r: CardRect, s: number): CardRect {
  return { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s }
}
