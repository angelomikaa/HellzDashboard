// cardAssets.ts — SINGLE SOURCE OF TRUTH for the card design (07.2-05
// checkpoint round 8, owner re-seed: "read card.svg again — actually made
// new alterations. read all layers carefully." → THE FILE IS THE SPEC).
//
// THE FILE: src/assets/card.svg (viewBox 1080×1600 — portrait 27:40), the
// owner's ONE design for every tier. THREE-LAYER BACKGROUND (the owner's
// explicit round-8 semantics, verified against the file):
//   1. <path id="base-plate"> cls-1 — solid recolorable plate fill, the full
//      shield silhouette. Painted FIRST; the area outside the shield stays
//      transparent (PNG-transparent design).
//   2. <path id="crop-path"> cls-2 — the PHOTO AREA: the top portion of the
//      silhouette closed at ~y=937 (full width), fill:none — BORDERLESS by
//      design. The photo is clipped to it and NOTHING strokes it: the
//      round-7 "border over the crop" reading is DEAD (that was the app's
//      divergence the owner flagged: "the border is in the crop, which would
//      be incorrect").
//   3. <g id="border-over"> — cls-3 stroke:url(#Blue_to_Magenta) WIDTH 48
//      ON THE PLATE SILHOUETTE (the cls-3 path's d IS the base-plate d),
//      clipped by clipPath#clip-path-1 (= the plate silhouette): the stroke's
//      outer half is cut, the inner ≈24px band rings the WHOLE shield and
//      covers the photo's top/side edges. The gradient line runs
//      x1=61.61 → x2=1017.352 — extended past the plate edges. The file's
//      stops are the UI's five-stop Impecável rainbow; the palette owns the
//      live colors per tier. Paint order:
//      plate → photo → border → texts.
//   - Placeholder TEXT slots (Bebas Neue unless noted — family + fill are
//     placeholders; code substitutes):
//       · <g id="OVR"> — cls-4 Bebas Neue, 6.992px × matrix 21.169 → ≈148px
//         effective at (136.177, 412.59), top-left over the photo
//       · Job class — cls-5 Bebas Neue, 72px at (136.177, 487.48), under
//         the number (no "OVR" tag, round 4 held)
//       · PLAYERNAME — cls-6 ORBITRON, 109.72px × matrix 0.656 → ≈72px
//         effective at (246.528, 1047.007). ORBITRON ONLY HERE: every other
//         slot is Bebas Neue (round 7).
//       · SIX SEMANTIC STAT GROUPS <g id="KEY1">…<g id="KEY6"> — each holds
//         exactly three texts: LABEL (cls-7 Bebas 56, y≈1141.317 — ABOVE the
//         rating), RATING (cls-8 Bebas 148, y≈1261.703) and STAT (cls-7
//         Bebas 56, y≈1317.836). Ids drift per group (LABEL / LABEL-2…,
//         KEYLABEL, RATING-2…, data-name attrs) — the parser resolves roles
//         from the group's structure (class + vertical order), NEVER from
//         exact id strings, and orders the columns left → right by the
//         RATING anchor (the visual grid — the KEY ids are NOT the visual
//         order: KEY3/KEY4 and KEY5/KEY6 sit swapped in the file). The
//         rating anchors are evenly pitched at ≈142.15px (the owner CENTERED
//         the '99' placeholders on the column grid — the parse locks that
//         pitch); the column CENTER is derived at plan-build as the rating
//         anchor + width('99')/2. Labels 4–6 chars (MATK / MDMG.R), points
//         big hero number, value raw own_value.
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

/** One of the six positional stat slots, resolved from the file's semantic
 *  <g id="KEY*"> groups. All three lines (label / points / value) render
 *  centered on the column centerX — DERIVED at plan-build as points.x +
 *  width('99')/2 (the parse locks the rating anchors' even pitch, proving
 *  the owner's center grid). Label ABOVE points ABOVE value (round 8). */
export interface CardStatSlot {
  label: CardTextSlot
  points: CardTextSlot
  value: CardTextSlot
}

/** A linearGradient in the SAME design space (userSpaceOnUse line + stops)
 *  — the detached border stroke's GEOMETRY (line + width). Only the geometry
 *  is parsed; the COLORS come from the tier palette (the file's stops show
 *  the UI's Impecável rainbow as the top-tier reference). */
export interface CardGradientLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CardBorderStroke {
  /** The gradient line (userSpaceOnUse geometry, scaled with everything). */
  line: CardGradientLine
  /** Stroke width — 48 in the owner's file (round 8). */
  width: number
  /** The STROKED path (the cls-3 path inside <g id="border-over">) — in the
   *  owner's file this IS the plate silhouette (three-layer semantics: the
   *  border rings the whole shield; the crop area stays borderless). Parsed
   *  separately from the clip so a future re-seed that decouples them stays
   *  faithful to the file. */
  strokePath: string
  /** The border's CLIP path (clipPath#clip-path-1 — the plate silhouette).
   *  The owner clips the border-over stroke to the plate: its outer half is
   *  cut, the inner half paints over the photo/plate edges (deliberate).
   *  Both surfaces must apply this clip. */
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
  /** Detached border: stroke width + gradient line + stroke path (the plate
   *  silhouette — three-layer semantics) + the plate-silhouette clip,
   *  painted over the photo. The clip cuts the stroke's outer half; the
   *  inner ≈24px band rings the whole shield. */
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
// rule: dark on the light metals, white on the deep magenta. The platinum
// border mirrors the UI's Impecável rainbow (tier-impecavel-border in
// src/index.css) stop-for-stop, so the card and the tier-styled UI frame
// never read as two different gradients.
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
    // Same five stops as the UI's tier-impecavel-border gradient
    // (linear-gradient(120deg, #f26d6f, #e9b44c, #3fb950, #58a6ff, #b8c0cc)),
    // spread along the card's horizontal border line.
    borderStops: [
      { offset: 0, color: '#f26d6f' },
      { offset: 0.25, color: '#e9b44c' },
      { offset: 0.5, color: '#3fb950' },
      { offset: 0.75, color: '#58a6ff' },
      { offset: 1, color: '#b8c0cc' },
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

/** The border stroke, round 8: cls-3 = `fill:none;
 *  stroke:url(#<gradient>);stroke-width:48` on the path inside
 *  <g id="border-over">, which carries clip-path="url(#<clip>)" — the
 *  owner clips the stroke (whose d IS the plate silhouette) to the plate
 *  silhouette so the border rings the shield without spilling outside.
 *  The stroked path and the clip are parsed SEPARATELY (a re-seed may
 *  decouple them). Only the GEOMETRY is taken (stroke path + line + width +
 *  clip path d) — the file's placeholder gradient stops stay in the file
 *  (pristine's live on in TIER_PALETTE). */
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
  // The border path: the cls-3 path inside <g id="border-over"> — its d IS
  // the stroked geometry (the plate silhouette in the owner's file). The
  // clip: the same path must reference a clipPath whose single <path> is
  // the plate silhouette (the owner's clip-path-1).
  const borderPath = [...svg.matchAll(/<path\b([^>]*)>/g)]
    .map((m) => attributes(m[1]))
    .find((a) => a.get('class') === 'cls-3')
  if (!borderPath?.get('d')) {
    throw new Error('card.svg: no cls-3 border-over path found (the stroked silhouette is required)')
  }
  const clipRef = borderPath.get('clip-path')?.match(/url\(#([^)]+)\)/)?.[1]
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
    strokePath: borderPath.get('d') as string,
    clipPath: clipD,
  }
}

function expectCount(texts: RawText[], cls: string, n: number): void {
  const found = texts.filter((t) => t.cls === cls)
  if (found.length !== n) {
    throw new Error(`card.svg: expected exactly ${n} ${cls} text slot(s), found ${found.length}`)
  }
  return void found
}

/** The six SEMANTIC stat groups <g id="KEY1">…<g id="KEY6"> with their text
 *  slots. Roles resolve from the group's STRUCTURE, never exact id strings
 *  (the file drifts: LABEL / LABEL-2 / KEYLABEL, RATING-2 + data-name,
 *  STAT-3 + data-name): the single cls-8 text is the RATING; of the two
 *  cls-7 texts the SMALLER y is the LABEL (above the rating) and the LARGER
 *  y is the STAT/value line — the file's label-above-rating-above-value
 *  order, derived from the file on every parse. */
function keyGroups(svg: string): { id: string; texts: RawText[] }[] {
  const groups: { id: string; texts: RawText[] }[] = []
  for (const m of svg.matchAll(/<g id="(KEY\d+)"[^>]*>([\s\S]*?)<\/g>/g)) {
    const texts: RawText[] = []
    for (const t of m[2].matchAll(/<text\b([^>]*)>/g)) {
      const attrs = attributes(t[1])
      const cls = attrs.get('class')
      if (!cls) throw new Error(`card.svg: ${m[1]} text slot must carry a class`)
      const { x, y, scale } = matrixTransform(attrs.get('transform'))
      texts.push({ cls, id: attrs.get('id'), x, y, scale })
    }
    if (texts.length !== 3) {
      throw new Error(
        `card.svg: stat group ${m[1]} must hold exactly 3 text slots (label/rating/value), found ${texts.length}`,
      )
    }
    groups.push({ id: m[1], texts })
  }
  if (groups.length !== 6) {
    throw new Error(`card.svg: expected 6 KEY stat groups (KEY1..KEY6), found ${groups.length}`)
  }
  return groups
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
  // Global census: ALL cls-7/cls-8 texts must live in the KEY groups —
  // a future edit adding a stray slot fails loudly here.
  expectCount(texts, 'cls-7', 12) // 6 labels + 6 raw values
  expectCount(texts, 'cls-8', 6)

  // OVR: ONE OF THE TWO slots allowed a scaled matrix — resolve ONCE here
  // (6.992px × 21.169 ≈ 148px effective; the hack never reaches render).
  const ovrRaw = texts.find((t) => t.cls === 'cls-4')!
  if (ovrRaw.scale === 1) throw new Error('card.svg: the OVR slot must carry its design matrix scale')
  const ovr: CardTextSlot = { x: ovrRaw.x, y: ovrRaw.y, size: ovrSize * ovrRaw.scale }

  const job = slotOf(texts.find((t) => t.cls === 'cls-5')!, jobSize)

  // PLAYERNAME: the SECOND slot allowed a scaled matrix (0.656 → ≈72px).
  const nameRaw = texts.find((t) => t.cls === 'cls-6')!
  const name = slotOf(nameRaw, nameSize)

  // THE SIX STAT COLUMNS (round 8 semantic groups): resolve roles inside
  // each KEY group, then order the columns LEFT → RIGHT by the RATING
  // anchor — the visual grid (the KEY ids are NOT the visual order: the
  // owner's file sits KEY3/KEY4 and KEY5/KEY6 visually swapped).
  const groups = keyGroups(svg).map((g) => {
    const rating = g.texts.find((t) => t.cls === 'cls-8')
    if (!rating) throw new Error(`card.svg: stat group ${g.id} has no cls-8 RATING slot`)
    const pair = g.texts.filter((t) => t.cls === 'cls-7').sort((a, b) => a.y - b.y)
    if (pair.length !== 2) {
      throw new Error(`card.svg: stat group ${g.id} must hold exactly 2 cls-7 slots (label + value)`)
    }
    if (pair[1].y <= pair[0].y) {
      throw new Error(`card.svg: stat group ${g.id} label/value rows must sit at DISTINCT y`)
    }
    return { id: g.id, label: pair[0], rating, value: pair[1] }
  })
  const pointsRaw = groups
    .sort((a, b) => a.rating.x - b.rating.x)
    .map((g) => ({ id: g.id, label: g.label, rating: g.rating, value: g.value }))

  // THE COLUMN-CENTER GRID (rounds 7-8): the RATING placeholders are the
  // SAME string ('99') in every column, so their left anchors sit at
  // center − width('99')/2 — CONSTANT offset → the rating x's are the
  // column centers' grid, evenly pitched. Lock the even pitch: a future
  // file edit that breaks the grid breaks the central-alignment design.
  for (let i = 1; i < pointsRaw.length; i++) {
    const pitch = pointsRaw[i].rating.x - pointsRaw[i - 1].rating.x
    const first = pointsRaw[1].rating.x - pointsRaw[0].rating.x
    if (Math.abs(pitch - first) > 1) {
      throw new Error(
        `card.svg: stat rating anchors are not evenly pitched (column ${i + 1} pitch ${pitch.toFixed(3)} ≠ ${first.toFixed(3)}) — the center grid is broken`,
      )
    }
  }

  const stats: CardStatSlot[] = pointsRaw.map((col) => {
    // Sanity bound (NOT centering): the three anchors are left-anchors of
    // the owner's PLACEHOLDER strings — they may differ from each other
    // (different string widths) but must stay near their column. The COLUMN
    // CENTER is derived downstream (rating anchor + width('99')/2, the
    // owner's own centering of the placeholder — see buildCardPlan).
    const xs = [col.label.x, col.rating.x, col.value.x]
    const span = Math.max(...xs) - Math.min(...xs)
    if (span > 20) throw new Error(`card.svg: stat slot ${col.id} is not column-aligned (span ${span}px)`)
    return {
      label: slotOf(col.label, labelSize),
      points: slotOf(col.rating, pointsSize),
      value: slotOf(col.value, labelSize),
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
