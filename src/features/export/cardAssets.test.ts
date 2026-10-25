// cardAssets.test.ts — unit locks for the card.svg parser (07.2-05
// checkpoint round 8, owner re-seed: ONE card.svg is the single source of
// truth for the card design — placeholder TEXT slots the code fills,
// borderless crop-path photo area, the border stroking the PLATE silhouette
// (three-layer background), tier colors applied by code, Bebas Neue
// everywhere except the player name (Orbitron), central column alignment).
// These tests lock that the parser extracts every layer the card needs —
// plate silhouette, crop path, border stroke geometry (stroke path + clip),
// and ALL text slots with their positions and EFFECTIVE font sizes (the OVR
// and name slot matrix hacks resolved) — and that the code-driven tier
// palettes carry the retired round-4 per-tier SVG palettes.
//
// A malformed or hand-edited-broken card.svg must fail loudly here
// (module-load fail-fast), never ship as a silently broken card.
import { describe, expect, it } from 'vitest'
import {
  CARD_DESIGN_HEIGHT,
  CARD_DESIGN_WIDTH,
  CARD_GEOMETRY,
  PHOTO_FRAME,
  TIER_PALETTE,
  photoDestRect,
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

  it('extracts the border stroke: width 48 + a userSpaceOnUse gradient line inside the design space', () => {
    expect(CARD_GEOMETRY.borderStroke.width).toBe(48)
    const line = CARD_GEOMETRY.borderStroke.line
    expect(line.x1).toBeCloseTo(61.61, 1)
    expect(line.x2).toBeCloseTo(1017.352, 1)
    expect(line.x1).toBeGreaterThanOrEqual(0)
    expect(line.x2).toBeLessThanOrEqual(CARD_DESIGN_WIDTH + 1)
    expect(line.y1).toBeGreaterThanOrEqual(0)
    expect(line.y2).toBeLessThanOrEqual(CARD_DESIGN_HEIGHT)
  })

  it('extracts the border STROKE PATH: the PLATE silhouette (round-8 three-layer semantics)', () => {
    // The border-over layer strokes the plate silhouette — NOT the crop
    // path. This is the owner's explicit round-8 ruling ("the current
    // design on the app looks like the border is in the crop, which would
    // be incorrect"): the border rings the WHOLE shield, the crop area
    // stays borderless. If a future file edit decouples the stroked path
    // from the plate, this lock forces a look.
    expect(CARD_GEOMETRY.borderStroke.strokePath.startsWith('M')).toBe(true)
    expect(CARD_GEOMETRY.borderStroke.strokePath).toBe(CARD_GEOMETRY.platePath)
    expect(CARD_GEOMETRY.borderStroke.strokePath).not.toBe(CARD_GEOMETRY.cropPath)
  })

  it('extracts the border CLIP: the plate silhouette (the owner clips border-over to the plate)', () => {
    // The border-over group clips its stroke with clipPath#clip-path-1,
    // whose single path IS the plate silhouette: the stroke's outer half is
    // cut, the inner band paints over the photo/plate edges. If a future
    // file edit decouples the clip from the plate, this lock forces a look.
    expect(CARD_GEOMETRY.borderStroke.clipPath.startsWith('M')).toBe(true)
    expect(CARD_GEOMETRY.borderStroke.clipPath).toBe(CARD_GEOMETRY.platePath)
  })
})

describe('cardAssets — placeholder TEXT slots resolve to real positions/sizes', () => {
  it('resolves the OVR slot THROUGH its matrix hack: 6.992px × 21.169 ≈ 148px at (136.177, 412.59)', () => {
    const ovr = CARD_GEOMETRY.slots.ovr
    expect(ovr.x).toBeCloseTo(136.177, 1)
    expect(ovr.y).toBeCloseTo(412.59, 1)
    expect(ovr.size).toBeCloseTo(6.992 * 21.169, 1)
    expect(ovr.size).toBeGreaterThan(140) // the number must be BIG (readability rounds 3-8)
    expect(ovr.size).toBeLessThan(160)
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

  it('resolves all SIX positional stat slots from the semantic KEY groups, left → right, on the ~142px center grid', () => {
    const stats = CARD_GEOMETRY.slots.stats
    expect(stats).toHaveLength(6)
    // The COLUMN GRID is the RATING anchors' even pitch (≈142.15px): the
    // owner centered the SAME '99' placeholder string on every column
    // center, so the rating x's MUST come evenly pitched (the parse also
    // fail-fasts on this in cardAssets.ts — here it is locked from the
    // outside too).
    const pointsXs = stats.map((s) => s.points.x)
    expect(pointsXs[0]).toBeCloseTo(120.019, 1)
    expect(pointsXs[5]).toBeCloseTo(830.751, 1)
    for (let i = 1; i < 6; i++) {
      const pitch = pointsXs[i] - pointsXs[i - 1]
      expect(pitch).toBeGreaterThan(140)
      expect(pitch).toBeLessThan(144)
    }
    // Per slot (round 8): label (56px, y≈1141.3) ABOVE the points rating
    // (148px, y≈1261.7), value (56px, y≈1317.8) below. All three lines
    // render CENTERED on the derived column center (round 7 central
    // alignment — see buildCardPlan); the parsed x's are the owner's
    // left-anchors for the PLACEHOLDER strings (different widths →
    // different left anchors), so they only sanity-bound together (well
    // within a column pitch), never serve as centers.
    for (const s of stats) {
      expect(s.label.size).toBe(56)
      expect(s.points.size).toBe(148)
      expect(s.value.size).toBe(56)
      expect(s.label.y).toBeCloseTo(1141.317, 1)
      expect(s.points.y).toBeCloseTo(1261.703, 1)
      expect(s.value.y).toBeCloseTo(1317.836, 1)
      expect(s.label.y).toBeLessThan(s.points.y)
      expect(s.points.y).toBeLessThan(s.value.y)
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

  it('carries the retired round-4 border gradients per tier, with the platinum ring matching the UI Impecável rainbow', () => {
    expect(TIER_PALETTE.bronze.borderStops.map((s) => s.color)).toEqual(['#ed7b00', '#b49f00'])
    expect(TIER_PALETTE.silver.borderStops.map((s) => s.color)).toEqual(['#7e888e', '#cbd2d6'])
    expect(TIER_PALETTE.gold.borderStops.map((s) => s.color)).toEqual(['#ff635f', '#d38f00'])
    // The top tier reads the SAME five stops as tier-impecavel-border.
    expect(TIER_PALETTE.platinum.borderStops.map((s) => s.color)).toEqual([
      '#f26d6f',
      '#e9b44c',
      '#3fb950',
      '#58a6ff',
      '#b8c0cc',
    ])
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

// --- Card polish round 8: the measured head-to-thigh photo framing ------

// The real crop window (CARD_GEOMETRY.cropBBox): ~931.7x855.9 in the
// 1080x1600 design space.
const WIN = CARD_GEOMETRY.cropBBox

// The measured live class art (2026-10-25 probe, class-f-high-priest:
// 1197x1309, character top 6.7%, bottom 95.5%, x 12.9-84.4%).
const HP_BOUNDS = { top: 88, bottom: 1250, left: 155, right: 1010 }

describe('photoDestRect — subject art (the class-portrait framing, round 8)', () => {
  it('keeps the head off the top border: the subject top lands well inside the window', () => {
    const dest = photoDestRect(1197, 1309, HP_BOUNDS, WIN)
    // The frame is height-constrained for this art, so the frame top == the
    // window top; the subject's own headroom (88 image px) scaled into the
    // window is the margin the owner asked for.
    const scale = dest.h / 1309
    const subjectTopInWindow = 88 * scale
    expect(subjectTopInWindow / WIN.h).toBeGreaterThan(0.08)
    expect(subjectTopInWindow / WIN.h).toBeLessThan(0.16)
  })

  it('cuts at the thigh line, not the knee: the visible band ends at bodyFraction of the figure', () => {
    const dest = photoDestRect(1197, 1309, HP_BOUNDS, WIN)
    const scale = dest.h / 1309
    // Window bottom maps to this image row:
    const visibleBottomImageRow = (WIN.y + WIN.h - dest.y) / scale
    const figureH = HP_BOUNDS.bottom - HP_BOUNDS.top
    const visibleFigureFraction = (visibleBottomImageRow - HP_BOUNDS.top) / figureH
    expect(visibleFigureFraction).toBeCloseTo(PHOTO_FRAME.bodyFraction, 2)
  })

  it('COVERS the window with the frame on both axes and keeps the image aspect', () => {
    const dest = photoDestRect(1197, 1309, HP_BOUNDS, WIN)
    // Aspect preserved (the whole image paints, clipped by the crop path).
    expect(dest.w / dest.h).toBeCloseTo(1197 / 1309, 6)
    // The frame covers the window: every window pixel maps inside the image.
    expect(dest.x).toBeLessThanOrEqual(WIN.x)
    expect(dest.y).toBeLessThanOrEqual(WIN.y + 0.5)
    expect(dest.x + dest.w).toBeGreaterThanOrEqual(WIN.x + WIN.w)
    expect(dest.y + dest.h).toBeGreaterThanOrEqual(WIN.y + WIN.h)
  })

  it('survives art with no headroom (clamped at the image top, still covers)', () => {
    // class-f-champion: character top at 0.4% — the margin is whatever the
    // art allows (here ~none), the fit must still cover and stay finite.
    const dest = photoDestRect(1197, 1309, { top: 5, bottom: 1299, left: 37, right: 1151 }, WIN)
    expect(Number.isFinite(dest.x)).toBe(true)
    expect(dest.x).toBeLessThanOrEqual(WIN.x)
    expect(dest.y).toBeLessThanOrEqual(WIN.y + 0.5)
    expect(dest.x + dest.w).toBeGreaterThanOrEqual(WIN.x + WIN.w)
    expect(dest.y + dest.h).toBeGreaterThanOrEqual(WIN.y + WIN.h)
  })

  it('clamps the frame to the image bounds (never frames outside the art)', () => {
    const dest = photoDestRect(1197, 1309, { top: 700, bottom: 1309, left: 590, right: 607 }, WIN)
    // A tiny off-center subject: the expanded frame clamps to the image, so
    // the window still shows image content, not out-of-bounds void.
    expect(dest.w / dest.h).toBeCloseTo(1197 / 1309, 6)
  })
})

describe('photoDestRect — opaque screenshots (round-7 head-safe anchor, unchanged)', () => {
  it('top-anchors tall phone screenshots (head safe, legs cropped)', () => {
    const dest = photoDestRect(1080, 2400, null, WIN)
    expect(dest.y).toBe(WIN.y)
    expect(dest.h).toBeGreaterThan(WIN.h)
    expect(dest.w / dest.h).toBeCloseTo(1080 / 2400, 6)
    // Horizontal stays centered.
    expect((WIN.x - dest.x) - (dest.x + dest.w - (WIN.x + WIN.w))).toBeCloseTo(0, 6)
  })

  it('fits wide screenshots by height exactly (anchor is a no-op)', () => {
    const dest = photoDestRect(1920, 1080, null, WIN)
    expect(dest.h).toBeCloseTo(WIN.h, 6)
    expect(dest.w).toBeGreaterThan(WIN.w)
    expect(dest.y).toBe(WIN.y)
  })

  it('guards zero-size images (never NaN into the render)', () => {
    const dest = photoDestRect(0, 0, null, WIN)
    expect(dest).toEqual(WIN)
  })
})

describe('PHOTO_FRAME tuning (calibrated 2026-10-25)', () => {
  it('keeps the owner-requested thigh cut and margins', () => {
    expect(PHOTO_FRAME.bodyFraction).toBe(0.58)
    expect(PHOTO_FRAME.headMargin).toBe(0.1)
    expect(PHOTO_FRAME.sideMargin).toBe(0.05)
  })
})
