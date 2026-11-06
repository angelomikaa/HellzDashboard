// cardAssets.ts — SINGLE SOURCE OF TRUTH for the card design (07.2-05
// checkpoint round 8, owner re-seed: "read card.svg again — actually made
// new alterations. read all layers carefully." → THE FILE IS THE SPEC).
//
// THE FILE: src/assets/card.svg (viewBox 1080×1600 — portrait 27:40), the
// owner's ONE design for every tier. The parser reads the file's LAYERS and
// TEXT SLOTS structurally and tolerates the export shapes the owner has
// shipped (fail-fast when none matches):
//
//   A) CURRENT FILE (owner re-model 2026-11-06 — "remodelado para comportar o
//      clip e os degradês que tínhamos anteriormente"; then the bokeh was
//      dropped: "bokeh is gone, it was not producing the desired effect") —
//      INLINE attributes, no <style>, no classes:
//        <path id="tier-color-plate"> — recolorable backplate, full shield,
//          filled with the tier's plate ramp (the file's Magenta_to_Orange IS
//          the Impecável tier color since 2026-11-05).
//        <g id="mask" clip-path="url(#clip-path-1)"> — THE PHOTO AREA (the
//          shield's top portion, closed at y≈963). It is an empty clip group
//          now; the app paints the member's photo inside it.
//        <g id="tier-color-plate-2" data-name="tier-color-plate"
//          opacity="0.7"> wrapping the silhouette stroked 48px with the tier
//          ramp, clipped by clipPath#clip-path-2 — the translucent border.
//        <path id="stats-plate"> — the stats contrast plate fades in from the
//          photo edge to the shield tip (pink → orange), painted AFTER the
//          border, its colors tinted by the tier.
//        <g id="OVR"> — number + job line; the LAST_UPDATE line (24px,
//          "atualizado • DD-MM") is nested inside it since this re-model.
//        <text ... font-size="…"> per slot, transform="matrix(1 0 0 1 x y)"
//   B) 2026-11-05 re-seed (retired, still parsed) — `id="crop-path"` photo
//      area, `tier-color-border` opacity 0.3 ring, no stats plate.
//   C) 2026-10-29 re-exports (retired) — no crop path (photo = whole shield),
//      a flat stats plate and/or a solid `plate-border` ring.
//   D) round-8 file (retired) — <style> + cls-* classes, crop-path photo area
//      + border-over gradient stroke clipped by clip-path-1.
//
// PAINT ORDER (the file's own): plate → photo (+ scrim) → border →
// stats plate → texts → logo.
//   - Placeholder TEXT slots (Bebas Neue unless noted — family + fill are
//     placeholders; code substitutes). Roles resolve from STRUCTURE, never
//     exact id strings (the ids drift per export: OVR / OVR-2 + data-name,
//     LABEL / LABEL-2 / KEYLABEL…):
//       · <g id="OVR"> holds TWO texts — the BIGGEST is the OVR number, the
//         other is the job-class line under it (current file: 164px at
//         (124.765, 406.853) over a 42px job line at (124.765, 460.263));
//       · the single ORBITRON text outside the OVR/KEY groups is PLAYERNAME
//         (≈72px, (246.626, 1051.454)) — Orbitron ONLY here (round 7);
//       · the LAST_UPDATE group (nested inside OVR since 2026-11-06) holds
//         three 24px texts: "atualizado" · "•" · the live date (rightmost);
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
   *  Parsed from the file's stroke gradient; the COLORS are the tier's own
   *  ramp (owner: the svg's colors ARE the Impecável tier color). A legacy
   *  solid border declares no line (palette fallback). */
  line?: CardGradientLine
  /** Explicit ring stops. The owner's files never carry them (the tier palette
   *  supplies the colors via `borderStops`); the field remains for a future
   *  export that pins its own stops. */
  stops?: { offset: number; color: string }[]
  /** Paint opacity read from the file. 2026-11-06 re-model: the ring is a
   *  TRANSLUCENT tint (`opacity="0.7"` on the group); the tier color is
   *  applied at the file's own opacity on both surfaces. Defaults to 1 when
   *  the file declares none. */
  opacity: number
  /** Stroke width — read from the file (48 in the round-8 file and the
   *  2026-11-06 re-model, 24 in the 2026-10-29 re-exports, 32 in the
   *  2026-11-05 re-seed). */
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

/** One stop of an authored fade: the OFFSET and OPACITY are the file's; the
 *  COLOR is supplied by the tier (the file's colors ARE the Impecável ramp). */
export interface CardFade {
  offset: number
  opacity: number
}

/** A gradient the file paints: its userSpaceOnUse line + the authored fade.
 *  The renderers tint it with the tier's own ramp (owner contract: the
 *  `tier-color-*` naming means the fill follows the tier, and the file's
 *  magenta/orange layers are the Impecável values of that ramp). */
export interface CardGradientPaint {
  /** The file's gradient id (kept so tooling can re-tint the same def). */
  id: string
  line: CardGradientLine
  fades: CardFade[]
}

/** The STATS CONTRAST PLATE (owner 2026-11-06 re-model): the plate behind the
 *  six stat columns, painted OVER the photo edge so the stat text reads
 *  against any screenshot. Its geometry + fade come from the file, its color
 *  from the tier. */
export interface CardStatsPlate extends CardGradientPaint {
  path: string
}

export interface CardGeometry {
  /** The solid plate silhouette (cls-1 path) — full shield. Painted first
   *  on both surfaces; nothing fills outside it (transparent design). */
  platePath: string
  /** Bounding box of the plate path (the name's center derives from its
   *  horizontal midline — see CardGeometry.slots.name). */
  plateBBox: CardRect
  /** The PHOTO AREA path: the screenshot is clipped to this path on BOTH
   *  surfaces. The 2026-11-06 re-model draws it as `<g id="mask"
   *  clip-path="url(#clip-path-1)">` (the group that masks the photo); the
   *  earlier re-seed carried `id="crop-path"`. A file with neither falls back
   *  to the WHOLE SHIELD. */
  cropPath: string
  /** Bounding box of the crop path (cover-fit drawing bounds). */
  cropBBox: CardRect
  /** The detached border, when the file draws one. The 2026-11-06 re-model
   *  wraps a 48px TIER-ramp stroke in `<g id="tier-color-plate-2"
   *  opacity="0.7">`, clipped to the plate silhouette. */
  borderStroke?: CardBorderStroke
  /** The stats contrast plate, when the file draws one (`stats-plate`). */
  statsPlate?: CardStatsPlate
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
    /** The "atualizado • 05-11" line under the OVR block (owner 2026-11-05;
     *  nested inside <g id="OVR"> since the 2026-11-06 re-model). */
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

/** The plate gradient line — the card.svg's own plate ramp line (design space,
 *  1080×1600): a near-vertical ramp from the crest's top point down to the
 *  shield's bottom tip. */
export const CARD_PLATE_GRADIENT_LINE = {
  x1: 540.621,
  y1: 81.129,
  x2: 540.102,
  y2: 1517.645,
} as const

/** The Impecável PLATE ramp — the card.svg's own gradient (owner 2026-11-06:
 *  "a cor base dos cards impecáveis é um degradê vermelho"): near-black to
 *  red. */
export const IMPECAVEL_PLATE_STOPS: { offset: number; color: string }[] = [
  { offset: 0, color: '#1a1a1a' },
  { offset: 1, color: '#ed1c24' },
]

/** The Impecável RING/ACCENT ramp — the file's border + stats-plate gradient:
 *  deep red to bright red. */
export const IMPECAVEL_BORDER_STOPS: { offset: number; color: string }[] = [
  { offset: 0, color: '#990000' },
  { offset: 1, color: '#ed1c24' },
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
  impecavel: {
    plateFill: '#ed1c24',
    // The card.svg's own ramps: the shield fades near-black → red, the ring
    // (and the stats-plate fade) deep red → bright red.
    plateStops: IMPECAVEL_PLATE_STOPS,
    borderStops: IMPECAVEL_BORDER_STOPS,
    textFill: '#ffffff',
  },
}

/** The tier's own ramp for the file's fade layers (the stats plate): the
 *  owner's re-modeled gradients are authored in the Impecável colors, and the
 *  tier rule ("as cores do svg serão a nova cor do tier", and before that
 *  "the fills must follow tier colors") means each tier paints its own ACCENT
 *  ramp at the FILE's offsets/opacities. Impecável therefore renders the file
 *  exactly (#990000 → #ed1c24); the metals render their own metal fade. */
export function tierFadeStops(
  palette: TierPalette,
  fades: CardFade[],
): { offset: number; color: string; opacity: number }[] {
  const ramp = palette.borderStops
  return fades.map((fade) => ({
    offset: fade.offset,
    color: sampleRamp(ramp, fade.offset),
    opacity: fade.opacity,
  }))
}

/** Linear sample of a stop list at `offset` (sRGB lerp). Non-hex colors fall
 *  back to the nearest stop, so a keyword in a future file never yields NaN. */
function sampleRamp(stops: { offset: number; color: string }[], offset: number): string {
  if (stops.length === 0) return '#000000'
  const o = Math.min(1, Math.max(0, offset))
  if (o <= stops[0].offset) return stops[0].color
  const last = stops[stops.length - 1]
  if (o >= last.offset) return last.color
  for (let i = 1; i < stops.length; i += 1) {
    const hi = stops[i]
    const lo = stops[i - 1]
    if (o <= hi.offset) {
      const span = hi.offset - lo.offset
      const t = span <= 0 ? 0 : (o - lo.offset) / span
      return mixHex(lo.color, hi.color, t)
    }
  }
  return last.color
}

function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (ca === null || cb === null) return t < 0.5 ? a : b
  const ch = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t)
  return `#${[ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim()
  const short = hex.match(/^#([0-9a-f]{3})$/i)
  if (short !== null) {
    const [r, g, b] = short[1].split('').map((c) => parseInt(c + c, 16))
    return [r, g, b]
  }
  const long = hex.match(/^#([0-9a-f]{6})$/i)
  if (long === null) return null
  return [
    parseInt(long[1].slice(0, 2), 16),
    parseInt(long[1].slice(2, 4), 16),
    parseInt(long[1].slice(4, 6), 16),
  ]
}

// ---------------------------------------------------------------------------
// Card text fill. OWNER RULING 2026-11-06: "the contrast is probably good now —
// make the text be white". The palette's own `textFill` is authoritative again
// (the round-10 AA flip to black is retired): Impecável renders WHITE stats /
// name / last-update over the ramp + stats plate, while the metals keep the
// dark fill their palettes declare (white on silver/gold would vanish). The
// plan carries it, so the SVG and the PNG can never disagree.


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

/** A `<g>` element with its BALANCED body (nested groups included) — the
 *  owner's exports nest groups (LAST_UPDATE inside OVR, the placeholder image
 *  inside the photo mask, the clip inside the border group), so a regex
 *  cannot pair the tags. */
interface SvgGroup {
  attrs: Map<string, string>
  attrsRaw: string
  body: string
  markup: string
  parent: SvgGroup | null
}

/** Every `<g>` in the document, with balanced nesting resolved. */
function svgGroups(svg: string): SvgGroup[] {
  const groups: SvgGroup[] = []
  const stack: { group: SvgGroup; bodyStart: number }[] = []
  for (const m of svg.matchAll(/<g\b([^>]*)>|<\/g>/g)) {
    if (m[0] === '</g>') {
      const open = stack.pop()
      if (open === undefined) continue
      const closeAt = m.index ?? 0
      open.group.body = svg.slice(open.bodyStart, closeAt)
      open.group.markup = svg.slice(
        open.bodyStart - open.group.attrsRaw.length - 3,
        closeAt + 4,
      )
      groups.push(open.group)
    } else {
      const attrsRaw = m[1]
      stack.push({
        group: {
          attrs: attributes(attrsRaw),
          attrsRaw,
          body: '',
          markup: '',
          parent: stack.length === 0 ? null : stack[stack.length - 1].group,
        },
        bodyStart: (m.index ?? 0) + m[0].length,
      })
    }
  }
  return groups
}

/** The group with the given id (balanced). */
function findGroup(groups: SvgGroup[], id: string): SvgGroup | undefined {
  return groups.find((g) => g.attrs.get('id') === id)
}

/** This group and its ancestors, innermost first. */
function selfAndAncestors(group: SvgGroup): SvgGroup[] {
  const chain: SvgGroup[] = []
  for (let node: SvgGroup | null = group; node !== null; node = node.parent) chain.push(node)
  return chain
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

/** The PHOTO AREA. The 2026-11-06 re-model draws it as the clip of the
 *  `<g id="mask">` photo group (the clip lives on the group or on a nested
 *  group); the 2026-11-05 re-seed carried `id="crop-path"`; the 2026-10-29
 *  re-exports carried none, and the owner then decided the photo occupies THE
 *  WHOLE SHIELD — so a file without a photo clip falls back to the plate
 *  silhouette. The round-8 file used class="cls-2". */
function pickCropPath(svg: string, groups: SvgGroup[]): string {
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    if (attrs.get('id') === 'crop-path' && attrs.get('d')) return attrs.get('d') as string
  }
  // The photo group: `<g id="mask" clip-path="url(#clip-path-1)">` (the clip
  // may also sit on a nested group).
  const mask = findGroup(groups, 'mask')
  if (mask) {
    const clipRef =
      mask.attrs.get('clip-path')?.match(/url\(#([^)]+)\)/)?.[1] ??
      mask.body.match(/clip-path="url\(#([^)]+)\)"/)?.[1]
    if (clipRef !== undefined) {
      const d = clipPathD(svg, clipRef)
      if (d === undefined) throw new Error(`card.svg: the photo clip "${clipRef}" holds no path`)
      return d
    }
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

/** A gradient the file references: its userSpaceOnUse line + the authored
 *  fade (offset + opacity). The COLORS are never read — the tier supplies
 *  them (tierFadeStops / palette.borderStops). */
function gradientPaint(svg: string, id: string): CardGradientPaint {
  const grad = svg.match(
    new RegExp('<linearGradient\\b[^>]*id="' + id + '"[^>]*>[\\s\\S]*?</linearGradient>'),
  )
  if (!grad) throw new Error(`card.svg: gradient "${id}" not found`)
  const attrs = attributes(grad[0].slice(0, grad[0].indexOf('>') + 1))
  const line = {
    x1: Number(attrs.get('x1')),
    y1: Number(attrs.get('y1')),
    x2: Number(attrs.get('x2')),
    y2: Number(attrs.get('y2')),
  }
  if ([line.x1, line.y1, line.x2, line.y2].some((v) => Number.isNaN(v))) {
    throw new Error(`card.svg: gradient "${id}" needs a userSpaceOnUse line`)
  }
  const fades = [...grad[0].matchAll(/<stop\b([^>]*)\/>/g)].map((s) => {
    const a = attributes(s[1])
    const offset = Number(a.get('offset'))
    if (Number.isNaN(offset)) {
      throw new Error(`card.svg: gradient "${id}" has a stop with no offset`)
    }
    const opacity = a.get('stop-opacity')
    return { offset, opacity: opacity === undefined ? 1 : Number(opacity) }
  })
  if (fades.length < 2) {
    throw new Error(`card.svg: gradient "${id}" needs at least two stops`)
  }
  return { id, line, fades }
}

/** The STATS CONTRAST PLATE (`<path id="stats-plate">`, owner 2026-11-06): the
 *  plate behind the six stat columns, painted after the border with the file's
 *  geometry + fade and the tier's colors. */
function statsPlate(svg: string): CardStatsPlate | undefined {
  const plate = [...svg.matchAll(/<path\b([^>]*)>/g)]
    .map((m) => attributes(m[1]))
    .find(
      (a) =>
        ['stats-plate', 'tier-color-plate-stats', 'plate-stats'].includes(a.get('id') ?? '') &&
        a.get('d'),
    )
  if (!plate) return undefined
  const ref = plate.get('fill')?.match(/url\(#([^)]+)\)/)
  if (!ref) throw new Error('card.svg: the stats plate must fill with url(#gradient)')
  return { path: plate.get('d') as string, ...gradientPaint(svg, ref[1]) }
}

/** The detached border layer, when the file draws one. FOUR shapes:
 *   A) 2026-11-06 re-model — `<g id="tier-color-plate-2"
 *      data-name="tier-color-plate" opacity="0.7">` wrapping a nested
 *      clip group around the plate silhouette stroked 48px with the tier-ramp
 *      gradient.
 *   B) 2026-11-05 re-seed — `<g id="tier-color-border" opacity="0.3">`
 *      wrapping the stroked silhouette (stroke-width 32).
 *   C) 2026-10-29 re-export — `<path id="plate-border">`: a solid ring.
 *   D) round-8 file — .cls-3{stroke:url(#gradient);stroke-width:48} inside
 *      <g id="border-over">.
 *  Either way only the GEOMETRY (+ the layer's opacity) is taken; the COLORS
 *  come from the tier palette — the file's colors never reach the render. */
function borderStroke(svg: string, groups: SvgGroup[]): CardBorderStroke | undefined {
  // A/B) the owner's group layers: the innermost group wrapping a stroked
  // (fill:none) path is the ring — the ids drift per export
  // (tier-color-border, tier-color-plate-2), the clip may live on a nested
  // group and the opacity on an ancestor.
  const ringGroup = groups.find((group) => {
    const inner = group.body.match(/<path\b([^>]*)>/)
    if (!inner) return false
    const attrs = attributes(inner[1])
    return (
      attrs.get('fill') === 'none' &&
      attrs.get('stroke') !== undefined &&
      attrs.get('stroke-width') !== undefined
    )
  })
  if (ringGroup !== undefined) {
    const attrs = attributes(ringGroup.body.match(/<path\b([^>]*)>/)?.[1] ?? '')
    const width = attrs.get('stroke-width')?.match(/^([\d.]+)/)
    if (!width) throw new Error('card.svg: the border path must declare a stroke-width')
    const d = attrs.get('d')
    if (!d) throw new Error('card.svg: the border path must declare a d')
    const clipRef =
      attrs.get('clip-path')?.match(/url\(#([^)]+)\)/)?.[1] ??
      selfAndAncestors(ringGroup)
        .map((g) => g.attrs.get('clip-path')?.match(/url\(#([^)]+)\)/)?.[1])
        .find((v) => v !== undefined)
    const clipD = clipRef === undefined ? undefined : clipPathD(svg, clipRef)
    if (clipRef !== undefined && clipD === undefined) {
      throw new Error(`card.svg: clipPath "${clipRef}" must contain the silhouette <path d>`)
    }
    // The group's opacity (and any wrapping group's) — the file's own value.
    let opacity = 1
    for (const node of selfAndAncestors(ringGroup)) {
      const raw = node.attrs.get('opacity')
      if (raw === undefined) continue
      const value = Number(raw)
      if (Number.isNaN(value)) {
        throw new Error(`card.svg: the border group declares an unparseable opacity "${raw}"`)
      }
      opacity *= value
    }
    // The stroke gradient's LINE is the file's; the COLORS stay tier-driven.
    const strokeRef = attrs.get('stroke')?.match(/url\(#([^)]+)\)/)?.[1]
    const line = strokeRef === undefined ? undefined : gradientPaint(svg, strokeRef).line
    return {
      width: Number(width[1]),
      strokePath: d,
      opacity: Math.min(1, Math.max(0, opacity)),
      clipPath: clipD,
      line,
    }
  }

  // C) a bare path layer (the 2026-10-29 solid ring).
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

  // D) the retired round-8 cls-3 gradient ring.
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
function cardLogo(svg: string, groups: SvgGroup[]): CardLogo | undefined {
  const group = findGroup(groups, 'logo-hellz')
  if (group === undefined) return undefined
  const markup = group.markup.replace(/\s+/g, ' ')
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
  groups: SvgGroup[],
): { value: CardLastUpdate; indexes: number[] } | undefined {
  const group = findGroup(groups, 'LAST_UPDATE')
  if (group === undefined) return undefined
  const indexes = textIndexes(svg)
  const texts: (CardTextSlot & { text: string; index: number })[] = []
  for (const m of group.body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
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
  if (texts.length < 1) {
    throw new Error('card.svg: the LAST_UPDATE group must hold at least the date text')
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
      // The suffix is OPTIONAL: the 2026-11-06c export carries the date alone
      // ("05-11"), earlier ones added "• atualizado" as separate texts.
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

function parseCard(svg: string): CardGeometry {
  const sizes = styleFontSizes(svg)
  const texts = textSlots(svg, sizes)
  // ONE balanced parse of the document feeds every group-based layer (the
  // owner's exports nest groups, so a regex cannot pair the tags).
  const svgNodes = svgGroups(svg)

  // The LAST_UPDATE line is parsed FIRST: since the 2026-11-06 re-model it is
  // nested INSIDE <g id="OVR">, so the OVR group's DIRECT texts are read with
  // the nested groups stripped (balanced groups keep the pairing honest).
  const lastUpdateGroup = lastUpdate(svg, sizes, svgNodes)
  const ovrGroup = findGroup(svgNodes, 'OVR')
  if (ovrGroup === undefined) {
    throw new Error('card.svg: no <g id="OVR"> group (the OVR number + job line)')
  }
  const ovrDirectBody = ovrGroup.body.replace(/<g\b[^>]*>[\s\S]*?<\/g>/g, '')

  // --- <g id="OVR">: the big number + the job line under it ---------------
  const ovrIndexes = textIndexes(svg)
  const ovrTexts = [...ovrDirectBody.matchAll(/<text\b([^>]*)>/g)].map((t) =>
    readText(t[1], sizes, ovrIndexes),
  )
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
  const statGroups = keyGroups(svg, sizes)
  // Census: EVERY text in the file must belong to a group (OVR, KEY,
  // LAST_UPDATE) or be the player name — a stray slot would silently fail to
  // render.
  const grouped = new Set<number>([
    ...statGroups.flatMap((g) => g.texts.map((t) => t.index)),
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
  const columns = statGroups.map((g) => {
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
  const cropPath = pickCropPath(svg, svgNodes)

  // The LAST_UPDATE line sits under the OVR block's job line (2026-11-06
  // re-model: nested inside <g id="OVR">, over the photo) and above the player
  // name/stat labels. A re-seed that breaks that order fails loudly instead of
  // stacking text.
  const lastUpdateValue = lastUpdateGroup?.value
  if (lastUpdateValue !== undefined) {
    const date = lastUpdateValue.date
    if (!(date.y > job.y)) {
      throw new Error('card.svg: the LAST_UPDATE line must sit BELOW the job line')
    }
    if (!(date.y < name.y)) {
      throw new Error('card.svg: the LAST_UPDATE line must sit ABOVE the player name')
    }
  }

  return {
    platePath,
    plateBBox: pathBBox(platePath, 'base-plate'),
    cropPath,
    cropBBox: pathBBox(cropPath, 'crop-path'),
    borderStroke: borderStroke(svg, svgNodes),
    statsPlate: statsPlate(svg),
    logo: cardLogo(svg, svgNodes),
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
