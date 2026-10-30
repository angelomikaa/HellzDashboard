// cardAssets.ts — SINGLE SOURCE OF TRUTH for the card design (07.2-05
// checkpoint round 8, owner re-seed: "read card.svg again — actually made
// new alterations. read all layers carefully." → THE FILE IS THE SPEC).
//
// THE FILE: src/assets/card.svg (viewBox 1080×1600 — portrait 27:40), the
// owner's ONE design for every tier. The parser reads the file's LAYERS and
// TEXT SLOTS structurally and tolerates the export shapes the owner has
// shipped (fail-fast when none matches):
//
//   A) CURRENT FILE (owner re-export 2026-10-29, "no more border" + tier
//      instructions) — INLINE attributes, no <style>, no classes:
//        <path id="tier-color-plate"> — recolorable backplate, full shield;
//          the photo stays CROPPED BY IT. The name says it paints the TIER's
//          color, never the file's.
//        <path id="tier-color-plate-stats" fill="url(#gradient)"> — the STATS
//          CONTRAST PLATE behind the six stat columns: its GEOMETRY and FADE
//          come from the file, its COLOR from the TIER (owner 2026-10-29:
//          "the fills must follow tier colors, not the color in the svg")
//        NO border layer at all
//        no crop-path → the photo occupies the WHOLE SHIELD
//        <text ... font-size="…"> per slot, transform="matrix(1 0 0 1 x y)"
//   B) first re-export (2026-10-29, "largura do arquivo, cor por tier") —
//      same as A but with <path id="plate-border">: a solid per-tier ring on
//      the silhouette, no clip, width read from the file.
//   C) round-8 file (retired, still parsed) — <style> + cls-* classes,
//      crop-path photo area + border-over gradient stroke clipped by
//      clip-path-1.
//
// PAINT ORDER: plate → photo → scrim → stats plate → border → texts.
//   - Placeholder TEXT slots (Bebas Neue unless noted — family + fill are
//     placeholders; code substitutes). Roles resolve from STRUCTURE, never
//     exact id strings (the ids drift per export: OVR / OVR-2 + data-name,
//     LABEL / LABEL-2 / KEYLABEL…):
//       · <g id="OVR"> holds TWO texts — the BIGGEST is the OVR number, the
//         other is the job-class line under it (re-export: 148.014px at
//         (136.177, 412.59) over a 56px job line at (136.177, 473.794));
//       · the single ORBITRON text outside the OVR/KEY groups is PLAYERNAME
//         (≈72px, (246.528, 1044.007)) — Orbitron ONLY here (round 7);
//       · SIX SEMANTIC STAT GROUPS <g id="KEY1">…<g id="KEY6">, each holding
//         exactly three texts: the BIGGEST is the RATING/points (148px,
//         y≈1261.703), the SMALLER-y of the other two the LABEL (56px,
//         y≈1141.317) and the larger the STAT/value (56px, y≈1317.836).
//         Columns are ordered LEFT → RIGHT by the RATING anchor (the KEY ids
//         are NOT the visual order: KEY3/KEY4 and KEY5/KEY6 sit swapped).
//         The parse locks the rating anchors' EVEN PITCH (≈142.15px in the
//         current file) and the column CENTER is derived at plan-build as
//         the rating anchor + width('99')/2 — the owner's placeholder
//         centering. Labels 4–6 chars (MATK / MDMG.R), points big hero
//         number, value raw own_value.
//
// TIER VARIANTS LIVE IN CODE: one TIER_PALETTE per tier (plate fill, border
// stops, text fill) applied over the SAME parsed geometry. The file's own
// colors (#cf1a87 plate, #662d91 ring, #e6e6e6 text) are placeholders —
// never parsed into the palettes.
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
  /** The gradient line (userSpaceOnUse geometry, scaled with everything).
   *  OPTIONAL since the owner's 2026-10-29 re-export: the current file carries
   *  a SOLID stroke (plate-border), so there is no gradient to paint — the
   *  renderers fall back to the palette's solid border color. */
  line?: CardGradientLine
  /** Stroke width — read from the file (48 in the round-8 file, 24 in the
   *  2026-10-29 re-export). */
  width: number
  /** The STROKED path — in the owner's files this IS the plate silhouette
   *  (three-layer semantics: the border rings the whole shield). Parsed
   *  separately from the clip so a future re-seed that decouples them stays
   *  faithful to the file. */
  strokePath: string
  /** The border's CLIP path (clipPath#clip-path-1 — the plate silhouette).
   *  The owner's round-8 file clips the border-over stroke to the plate: its
   *  outer half is cut, the inner half paints over the photo/plate edges
   *  (deliberate). ABSENT in the 2026-10-29 re-export (no clipPath at all) —
   *  when undefined, the stroke paints unclipped, which is what the file shows.
   *  Both surfaces apply the clip only when it exists. */
  clipPath?: string
}

/** The STATS CONTRAST PLATE: a path behind the six stat columns, painted over
 *  the photo so the stat text reads against any screenshot.
 *
 *  OWNER CONTRACT (2026-10-29, "tier instructions have been updated — the fills
 *  must follow tier colors, not the color in the svg"): the owner now names the
 *  layers `tier-color-plate` and `tier-color-plate-stats`, which is the signal
 *  that BOTH fills are TIER-DRIVEN. So the parse carries only the plate's
 *  GEOMETRY (path + gradient line) and its FADE structure (offsets + opacities
 *  as authored for contrast), and BOTH surfaces paint it in the tier's own
 *  color. The SVG's purple ramp is the owner's reference for HOW it fades,
 *  never the color it paints. */
export interface CardStatsPlate {
  path: string
  line: CardGradientLine
  /** The authored fade: each stop's OFFSET and OPACITY, in file order. The
   *  COLOR is not parsed (see the tier-color contract above) — the renderers
   *  supply the tier's own color at every stop. */
  fades: { offset: number; opacity: number }[]
}

/** The tier's plate color: the palette's gradient when the tier declares one
 *  (pristine), otherwise its solid plateFill. Shared by both surfaces so the
 *  plate and the stats plate can never disagree on the tier's color. */
export function tierPlateColor(palette: TierPalette): string {
  const stops = palette.plateStops
  if (stops === undefined) return palette.plateFill
  // A mid stop reads as the tier's color most faithfully on the small plate.
  const mid = stops.reduce((best, s) =>
    Math.abs(s.offset - 0.5) < Math.abs(best.offset - 0.5) ? s : best, stops[0])
  return mid.color
}

export interface CardGeometry {
  /** The solid plate silhouette (cls-1 path) — full shield. Painted first
   *  on both surfaces; nothing fills outside it (transparent design). */
  platePath: string
  /** Bounding box of the plate path (the name's center derives from its
   *  horizontal midline — see CardGeometry.slots.name). */
  plateBBox: CardRect
  /** The PHOTO AREA path: the screenshot is clipped to this path on BOTH
   *  surfaces. The round-8 file drew it as `id="crop-path"` (the shield's top
   *  portion, closed at ~y=937); the 2026-10-29 re-exports carry no crop path,
   *  so the photo falls back to the WHOLE SHIELD (owner decision
   *  2026-10-29) — the backplate stays behind it as the no-photo fallback. */
  cropPath: string
  /** Bounding box of the crop path (cover-fit drawing bounds). */
  cropBBox: CardRect
  /** The detached border, when the file draws one. Round 8 painted a gradient
   *  ring on the silhouette (clipped, width 48); the 2026-10-29 re-export
   *  REPLACED IT with the stats contrast plate, so the owner's current file
   *  declares NO border at all and this is undefined. Both surfaces skip the
   *  border layer entirely in that case. */
  borderStroke?: CardBorderStroke
  /** The STATS CONTRAST PLATE behind the six stat columns
   *  (tier-color-plate-stats), painted over the photo so the stat text reads
   *  against any screenshot. Its geometry + fade are the file's; its color is
   *  the TIER's (owner 2026-10-29). Absent in the round-8 file (its stats sat
   *  on the solid plate) and in the first re-export; present in the current
   *  file. */
  statsPlate?: CardStatsPlate
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
  /** Optional PLATE gradient (owner checkpoint round 10): the pristine top
   *  tier paints the same rainbow as its border across the shield itself.
   *  `plateFill` stays the solid fallback/base for every other tier. */
  plateStops?: { offset: number; color: string }[]
  borderStops: { offset: number; color: string }[]
  textFill: string
}

/** The prismatic plate gradient line (design space, 1080×1600): the same
 *  120°-ish diagonal feel as the UI's tier-impecavel-border. */
export const CARD_PLATE_GRADIENT_LINE = { x1: 0, y1: 0, x2: 1080, y2: 1600 } as const

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
    // (linear-gradient(120deg, #f26d6f, #e9b44c, #3fb950, #58a6ff, #b8c0cc)):
    // the plate mirrors the ring, and the ring mirrors the UI.
    plateStops: [
      { offset: 0, color: '#f26d6f' },
      { offset: 0.25, color: '#e9b44c' },
      { offset: 0.5, color: '#3fb950' },
      { offset: 0.75, color: '#58a6ff' },
      { offset: 1, color: '#b8c0cc' },
    ],
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
// Card text contrast (owner checkpoint round 10): white-on-plate fails once
// the plate carries the light rainbow. Same palette, same decision on both
// surfaces — the plan stores the RESOLVED fill so the SVG and the PNG export
// can never disagree.

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`card palette: expected #rrggbb, got "${hex}"`)
  const n = Number.parseInt(m[1], 16)
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  )
}

/** WCAG contrast ratio between two #rrggbb colors. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Resolves the card text fill: keep the palette's choice when it holds
 *  WCAG AA (4.5:1) on EVERY plate color; otherwise switch to black when
 *  black reads better than the light fill. Metals keep their dark brown —
 *  the rule only rescues light text that the plate can no longer carry. */
export function resolveCardTextFill(palette: TierPalette): string {
  const backgrounds = palette.plateStops?.map((s) => s.color) ?? [palette.plateFill]
  const worst = (fill: string): number =>
    Math.min(...backgrounds.map((bg) => contrastRatio(fill, bg)))
  if (worst(palette.textFill) >= 4.5) return palette.textFill
  return worst('#000000') > worst(palette.textFill) ? '#000000' : palette.textFill
}

// ---------------------------------------------------------------------------
// Parsing (pure string work — card.svg is a tiny, hand-verified file).

function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const m of tag.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) attrs.set(m[1], m[2])
  return attrs
}

/** class → font-size from the file's <style> block, when the file HAS one
 *  (the retired round-8 shape). The 2026-10-29 re-export carries no <style>:
 *  every text states its own font-size inline, so this map is simply empty
 *  and the inline sizes win — the parser never throws for a missing block. */
function styleFontSizes(svg: string): Map<string, number> {
  const map = new Map<string, number>
  const style = svg.match(/<style>([\s\S]*?)<\/style>/)
  if (!style) return map
  for (const m of style[1].matchAll(/\.(\w[\w-]*)\{([^}]*)\}/g)) {
    const size = m[2].match(/font-size:(\d+(?:\.\d+)?)/)
    if (size) map.set(m[1], Number(size[1]))
  }
  return map
}

/** A text slot's own font-size: the INLINE font-size attribute (re-export),
 *  else the size its <style> class declares (round-8 file). */
function ownFontSize(attrs: Map<string, string>, sizes: Map<string, number>): number {
  const inline = attrs.get('font-size')?.match(/^([\d.]+)/)
  if (inline) return Number(inline[1])
  const cls = attrs.get('class')
  const styled = cls === undefined ? undefined : sizes.get(cls)
  if (styled !== undefined) return styled
  throw new Error(`card.svg: a text slot has no font-size (inline attribute nor <style> class ${cls ?? ''})`)
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
  /** Ordinal position in the document — the ONLY stable identity across the
   *  two parses (the whole file's <text> list and the per-group lists), since
   *  ids and classes drift per export and object identity is per-parse. */
  index: number
  /** The slot's own font-size (inline attribute or <style> class). */
  size: number
  /** Font family (lowercased) — the OVR/job/stat slots are Bebas Neue and
   *  ONLY the player name is Orbitron, which is how the name is identified
   *  in a class-less export. */
  family: string
  id: string | undefined
  x: number
  y: number
  scale: number
}

/** A document-order index for every <text>, so group membership can be
 *  checked across independently parsed lists. */
function textIndexes(svg: string): Map<string, number> {
  const indexes = new Map<string, number>()
  let ordinal = 0
  for (const m of svg.matchAll(/<text\b([^>]*)>/g)) {
    indexes.set(m[1], ordinal)
    ordinal += 1
  }
  return indexes
}

function readText(
  attrsText: string,
  sizes: Map<string, number>,
  indexes: Map<string, number>,
): RawText {
  const attrs = attributes(attrsText)
  const { x, y, scale } = matrixTransform(attrs.get('transform'))
  return {
    index: indexes.get(attrsText) ?? -1,
    size: ownFontSize(attrs, sizes),
    family: (attrs.get('font-family') ?? '').toLowerCase(),
    id: attrs.get('id'),
    x,
    y,
    scale,
  }
}

/** Every <text> in document order with its resolved size, family, transform. */
function textSlots(svg: string, sizes: Map<string, number>): RawText[] {
  const indexes = textIndexes(svg)
  const texts: RawText[] = []
  for (const m of svg.matchAll(/<text\b([^>]*)>/g)) {
    texts.push(readText(m[1], sizes, indexes))
  }
  return texts
}

function slotOf(t: RawText): CardTextSlot {
  return { x: t.x, y: t.y, size: t.size * t.scale }
}

/** The plate path: the recolorable fill layer. The owner's current names it
 *  `id="tier-color-plate"` (the tier-color contract); the first re-export used
 *  `id="base-plate"` and the round-8 file `class="cls-1"`. Id wins. */
function pickPlatePath(svg: string): string {
  for (const id of ['tier-color-plate', 'base-plate']) {
    for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
      const attrs = attributes(m[1])
      if (attrs.get('id') === id && attrs.get('d')) return attrs.get('d') as string
    }
  }
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    if (attrs.get('class') === 'cls-1' && attrs.get('d')) return attrs.get('d') as string
  }
  throw new Error('card.svg: no plate path found (id="tier-color-plate" / "base-plate" / class="cls-1")')
}

/** The PHOTO AREA. The round-8 file drew it as `id="crop-path"` (the top
 *  portion of the shield); the 2026-10-29 re-export dropped it, and the owner
 *  decided the photo then occupies THE WHOLE SHIELD — so the crop path falls
 *  back to the plate silhouette (the plate fill stays behind as the no-photo
 *  fallback, exactly as before). */
function pickCropPath(svg: string): string {
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    if (attrs.get('id') === 'crop-path' && attrs.get('d')) return attrs.get('d') as string
  }
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    if (attrs.get('class') === 'cls-2' && attrs.get('d')) return attrs.get('d') as string
  }
  return pickPlatePath(svg)
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
/** The border layer. TWO shapes:
 *   A) 2026-10-29 re-export — <path id="plate-border"> with its own
 *      stroke-width, stroking the plate silhouette, no gradient and no clip.
 *   B) round-8 file — .cls-3{stroke:url(#gradient);stroke-width:48} on the
 *      path inside <g id="border-over">, clipped by clipPath#clip-path-1.
 *  Either way only the GEOMETRY is taken (stroke path + width, plus the line
 *  and clip when the file declares them); the COLORS come from the tier
 *  palette — the file's placeholder colors never reach the render. */
/** The STATS CONTRAST PLATE: `<path id="tier-color-plate-stats" fill="url(#g)">`
 *  plus that gradient's userSpaceOnUse LINE and the fade structure (offsets +
 *  opacities). Returns undefined when the file has no such layer (the round-8
 *  files and the first re-export). Colors are NOT read — the tier drives them. */
function statsPlate(svg: string): CardStatsPlate | undefined {
  const platePath = [...svg.matchAll(/<path\b([^>]*)>/g)]
    .map((m) => attributes(m[1]))
    // The owner's current name; `plate-stats` is the earlier spelling.
    .find((a) => a.get('id') === 'tier-color-plate-stats' && a.get('d'))
    ?? [...svg.matchAll(/<path\b([^>]*)>/g)]
      .map((m) => attributes(m[1]))
      .find((a) => a.get('id') === 'plate-stats' && a.get('d'))
  if (!platePath) return undefined
  const ref = platePath.get('fill')?.match(/url\(#([^)]+)\)/)
  if (!ref) throw new Error('card.svg: the stats plate must fill with url(#gradient)')
  const grad = svg.match(new RegExp('<linearGradient\\b[^>]*id="' + ref[1] + '"[^>]*>[\\s\\S]*?</linearGradient>'))
  if (!grad) throw new Error(`card.svg: stats plate gradient "${ref[1]}" not found`)
  const attrs = attributes(grad[0])
  if (!attrs.get('x1') || !attrs.get('x2') || !attrs.get('y1') || !attrs.get('y2')) {
    throw new Error(`card.svg: stats plate gradient "${ref[1]}" needs a userSpaceOnUse line`)
  }
  const fades = [...grad[0].matchAll(/<stop\b([^>]*)\/>/g)].map((s) => {
    const a = attributes(s[1])
    const offset = Number(a.get('offset'))
    if (Number.isNaN(offset)) {
      throw new Error(`card.svg: stats plate gradient "${ref[1]}" has a stop with no offset`)
    }
    const opacity = a.get('stop-opacity')
    return { offset, opacity: opacity === undefined ? 1 : Number(opacity) }
  })
  if (fades.length < 2) {
    throw new Error(`card.svg: stats plate gradient "${ref[1]}" needs at least two stops`)
  }
  return {
    path: platePath.get('d') as string,
    line: {
      x1: Number(attrs.get('x1')),
      y1: Number(attrs.get('y1')),
      x2: Number(attrs.get('x2')),
      y2: Number(attrs.get('y2')),
    },
    fades,
  }
}

/** The detached border layer, when the file draws one. Returns undefined for
 *  the owner's 2026-10-29 file, which replaced it with the stats plate. */
function borderStroke(svg: string): CardBorderStroke | undefined {
  const byId = [...svg.matchAll(/<path\b([^>]*)>/g)]
    .map((m) => attributes(m[1]))
    .find((a) => a.get('id') === 'plate-border' && a.get('d'))
  if (byId) {
    const width = byId.get('stroke-width')?.match(/^([\d.]+)/)
    if (!width) throw new Error('card.svg: plate-border must declare a stroke-width')
    return {
      width: Number(width[1]),
      strokePath: byId.get('d') as string,
      // No gradient line and no clip in this export: the renderers paint a
      // solid per-tier ring, unclipped, exactly as the file draws it.
    }
  }

  const cls3 = svg.match(/\.cls-3\{([^}]*)\}/)
  if (!cls3) return undefined
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

/** The six SEMANTIC stat groups <g id="KEY1">…<g id="KEY6"> with their text
 *  slots. Roles resolve from the group's STRUCTURE, never exact id strings
 *  (the file drifts per export: LABEL / LABEL-2 / KEYLABEL, RATING-2 +
 *  data-name, STAT-3 + data-name, and the class-less re-export has none at
 *  all): inside each group the BIGGEST font-size is the RATING/points, and
 *  of the two remaining texts the SMALLER y is the LABEL (above the rating)
 *  and the LARGER y the STAT/value line — the file's
 *  label-above-rating-above-value order, derived on every parse. */
function keyGroups(svg: string, sizes: Map<string, number>): { id: string; texts: RawText[] }[] {
  const groups: { id: string; texts: RawText[] }[] = []
  const indexes = textIndexes(svg)
  for (const m of svg.matchAll(/<g id="(KEY\d+)"[^>]*>([\s\S]*?)<\/g>/g)) {
    const texts: RawText[] = []
    for (const t of m[2].matchAll(/<text\b([^>]*)>/g)) {
      texts.push(readText(t[1], sizes, indexes))
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

/** Every <text> inside the first matching group tag, parsed as RawText. */
function groupTexts(svg: string, marker: RegExp, sizes: Map<string, number>): RawText[] {
  const group = svg.match(marker)
  if (!group) throw new Error('card.svg: no <g id="OVR"> group (the OVR number + job line)')
  const indexes = textIndexes(svg)
  return [...group[1].matchAll(/<text\b([^>]*)>/g)].map((t) => readText(t[1], sizes, indexes))
}

function parseCard(svg: string): CardGeometry {
  const sizes = styleFontSizes(svg)
  const texts = textSlots(svg, sizes)

  // --- <g id="OVR">: the big number + the job line under it ---------------
  const ovrTexts = groupTexts(svg, /<g id="OVR"[^>]*>([\s\S]*?)<\/g>/, sizes)
  if (ovrTexts.length !== 2) {
    throw new Error(`card.svg: the OVR group must hold exactly 2 texts (number + job), found ${ovrTexts.length}`)
  }
  // The BIGGEST is the OVR number, the other the job line — the file's own
  // ratio (148 vs 56), resolved structurally so a size tweak never breaks it.
  const ranked = [...ovrTexts].sort((a, b) => b.size - a.size)
  const ovrRaw = ranked[0]
  const jobRaw = ranked[1]
  if (!(jobRaw.y > ovrRaw.y)) {
    throw new Error('card.svg: the job-class line must sit BELOW the OVR number')
  }
  const ovr = slotOf(ovrRaw)
  const job = slotOf(jobRaw)

  // --- PLAYERNAME: the ORBITRON text (the only one outside a group) -------
  const groups = keyGroups(svg, sizes)
  // Census: EVERY text in the file must belong to a group (OVR or KEY) or be
  // the player name — a stray slot would silently fail to render.
  const grouped = new Set<number>([
    ...groups.flatMap((g) => g.texts.map((t) => t.index)),
    ...ovrTexts.map((t) => t.index),
  ])
  const nameRaw = texts.find((t) => !grouped.has(t.index) && t.family.includes('orbitron'))
  if (!nameRaw) throw new Error('card.svg: no ORBITRON text found for the player name slot')
  const strays = texts.filter((t) => !grouped.has(t.index) && !t.family.includes('orbitron'))
  if (strays.length) {
    throw new Error(
      `card.svg: ${strays.length} text slot(s) sit outside the OVR/KEY groups (indexes ${strays.map((s) => s.index).join(',')})`,
    )
  }
  const name = slotOf(nameRaw)

  // --- THE SIX STAT COLUMNS (semantic groups), ordered left → right -------
  const columns = groups.map((g) => {
    const rating = [...g.texts].sort((a, b) => b.size - a.size)[0]
    const pair = g.texts.filter((t) => t !== rating).sort((a, b) => a.y - b.y)
    if (pair.length !== 2) {
      throw new Error(`card.svg: stat group ${g.id} must hold exactly 2 non-rating slots (label + value)`)
    }
    if (pair[1].y <= pair[0].y) {
      throw new Error(`card.svg: stat group ${g.id} label/value rows must sit at DISTINCT y`)
    }
    return { id: g.id, label: pair[0], rating, value: pair[1] }
  })
  const pointsRaw = columns
    .sort((a, b) => a.rating.x - b.rating.x)
    .map((g) => ({ id: g.id, label: g.label, rating: g.rating, value: g.value }))

  // One size per role across the six columns (the file's 56 / 148): a per-
  // column drift means the export broke the grid, and the render would show
  // mismatched hero numbers — fail loudly instead.
  const pointsSize = pointsRaw[0].rating.size * pointsRaw[0].rating.scale
  const lineSize = pointsRaw[0].label.size * pointsRaw[0].label.scale
  for (const col of pointsRaw) {
    if (Math.abs(col.rating.size * col.rating.scale - pointsSize) > 1) {
      throw new Error(`card.svg: stat group ${col.id} rating font-size drifts from the column grid`)
    }
    if (Math.abs(col.label.size * col.label.scale - lineSize) > 1) {
      throw new Error(`card.svg: stat group ${col.id} label font-size drifts from the column grid`)
    }
    if (col.label.size !== col.value.size) {
      throw new Error(`card.svg: stat group ${col.id} label/value font-sizes must match`)
    }
  }

  // THE COLUMN-CENTER GRID (rounds 7-8, held): the RATING placeholders are the
  // SAME string ('99') in every column, so their left anchors sit at
  // center − width('99')/2 — CONSTANT offset → the rating x's are the column
  // centers' grid, evenly pitched. Lock the even pitch: a future file edit
  // that breaks the grid breaks the central-alignment design.
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
    // Sanity bound (NOT centering): the three anchors are left-anchors of the
    // owner's PLACEHOLDER strings — they may differ from each other
    // (different string widths) but must stay near their column. The COLUMN
    // CENTER is derived downstream (rating anchor + width('99')/2, the
    // owner's own centering of the placeholder — see buildCardPlan).
    const xs = [col.label.x, col.rating.x, col.value.x]
    const span = Math.max(...xs) - Math.min(...xs)
    if (span > 20) throw new Error(`card.svg: stat slot ${col.id} is not column-aligned (span ${span}px)`)
    return {
      label: slotOf(col.label),
      points: slotOf(col.rating),
      value: slotOf(col.value),
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
    statsPlate: statsPlate(svg),
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
  return { x: r.x * s, y: r.y * s, h: r.h * s, w: r.w * s }
}

// ---------------------------------------------------------------------------
// Photo framing (card polish round 8 — owner: "go down further, heads are
// still too close to the border"). ONE shared contract for all three paint
// sites (on-page CardSvg, canvas export, the render-diff harness reference)
// so the framed crop cannot drift between surfaces.
//
// Two image kinds, detected by the measurement:
//   - SUBJECT ART (the per-job full-body class portraits: real alpha
//     margins around the character) gets a MEASURED head-to-thigh frame:
//     the opaque bounds are expanded by a head/side margin, cut at
//     BODY_FRACTION of the figure, then cover-fit so the body FILLS the
//     window — the head lands ~8-12% below the top border and the crop
//     line sits around mid-thigh, balancing the card info below.
//   - OPAQUE SCREENSHOTS (member uploads: fully opaque rectangles, no
//     detectable subject) keep the round-7 head-safe rule unchanged:
//     top-anchored cover-fit (xMidYMin slice / drawImage at the window
//     top) — never vertical-center, never cropping the head.

/** Opaque-subject bounds in IMAGE pixels (round 8 measured via alpha scan). */
export interface PhotoSubjectBounds {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Frame tuning, calibrated against the live 1197×1309 class art (measured
 * 2026-10-25: character tops at 0.4-11.5% of the art height, bottoms at
 * 92-99.3%). Fractions are of the measured FIGURE height (bottom - top).
 */
export const PHOTO_FRAME = {
  /** How much of the figure the frame keeps below the head: 0.58 cuts at
   *  about mid-thigh (the owner's "shot from the thighs and above"). */
  bodyFraction: 0.58,
  /** Breathing room above the subject's topmost opaque pixel. */
  headMargin: 0.1,
  /** Breathing room either side of the figure (of the figure height). */
  sideMargin: 0.05,
  /** Alpha threshold for the opaque scan. */
  alphaThreshold: 40,
  /** Bounds covering >= this fraction of EVERY side mean "no subject"
   *  (a fully opaque screenshot) → round-7 top-anchored cover. */
  opaqueFullBleed: 0.995,
  /** Downscale cap for the alpha scan (speed; a thin 1px tip may fall
   *  below threshold at this scale — acceptable, the framing is a
   *  heuristic by design). */
  measureMaxSide: 256,
} as const

/** Dest rect for painting the WHOLE image so the frame covers `win`.
 *  PURE — the only place this math exists (both surfaces + the harness
 *  call it; the render-diff gate locks them together). */
export function photoDestRect(
  imgW: number,
  imgH: number,
  subject: PhotoSubjectBounds | null,
  win: CardRect,
): CardRect {
  if (imgW <= 0 || imgH <= 0) return { x: win.x, y: win.y, w: win.w, h: win.h }

  if (subject === null) {
    // Screenshot path (round 7): top-anchored cover-fit. Wide images fit
    // by height (anchor is a no-op); tall images lose their legs, never
    // their head.
    const cover = Math.max(win.w / imgW, win.h / imgH)
    return {
      x: win.x + (win.w - imgW * cover) / 2,
      y: win.y,
      w: imgW * cover,
      h: imgH * cover,
    }
  }

  // Subject path (round 8): expand the figure by the margins, cut at the
  // thigh line, clamp to the image, cover-fit into the window.
  const figureH = Math.max(1, subject.bottom - subject.top)
  const head = figureH * PHOTO_FRAME.headMargin
  const side = figureH * PHOTO_FRAME.sideMargin
  const frame = {
    left: Math.max(0, subject.left - side),
    top: Math.max(0, subject.top - head),
    right: Math.min(imgW, subject.right + side),
    bottom: Math.min(
      imgH,
      Math.max(subject.top, subject.top + figureH * PHOTO_FRAME.bodyFraction),
    ),
  }
  const frameW = Math.max(1, frame.right - frame.left)
  const frameH = Math.max(1, frame.bottom - frame.top)

  // Cover: the frame fills the window on BOTH axes; overflow centers, so
  // the SUBJECT stays centered and its head margin survives.
  const scale = Math.max(win.w / frameW, win.h / frameH)
  return {
    x: win.x + (win.w - frameW * scale) / 2 - frame.left * scale,
    y: win.y + (win.h - frameH * scale) / 2 - frame.top * scale,
    w: imgW * scale,
    h: imgH * scale,
  }
}

/**
 * Measure the opaque subject bounds of a loaded image (DOM glue — the
 * canvas scan both surfaces share). Downscaled to PHOTO_FRAME.measureMaxSide
 * on the long side; scans alpha > PHOTO_FRAME.alphaThreshold. Returns null
 * for fully-opaque rectangles (member screenshots — no subject to frame).
 * Never throws: a tainted/failed canvas degrades to the screenshot path.
 */
export function measurePhotoSubject(img: HTMLImageElement): PhotoSubjectBounds | null {
  try {
    const long = Math.max(img.naturalWidth, img.naturalHeight)
    if (long <= 0) return null
    const s = Math.min(1, PHOTO_FRAME.measureMaxSide / long)
    const w = Math.max(1, Math.round(img.naturalWidth * s))
    const h = Math.max(1, Math.round(img.naturalHeight * s))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx === null) return null
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    const t = PHOTO_FRAME.alphaThreshold
    const opaqueAt = (x: number, y: number) => data[(y * w + x) * 4 + 3] > t
    let top = -1
    let bottom = -1
    let left = -1
    let right = -1
    for (let y = 0; y < h && top < 0; y++) {
      for (let x = 0; x < w; x++) {
        if (opaqueAt(x, y)) { top = y; break }
      }
    }
    if (top < 0) return null
    for (let y = h - 1; y >= 0 && bottom < 0; y--) {
      for (let x = 0; x < w; x++) {
        if (opaqueAt(x, y)) { bottom = y; break }
      }
    }
    for (let x = 0; x < w && left < 0; x++) {
      for (let y = 0; y < h; y++) {
        if (opaqueAt(x, y)) { left = x; break }
      }
    }
    for (let x = w - 1; x >= 0 && right < 0; x--) {
      for (let y = 0; y < h; y++) {
        if (opaqueAt(x, y)) { right = x; break }
      }
    }
    const f = PHOTO_FRAME.opaqueFullBleed
    const fullBleed =
      top <= h * (1 - f) &&
      bottom >= h * f &&
      left <= w * (1 - f) &&
      right >= w * f
    if (fullBleed) return null
    // Map the downscaled scan back to image pixels (ceil/floor so the
    // bounds never clip the subject).
    return {
      top: Math.floor(top / s),
      bottom: Math.ceil(bottom / s),
      left: Math.floor(left / s),
      right: Math.ceil(right / s),
    }
  } catch {
    return null
  }
}
