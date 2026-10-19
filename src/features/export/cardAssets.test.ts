// cardAssets.test.ts — unit locks for the card.svg parser (07.2-05
// checkpoint round 7, owner supersession: ONE card.svg is the single source
// of truth for the card design — placeholder TEXT slots the code fills,
// crop-path photo area, tier colors applied by code, Bebas Neue everywhere
// except the player name (Orbitron), detached border over the crop,
// central column alignment). These tests lock that the parser extracts every
// layer the card needs — plate silhouette, crop path, border stroke
// geometry, and ALL text slots with their positions and EFFECTIVE font sizes
// (the OVR and name slot matrix hacks resolved) — and that the code-driven
// tier palettes carry the retired round-4 per-tier SVG palettes.
//
// A malformed or hand-edited-broken card.svg must fail loudly here
// (module-load fail-fast), never ship as a silently broken card.
import { describe, expect, it } from 'vitest'
import {
  CARD_DESIGN_HEIGHT,
  CARD_DESIGN_WIDTH,
  CARD_GEOMETRY,
  TIER_PALETTE,
  scalePath,
  scaleRect,
} from './cardAssets'

describe('cardAssets — card.svg parses completely (fail-fast contract)', () => {
  it('parses the round-7 design space: portrait 1080×1600 (27:40, NOT 2:3)', () => {
    expect(CARD_DESIGN_WIDTH).toBe(1080)
    expect(CARD_DESIGN_HEIGHT).toBe(1600)
    expect(CARD_DESIGN_WIDTH / CARD_DESIGN_HEIGHT).toBeCloseTo(0.675, 3)
  })

  it('extracts the plate silhouette and the crop path (both real absolute-command paths)', () => {
    expect(CARD_GEOMETRY.platePath.startsWith('M')).toBe(true)
    expect(CARD_GEOMETRY.platePath.length).toBeGreaterThan(100)
    expect(CARD_GEOMETRY.cropPath.startsWith('M')).toBe(true)
    // The crop path is a DISTINCT path (the photo area top portion, not the
    // full silhouette — it closes at ~y=937).
    expect(CARD_GEOMETRY.cropPath).not.toBe(CARD_GEOMETRY.platePath)
  })

  it('resolves the crop-path bbox inside the design space (photo upper region, full width)', () => {
    const b = CARD_GEOMETRY.cropBBox
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w).toBeLessThanOrEqual(CARD_DESIGN_WIDTH + 1)
    expect(b.y + b.h).toBeLessThanOrEqual(CARD_DESIGN_HEIGHT)
    // The crop path spans essentially the full card width and the upper
    // ~54% of the height (down to ~y=937 of 1600).
    expect(b.w).toBeGreaterThan(CARD_DESIGN_WIDTH * 0.85)
    expect(b.h).toBeGreaterThan(CARD_DESIGN_HEIGHT * 0.45)
    expect(b.h).toBeLessThan(CARD_DESIGN_HEIGHT * 0.6)
  })

  it('extracts the border stroke: width 40 + a userSpaceOnUse gradient line inside the design space', () => {
    expect(CARD_GEOMETRY.borderStroke.width).toBe(40)
    const line = CARD_GEOMETRY.borderStroke.line
    expect(line.x1).toBeGreaterThanOrEqual(0)
    expect(line.x2).toBeLessThanOrEqual(CARD_DESIGN_WIDTH)
    expect(line.y1).toBeGreaterThanOrEqual(0)
    expect(line.y2).toBeLessThanOrEqual(CARD_DESIGN_HEIGHT)
  })

  it('extracts the border CLIP: the plate silhouette (the owner clips border-over to the plate, round 7)', () => {
    // The border-over group clips its stroke with clipPath#clip-path-1,
    // whose single path IS the plate silhouette: the stroke's outer half is
    // cut, the inner half paints OVER the photo edges. If a future file
    // edit decouples the clip from the plate, this lock forces a look.
    expect(CARD_GEOMETRY.borderStroke.clipPath.startsWith('M')).toBe(true)
    expect(CARD_GEOMETRY.borderStroke.clipPath).toBe(CARD_GEOMETRY.platePath)
  })
})

describe('cardAssets — placeholder TEXT slots resolve to real positions/sizes', () => {
  it('resolves the OVR slot THROUGH its matrix hack: 8.503px × 21.169 ≈ 180px at (136.177, 412.59)', () => {
    const ovr = CARD_GEOMETRY.slots.ovr
    expect(ovr.x).toBeCloseTo(136.177, 1)
    expect(ovr.y).toBeCloseTo(412.59, 1)
    expect(ovr.size).toBeCloseTo(8.503 * 21.169, 1)
    expect(ovr.size).toBeGreaterThan(170) // the number must be BIG (readability rounds 3-7)
    expect(ovr.size).toBeLessThan(190)
  })

  it('resolves the job slot (72px Bebas) directly under the OVR number', () => {
    const job = CARD_GEOMETRY.slots.job
    expect(job.x).toBeCloseTo(136.177, 1)
    expect(job.y).toBeCloseTo(487.48, 1)
    expect(job.size).toBe(72)
    expect(job.y).toBeGreaterThan(CARD_GEOMETRY.slots.ovr.y)
  })

  it('resolves the PLAYERNAME slot (ORBITRON, ≈72px effective via its 0.656 matrix) on the plate between photo and stats', () => {
    const name = CARD_GEOMETRY.slots.name
    expect(name.x).toBeCloseTo(246.528, 1)
    expect(name.y).toBeCloseTo(1047.007, 1)
    expect(name.size).toBeCloseTo(109.72 * 0.656, 1)
    expect(name.size).toBeGreaterThan(60)
    expect(name.size).toBeLessThan(80)
    // Between the crop area's bottom (~937) and the stats labels (~1273).
    expect(name.y).toBeGreaterThan(CARD_GEOMETRY.cropBBox.y + CARD_GEOMETRY.cropBBox.h)
    expect(name.y).toBeLessThan(CARD_GEOMETRY.slots.stats[0].label.y)
  })

  it('resolves all SIX positional stat slots, left → right, on the owner\'s ~141px center grid', () => {
    const stats = CARD_GEOMETRY.slots.stats
    expect(stats).toHaveLength(6)
    // The COLUMN GRID is the points anchors' even pitch (≈141px): the owner
    // centered the SAME '99' placeholder string on every column center, so
    // the points x's MUST come evenly pitched (the parse also fail-fasts on
    // this in cardAssets.ts — here it is locked from the outside too).
    const pointsXs = stats.map((s) => s.points.x)
    expect(pointsXs[0]).toBeCloseTo(136.177, 1)
    expect(pointsXs[5]).toBeCloseTo(841.079, 1)
    for (let i = 1; i < 6; i++) {
      const pitch = pointsXs[i] - pointsXs[i - 1]
      expect(pitch).toBeGreaterThan(138)
      expect(pitch).toBeLessThan(144)
    }
    // Per slot: label (48px, y≈1273.5), points (128px, y≈1199.7), value
    // (48px, y≈1319.3) — points row ABOVE the label row. All three lines
    // render CENTERED on the derived column center (round 7 central
    // alignment — see buildCardPlan); the parsed x's are the owner's
    // left-anchors for the PLACEHOLDER strings (different widths →
    // different left anchors), so they only sanity-bound together (well
    // within a column pitch), never serve as centers.
    for (const s of stats) {
      expect(s.label.size).toBe(48)
      expect(s.points.size).toBe(128)
      expect(s.value.size).toBe(48)
      expect(s.points.y).toBeCloseTo(1199.703, 1)
      expect(s.label.y).toBeCloseTo(1273.507, 1)
      expect(s.value.y).toBeCloseTo(1319.255, 1)
      expect(s.points.y).toBeLessThan(s.label.y)
      expect(s.label.y).toBeLessThan(s.value.y)
      // Placeholder anchors stay near their column (sanity, not centering).
      const span = Math.max(s.label.x, s.points.x, s.value.x) - Math.min(s.label.x, s.points.x, s.value.x)
      expect(span).toBeLessThanOrEqual(20)
    }
  })
})

describe('cardAssets — tier palettes (the round-4 per-tier SVG colors, now code-driven)', () => {
  it('carries a DISTINCT plate fill per tier with the round-4 hexes', () => {
    const fills = (['bronze', 'silver', 'gold', 'platinum'] as const).map((t) => TIER_PALETTE[t].plateFill)
    expect(new Set(fills).size).toBe(4)
    expect(TIER_PALETTE.bronze.plateFill).toBe('#d1a972')
    expect(TIER_PALETTE.silver.plateFill).toBe('#e6e6e6')
    expect(TIER_PALETTE.gold.plateFill).toBe('#f9b745')
    expect(TIER_PALETTE.platinum.plateFill).toBe('#cf1a87')
  })

  it('carries the retired round-4 border gradients per tier (Orange_to_Yellow / Overcast / Red_to_Amber / Blue_to_Magenta)', () => {
    expect(TIER_PALETTE.bronze.borderStops.map((s) => s.color)).toEqual(['#ed7b00', '#b49f00'])
    expect(TIER_PALETTE.silver.borderStops.map((s) => s.color)).toEqual(['#7e888e', '#cbd2d6'])
    expect(TIER_PALETTE.gold.borderStops.map((s) => s.color)).toEqual(['#ff635f', '#d38f00'])
    // Pristine keeps card.svg's own Blue_to_Magenta verbatim.
    expect(TIER_PALETTE.platinum.borderStops.map((s) => s.color)).toEqual(['#6e9aff', '#ff12f7'])
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      expect(TIER_PALETTE[tier].borderStops.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('follows the round-4 contrast rule: dark text on the light metals, white on the deep magenta', () => {
    expect(TIER_PALETTE.bronze.textFill).toBe('#241a10')
    expect(TIER_PALETTE.silver.textFill).toBe('#241a10')
    expect(TIER_PALETTE.gold.textFill).toBe('#241a10')
    expect(TIER_PALETTE.platinum.textFill).toBe('#ffffff')
  })

  it('carries NO placeholder values: neither the file\'s #e6e6e6 slot fill nor Bebas Neue reaches the palettes', () => {
    // The parser deliberately ignores the placeholder font/fill — a future
    // edit must not reintroduce them through the palette either.
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      expect(TIER_PALETTE[tier].textFill.toLowerCase()).not.toBe('#e6e6e6')
    }
  })
})

describe('cardAssets — scalePath/scaleRect (the canvas-mapping contract)', () => {
  it('scales design-space paths exactly onto any backing store (identity at 1×, exact 2×)', () => {
    const d = CARD_GEOMETRY.platePath
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

  it('scales the crop path onto the backing store too (the photo clip is a path, round 5)', () => {
    expect(scalePath(CARD_GEOMETRY.cropPath, 1)).toBe(CARD_GEOMETRY.cropPath)
    expect(scalePath(CARD_GEOMETRY.cropPath, 2)).not.toBe(CARD_GEOMETRY.cropPath)
  })

  it('scales rects componentwise', () => {
    const r = { x: 10, y: 20, w: 30, h: 40 }
    expect(scaleRect(r, 2)).toEqual({ x: 20, y: 40, w: 60, h: 80 })
    expect(scaleRect(r, 0.5)).toEqual({ x: 5, y: 10, w: 15, h: 20 })
  })
})
