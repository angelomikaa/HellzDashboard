// crestAssets.ts — SINGLE SOURCE OF GEOMETRIC TRUTH for the crest card
// (07.2-05 checkpoint round 3, owner's superseding design: the four hand-
// designed crest SVGs in src/assets/ REPLACE the code-drawn shield frames).
//
// The owner's SVGs (viewBox 0 0 1000 1000) each contain exactly the layers
// the card needs:
//   - a `Plate` path (cls-1) — the filled frame the card is drawn on
//     (bronze #b58c58, silver #cccccc, gold #f9b745; the Impecável/"pristine"
//     crest fills with the Soft_Spectrum linearGradient instead)
//   - a photo-crop path (cls-2 — the member's character screenshot is CLIPPED
//     into it; ids vary per file: "Photo-crop-path" / "Image-crop" /
//     "Photo-clip-path" / "photo-crop", so access goes through the selector
//     map below, never a hardcoded id)
//   - a `Guidelines` group with 4 explicit placement rects (as fill:none
//     paths): Content-safezone, OVR-number, Name-and-job, six-key-stats —
//     the owner's "fake rectangle" contract: the code treats the card as a
//     rectangle laid over the decorated crest frame, and EVERY content
//     placement reads these rects.
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
import bronzeRaw from '../../assets/bronze-crest.svg?raw'
import silverRaw from '../../assets/silver-crest.svg?raw'
import goldRaw from '../../assets/gold-crest.svg?raw'
import pristineRaw from '../../assets/pristine-crest.svg?raw'

// ---------------------------------------------------------------------------
// Parsed geometry contract.

/** The SVGs' viewBox — the card design space (square, 1000×1000). */
export const CREST_DESIGN_SIZE = 1000

export interface CrestRect {
  x: number
  y: number
  w: number
  h: number
}

export interface CrestPlateSolid {
  kind: 'solid'
  hex: string
}

export interface CrestPlateGradient {
  kind: 'gradient'
  /** Gradient line in the SAME design space (userSpaceOnUse). */
  x1: number
  y1: number
  x2: number
  y2: number
  stops: { offset: number; color: string }[]
}

export type CrestPlateFill = CrestPlateSolid | CrestPlateGradient

export interface CrestGuides {
  contentSafezone: CrestRect
  ovrNumber: CrestRect
  nameAndJob: CrestRect
  sixKeyStats: CrestRect
}

export interface CrestGeometry {
  tier: Tier
  platePath: string
  plateFill: CrestPlateFill
  /** The member's character screenshot is clipped into this path. */
  photoCropPath: string
  /** Optional decorative stroke ON the photo window (the owner's updated
   *  pristine crest strokes the crop with #e6e6e6 @ 20 — clipped to the
   *  crop path, so only the inner half shows). Parsed from the cls-2 style
   *  block; both surfaces render it for design fidelity. */
  photoCropStroke: { color: string; width: number } | null
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
 * Photo-crop selector map: the four files name their crop layer differently
 * ("Photo-crop-path" / "Image-crop" / "Photo-clip-path" / "photo-crop") —
 * access NEVER hardcodes one id.
 */
const PHOTO_CROP_IDS = ['Photo-crop-path', 'Image-crop', 'Photo-clip-path', 'photo-crop']

function pickPhotoCrop(paths: Map<string, string>, svg: string): string {
  for (const id of PHOTO_CROP_IDS) {
    const d = paths.get(id)
    if (d) return d
  }
  // The updated pristine crest carries the crop path WITHOUT an id, inside
  // a `<g id="photo-crop">` group — fall back to the group's first path.
  const group = svg.match(/<g\b[^>]*id="photo-crop"[^>]*>[\s\S]*?<path\b[^>]*\bd="([^"]+)"/)
  if (group) return group[1]
  throw new Error(`crest SVG: no photo-crop path found (tried ids: ${PHOTO_CROP_IDS.join(', ')} + g#photo-crop)`)
}

/** cls-2 is the crop path's class: `{fill:none}` in the metal crests, but
 *  the updated pristine crest strokes the photo window
 *  (`stroke:#e6e6e6;stroke-width:20`) — captured for both surfaces. */
function photoCropStroke(svg: string): { color: string; width: number } | null {
  const cls2 = svg.match(/\.cls-2\{([^}]*)\}/)
  if (!cls2) return null
  const color = cls2[1].match(/stroke:(#[0-9a-fA-F]{6})/)
  const width = cls2[1].match(/stroke-width:(\d+(?:\.\d+)?)/)
  if (color && width) return { color: color[1].toLowerCase(), width: Number(width[1]) }
  return null
}

function pickPlate(paths: Map<string, string>): string {
  for (const [id, d] of paths) if (id.toLowerCase() === 'plate') return d
  throw new Error('crest SVG: no Plate path found')
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
    ovrNumber: need('OVR-number'),
    nameAndJob: need('Name-and-job'),
    sixKeyStats: need('six-key-stats'),
  }
}

function plateFill(svg: string): CrestPlateFill {
  // Solid fill: the cls-1 class carries `fill:#rrggbb` (bronze/silver/gold);
  // trailing declarations (stroke etc.) are tolerated.
  const solid = svg.match(/\.cls-1\{fill:(#[0-9a-fA-F]{6})[^}]*\}/)
  if (solid) return { kind: 'solid', hex: solid[1].toLowerCase() }
  // Gradient fill (pristine): cls-1 references url(#id) — trailing
  // declarations tolerated (the updated crest also strokes the plate).
  const gradRef = svg.match(/\.cls-1\{fill:url\(#([^)]+)\)[^}]*\}/)
  if (gradRef) {
    const gid = gradRef[1]
    const grad = svg.match(new RegExp(`<linearGradient\\b[^>]*id="${gid}"[^>]*>`))
    if (grad) {
      const attrs = attributes(grad[0])
      const stops = [...svg.matchAll(/<stop\b([^>]*)>/g)].map((s) => {
        const a = attributes(s[1])
        return { offset: Number(a.get('offset') ?? '0'), color: (a.get('stop-color') ?? '#000000').toLowerCase() }
      })
      if (stops.length > 0 && attrs.get('x1') && attrs.get('x2')) {
        return {
          kind: 'gradient',
          x1: Number(attrs.get('x1')),
          y1: Number(attrs.get('y1')),
          x2: Number(attrs.get('x2')),
          y2: Number(attrs.get('y2')),
          stops,
        }
      }
    }
  }
  throw new Error('crest SVG: no cls-1 plate fill (solid hex or linearGradient) found')
}

function parseCrest(tier: Tier, svg: string): CrestGeometry {
  const paths = pathMap(svg)
  return {
    tier,
    platePath: pickPlate(paths),
    plateFill: plateFill(svg),
    photoCropPath: pickPhotoCrop(paths, svg),
    photoCropStroke: photoCropStroke(svg),
    guides: guides(paths),
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
// the crest paths are authored in the 1000×1000 design space; the on-page
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
