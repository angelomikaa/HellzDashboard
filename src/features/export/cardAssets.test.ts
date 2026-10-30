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
  tierPlateFadeStops,
  tierPlateRamp,
} from './cardAssets'

describe('cardAssets — card.svg parses completely (fail-fast contract)', () => {
  it('parses the round-7 design space: portrait 1080×1600 (27:40, NOT 2:3)', () => {
    expect(CARD_DESIGN_WIDTH).toBe(1080)
    expect(CARD_DESIGN_HEIGHT).toBe(1600)
    expect(CARD_DESIGN_WIDTH / CARD_DESIGN_HEIGHT).toBeCloseTo(0.675, 3)
  })

  it('extracts the plate silhouette and the photo area (both real absolute-command paths)', () => {
    expect(CARD_GEOMETRY.platePath.startsWith('M')).toBe(true)
    expect(CARD_GEOMETRY.platePath.length).toBeGreaterThan(100)
    expect(CARD_GEOMETRY.cropPath.startsWith('M')).toBe(true)
    expect(CARD_GEOMETRY.cropPath.length).toBeGreaterThan(100)
  })

  it('resolves the photo area inside the design space (whole shield in the re-export)', () => {
    const b = CARD_GEOMETRY.cropBBox
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w).toBeLessThanOrEqual(CARD_DESIGN_WIDTH + 1)
    expect(b.y + b.h).toBeLessThanOrEqual(CARD_DESIGN_HEIGHT)
    // Owner decision 2026-10-29: the re-export carries no crop-path, so the
    // photo occupies THE WHOLE SHIELD — the bbox IS the plate's bbox.
    expect(CARD_GEOMETRY.cropPath).toBe(CARD_GEOMETRY.platePath)
    expect(CARD_GEOMETRY.cropBBox).toEqual(CARD_GEOMETRY.plateBBox)
    expect(b.w).toBeGreaterThan(CARD_DESIGN_WIDTH * 0.85)
    expect(b.h).toBeGreaterThan(CARD_DESIGN_HEIGHT * 0.85)
  })

  it('draws NO border in the owner\'s current file (the border is optional)', () => {
    // Owner 2026-10-29: "new card svg: no more border". The layer must be
    // OPTIONAL in the contract so the round-8 file (gradient ring, width 48,
    // clipped) and the first re-export (solid ring, width 24, unclipped) still
    // parse when the owner restores them — and so nothing throws or paints a
    // phantom ring now.
    expect(CARD_GEOMETRY.borderStroke).toBeUndefined()
  })

  it('extracts the STATS CONTRAST PLATE: its path, gradient line and FADE only', () => {
    // Owner 2026-10-29: "the stats also have a plate that ensures contrast
    // against the background", then: "the fills must follow tier colors, not
    // the color in the svg". So the parse carries the plate's GEOMETRY (path +
    // gradient line) and its FADE structure (offsets + opacities) — and NO
    // color: the tier supplies that at paint time.
    const plate = CARD_GEOMETRY.statsPlate
    expect(plate).toBeDefined()
    if (plate === undefined) return
    expect(plate.path.startsWith('M')).toBe(true)
    expect(plate.path).not.toBe(CARD_GEOMETRY.platePath)
    expect(plate.line.x1).toBeCloseTo(540.102, 1)
    expect(plate.line.x2).toBeCloseTo(536.666, 1)
    expect(plate.line.y1).toBeCloseTo(1517.645, 1)
    expect(plate.line.y2).toBeCloseTo(844.033, 1)
    expect(plate.fades.length).toBeGreaterThanOrEqual(2)
    for (const fade of plate.fades) {
      expect(Object.keys(fade).sort()).toEqual(['offset', 'opacity'])
      expect(fade.opacity).toBeGreaterThanOrEqual(0)
      expect(fade.opacity).toBeLessThanOrEqual(1)
    }
    // The plate fades: opaque where the stats sit (bottom) and transparent
    // toward the photo above them.
    expect(plate.fades[0].opacity).toBeGreaterThan(plate.fades[plate.fades.length - 1].opacity)
  })

  it('covers the whole stats band with the plate (the stats must stay legible)', () => {
    const plate = CARD_GEOMETRY.statsPlate
    if (plate === undefined) throw new Error('the current file must carry the stats plate')
    const b = cardPlateBBox(plate.path)
    const firstStat = CARD_GEOMETRY.slots.stats[0]
    const lastStat = CARD_GEOMETRY.slots.stats[5]
    // Below the player name, above nothing: the plate spans the stat columns.
    expect(b.y).toBeLessThan(firstStat.label.y)
    expect(b.y + b.h).toBeGreaterThan(lastStat.value.y)
    expect(b.w).toBeGreaterThan(CARD_DESIGN_WIDTH * 0.85)
    expect(b.y + b.h).toBeLessThanOrEqual(CARD_DESIGN_HEIGHT + 1)
  })
})

/** Local bbox helper (pathBBox is not exported; the plate is a plain absolute
 *  M/C path, so the numeric tokens are the coordinates in order). */
function cardPlateBBox(d: string) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

describe('cardAssets — placeholder TEXT slots resolve to real positions/sizes', () => {
  it('resolves the OVR slot: the BIGGEST text in the OVR group, ≈148px at (136.177, 412.59)', () => {
    const ovr = CARD_GEOMETRY.slots.ovr
    expect(ovr.x).toBeCloseTo(136.177, 1)
    expect(ovr.y).toBeCloseTo(412.59, 1)
    // The re-export states the effective size inline (148.014px; the round-8
    // file reached the same 148px through its 6.992×21.169 matrix hack).
    expect(ovr.size).toBeCloseTo(148.014, 1)
    expect(ovr.size).toBeGreaterThan(140) // the number must be BIG (readability rounds 3-8)
    expect(ovr.size).toBeLessThan(160)
  })

  it('resolves the job slot (the SMALLER OVR-group text, 56px Bebas) directly under the number', () => {
    const job = CARD_GEOMETRY.slots.job
    expect(job.x).toBeCloseTo(136.177, 1)
    expect(job.y).toBeCloseTo(473.794, 1)
    expect(job.size).toBe(56)
    expect(job.y).toBeGreaterThan(CARD_GEOMETRY.slots.ovr.y)
    // The job line must stay smaller than the number it sits under.
    expect(job.size).toBeLessThan(CARD_GEOMETRY.slots.ovr.size)
  })

  it('resolves the PLAYERNAME slot (the ONE Orbitron text, ≈72px) on the plate between photo and stats', () => {
    const name = CARD_GEOMETRY.slots.name
    expect(name.x).toBeCloseTo(246.528, 1)
    expect(name.y).toBeCloseTo(1044.007, 1)
    expect(name.size).toBeCloseTo(71.976, 1)
    expect(name.size).toBeGreaterThan(60)
    expect(name.size).toBeLessThan(80)
    // Above the stats labels (the photo area now IS the whole shield, so the
    // name is checked against the first stat column instead of the crop bbox).
    expect(name.y).toBeLessThan(CARD_GEOMETRY.slots.stats[0].label.y)
    expect(name.y).toBeGreaterThan(CARD_GEOMETRY.slots.job.y)
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
    // Per slot: label (56px, y≈1141.3) ABOVE the points rating (148px,
    // y≈1261.7), value (56px, y≈1317.8) below. All three lines render
    // CENTERED on the derived column center (round 7 central alignment — see
    // buildCardPlan); the parsed x's are the owner's left-anchors for the
    // PLACEHOLDER strings (different widths → different left anchors), so
    // they only sanity-bound together (well within a column pitch), never
    // serve as centers.
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

  it('resolves the stat roles from SIZE, not ids or classes (the re-export carries neither)', () => {
    // The 2026-10-29 re-export has no cls-* classes and drifting ids
    // (LABEL / LABEL-2 / KEYLABEL, RATING-2 + data-name, STAT-3 + data-name),
    // so roles MUST come from the group structure: the biggest text is the
    // rating, the upper of the rest the label, the lower the value.
    for (const s of CARD_GEOMETRY.slots.stats) {
      expect(s.points.size).toBeGreaterThan(s.label.size)
      expect(s.points.size).toBeGreaterThan(s.value.size)
      expect(s.label.size).toBe(s.value.size)
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

describe('cardAssets — 3-point tier ramp for the stats plate (owner 2026-10-29)', () => {
  it('reduces the 5-point rainbow tier to 3 points, red at 0 and silver at 1', () => {
    // "the rainbow doesn't necessarily have to be the 5-point we have on the
    // project, it can reduced to 3 to better fit the 3 point gradient of the
    // status plate".
    const ramp = tierPlateRamp(TIER_PALETTE.platinum)
    expect(ramp.map((s) => s.offset)).toEqual([0, 0.5, 1])
    expect(ramp[0].color).toBe('#f26d6f')
    expect(ramp[2].color).toBe('#b8c0cc')
    // The middle point is sampled off the tier ramp (the 5-stop midpoint).
    expect(ramp[1].color).toBe('#3fb950')
    // Not the flat magenta plateFill — that was the bug.
    expect(ramp.map((s) => s.color)).not.toContain('#cf1a87')
  })

  it('collapses a solid tier to its plateFill at every ramp point', () => {
    for (const tier of ['bronze', 'silver', 'gold'] as const) {
      const ramp = tierPlateRamp(TIER_PALETTE[tier])
      expect(ramp).toEqual([{ offset: 0, color: TIER_PALETTE[tier].plateFill }])
    }
  })

  it('tints the FILE fade with the TIER ramp: offsets/opacities verbatim, one color per fade', () => {
    const fades = [
      { offset: 0, opacity: 1 },
      { offset: 0.5, opacity: 1 },
      { offset: 1, opacity: 0 },
    ]
    const stops = tierPlateFadeStops(TIER_PALETTE.platinum, fades)
    expect(stops.map((s) => s.offset)).toEqual([0, 0.5, 1])
    expect(stops.map((s) => s.opacity)).toEqual([1, 1, 0])
    expect(stops.map((s) => s.color)).toEqual(['#f26d6f', '#3fb950', '#b8c0cc'])
  })

  it('samples between ramp points so no fade ever lands on a hard, unblended color', () => {
    const stops = tierPlateFadeStops(TIER_PALETTE.platinum, [
      { offset: 0.25, opacity: 1 },
      { offset: 0.75, opacity: 1 },
    ])
    expect(stops[0].color).not.toBe('#f26d6f')
    expect(stops[0].color).not.toBe('#3fb950')
    expect(stops[1].color).not.toBe('#3fb950')
    expect(stops[1].color).not.toBe('#b8c0cc')
    for (const stop of stops) expect(stop.color).toMatch(/^#[0-9a-f]{6}$/)
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
    // window is the margin the owner asked for. The whole-figure framing
    // (bodyFraction 1.0, 2026-10-30) scales the art down, so this margin is
    // ~7% of the window: still clear of the top border, without the zoom.
    const scale = dest.h / 1309
    const subjectTopInWindow = 88 * scale
    expect(subjectTopInWindow / WIN.h).toBeGreaterThan(0.05)
    expect(subjectTopInWindow / WIN.h).toBeLessThan(0.16)
  })

  it('ends the visible band at bodyFraction of the figure (no cut past the feet)', () => {
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
  it('shows the whole figure (owner 2026-10-30: the thigh crop was too zoomed in)', () => {
    expect(PHOTO_FRAME.bodyFraction).toBe(1.0)
    expect(PHOTO_FRAME.headMargin).toBe(0.1)
    expect(PHOTO_FRAME.sideMargin).toBe(0.05)
  })
})
