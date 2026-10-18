// crestAssets.test.ts — unit locks for the crest-asset parser (07.2-05
// checkpoint round 3, owner's superseding design). The four hand-designed
// crest SVGs are the SINGLE SOURCE of geometric truth for the card: these
// tests lock that the parser extracts every layer the card needs from every
// file — plate, photo-crop (ids differ per file!), and the four guideline
// rects — and that the parsed geometry is SANE (rects inside the design
// space, in the owner's documented stacking order).
//
// A malformed or hand-edited-broken SVG must fail loudly here (module-load
// fail-fast), never ship as a silently broken card.
import { describe, expect, it } from 'vitest'
import { CREST_DESIGN_SIZE, CREST_GEOMETRY, scalePath, scaleRect } from './crestAssets'

const TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const

describe('crestAssets — every crest parses completely (fail-fast contract)', () => {
  it('exposes a geometry record for every tier with plate + photo-crop + all 4 guideline rects', () => {
    for (const tier of TIERS) {
      const crest = CREST_GEOMETRY[tier]
      expect(crest.tier).toBe(tier)
      // Plate: a real path string starting with an absolute move.
      expect(crest.platePath.startsWith('M')).toBe(true)
      expect(crest.platePath.length).toBeGreaterThan(100)
      // Photo-crop: found via the selector map, never a hardcoded id.
      expect(crest.photoCropPath.startsWith('M')).toBe(true)
      // All four guideline rects parsed.
      for (const guide of ['contentSafezone', 'ovrNumber', 'nameAndJob', 'sixKeyStats'] as const) {
        const r = crest.guides[guide]
        expect(r.w).toBeGreaterThan(0)
        expect(r.h).toBeGreaterThan(0)
      }
    }
  })

  it('normalizes the per-file photo-crop id drift through the selector map', () => {
    // The files name their crop layer differently (verified by hand:
    // Photo-crop-path / Image-crop / Photo-clip-path / photo-crop) — the
    // parser must resolve ALL of them, and the extracted paths must differ
    // per tier (each crest has its own crop silhouette).
    const crops = TIERS.map((t) => CREST_GEOMETRY[t].photoCropPath)
    expect(new Set(crops).size).toBe(4)
    for (const d of crops) expect(d).toMatch(/^M/)
  })

  it('resolves the id-less crop path inside g#photo-crop (updated pristine crest)', () => {
    // The owner's updated pristine crest dropped the crop path's id — the
    // path now lives inside a `<g id="photo-crop">` group. The parser must
    // still find it (group fallback), not just id-matched paths.
    const pristine = CREST_GEOMETRY.platinum
    expect(pristine.photoCropPath).toMatch(/^M/)
    // The final owner re-export also dropped the photo-window stroke
    // (cls-2 is back to plain `{fill:none}`) — no crest carries a crop
    // stroke anymore; the parser stays generic (renders it if present).
    expect(pristine.photoCropStroke).toBeNull()
    expect(CREST_GEOMETRY.bronze.photoCropStroke).toBeNull()
    expect(CREST_GEOMETRY.silver.photoCropStroke).toBeNull()
    expect(CREST_GEOMETRY.gold.photoCropStroke).toBeNull()
  })
})

describe('crestAssets — parsed geometry is sane (owner guideline contract)', () => {
  it('keeps every guideline rect inside the 1000×1000 design space', () => {
    for (const tier of TIERS) {
      const { guides } = CREST_GEOMETRY[tier]
      for (const guide of Object.values(guides)) {
        expect(guide.x).toBeGreaterThanOrEqual(0)
        expect(guide.y).toBeGreaterThanOrEqual(0)
        expect(guide.x + guide.w).toBeLessThanOrEqual(CREST_DESIGN_SIZE)
        expect(guide.y + guide.h).toBeLessThanOrEqual(CREST_DESIGN_SIZE)
      }
    }
  })

  it('stacks the bands in the owner\'s order: OVR box top, name band below, stats band last', () => {
    for (const tier of TIERS) {
      const { guides } = CREST_GEOMETRY[tier]
      expect(guides.ovrNumber.y).toBeLessThan(guides.nameAndJob.y)
      expect(guides.nameAndJob.y + guides.nameAndJob.h).toBeLessThanOrEqual(guides.sixKeyStats.y + 1)
      // The OVR box hugs the top-left corner of the content safezone.
      expect(guides.ovrNumber.x).toBeCloseTo(guides.contentSafezone.x, 0)
      expect(Math.abs(guides.ovrNumber.y - guides.contentSafezone.y)).toBeLessThan(2)
      // The stat band is the safezone's bottom band.
      expect(guides.sixKeyStats.y).toBeGreaterThan(guides.contentSafezone.y)
      expect(Math.abs(guides.sixKeyStats.y + guides.sixKeyStats.h - (guides.contentSafezone.y + guides.contentSafezone.h))).toBeLessThan(2)
    }
  })

  it('parses the owner plate palette: solid hexes for the metals, the gradient for Impecável', () => {
    expect(CREST_GEOMETRY.bronze.plateFill).toEqual({ kind: 'solid', hex: '#b58c58' })
    expect(CREST_GEOMETRY.silver.plateFill).toEqual({ kind: 'solid', hex: '#cccccc' })
    expect(CREST_GEOMETRY.gold.plateFill).toEqual({ kind: 'solid', hex: '#f9b745' })
    const pristine = CREST_GEOMETRY.platinum.plateFill
    expect(pristine.kind).toBe('gradient')
    if (pristine.kind === 'gradient') {
      expect(pristine.stops.length).toBeGreaterThanOrEqual(2)
      expect(pristine.stops[0].color).toMatch(/^#[0-9a-f]{6}$/)
      // userSpaceOnUse gradient line inside the design space.
      expect(pristine.x1).toBeGreaterThanOrEqual(0)
      expect(pristine.x2).toBeLessThanOrEqual(CREST_DESIGN_SIZE)
    }
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
    // At 2× (the 2000×2000 download backing store) every bound doubles.
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
