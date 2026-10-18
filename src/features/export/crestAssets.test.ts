// crestAssets.test.ts — unit locks for the crest-asset parser (07.2-05
// checkpoint round 4, owner's readability redesign). The four hand-designed
// crest SVGs (re-exported at 1080×1600) are the SINGLE SOURCE of geometric
// truth for the card: these tests lock that the parser extracts every layer
// the card needs from every file — plate silhouette, solid tier fill, the
// gradient border stroke, and the four guideline rects — and that the
// parsed geometry is SANE (rects inside the design space, in the owner's
// documented stacking order).
//
// Round-4 contract specifics locked here:
//   - files are keyed by TIER FILENAME (bronze/silver/gold/pristine.svg) —
//     the root group is id="Pristine" in ALL FOUR (copy-paste artifact),
//     so the parser must select by class + position, never by group id
//   - there is NO photo-crop path: the photo area IS the Content-safezone
//   - Name-only + six-key-stats are SOLID tier-fill bands (cls-1, shared
//     with the plate)
//   - the border stroke is a tier gradient @ width 40, clipped to the
//     silhouette — required in every file
//
// A malformed or hand-edited-broken SVG must fail loudly here (module-load
// fail-fast), never ship as a silently broken card.
import { describe, expect, it } from 'vitest'
import { CREST_DESIGN_HEIGHT, CREST_DESIGN_WIDTH, CREST_GEOMETRY, scalePath, scaleRect } from './crestAssets'

const TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const

describe('crestAssets — every crest parses completely (fail-fast contract)', () => {
  it('exposes a geometry record for every tier with plate + tier fill + border stroke + all 4 guideline rects', () => {
    for (const tier of TIERS) {
      const crest = CREST_GEOMETRY[tier]
      expect(crest.tier).toBe(tier)
      // Plate: a real path string starting with an absolute move.
      expect(crest.platePath.startsWith('M')).toBe(true)
      expect(crest.platePath.length).toBeGreaterThan(100)
      // Solid tier fill shared by plate + solid bands.
      expect(crest.tierFillHex).toMatch(/^#[0-9a-f]{6}$/)
      // The decorative border: gradient + width, REQUIRED in every file.
      expect(crest.borderStroke.width).toBe(40)
      expect(crest.borderStroke.gradient.stops.length).toBeGreaterThanOrEqual(2)
      // All four guideline rects parsed.
      for (const guide of ['contentSafezone', 'ovrBox', 'nameOnly', 'sixKeyStats'] as const) {
        const r = crest.guides[guide]
        expect(r.w).toBeGreaterThan(0)
        expect(r.h).toBeGreaterThan(0)
      }
    }
  })

  it('never relies on group ids: the root group is "Pristine" in ALL FOUR files (copy-paste artifact) yet every tier parses', () => {
    // The parser selects the plate by class + document position (first cls-1
    // path before the Guidelines group), never by group id. If it had relied
    // on a "Pristine" id for anything else than the pristine tier, four
    // identical ids would have collided — the record below proves it didn't.
    for (const tier of TIERS) {
      expect(CREST_GEOMETRY[tier].tier).toBe(tier)
      expect(CREST_GEOMETRY[tier].platePath).toMatch(/^M/)
    }
  })

  it('parses the round-4 design space: portrait 1080×1600 (27:40, NOT 2:3)', () => {
    expect(CREST_DESIGN_WIDTH).toBe(1080)
    expect(CREST_DESIGN_HEIGHT).toBe(1600)
    expect(CREST_DESIGN_WIDTH / CREST_DESIGN_HEIGHT).toBeCloseTo(0.675, 3)
  })

  it('keys files by tier filename: each tier carries ITS OWN palette', () => {
    const hexes = TIERS.map((t) => CREST_GEOMETRY[t].tierFillHex)
    expect(new Set(hexes).size).toBe(4)
    expect(CREST_GEOMETRY.bronze.tierFillHex).toBe('#d1a972')
    expect(CREST_GEOMETRY.silver.tierFillHex).toBe('#e6e6e6')
    expect(CREST_GEOMETRY.gold.tierFillHex).toBe('#f9b745')
    expect(CREST_GEOMETRY.platinum.tierFillHex).toBe('#cf1a87')
  })

  it('carries a DISTINCT tier gradient per border (Orange_to_Yellow / Overcast / Red_to_Amber / Spectrum)', () => {
    const firstStops = TIERS.map((t) => CREST_GEOMETRY[t].borderStroke.gradient.stops[0].color)
    expect(new Set(firstStops).size).toBe(4)
    // userSpaceOnUse gradient line inside the design space.
    for (const tier of TIERS) {
      const g = CREST_GEOMETRY[tier].borderStroke.gradient
      expect(g.x1).toBeGreaterThanOrEqual(0)
      expect(g.x2).toBeLessThanOrEqual(CREST_DESIGN_WIDTH)
    }
  })
})

describe('crestAssets — parsed geometry is sane (owner guideline contract, round 4)', () => {
  it('keeps every guideline rect inside the 1080×1600 design space', () => {
    for (const tier of TIERS) {
      const { guides } = CREST_GEOMETRY[tier]
      for (const guide of Object.values(guides)) {
        expect(guide.x).toBeGreaterThanOrEqual(0)
        expect(guide.y).toBeGreaterThanOrEqual(0)
        expect(guide.x + guide.w).toBeLessThanOrEqual(CREST_DESIGN_WIDTH)
        expect(guide.y + guide.h).toBeLessThanOrEqual(CREST_DESIGN_HEIGHT)
      }
    }
  })

  it('makes the photo area EXACTLY the Content-safezone (no dedicated crop path in round 4)', () => {
    for (const tier of TIERS) {
      const { guides } = CREST_GEOMETRY[tier]
      // The photo rect is the safezone itself, and it spans the plate's
      // inner content column.
      expect(guides.contentSafezone.w).toBeGreaterThan(CREST_DESIGN_WIDTH * 0.7)
      expect(guides.contentSafezone.h).toBeGreaterThan(CREST_DESIGN_HEIGHT * 0.6)
    }
  })

  it('stacks the bands in the owner\'s order: OVR box top, name band below it, stats band last (both OVER the photo)', () => {
    for (const tier of TIERS) {
      const { guides } = CREST_GEOMETRY[tier]
      expect(guides.ovrBox.y).toBeLessThan(guides.nameOnly.y)
      expect(guides.nameOnly.y + guides.nameOnly.h).toBeLessThanOrEqual(guides.sixKeyStats.y + 1)
      // The OVR box hugs the top-left corner of the content safezone.
      expect(guides.ovrBox.x).toBeCloseTo(guides.contentSafezone.x, 0)
      expect(Math.abs(guides.ovrBox.y - guides.contentSafezone.y)).toBeLessThan(2)
      // Both solid bands sit INSIDE the photo area (they overlay it) and
      // the stat band closes the safezone's bottom edge.
      expect(guides.nameOnly.y).toBeGreaterThan(guides.contentSafezone.y)
      expect(guides.sixKeyStats.y).toBeGreaterThan(guides.nameOnly.y)
      expect(Math.abs(guides.sixKeyStats.y + guides.sixKeyStats.h - (guides.contentSafezone.y + guides.contentSafezone.h))).toBeLessThan(2)
    }
  })

  it('shares ONE silhouette across the four files (identical geometry, different palettes by design)', () => {
    const plates = TIERS.map((t) => CREST_GEOMETRY[t].platePath)
    expect(new Set(plates).size).toBe(1)
  })
})

describe('crestAssets — scalePath/scaleRect (the canvas-mapping contract)', () => {
  it('scales design-space paths exactly onto any backing store (identity at 1×, exact 2×)', () => {
    const d = CREST_GEOMETRY.gold.platePath
    const bounds = (path: string) => {
      const nums = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      return { maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
    // Identity at 1× (the on-page SVG renders the unscaled string).
    expect(scalePath(d, 1)).toBe(d)
    // At 2× (the 2160×3200 download backing store) every bound doubles.
    const scaled = bounds(scalePath(d, 2))
    expect(scaled.maxX).toBeCloseTo(bounds(d).maxX * 2, 0)
    expect(scaled.maxY).toBeCloseTo(bounds(d).maxY * 2, 0)
  })

  it('scales rects componentwise', () => {
    const r = { x: 10, y: 20, w: 30, h: 40 }
    expect(scaleRect(r, 2)).toEqual({ x: 20, y: 40, w: 60, h: 80 })
    expect(scaleRect(r, 0.5)).toEqual({ x: 5, y: 10, w: 15, h: 20 })
  })
})
