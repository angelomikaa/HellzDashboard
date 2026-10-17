// shieldFrame.ts — the tier-parametric SHIELD card frame (07.2-05 checkpoint
// round 2, owner's superseding design decision: rectangular frames are
// replaced by shield-like cards with tier-complexity borders — bronze/silver
// SIMPLE, gold/Impecável ORNATE — inspired by the owner's ornate
// scrollwork-shield reference, drawn entirely in code, never raster frames).
//
// ONE source of geometric truth: every path is authored as an SVG path string
// in a 750×1125 design space (the card's 2:3 base). The on-page card renders
// them in an <svg viewBox="0 0 750 1125">; the JPEG export strokes the exact
// same strings via new Path2D(d) — so both surfaces are pixel-identical by
// construction, and tier variants are parametric (same generator, complexity
// knob set by tier).
//
// Shared palette single-source: the tier hexes + Impecável rainbow live here
// so the canvas and the on-page SVG can never drift apart.
import type { Tier } from '../dashboard/presentation'

// ---------------------------------------------------------------------------
// Tier → hex, mirroring the @theme tokens (src/index.css --color-tier-*).
export const TIER_HEX: Record<Tier, string> = {
  bronze: '#C97F3F',
  silver: '#B8C0CC',
  gold: '#E9B44C',
  platinum: '#D7E3F0',
}

/** The Impecável rainbow (tier-impecavel-border palette) for frame strokes. */
export const PLATINUM_RAINBOW = ['#F26D6F', '#E9B44C', '#3FB950', '#58A6FF', '#B8C0CC'] as const

// Canvas/SVG shared neutrals (same values as the @theme tokens).
export const SHIELD_NEUTRALS = {
  dominant: '#141414',
  surface: '#1E1E1E',
  line: '#3D2A2B',
  content: '#F0EDED',
  muted: '#9A8F8F',
} as const

// ---------------------------------------------------------------------------
// Shield geometry, authored in the 750×1125 design space.
//
// Silhouette: classic heater shield — gently rounded top corners, straight
// flanks through the content zone, then a smooth taper to a rounded bottom
// point. The taper starts at y=620 (BELOW the stat grid's first two rows) and
// the bottom point lands at y≈1100, so the composition's safe area
// (x ≈ 115..635, y ≈ 70..900, mark at y ≈ 980 where the inner outline still
// spans ~±115px) never clips — verified against the taper's Bézier bounds.
//
// Content safe area (kept clear by the composition in cardExport.ts /
// PromotionCard.tsx): the stat grid spans x 115..620 and ends by y ≈ 865;
// only the centered Hellz mark lives below, inside the taper.

/** Outer silhouette — the shield's edge (bold stroke, tier/rainbow colored). */
const OUTER =
  'M 96 30 L 654 30 C 702 30 720 50 720 98 L 720 620 ' +
  'C 720 850 566 1030 375 1108 C 184 1030 30 850 30 620 L 30 98 C 30 50 48 30 96 30 Z'

/** First inner outline — inset ~22px, thinner, lower emphasis. */
const INNER =
  'M 112 52 L 638 52 C 678 52 698 72 698 114 L 698 620 ' +
  'C 698 834 560 1002 375 1078 C 190 1002 52 834 52 620 L 52 114 C 52 72 72 52 112 52 Z'

/** Second inner outline — ORNATE tiers only: the double-outline scrollwork
 *  register from the owner's reference, framing the content zone. */
const INNER_2 =
  'M 126 72 L 624 72 C 656 72 674 90 674 126 L 674 620 ' +
  'C 674 818 552 976 375 1046 C 198 976 76 818 76 620 L 76 126 C 76 90 94 72 126 72 Z'

/** Filled diamond stud centered at (cx, cy) with radius r — the ornate
 *  border's rivet/stud language (sits in the band between the outlines). */
function stud(cx: number, cy: number, r: number): string {
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`
}

/** Top-center flourish for ornate tiers: a diamond trio with flanking
 *  chevrons — restrained scrollwork hint, symmetric about x=375. */
const FLOURISH_TOP =
  stud(375, 96, 10) +
  ' ' +
  stud(337, 96, 5) +
  ' ' +
  stud(413, 96, 5) +
  ' ' +
  'M 292 118 L 355 104 M 458 118 L 395 104'

/** Border studs for ornate tiers: 3 along the top band + 2 on each flank —
 *  the band midpoints of the outer/inner outlines. */
const STUDS_ORNATE =
  stud(375, 41, 6) +
  ' ' +
  stud(213, 41, 6) +
  ' ' +
  stud(537, 41, 6) +
  ' ' +
  stud(41, 330, 6) +
  ' ' +
  stud(709, 330, 6) +
  ' ' +
  stud(41, 470, 6) +
  ' ' +
  stud(709, 470, 6)

export interface ShieldFrame {
  /** Outer silhouette — bold stroke (tier hex, or the rainbow gradient). */
  outer: string
  /** Inner outline — thin stroke, tier hex at reduced emphasis. */
  inner: string
  /** ORNATE tiers only: second inner outline (thin, faint). */
  inner2: string | null
  /** Filled ornaments (studs/flourish diamonds), fill = ornament color. */
  fills: string[]
  /** Stroked ornaments (flourish chevrons), stroke = ornament color. */
  strokes: string[]
  /** Stroke widths in design-space units (scale linearly with card width). */
  widths: { outer: number; inner: number; inner2: number; ornament: number }
}

/**
 * Build the shield frame for a tier. SIMPLE tiers (bronze/silver): outer +
 * inner only — clean outline, minimal ornament. ORNATE tiers (gold/Impecável):
 * double outline + studs + top flourish — the elaborate scrollwork register.
 * PURE — path strings only, no DOM/canvas.
 */
export function buildShieldFrame(tier: Tier): ShieldFrame {
  const ornate = tier === 'gold' || tier === 'platinum'
  if (!ornate) {
    return {
      outer: OUTER,
      inner: INNER,
      inner2: null,
      fills: [],
      strokes: [],
      widths: { outer: 6, inner: 2, inner2: 0, ornament: 0 },
    }
  }
  return {
    outer: OUTER,
    inner: INNER,
    inner2: INNER_2,
    fills: [STUDS_ORNATE],
    strokes: [FLOURISH_TOP],
    widths: { outer: 6, inner: 2.5, inner2: 1.5, ornament: 2 },
  }
}

/** True for tiers that get the ornate treatment (gold + Impecável). */
export function isOrnateTier(tier: Tier): boolean {
  return tier === 'gold' || tier === 'platinum'
}

/**
 * Scale every coordinate of an absolute M/L/C/Z path string by s.
 *
 * THE CANVAS-MAPPING CONTRACT (checkpoint round 2, "extremely distorted"
 * export): the frame paths are authored in the 750×1125 design space — the
 * on-page <svg viewBox="0 0 750 1125"> maps them to the element for free,
 * but Canvas 2D has no viewBox, so the JPEG shell MUST transform the paths
 * onto the backing store itself. This pure helper is that transform, and the
 * unit tests lock its bounds at every tier.
 *
 * Exact for our paths: every frame constant above uses ONLY absolute
 * M/L/C/Z commands (no relative commands, no arcs) — every numeric token in
 * the string is a coordinate.
 */
export function scalePath(d: string, s: number): string {
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(parseFloat(n) * s * 1000) / 1000))
}
