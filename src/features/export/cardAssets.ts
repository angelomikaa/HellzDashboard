// cardAssets.ts — SINGLE SOURCE OF TRUTH for the card design (07.2-05
// checkpoint round 8, owner re-seed: "read card.svg again — actually made
// new alterations. read all layers carefully." → THE FILE IS THE SPEC).
//
// THE FILE: src/assets/card.svg (viewBox 1080×1600 — portrait 27:40), the
// owner's ONE design for every tier. The parser reads the file's LAYERS and
// TEXT SLOTS structurally and tolerates the export shapes the owner has
// shipped (fail-fast when none matches):
//
//   A) CURRENT FILE (owner re-seed 2026-11-05 — "the crop path is back", the
//      border carries opacity, the stats plate is gone) — INLINE attributes,
//      no <style>, no classes:
//        <path id="tier-color-plate"> — recolorable backplate, full shield,
//          painted with the tier's plate ramp (the file's Magenta_to_Orange
//          IS the Impecável tier color since 2026-11-05).
//        <path id="crop-path"> — THE PHOTO AREA IS BACK (the shield's top
//          portion, closed at y≈903); the screenshot is clipped to it.
//        <g id="tier-color-border" opacity="0.3"> wrapping the stroked
//          silhouette (width 32, clipped by clipPath#clip-path-1). The ring
//          is TIER colored at the FILE's opacity — a translucent tier tint,
//          never the file's placeholder stroke.
//        <g id="LAST_UPDATE"> — three hand-placed texts (date · bullet ·
//          "atualizado"); the FIRST segment is the live date, the rest are
//          static labels.
//        NO stats contrast plate: the backplate itself carries the contrast.
//        <text ... font-size="…"> per slot, transform="matrix(1 0 0 1 x y)"
//   B) 2026-10-29 re-exports (retired, still parsed) — no crop path (photo =
//      whole shield), a flat stats contrast plate and/or a solid per-tier
//      `plate-border` ring.
//   C) round-8 file (retired, still parsed) — <style> + cls-* classes,
//      crop-path photo area + border-over gradient stroke clipped by
//      clip-path-1.
//
// PAINT ORDER: plate → photo → scrim → border → texts.
//   - Placeholder TEXT slots (Bebas Neue unless noted — family + fill are
//     placeholders; code substitutes). Roles resolve from STRUCTURE, never
//     exact id strings (the ids drift per export: OVR / OVR-2 + data-name,
//     LABEL / LABEL-2 / KEYLABEL…):
//       · <g id="OVR"> holds TWO texts — the BIGGEST is the OVR number, the
//         other is the job-class line under it (re-export: 148.014px at
//         (136.177, 412.59) over a 56px job line at (136.177, 473.794));
//       · the single ORBITRON text outside the OVR/KEY groups is PLAYERNAME
//         (≈72px, (246.626, 1007.454)) — Orbitron ONLY here (round 7);
//       · the LAST_UPDATE group's first text is the live date (36px); the
//         following texts ("•", "atualizado") keep their parsed anchors;
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
 *  — the border/tier ramp's GEOMETRY (line). Only the geometry is parsed; the
 *  COLORS come from the tier palette (since 2026-11-05 that palette IS the
 *  card.svg's Magenta_to_Orange). */
export interface CardGradientLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CardBorderStroke {
  /** The gradient line (userSpaceOnUse geometry, scaled with everything).
   *  PRESENT for the owner's 2026-11-05 re-seed: the `tier-color-border`
   *  layer is painted with the tier's own ramp, not the file's placeholder
   *  color. A legacy solid border declares no line (palette fallback). */
  line?: CardGradientLine
  /** Gradient stops for the ring. The 2026-11-05 `tier-color-border` carries
   *  the tier's ramp stops (Impecável = the file's Magenta_to_Orange); legacy
   *  borders omit it and fall back to the tier palette's `borderStops`. */
  stops?: { offset: number; color: string }[]
  /** Paint opacity read from the file. Owner 2026-11-05: the border is now a
   *  TRANSLUCENT tint (`opacity="0.3"` on the group) — the tier color is
   *  applied at the file's own opacity on both surfaces. Defaults to 1 when
   *  the file declares none. */
  opacity: number
  /** Stroke width — read from the file (48 in the round-8 file, 24 in the
   *  2026-10-29 re-exports, 32 in the 2026-11-05 re-seed). */
  width: number
  /** The STROKED path — in the owner's files this IS the plate silhouette
   *  (three-layer semantics: the border rings the whole shield). Parsed
   *  separately from the clip so a future re-seed that decouples them stays
   *  faithful to the file. */
  strokePath: string
  /** The border's CLIP path (clipPath#clip-path-1 — the plate silhouette).
   *  The 2026-11-05 file clips the stroke to the plate: its outer half is
   *  cut, the inner half paints over the photo/plate edges (deliberate).
   *  ABSENT in the 2026-10-29 re-export (no clipPath at all) — when
   *  undefined, the stroke paints unclipped, which is what the file shows.
   *  Both surfaces apply the clip only when it exists. */
  clipPath?: string
}

/** The LAST_UPDATE line (owner re-seed 2026-11-05): the date the member's
 *  stats were last updated. The file draws it as three hand-placed texts —
 *  the FIRST is the live date, the rest ("•", "atualizado") are static.
 *  Parsed verbatim so the render keeps the owner's spacing. */
export interface CardLastUpdate {
  /** The live date slot (design space, baseline + effective size). */
  date: CardTextSlot
  /** The static trailing segments, in file order, with their own anchors. */
  suffix: { x: number; y: number; size: number; text: string }[]
}

/** The BRAND MARK the file draws (`<g id="logo-hellz">`, owner 2026-11-05):
 *  vector paths + their gradients, in the card's own design space. Since the
 *  file now carries the mark, the app paints IT — the old additive
 *  hellz-mark.svg overlay is gone (it double-drew the logo). */
export interface CardLogo {
  /** The group markup, verbatim (paths/polygons + their fills). */
  markup: string
  /** The `<linearGradient>` defs the markup references, verbatim. */
  gradients: string
}

export interface CardGeometry {
  /** The solid plate silhouette (cls-1 path) — full shield. Painted first
   *  on both surfaces; nothing fills outside it (transparent design). This is
   *  also the CONTRAST surface behind the stat text since the 2026-11-05
   *  re-seed dropped the dedicated stats plate. */
  platePath: string
  /** Bounding box of the plate path (the name's center derives from its
   *  horizontal midline — see CardGeometry.slots.name). */
  plateBBox: CardRect
  /** The PHOTO AREA path: the screenshot is clipped to this path on BOTH
   *  surfaces. The 2026-11-05 re-seed brought `id="crop-path"` BACK (the
   *  shield's top portion, closed at y≈903); the 2026-10-29 re-exports carried
   *  none, so the photo then fell back to the WHOLE SHIELD. */
  cropPath: string
  /** Bounding box of the crop path (cover-fit drawing bounds). */
  cropBBox: CardRect
  /** The detached border, when the file draws one. The 2026-11-05 re-seed
   *  paints `tier-color-border` (32px, TIER colored) at the group's own
   *  opacity (0.3), clipped to the plate silhouette. */
  borderStroke?: CardBorderStroke
  /** The brand mark the file draws (`logo-hellz`), when present. */
  logo?: CardLogo
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
    /** The "05-11 • atualizado" line under the name (owner 2026-11-05). */
    lastUpdate?: CardLastUpdate
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
// rule: dark on the light metals, black on the Impecável ramp (resolved at
// plan-build). Owner 2026-11-05: the Impecável palette IS the card.svg's own
// Magenta_to_Orange ramp — the file's colors are now the tier's colors.
export interface TierPalette {
  plateFill: string
  /** Optional PLATE gradient: a tier that declares it paints its ramp across
   *  the shield itself (Impecável = Magenta_to_Orange). `plateFill` stays the
   *  solid fallback/base for every other tier. */
  plateStops?: { offset: number; color: string }[]
  borderStops: { offset: number; color: string }[]
  textFill: string
}

/** The plate gradient line — the card.svg's OWN `Magenta_to_Orange` line
 *  (design space, 1080×1600): a near-vertical ramp from the crest's top
 *  point down to the shield's bottom tip. */
export const CARD_PLATE_GRADIENT_LINE = {
  x1: 540.621,
  y1: 81.129,
  x2: 540.102,
  y2: 1517.645,
} as const

/** The Impecável ramp — the card.svg's `Magenta_to_Orange` stops, THE tier
 *  color since the owner's 2026-11-05 ruling ("atualize as cores do tier
 *  platina/impecável para as cores do svg, elas serão a nova cor do tier"). */
export const IMPECAVEL_BORDER_STOPS: { offset: number; color: string }[] = [
  { offset: 0, color: '#ff12f7' },
  { offset: 1, color: '#ed7b00' },
]

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
    plateFill: '#ff12f7',
    // The card.svg's own Magenta_to_Orange ramp: the plate and the (30%
    // opacity) border both paint the file's colors.
    plateStops: IMPECAVEL_BORDER_STOPS,
    borderStops: IMPECAVEL_BORDER_STOPS,
    textFill: '#ffffff',
  },
}

// ---------------------------------------------------------------------------
// Card text contrast (owner checkpoint round 10): white-on-plate fails once
// the plate carries a bright ramp (today: Impecável's Magenta_to_Orange).
// Same palette, same decision on both surfaces — the plan stores the RESOLVED
// fill so the SVG and the PNG export can never disagree.

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

/** The PHOTO AREA. The 2026-11-05 re-seed brought `id="crop-path"` BACK (the
 *  top portion of the shield); the 2026-10-29 re-exports dropped it, and the
 *  owner then decided the photo occupies THE WHOLE SHIELD — so a file without
 *  a crop path falls back to the plate silhouette (the plate fill stays behind
 *  as the no-photo fallback, exactly as before). The round-8 file used
 *  class="cls-2". */
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

/** The `d` of a `<clipPath id="…">`'s first <path>, or undefined. */
function clipPathD(svg: string, id: string): string | undefined {
  const clip = svg.match(new RegExp('<clipPath\\b[^>]*id="' + id + '"[^>]*>[\\s\\S]*?</clipPath>'))
  if (!clip) return undefined
  return clip[0].match(/<path\b[^>]*\bd="([^"]+)"/)?.[1]
}

/** The detached border layer, when the file draws one. THREE shapes:
 *   A) 2026-11-05 re-seed — `<g id="tier-color-border" opacity="0.3">`
 *      wrapping the stroked plate silhouette (stroke-width 32, clipped by
 *      clipPath#clip-path-1). The ring is TIER colored (the palette's ramp)
 *      at the FILE's opacity — a translucent tier tint.
 *   B) 2026-10-29 re-export — `<path id="plate-border">` with its own
 *      stroke-width: a solid per-tier ring, no gradient, no clip.
 *   C) round-8 file — .cls-3{stroke:url(#gradient);stroke-width:48} on the
 *      path inside <g id="border-over">, clipped by clipPath#clip-path-1.
 *  Either way only the GEOMETRY (+ the layer's opacity) is taken; the COLORS
 *  come from the tier palette — the file's placeholder colors never reach the
 *  render. */
function borderStroke(svg: string): CardBorderStroke | undefined {
  // A) the owner's current group layer (opacity lives on the <g>).
  const group = svg.match(/<g\b[^>]*id="(tier-color-border|plate-border)"[^>]*>([\s\S]*?)<\/g>/)
  if (group) {
    const groupAttrs = attributes(group[0].slice(0, group[0].indexOf('>') + 1))
    const inner = group[2].match(/<path\b([^>]*)>/)
    if (!inner) throw new Error('card.svg: the border group must wrap the stroked path')
    const attrs = attributes(inner[1])
    const width = attrs.get('stroke-width')?.match(/^([\d.]+)/)
    if (!width) throw new Error('card.svg: the border path must declare a stroke-width')
    const d = attrs.get('d')
    if (!d) throw new Error('card.svg: the border path must declare a d')
    const clipRef = attrs.get('clip-path')?.match(/url\(#([^)]+)\)/)?.[1]
    const clipD = clipRef === undefined ? undefined : clipPathD(svg, clipRef)
    if (clipRef !== undefined && clipD === undefined) {
      throw new Error(`card.svg: clipPath "${clipRef}" must contain the silhouette <path d>`)
    }
    const rawOpacity = groupAttrs.get('opacity') ?? groupAttrs.get('fill-opacity') ?? '1'
    const opacity = Number(rawOpacity)
    if (Number.isNaN(opacity)) {
      throw new Error(`card.svg: the border group declares an unparseable opacity "${rawOpacity}"`)
    }
    const base = {
      width: Number(width[1]),
      strokePath: d,
      opacity: Math.min(1, Math.max(0, opacity)),
      clipPath: clipD,
    }
    if (group[1] === 'tier-color-border') {
      // Owner 2026-11-05: the file's placeholder `stroke="#1a1a1a"` is NOT the
      // design color — the ring paints the TIER's ramp at the file's opacity.
      return {
        ...base,
        line: CARD_PLATE_GRADIENT_LINE,
        stops: IMPECAVEL_BORDER_STOPS,
      }
    }
    return base
  }

  // B) a bare path layer (the 2026-10-29 solid ring).
  const byId = [...svg.matchAll(/<path\b([^>]*)>/g)]
    .map((m) => attributes(m[1]))
    .find((a) => a.get('id') === 'plate-border' && a.get('d'))
  if (byId) {
    const width = byId.get('stroke-width')?.match(/^([\d.]+)/)
    if (!width) throw new Error('card.svg: the border path must declare a stroke-width')
    return {
      width: Number(width[1]),
      strokePath: byId.get('d') as string,
      opacity: 1,
    }
  }

  // C) the retired round-8 cls-3 gradient ring.
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
  const clipD = clipPathD(svg, clipRef)
  if (!clipD) throw new Error(`card.svg: clipPath "${clipRef}" must contain the silhouette <path d>`)
  return {
    line: {
      x1: Number(attrs.get('x1')),
      y1: Number(attrs.get('y1')),
      x2: Number(attrs.get('x2')),
      y2: Number(attrs.get('y2')),
    },
    width: Number(width[1]),
    opacity: 1,
    strokePath: borderPath.get('d') as string,
    clipPath: clipD,
  }
}

/** The brand mark group, verbatim, plus the gradients it references. Returns
 *  undefined for a file that draws no mark (the retired re-exports). */
function cardLogo(svg: string): CardLogo | undefined {  const group = svg.match(/<g\b[^>]*id="logo-hellz"[^>]*>[\s\S]*?<\/g>/)
  if (!group) return undefined
  const markup = group[0].replace(/\s+/g, ' ')
  const ids = new Set([...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))
  const gradients = [...ids]
    .map((id) => {
      const grad = svg.match(
        new RegExp('<linearGradient\\b[^>]*id="' + id + '"[^>]*>[\\s\\S]*?</linearGradient>'),
      )
      if (!grad) throw new Error(`card.svg: the logo gradient "${id}" is missing`)
      return grad[0]
    })
    .join('')
  return { markup, gradients }
}

/** Scope the logo's gradient ids (one card per page must not collide with the
 *  next — the showcase mounts many). Longest id first so a prefix can never
 *  rewrite a longer id. */
export function scopedLogo(logo: CardLogo, scope: string): CardLogo {
  const ids = [...new Set([...logo.markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))].sort(
    (a, b) => b.length - a.length,
  )
  const rewrite = (source: string): string =>
    ids.reduce(
      (acc, id) => acc.replaceAll(`#${id}`, `#${id}-${scope}`).replaceAll(`id="${id}"`, `id="${id}-${scope}"`),
      source,
    )
  return { markup: rewrite(logo.markup), gradients: rewrite(logo.gradients) }
}

/** The LAST_UPDATE line (owner re-seed 2026-11-05): `<g id="LAST_UPDATE">`
 *  holds the hand-placed texts date · bullet · "atualizado". The FIRST text is
 *  the live date slot; the rest keep their own anchors and literal strings.
 *  Returns undefined when the file carries no such group, plus the document
 *  indexes of its texts so the stray-slot census ignores them. */
function lastUpdate(
  svg: string,
  sizes: Map<string, number>,
): { value: CardLastUpdate; indexes: number[] } | undefined {
  const group = svg.match(/<g\b[^>]*id="LAST_UPDATE"[^>]*>([\s\S]*?)<\/g>/)
  if (!group) return undefined
  const indexes = textIndexes(svg)
  const texts: (CardTextSlot & { text: string; index: number })[] = []
  for (const m of group[1].matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const attrs = attributes(m[1])
    const { x, y, scale } = matrixTransform(attrs.get('transform'))
    const text = m[2]
      .replace(/<[^>]*>/g, '')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .trim()
    texts.push({
      x,
      y,
      size: ownFontSize(attrs, sizes) * scale,
      text,
      index: indexes.get(m[1]) ?? -1,
    })
  }
  if (texts.length < 2) {
    throw new Error('card.svg: the LAST_UPDATE group must hold the date plus its label texts')
  }
  const [date, ...rest] = texts
  for (const segment of rest) {
    if (Math.abs(segment.y - date.y) > 1) {
      throw new Error('card.svg: the LAST_UPDATE segments must share one baseline')
    }
  }
  return {
    value: {
      date: { x: date.x, y: date.y, size: date.size },
      suffix: rest.map((s) => ({ x: s.x, y: s.y, size: s.size, text: s.text })),
    },
    indexes: texts.map((t) => t.index),
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
  // The LAST_UPDATE line (owner 2026-11-05): its texts sit outside the
  // OVR/KEY groups, so they join the census before the stray check.
  const lastUpdateGroup = lastUpdate(svg, sizes)
  // Census: EVERY text in the file must belong to a group (OVR, KEY,
  // LAST_UPDATE) or be the player name — a stray slot would silently fail to
  // render.
  const grouped = new Set<number>([
    ...groups.flatMap((g) => g.texts.map((t) => t.index)),
    ...ovrTexts.map((t) => t.index),
    ...(lastUpdateGroup?.indexes ?? []),
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

  // The LAST_UPDATE line must sit below the name and above the stat labels
  // (the file's own composition): a re-seed that breaks that order fails
  // loudly instead of stacking text.
  const lastUpdateValue = lastUpdateGroup?.value
  if (lastUpdateValue !== undefined) {
    const date = lastUpdateValue.date
    if (!(date.y > name.y)) {
      throw new Error('card.svg: the LAST_UPDATE line must sit BELOW the player name')
    }
    if (!(date.y < stats[0].label.y)) {
      throw new Error('card.svg: the LAST_UPDATE line must sit ABOVE the stat labels')
    }
  }

  return {
    platePath,
    plateBBox: pathBBox(platePath, 'base-plate'),
    cropPath,
    cropBBox: pathBBox(cropPath, 'crop-path'),
    borderStroke: borderStroke(svg),
    logo: cardLogo(svg),
    slots: { ovr, job, name, lastUpdate: lastUpdateValue, stats },
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
  /** How much of the figure the frame keeps below the head. 1.0 keeps the
   *  whole figure: owner 2026-10-30 found the earlier 0.58 (mid-thigh) crop
   *  too zoomed in, so the portrait now shows head to feet. */
  bodyFraction: 1.0,
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

  // Cover: the frame fills the window on BOTH axes. When the framed figure is
  // TALLER than the window (the usual case since the 2026-11-05 crop path is
  // short and wide), anchor the frame's TOP to the window top — the head keeps
  // its margin and only the legs are cropped ("hide the legs, never the head",
  // the round-7 rule). A frame that fits vertically centers as before. The
  // member can then pan/zoom the framing themselves (applyPhotoTransform).
  const scale = Math.max(win.w / frameW, win.h / frameH)
  const drawnFrameH = frameH * scale
  const y =
    drawnFrameH > win.h + 0.5
      ? win.y - frame.top * scale
      : win.y + (win.h - drawnFrameH) / 2 - frame.top * scale
  return {
    x: win.x + (win.w - frameW * scale) / 2 - frame.left * scale,
    y,
    w: imgW * scale,
    h: imgH * scale,
  }
}

/** The member's chosen framing inside the crop path (owner 2026-11-05: "dar
 *  zoom e arrastar a foto como quiser"). Values are NORMALIZED so the same
 *  transform renders identically at every scale:
 *   - `zoom` multiplies the cover fit (>= 1 — the photo always covers the
 *     crop window, never a gap);
 *   - `x` / `y` are the pan in -1..1: ±1 puts the photo's edge exactly on the
 *     window's edge, 0 keeps the cover fit's own anchor. */
export interface CardPhotoTransform {
  zoom: number
  x: number
  y: number
}

export const PHOTO_TRANSFORM_DEFAULT: CardPhotoTransform = { zoom: 1, x: 0, y: 0 }

/** Is this transform a no-op (the cover fit is used verbatim)? */
export function isPhotoTransformDefault(t: CardPhotoTransform | null | undefined): boolean {
  return t === null || t === undefined || (t.zoom === 1 && t.x === 0 && t.y === 0)
}

/**
 * Apply the member's framing to the cover-fit rect. PURE — the on-page card,
 * the crop editor and the canvas export all call it, so the preview is the
 * artifact by construction.
 *
 * The base rect always COVERS `win` (photoDestRect guarantees it). Zoom is
 * applied about the window's center, then the pan slides the image inside its
 * own overflow; because |x|, |y| ≤ 1 the photo keeps covering the window at
 * every position (no empty corners).
 */
export function applyPhotoTransform(
  base: CardRect,
  win: CardRect,
  t: CardPhotoTransform | null | undefined,
): CardRect {
  if (isPhotoTransformDefault(t) || t === null || t === undefined) return base
  const zoom = Math.max(1, t.zoom)
  const w = base.w * zoom
  const h = base.h * zoom
  let x = win.x + (win.w - w) / 2
  let y = win.y + (win.h - h) / 2
  const clamp = (v: number) => Math.min(1, Math.max(-1, v))
  const px = clamp(t.x)
  const py = clamp(t.y)
  // Overflow on each side of the window (>= 0 because the image covers it).
  const left = Math.max(0, win.x - x)
  const right = Math.max(0, x + w - (win.x + win.w))
  const top = Math.max(0, win.y - y)
  const bottom = Math.max(0, y + h - (win.y + win.h))
  x += px >= 0 ? px * left : px * right
  y += py >= 0 ? py * top : py * bottom
  return { x, y, w, h }
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
