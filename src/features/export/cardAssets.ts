// cardAssets.ts — SINGLE SOURCE OF TRUTH for the card design (07.2-05
// checkpoint round 5, owner supersession: "check the new card.svg at the
// assets folder, it now contains placeholder texts too, eliminating the
// necessity for safe area ... We can change the color of the card via code
// too, so this one file becomes the source of truth for card design").
//
// THE FILE: src/assets/card.svg (viewBox 1080×1600 — portrait 27:40), the
// owner's ONE design for every tier. Structure (verified against the file):
//   - Plate: TWO paths sharing the SAME silhouette d:
//       · cls-1 — solid fill (currently #cf1a87 pristine magenta = the
//         RECOLORABLE card color; the placeholder value is never trusted —
//         tier palettes below own the fill)
//       · cls-2 — the same path stroked with the decorative border
//         stroke:url(#Blue_to_Magenta) stroke-width:40, clipped by
//         clipPath#clip-path-1 (only the inner half of the stroke shows)
//   - <path id="crop-path"> (cls-3): the PHOTO AREA — the upper region of
//     the silhouette down to ~y=864, full width. The member's screenshot is
//     CLIPPED to this path (round 5 brought the crop path back — there are
//     no guideline rects anymore, just the text to be edited).
//   - Placeholder TEXT slots (all 'Bebas Neue', fill #e6e6e6 — BOTH are
//     placeholders; code substitutes font and color):
//       · <text id="OVR"> — cls-4, font-size 12.093 with
//         transform="matrix(21.169 0 0 21.169 119.82 466.72)" → effective
//         size ≈ 12.093 × 21.169 ≈ 256px at (119.82, 466.72). The parser
//         resolves the matrix ONCE — the matrix hack never reaches render.
//       · Job Class — cls-5 (48px) at (147.772, 533.928), under the number.
//       · PLAYERNAME — cls-7 (128px) at (285.408, 1030.58), on the plate
//         between the photo and the stats band.
//       · <g id="Stats"> → KEY1..KEY6, each: key label (cls-6, 72px,
//         y≈1141), points value (cls-7, 128px, y≈1265), raw own_value
//         (cls-8, 36px, y≈1314). SLOTS ARE POSITIONAL — code fills them
//         with the member's six key stats in server order.
//
// TIER VARIANTS LIVE IN CODE: one TIER_PALETTE per tier (plate fill, border
// gradient stops, text fill) applied over the SAME parsed geometry — the
// four round-4 per-tier SVGs are retired; their palettes survive here. The
// file's own #e6e6e6 text fill / 'Bebas Neue' are placeholders the parser
// deliberately ignores.
//
// This module parses card.svg ONCE at module load (pure string parsing — no
// DOM, so it runs in node/vitest) and exposes the normalized geometry + the
// slot map. Both rendering surfaces consume it:
//   - CardSvg.tsx (on-page <svg>) renders the paths/slots directly
//   - cardExport.ts paints the SAME path strings on canvas via scalePath
//     and the SAME slot positions — on-page card and downloaded JPEG are
//     identical by construction.
//
// Fail-fast: a missing layer, an unparseable matrix, or a wrong slot count
// throws at module load — a malformed design asset must never ship as a
// silently broken card.
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
 *  (matrix scale × class font-size — the OVR slot's matrix hack resolved). */
export interface CardTextSlot {
  x: number
  y: number
  size: number
}

/** One of the six positional stat slots inside <g id="Stats">. */
export interface CardStatSlot {
  label: CardTextSlot
  points: CardTextSlot
  value: CardTextSlot
}

/** A linearGradient in the SAME design space (userSpaceOnUse line + stops)
 *  — the border stroke's GEOMETRY (line + width). The COLORS come from the
 *  tier palette; the file's Blue_to_Magenta stops are the pristine tier's
 *  palette source. */
export interface CardGradientLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CardGeometry {
  /** The solid plate silhouette (cls-1 path) — also the border clip. */
  platePath: string
  /** The PHOTO AREA path (id="crop-path") — the screenshot is clipped to
   *  this path on BOTH surfaces. */
  cropPath: string
  /** Bounding box of the crop path (cover-fit drawing bounds). */
  cropBBox: CardRect
  /** Decorative border: stroke width + gradient line, clipped to the
   *  silhouette. Required — a card without its border is malformed. */
  borderStroke: { line: CardGradientLine; width: number }
  slots: {
    /** Big OVR number — top-left, OVER the photo. */
    ovr: CardTextSlot
    /** Job class name, under the OVR number (still over the photo). */
    job: CardTextSlot
    /** Player name — on the plate, between photo and stats. */
    name: CardTextSlot
    /** The six positional stat slots, left → right. */
    stats: CardStatSlot[]
  }
}

// ---------------------------------------------------------------------------
// Tier palettes — the CODE-DRIVEN colors (round 5: the per-tier SVGs are
// retired; these palettes ARE their successors). Text fill follows the
// round-4 contrast rule: dark on the light metals, white on the deep
// magenta. The pristine border keeps card.svg's own Blue_to_Magenta stops
// verbatim (it IS the pristine design; the bright #ff12f7 end reads clearly
// against the darker #cf1a87 plate).
export interface TierPalette {
  /** The recolorable card color (plate cls-1 fill). */
  plateFill: string
  /** Border gradient stops (the gradient LINE/width come from card.svg). */
  borderStops: { offset: number; color: string }[]
  /** Text color on the plate (name + stats block). */
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

/** class → font-size from the file's <style> block (placeholder sizes —
 *  the SIZES are honored, the font family/fill are not). */
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
 *  scale (a===d, b=c=0). Non-uniform matrices throw — the design must stay
 *  resolvable to a plain position+size. */
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

function slotOf(t: RawText, fontSize: number, what: string): CardTextSlot {
  if (t.scale !== 1) {
    // Only the OVR slot is allowed a scaled matrix (its 12.093×21.169 hack).
    throw new Error(`card.svg: unexpected scaled matrix on ${what}`)
  }
  return { x: t.x, y: t.y, size: fontSize }
}

/** The plate path: the FIRST cls-1 path in the document (the file has
 *  exactly two identical silhouette paths — cls-1 solid + cls-2 stroked;
 *  cls-1 is the recolorable fill). */
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
 *  every numeric token is a coordinate (control points may slightly
 *  overestimate — acceptable: the photo covers a hair more than the curve). */
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

/** The border stroke: cls-2 = `stroke:url(#<gradient>) stroke-width:40`.
 *  Only the geometry (line + width) is taken — the file's placeholder
 *  gradient stops stay in the file (pristine's live on in TIER_PALETTE). */
function borderStroke(svg: string): { line: CardGradientLine; width: number } {
  const cls2 = svg.match(/\.cls-2\{([^}]*)\}/)
  if (!cls2) throw new Error('card.svg: no cls-2 border style found')
  const strokeRef = cls2[1].match(/stroke:url\(#([^)]+)\)/)
  const width = cls2[1].match(/stroke-width:(\d+(?:\.\d+)?)/)
  if (!strokeRef || !width) {
    throw new Error('card.svg: cls-2 must stroke:url(#gradient) with a stroke-width')
  }
  const grad = svg.match(new RegExp('<linearGradient\\b[^>]*id="' + strokeRef[1] + '"[^>]*>'))
  if (!grad) throw new Error(`card.svg: border gradient "${strokeRef[1]}" not found`)
  const attrs = attributes(grad[0])
  if (!attrs.get('x1') || !attrs.get('x2')) {
    throw new Error(`card.svg: border gradient "${strokeRef[1]}" needs a userSpaceOnUse line`)
  }
  return {
    line: {
      x1: Number(attrs.get('x1')),
      y1: Number(attrs.get('y1')),
      x2: Number(attrs.get('x2')),
      y2: Number(attrs.get('y2')),
    },
    width: Number(width[1]),
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
  const labelSize = need('cls-6', 'stat label')
  const pointsSize = need('cls-7', 'points')
  const valueSize = need('cls-8', 'stat value')

  const texts = textSlots(svg)
  expectCount(texts, 'cls-4', 1)
  expectCount(texts, 'cls-5', 1)
  expectCount(texts, 'cls-6', 6)
  expectCount(texts, 'cls-7', 7) // 6 points + 1 PLAYERNAME
  expectCount(texts, 'cls-8', 6)

  // OVR: the ONE slot allowed a scaled matrix — resolve it ONCE here
  // (12.093px × 21.169 matrix ≈ 256px effective; the hack never reaches
  // the render surfaces).
  const ovrRaw = texts.find((t) => t.cls === 'cls-4')!
  if (ovrRaw.scale === 1) throw new Error('card.svg: the OVR slot must carry its design matrix scale')
  const ovr: CardTextSlot = { x: ovrRaw.x, y: ovrRaw.y, size: ovrSize * ovrRaw.scale }

  const job = slotOf(texts.find((t) => t.cls === 'cls-5')!, jobSize, 'the job slot')

  // cls-7 is shared by the 6 points slots and PLAYERNAME: the name is the
  // single one ABOVE the stats band (y < 1100; points sit at y≈1265).
  const cls7 = texts.filter((t) => t.cls === 'cls-7').sort(byX)
  const nameRaw = cls7.filter((t) => t.y < 1100)
  const pointsRaw = cls7.filter((t) => t.y >= 1100).sort(byX)
  if (nameRaw.length !== 1 || pointsRaw.length !== 6) {
    throw new Error('card.svg: cls-7 must be exactly 6 points slots (y≥1100) + 1 PLAYERNAME (y<1100)')
  }
  const name = slotOf(nameRaw[0], pointsSize, 'the name slot')

  const labelRaw = texts.filter((t) => t.cls === 'cls-6').sort(byX)
  const valueRaw = texts.filter((t) => t.cls === 'cls-8').sort(byX)

  const stats: CardStatSlot[] = labelRaw.map((label, i) => {
    const points = slotOf(pointsRaw[i], pointsSize, `points slot ${i + 1}`)
    return {
      label: slotOf(label, labelSize, `label slot ${i + 1}`),
      points,
      value: slotOf(valueRaw[i], valueSize, `value slot ${i + 1}`),
    }
  })

  // Slot sanity: within each stat slot the three texts must be column-aligned
  // (label → points → value within ~40px) — a shuffled design must fail loud.
  stats.forEach((s, i) => {
    const span = Math.max(s.label.x, s.points.x, s.value.x) - Math.min(s.label.x, s.points.x, s.value.x)
    if (span > 40) throw new Error(`card.svg: stat slot ${i + 1} is not column-aligned (span ${span}px)`)
  })

  const platePath = pickPlatePath(svg)
  const cropPath = pickCropPath(svg)

  return {
    platePath,
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
// viewBox — the JPEG shell MUST transform every path onto the backing store
// itself. Exact for our paths: every card path uses ONLY absolute M/L/C/Z
// commands (no relative commands, no arcs), so every numeric token is a
// coordinate.
export function scalePath(d: string, s: number): string {
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(parseFloat(n) * s * 1000) / 1000))
}

/** Scale a design-space rect onto a backing store (companion to scalePath). */
export function scaleRect(r: CardRect, s: number): CardRect {
  return { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s }
}
