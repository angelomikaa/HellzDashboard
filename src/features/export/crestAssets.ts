// crestAssets.ts — SINGLE SOURCE OF GEOMETRIC TRUTH for the crest card
// (07.2-05 checkpoint round 4, owner's READABILITY REDESIGN: the four crest
// SVGs re-exported at 1080×1600 — portrait 27:40 — with a clearer content
// layout; the round-3 verdict was "all the info was small and unreadable").
//
// ROUND-4 FILE STRUCTURE (verified identical geometry in all four files —
// only the palette differs; files are referenced by TIER FILENAME
// bronze/silver/gold/pristine.svg — the root group is id="Pristine" in ALL
// FOUR, a copy-paste artifact the parser must NEVER rely on):
//   - Plate: an unnamed group with TWO paths sharing the SAME silhouette d:
//       · cls-1 — the solid tier fill (bronze #d1a972, silver #e6e6e6,
//         gold #f9b745, pristine/Impecável #cf1a87)
//       · cls-2 — the decorative border: the same path, stroked with
//         stroke:url(#<tier gradient>) stroke-width:40, clipped by
//         clipPath#clip-path-1 (which contains that same silhouette) so
//         only the inner half of the stroke shows
//   - NO separate photo-crop path anymore: the member's screenshot fills
//     the Content-safezone rect itself.
//   - Guidelines group — 4 rect paths (L→T coordinates):
//       · Content-safezone   (fill:none) — NOW THE PHOTO CROP AREA
//       · Name-only          (cls-1, SOLID tier fill) — name band, overlays
//         the photo and guarantees name contrast on any screenshot
//       · six-key-stats      (cls-1, SOLID tier fill) — bottom stat band,
//         same contrast guarantee
//       · OVR-number-and-job (fill:none) — top-left box over the photo:
//         the big OVR number with the JOB NAME below it (round 4 dropped
//         the "OVR" tag)
//
// This module parses those raw SVGs ONCE at module load (pure string
// parsing — no DOM, so it runs in node/vitest) and exposes a normalized,
// tier-keyed geometry record. Both rendering surfaces consume it:
//   - CrestCard.tsx (on-page <svg>) renders the paths/rects directly
//   - cardExport.ts strokes/fills the SAME path strings on canvas via
//     scalePath — on-page card and downloaded JPEG are identical by
//     construction.
//
// Fail-fast: a missing layer or an unparseable guideline rect throws at
// module load — a malformed design asset must never ship as a silently
// broken card.
import type { Tier } from '../dashboard/presentation'
import bronzeRaw from '../../assets/bronze.svg?raw'
import silverRaw from '../../assets/silver.svg?raw'
import goldRaw from '../../assets/gold.svg?raw'
import pristineRaw from '../../assets/pristine.svg?raw'

// ---------------------------------------------------------------------------
// Parsed geometry contract.

/** The SVGs' viewBox — the card design space is now PORTRAIT 1080×1600
 *  (27:40, not exactly 2:3 — do not "simplify" the ratio). */
export const CREST_DESIGN_WIDTH = 1080
export const CREST_DESIGN_HEIGHT = 1600

export interface CrestRect {
  x: number
  y: number
  w: number
  h: number
}

/** A linearGradient in the SAME design space (userSpaceOnUse line + stops)
 *  — the border stroke's palette. */
export interface CrestGradient {
  x1: number
  y1: number
  x2: number
  y2: number
  stops: { offset: number; color: string }[]
}

export interface CrestGuides {
  /** The PHOTO CROP AREA: the member's screenshot fills THIS rect
   *  (round 4 retired the dedicated photo-crop path). */
  contentSafezone: CrestRect
  /** Top-left box over the photo: big OVR number + job name below. */
  ovrBox: CrestRect
  /** SOLID tier-fill name band (overlays the photo). */
  nameOnly: CrestRect
  /** SOLID tier-fill stat band (overlays the photo). */
  sixKeyStats: CrestRect
}

export interface CrestGeometry {
  tier: Tier
  platePath: string
  /** Solid tier fill shared by the plate AND the solid guideline bands
   *  (both carry cls-1 in the round-4 files). */
  tierFillHex: string
  /** Decorative border: the tier gradient stroked along the silhouette,
   *  clipped to it (only the inner half shows). Required in every file —
   *  a crest without its border is a malformed asset. */
  borderStroke: { gradient: CrestGradient; width: number }
  guides: CrestGuides
}

// ---------------------------------------------------------------------------
// Parsing (pure string work — the SVGs are tiny, hand-verified files).

function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const m of tag.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) attrs.set(m[1], m[2])
  return attrs
}

function pathMap(svg: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    const id = attrs.get('id')
    const d = attrs.get('d')
    if (id && d) map.set(id, d)
  }
  return map
}

/**
 * The plate path: the FIRST cls-1 path BEFORE the Guidelines group. This
 * deliberately ignores ALL group ids — the round-4 files name their root
 * group "Pristine" in every tier (copy-paste artifact), so ids carry no
 * semantic weight; selection is by class + document position.
 */
function pickPlatePath(svg: string): string {
  const guidelinesAt = svg.indexOf('id="Guidelines"')
  if (guidelinesAt === -1) throw new Error('crest SVG: no Guidelines group found')
  const head = svg.slice(0, guidelinesAt)
  for (const m of head.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = attributes(m[1])
    if (attrs.get('class') === 'cls-1' && attrs.get('d')) return attrs.get('d') as string
  }
  throw new Error('crest SVG: no cls-1 plate path found before the Guidelines group')
}

/** cls-1 is the shared SOLID tier fill: plate + Name-only + six-key-stats
 *  bands all carry it (round-4 contrast design). */
function tierFill(svg: string): string {
  const solid = svg.match(/\.cls-1\{fill:(#[0-9a-fA-F]{6})/)
  if (!solid) throw new Error('crest SVG: cls-1 must be a solid #rrggbb fill (round-4 design: plate and solid bands share it)')
  return solid[1].toLowerCase()
}

/** The border stroke: cls-2 = `stroke:url(#<gradient>) stroke-width:40`,
 *  clipped to the silhouette by clip-path in the file (both surfaces
 *  re-apply that clip themselves). The gradient MUST exist — fail fast. */
function borderStroke(svg: string): { gradient: CrestGradient; width: number } {
  const cls2 = svg.match(/\.cls-2\{([^}]*)\}/)
  if (!cls2) throw new Error('crest SVG: no cls-2 border style found')
  const strokeRef = cls2[1].match(/stroke:url\(#([^)]+)\)/)
  const width = cls2[1].match(/stroke-width:(\d+(?:\.\d+)?)/)
  if (!strokeRef || !width) {
    throw new Error('crest SVG: cls-2 must stroke:url(#gradient) with a stroke-width')
  }
  const grad = svg.match(new RegExp(`<linearGradient\\b[^>]*id="${strokeRef[1]}"[^>]*>([\\s\\S]*?)</linearGradient>`))
  if (!grad) throw new Error(`crest SVG: border gradient "${strokeRef[1]}" not found`)
  const attrs = attributes(grad[0])
  const stops = [...grad[1].matchAll(/<stop\b([^>]*)>/g)].map((s) => {
    const a = attributes(s[1])
    return { offset: Number(a.get('offset') ?? '0'), color: (a.get('stop-color') ?? '#000000').toLowerCase() }
  })
  if (stops.length < 2 || !attrs.get('x1') || !attrs.get('x2')) {
    throw new Error(`crest SVG: border gradient "${strokeRef[1]}" is malformed (needs a userSpaceOnUse line + ≥2 stops)`)
  }
  return {
    gradient: {
      x1: Number(attrs.get('x1')),
      y1: Number(attrs.get('y1')),
      x2: Number(attrs.get('x2')),
      y2: Number(attrs.get('y2')),
      stops,
    },
    width: Number(width[1]),
  }
}

/** Guideline paths are axis-aligned rectangles authored as
 *  `M x y L x y L x y L x y Z` — the bbox of their coordinates IS the rect. */
function guideRect(d: string, id: string): CrestRect {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  if (nums.length < 8) throw new Error(`crest SVG: guideline "${id}" is not a 4-point rect`)
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function guides(paths: Map<string, string>): CrestGuides {
  const need = (id: string): CrestRect => {
    const d = paths.get(id)
    if (!d) throw new Error(`crest SVG: missing guideline rect "${id}"`)
    return guideRect(d, id)
  }
  return {
    contentSafezone: need('Content-safezone'),
    ovrBox: need('OVR-number-and-job'),
    nameOnly: need('Name-only'),
    sixKeyStats: need('six-key-stats'),
  }
}

function parseCrest(tier: Tier, svg: string): CrestGeometry {
  return {
    tier,
    platePath: pickPlatePath(svg),
    tierFillHex: tierFill(svg),
    borderStroke: borderStroke(svg),
    guides: guides(pathMap(svg)),
  }
}

// ---------------------------------------------------------------------------
// Tier → crest mapping. The display vocabulary is tierDisplay's Tier union
// ('platinum' internally = "Impecável" UI name = the owner's "pristine"
// crest file). One crest per tier, keyed by the INTERNAL tier key so every
// consumer maps through the same record.

export const CREST_GEOMETRY: Record<Tier, CrestGeometry> = {
  bronze: parseCrest('bronze', bronzeRaw),
  silver: parseCrest('silver', silverRaw),
  gold: parseCrest('gold', goldRaw),
  platinum: parseCrest('platinum', pristineRaw),
}

// ---------------------------------------------------------------------------
// scalePath — THE CANVAS-MAPPING CONTRACT (kept from checkpoint round 2):
// the crest paths are authored in the 1080×1600 design space; the on-page
// <svg viewBox> maps them to the element for free, but Canvas 2D has no
// viewBox — the JPEG shell MUST transform every path onto the backing store
// itself. Exact for our paths: every crest path uses ONLY absolute M/L/C/Z
// commands (no relative commands, no arcs), so every numeric token is a
// coordinate.
export function scalePath(d: string, s: number): string {
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(parseFloat(n) * s * 1000) / 1000))
}

/** Scale a design-space rect onto a backing store (companion to scalePath). */
export function scaleRect(r: CrestRect, s: number): CrestRect {
  return { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s }
}
