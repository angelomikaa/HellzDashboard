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
  CARD_PLATE_GRADIENT_LINE,
  IMPECAVEL_BORDER_STOPS,
  PHOTO_FRAME,
  PHOTO_TRANSFORM_DEFAULT,
  TIER_PALETTE,
  applyPhotoTransform,
  photoDestRect,
  scalePath,
  scaleRect,
  scopedLogo,
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

  it('resolves the photo area inside the design space (crop path is BACK)', () => {
    const b = CARD_GEOMETRY.cropBBox
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w).toBeLessThanOrEqual(CARD_DESIGN_WIDTH + 1)
    expect(b.y + b.h).toBeLessThanOrEqual(CARD_DESIGN_HEIGHT)
    // Owner 2026-11-05: the re-seed brought `crop-path` back — the photo is
    // the shield's TOP PORTION, not the whole shield.
    expect(CARD_GEOMETRY.cropPath).not.toBe(CARD_GEOMETRY.platePath)
    expect(b.w).toBeGreaterThan(CARD_DESIGN_WIDTH * 0.85)
    expect(b.h).toBeLessThan(CARD_DESIGN_HEIGHT * 0.6)
    // The crop closes above the name/stat bands.
    expect(b.y + b.h).toBeLessThan(CARD_GEOMETRY.slots.name.y)
  })

  it('draws the owner\'s current tier-color-border ring: tier ramp at the file\'s 30% opacity', () => {
    // Owner 2026-11-05: `<g id="tier-color-border" opacity="0.3">` wraps the
    // stroked silhouette (32px, clipped by clip-path-1). The ring paints the
    // TIER's ramp (the file's dark stroke is a placeholder) at the FILE's
    // opacity.
    const border = CARD_GEOMETRY.borderStroke
    expect(border).toBeDefined()
    expect(border?.width).toBe(32)
    expect(border?.opacity).toBeCloseTo(0.3, 6)
    expect(border?.strokePath).toBe(CARD_GEOMETRY.platePath)
    expect(border?.line).toBe(CARD_PLATE_GRADIENT_LINE)
    expect(border?.stops).toBe(IMPECAVEL_BORDER_STOPS)
    expect(border?.stops?.map((s) => s.color)).toEqual(['#ff12f7', '#ed7b00'])
    // The file clips the ring to the plate silhouette — parsed from
    // clipPath#clip-path-1.
    expect(border?.clipPath).toBe(CARD_GEOMETRY.platePath)
  })

  it('has NO stats contrast plate any more (the backplate carries the contrast)', () => {
    // Owner 2026-11-05: "o stats plate sumiu (o back-plate agora faz o
    // trabalho do contraste)" — the parser no longer models the layer at all.
    expect('statsPlate' in CARD_GEOMETRY).toBe(false)
  })

  it('parses the LAST_UPDATE line: the date slot + the static "• atualizado" segments', () => {    const lu = CARD_GEOMETRY.slots.lastUpdate
    expect(lu).toBeDefined()
    if (lu === undefined) return
    // The first text of the group is the live date (36px), hand-placed under
    // the player name.
    expect(lu.date.x).toBeCloseTo(429.072, 1)
    expect(lu.date.y).toBeCloseTo(1050.662, 1)
    expect(lu.date.size).toBe(36)
    expect(lu.date.y).toBeGreaterThan(CARD_GEOMETRY.slots.name.y)
    expect(lu.date.y).toBeLessThan(CARD_GEOMETRY.slots.stats[0].label.y)
    // The trailing segments keep the owner's literal strings and anchors.
    expect(lu.suffix.map((s) => s.text)).toEqual(['•', 'atualizado'])
    expect(lu.suffix[0].x).toBeCloseTo(503.01, 1)
    expect(lu.suffix[1].x).toBeCloseTo(520.428, 1)
    for (const segment of lu.suffix) {
      expect(segment.y).toBeCloseTo(lu.date.y, 1)
      expect(segment.size).toBe(36)
    }
  })

  it('parses the brand mark the file draws and scopes its gradient ids per card', () => {
    // Owner 2026-11-05 added `logo-hellz` to the file: the app paints THAT
    // mark (the old bundled hellz-mark.svg overlay double-drew the logo).
    const logo = CARD_GEOMETRY.logo
    expect(logo).toBeDefined()
    if (logo === undefined) return
    expect(logo.markup).toContain('id="logo-hellz"')
    expect(logo.markup).toContain('polygon')
    expect(logo.gradients).toContain('id="Magenta_to_Orange-2"')
    // Two cards on one page must not cross-wire gradients: the scope suffixes
    // both the defs' ids and every url(#…) reference.
    const scoped = scopedLogo(logo, 'abc')
    expect(scoped.gradients).toContain('id="Magenta_to_Orange-2-abc"')
    expect(scoped.markup).not.toContain('url(#Magenta_to_Orange-2)')
    expect(scoped.markup).toContain('url(#Magenta_to_Orange-2-abc)')
  })
})

describe('cardAssets — placeholder TEXT slots resolve to real positions/sizes', () => {
  it('resolves the OVR slot: the BIGGEST text in the OVR group, ≈148px at (112.481, 399.59)', () => {
    const ovr = CARD_GEOMETRY.slots.ovr
    expect(ovr.x).toBeCloseTo(112.481, 1)
    expect(ovr.y).toBeCloseTo(399.59, 1)
    // The re-export states the effective size inline (148.014px; the round-8
    // file reached the same 148px through its 6.992×21.169 matrix hack).
    expect(ovr.size).toBeCloseTo(148.014, 1)
    expect(ovr.size).toBeGreaterThan(140) // the number must be BIG (readability rounds 3-8)
    expect(ovr.size).toBeLessThan(160)
  })

  it('resolves the job slot (the SMALLER OVR-group text, 48px Bebas) directly under the number', () => {
    const job = CARD_GEOMETRY.slots.job
    expect(job.x).toBeCloseTo(112.481, 1)
    expect(job.y).toBeCloseTo(455.297, 1)
    expect(job.size).toBe(48)
    expect(job.y).toBeGreaterThan(CARD_GEOMETRY.slots.ovr.y)
    // The job line must stay smaller than the number it sits under.
    expect(job.size).toBeLessThan(CARD_GEOMETRY.slots.ovr.size)
  })

  it('resolves the PLAYERNAME slot (the ONE Orbitron text, ≈72px) on the plate between photo and stats', () => {
    const name = CARD_GEOMETRY.slots.name
    expect(name.x).toBeCloseTo(246.626, 1)
    expect(name.y).toBeCloseTo(1007.454, 1)
    expect(name.size).toBeCloseTo(71.976, 1)
    expect(name.size).toBeGreaterThan(60)
    expect(name.size).toBeLessThan(80)
    // Below the crop path (it sits on the plate), above the stat labels.
    expect(name.y).toBeGreaterThan(CARD_GEOMETRY.cropBBox.y + CARD_GEOMETRY.cropBBox.h)
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

describe('cardAssets — tier palettes (the code-driven tier colors)', () => {
  it('carries a DISTINCT plate fill per tier, the Impecável one from the file', () => {
    const fills = (['bronze', 'silver', 'gold', 'platinum'] as const).map((t) => TIER_PALETTE[t].plateFill)
    expect(new Set(fills).size).toBe(4)
    expect(TIER_PALETTE.bronze.plateFill).toBe('#d1a972')
    expect(TIER_PALETTE.silver.plateFill).toBe('#e6e6e6')
    expect(TIER_PALETTE.gold.plateFill).toBe('#f9b745')
    // Owner 2026-11-05: "as cores do svg ... serão a nova cor do tier".
    expect(TIER_PALETTE.platinum.plateFill).toBe('#ff12f7')
    expect(TIER_PALETTE.platinum.plateStops?.map((s) => s.color)).toEqual(['#ff12f7', '#ed7b00'])
  })

  it('carries the border gradients per tier, with the Impecável ring on the card.svg ramp', () => {
    expect(TIER_PALETTE.bronze.borderStops.map((s) => s.color)).toEqual(['#ed7b00', '#b49f00'])
    expect(TIER_PALETTE.silver.borderStops.map((s) => s.color)).toEqual(['#7e888e', '#cbd2d6'])
    expect(TIER_PALETTE.gold.borderStops.map((s) => s.color)).toEqual(['#ff635f', '#d38f00'])
    // The top tier ring is the SAME Magenta_to_Orange ramp as its plate.
    expect(TIER_PALETTE.platinum.borderStops.map((s) => s.color)).toEqual(['#ff12f7', '#ed7b00'])
    expect(TIER_PALETTE.platinum.borderStops).toBe(TIER_PALETTE.platinum.plateStops)
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      expect(TIER_PALETTE[tier].borderStops.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('follows the contrast rule: dark text on the light metals, white on the deep magenta', () => {
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

describe('cardAssets — the member\'s photo framing inside the crop path (owner 2026-11-05)', () => {
  const WIN = CARD_GEOMETRY.cropBBox
  const screenshot = photoDestRect(1080, 2400, null, WIN)

  it('is a no-op for the default transform (the measured cover fit renders untouched)', () => {
    expect(applyPhotoTransform(screenshot, WIN, null)).toBe(screenshot)
    expect(applyPhotoTransform(screenshot, WIN, PHOTO_TRANSFORM_DEFAULT)).toBe(screenshot)
  })

  it('zooms about the window center and keeps the photo covering the crop window', () => {
    const zoomed = applyPhotoTransform(screenshot, WIN, { zoom: 2, x: 0, y: 0 })
    expect(zoomed.w).toBeCloseTo(screenshot.w * 2, 6)
    expect(zoomed.h).toBeCloseTo(screenshot.h * 2, 6)
    // Aspect preserved, centered on the window.
    expect(zoomed.w / zoomed.h).toBeCloseTo(screenshot.w / screenshot.h, 6)
    expect(zoomed.x + zoomed.w / 2).toBeCloseTo(WIN.x + WIN.w / 2, 6)
    expect(zoomed.y + zoomed.h / 2).toBeCloseTo(WIN.y + WIN.h / 2, 6)
  })

  it('pans within the overflow only — ±1 puts the image edge on the window edge', () => {
    for (const x of [-1, -0.5, 0, 0.5, 1]) {
      for (const y of [-1, -0.5, 0, 0.5, 1]) {
        const dest = applyPhotoTransform(screenshot, WIN, { zoom: 1.5, x, y })
        expect(dest.x).toBeLessThanOrEqual(WIN.x + 1e-6)
        expect(dest.y).toBeLessThanOrEqual(WIN.y + 1e-6)
        expect(dest.x + dest.w).toBeGreaterThanOrEqual(WIN.x + WIN.w - 1e-6)
        expect(dest.y + dest.h).toBeGreaterThanOrEqual(WIN.y + WIN.h - 1e-6)
      }
    }
    const right = applyPhotoTransform(screenshot, WIN, { zoom: 1, x: 1, y: 0 })
    expect(right.x).toBeCloseTo(WIN.x, 6)
    const left = applyPhotoTransform(screenshot, WIN, { zoom: 1, x: -1, y: 0 })
    expect(left.x + left.w).toBeCloseTo(WIN.x + WIN.w, 6)
  })

  it('clamps out-of-range pans (a corrupted store never opens a gap)', () => {
    const dest = applyPhotoTransform(screenshot, WIN, { zoom: 1, x: 9, y: -9 })
    expect(dest.x).toBeCloseTo(WIN.x, 6)
    expect(dest.y + dest.h).toBeCloseTo(WIN.y + WIN.h, 6)
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
    // The 2026-11-05 crop window is short and wide, so the frame is
    // width-constrained and anchored to the TOP: the subject's own headroom
    // (88 art px) scaled into the window is the margin the owner asked for.
    const scale = dest.h / 1309
    const subjectTopInWindow = dest.y - WIN.y + 88 * scale
    expect(subjectTopInWindow / WIN.h).toBeGreaterThan(0.05)
    expect(subjectTopInWindow / WIN.h).toBeLessThan(0.16)
    expect(dest.y).toBeLessThanOrEqual(WIN.y + 0.5)
  })

  it('crops only BELOW the head (never the top of the figure)', () => {
    const dest = photoDestRect(1197, 1309, HP_BOUNDS, WIN)
    const scale = dest.h / 1309
    // Window bottom maps to this image row:
    const visibleBottomImageRow = (WIN.y + WIN.h - dest.y) / scale
    const figureH = HP_BOUNDS.bottom - HP_BOUNDS.top
    const visibleFigureFraction = (visibleBottomImageRow - HP_BOUNDS.top) / figureH
    // The head + most of the body survive; only the lower part is cropped.
    expect(visibleFigureFraction).toBeGreaterThan(0.55)
    expect(visibleFigureFraction).toBeLessThan(1)
    expect(visibleBottomImageRow).toBeLessThanOrEqual(HP_BOUNDS.bottom + 1)
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
