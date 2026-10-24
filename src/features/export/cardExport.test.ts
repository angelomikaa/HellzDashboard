// cardExport.test.ts — unit locks for the card layout plan (plan
// 07.2-05, CARD-03/D-09/D-10/D-12; checkpoint round 7, owner supersession:
// ONE card.svg is the source of truth, Bebas Neue everywhere except the
// player name, border-over-photo, central column alignment, PNG export).
// The DOM shell (drawCard/downloadCard) needs a canvas — the pure-core
// tests below lock buildCardPlan + the filename + the fit contract, and a
// stubbed-DOM paint-sequence test locks the PNG export contract:
//
//  - T-072-12: the exported PNG is a celebration artifact that circulates
//    OUTSIDE the guild (D-09) — the plan must carry ZERO guild-average data
//    (no class_average, no best), only identity + the 6 key stats + points.
//  - D-10 (round-7 edition): PORTRAIT 27:40 card; OVR number + job name
//    (NO "OVR" tag) at the parsed over-photo slot; PLAYERNAME on the plate
//    (Orbitron — the ONLY Orbitron slot); the 6 stats in the parsed slot
//    columns in SERVER/highlight order (never re-sorted), each column's
//    three lines centrally aligned on the column center.
//  - Round-7 font split: the plan CARRIES the font strings — Bebas Neue for
//    every slot except the player name (Orbitron); both surfaces read them
//    from the plan so the split cannot drift.
//  - Round-5 palette contract (held): tier colors come from TIER_PALETTE
//    (code) — dark text on the light metals, and the pristine plate's
//    rainbow forces the round-10 contrast rule (white → black).
//  - Round-6/7 fit contract: fitCardText with REAL measured metrics (canvas
//    measureText) — shrink-to-fit with a readability floor, emergency
//    glyph-squeeze only past it; labels may be 3–6 chars ('PDMG.R') and
//    must still fit their column.
//  - PNG export (round 7): toBlob('image/png'), filename hellz-*.png, NO
//    full-canvas background fill — the paint sequence fills only the plate
//    path + the in-crop scrim (verified against a recorded canvas op log).
//  - Round-2 lessons carried forward: exact design-space→backing-store
//    scaling (scalePath contract).
//  - Round-5 photo contract: the photo area IS the parsed crop path (both
//    surfaces clip to it); fallback chain monogram (never an empty hole).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCardPlan,
  cardFilename,
  CARD_DESIGN_HEIGHT,
  CARD_DESIGN_WIDTH,
  CARD_FIT_FLOOR,
  CARD_FONTS,
  CARD_GEOMETRY,
  estimateBebas,
  estimateOrbitron,
  fitCardText,
  measureBebas,
  measureOrbitron,
  TIER_PALETTE,
  downloadCard,
  type CardExportData,
  type TextMeasurer,
} from './cardExport'
import { contrastRatio, resolveCardTextFill } from './cardAssets'

const data: CardExportData = {
  name: 'Maria Silva',
  charClass: 'Assassin Cross',
  charFunction: 'dps',
  ovr: 87.4,
  stats: [
    { label_short: 'PCB', value: '1.234', points: 96 },
    { label_short: 'CRT', value: '42,5%', points: 71 },
    { label_short: 'HP', value: '98.765', points: 55 },
    { label_short: 'ASP', value: '183%', points: 30 },
    { label_short: 'PAT', value: '2.345', points: 12 },
    { label_short: 'SPM', value: '67,8%', points: 88 },
  ],
  photoSrc: '/assets/classes/class-f-assassin-cross.webp',
  monogramLetter: 'A',
}

describe('buildCardPlan — card geometry (D-10, round-5 single-design edition)', () => {
  it('is PORTRAIT 27:40 at any width (card.svg\'s 1080×1600 design space), OVR above name above stats', () => {
    for (const width of [360, 1080, 2160]) {
      const plan = buildCardPlan(data, width)
      expect(plan.height).toBe((width * CARD_DESIGN_HEIGHT) / CARD_DESIGN_WIDTH)
      expect(plan.scale).toBe(width / CARD_DESIGN_WIDTH)
      // Vertical composition order: OVR number (over the photo) → job name
      // → PLAYERNAME (on the plate) → LABEL → POINTS → value (the label row
      // sits ABOVE the rating row — the round-8 re-seed's structure).
      expect(plan.ovr.y).toBeLessThan(plan.ovr.jobY)
      expect(plan.ovr.jobY).toBeLessThan(plan.name.y)
      for (const cell of plan.stats) {
        expect(plan.name.y).toBeLessThan(cell.labelY)
        expect(cell.labelY).toBeLessThan(cell.pointsY)
        expect(cell.pointsY).toBeLessThan(cell.valueY)
      }
    }
  })

  it('places every text at the PARSED slot positions (the owner\'s placement authority)', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    const slots = CARD_GEOMETRY.slots
    expect(plan.ovr.x).toBe(slots.ovr.x)
    expect(plan.ovr.y).toBe(slots.ovr.y)
    expect(plan.ovr.size).toBeCloseTo(slots.ovr.size, 6)
    expect(plan.ovr.jobX).toBe(slots.job.x)
    expect(plan.ovr.jobY).toBe(slots.job.y)
    // The name renders CENTERED on the plate bbox's horizontal midline (the
    // parsed x anchors the placeholder's left edge — the owner drew
    // 'PLAYERNAME' centered on the shield), baseline + size from the slot.
    const plateMid = CARD_GEOMETRY.plateBBox.x + CARD_GEOMETRY.plateBBox.w / 2
    expect(plan.name.x).toBeCloseTo(plateMid, 6)
    expect(plan.name.y).toBe(slots.name.y)
    expect(plan.name.size).toBe(slots.name.size)
    // Each stat column rides its parsed slot: all three lines center on the
    // DERIVED column center (= points anchor + width('99')/2 — the owner
    // centered the placeholder on the grid, round 7), server order preserved.
    plan.stats.forEach((cell, i) => {
      const center =
        slots.stats[i].points.x + measureBebas('99', 400, slots.stats[i].points.size) / 2
      expect(cell.centerX).toBeCloseTo(center, 6)
      expect(cell.labelY).toBe(slots.stats[i].label.y)
      expect(cell.pointsY).toBe(slots.stats[i].points.y)
      expect(cell.valueY).toBe(slots.stats[i].value.y)
    })
  })

  it('renders the 6 stats in server order (never re-sorted), left → right', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(plan.stats.map((c) => c.label)).toEqual(['PCB', 'CRT', 'HP', 'ASP', 'PAT', 'SPM'])
    for (let i = 1; i < 6; i++) {
      expect(plan.stats[i].centerX).toBeGreaterThan(plan.stats[i - 1].centerX)
    }
  })

  it('has NO "OVR" tag and NO aggregate-shaped fields (round 4/5 contracts held)', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(plan.ovr.jobText).toBe('Assassin Cross')
    const serialized = JSON.stringify(plan)
    expect(serialized).not.toContain('caption')
    expect(serialized).not.toContain('subtitle')
    expect(serialized).not.toContain('chip')
  })

  it('carries ZERO guild-average data anywhere in the plan (D-09/T-072-12 export contract)', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    const serialized = JSON.stringify(plan).toLowerCase()
    expect(serialized).not.toContain('class_average')
    expect(serialized).not.toContain('average')
    expect(serialized).not.toContain('"best"')
    // The stat-slot field list is CLOSED: label + points + value with their
    // anchors/bounds — nothing else (in particular: no aggregate, no chip).
    // centerX / colW are the column geometry (round 7 central alignment).
    for (const cell of plan.stats) {
      expect(Object.keys(cell).sort()).toEqual([
        'centerX',
        'colW',
        'label',
        'labelMaxW',
        'labelSize',
        'labelY',
        'points',
        'pointsMaxW',
        'pointsSize',
        'pointsY',
        'value',
        'valueMaxW',
        'valueSize',
        'valueY',
      ])
    }
  })
})

describe('buildCardPlan — round-5 typography contract (Orbitron fit inside the columns)', () => {
  it('keeps the BIG type the readability rounds locked: points ≥ 8% of the card width', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    for (const cell of plan.stats) {
      expect(cell.pointsSize / CARD_DESIGN_WIDTH).toBeGreaterThan(0.08)
      expect(cell.labelSize / CARD_DESIGN_WIDTH).toBeGreaterThan(0.04)
      expect(plan.ovr.size / CARD_DESIGN_WIDTH).toBeGreaterThan(0.13)
    }
    // Same contract at any render width (linear scaling).
    const small = buildCardPlan(data, 360)
    expect(small.stats[0].pointsSize).toBeCloseTo(plan.stats[0].pointsSize * (360 / 1080), 5)
  })

  it('bounds every slot text inside its own column — no collision with the next column', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    // The column grid: the DERIVED centers (points anchor + width('99')/2,
    // the same contract buildCardPlan applies — evenly pitched ≈141px).
    const centers = CARD_GEOMETRY.slots.stats.map(
      (s) => s.points.x + measureBebas('99', 400, s.points.size) / 2,
    )
    for (let i = 0; i < 6; i++) {
      const cell = plan.stats[i]
      // Column bound: midpoint to the previous center + midpoint to the next
      // center, minus a gutter (boundaries lie midway between centers).
      const leftGap = i === 0 ? 0 : centers[i] - centers[i - 1]
      const rightGap = i === 5 ? 0 : centers[i + 1] - centers[i]
      const span = i === 0 ? rightGap : i === 5 ? leftGap : (leftGap + rightGap) / 2
      const colW = span - 8
      expect(cell.labelMaxW).toBeCloseTo(colW, 6)
      expect(cell.pointsMaxW).toBeCloseTo(colW, 6)
      expect(cell.valueMaxW).toBeCloseTo(colW, 6)
      expect(cell.labelMaxW).toBeGreaterThan(100)
      // A 2-digit points value at the design size fits (possibly shrunk by
      // fitText — the maxW is the hard bound either way).
      expect(cell.pointsMaxW).toBeGreaterThan(cell.pointsSize * 0.8)
    }
  })

  it('names shrink-to-fit inside a symmetric plate bound, still readable', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    // The bound is symmetric inside the plate's inner span (gutter 14px per
    // side) — the name can use the shield's full width, never leave it.
    const plateMid = CARD_GEOMETRY.plateBBox.x + CARD_GEOMETRY.plateBBox.w / 2
    const expectedMaxW = 2 * Math.min(
      plateMid - CARD_GEOMETRY.plateBBox.x - 14,
      CARD_GEOMETRY.plateBBox.x + CARD_GEOMETRY.plateBBox.w - 14 - plateMid,
    )
    expect(plan.name.maxWidth).toBeCloseTo(expectedMaxW, 6)
    expect(plan.name.maxWidth).toBeGreaterThan(CARD_DESIGN_WIDTH * 0.7)
    expect(plan.name.size / CARD_DESIGN_WIDTH).toBeGreaterThan(0.05)
  })
})

describe('buildCardPlan — round-5 palette contract (tier colors applied by code)', () => {
  it('keys the palette by the OVR tier and carries THAT tier\'s plate fill + border stops + text fill', () => {
    const ovrByTier = { bronze: 60, silver: 70, gold: 80, platinum: 87 } as const
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const plan = buildCardPlan({ ...data, ovr: ovrByTier[tier] }, CARD_DESIGN_WIDTH)
      expect(plan.tier).toBe(tier)
      expect(plan.palette).toBe(TIER_PALETTE[tier])
      // Text contrast: dark on the light metals; the pristine plate carries
      // the light rainbow, so its white fill fails AA and flips to black
      // (round 10). The NAME and the stats carry the RESOLVED fill.
      expect(plan.name.color).toBe(plan.textFill)
      expect(plan.textFill).toBe(resolveCardTextFill(TIER_PALETTE[tier]))
      if (tier === 'platinum') {
        expect(plan.name.color).toBe('#000000')
      } else {
        expect(plan.name.color).toBe('#241a10')
      }
      // The border keeps card.svg's GEOMETRY with the palette's stops.
      expect(plan.card.borderStroke.width).toBe(48)
      expect(plan.card.borderStroke.strokePath).toBe(CARD_GEOMETRY.platePath)
      expect(plan.palette.borderStops).toEqual(TIER_PALETTE[tier].borderStops)
    }
  })

  it('paints the over-photo OVR block white on EVERY tier (photo legibility is tier-independent)', () => {
    const ovrByTier = { bronze: 60, silver: 70, gold: 80, platinum: 87 } as const
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const plan = buildCardPlan({ ...data, ovr: ovrByTier[tier] }, CARD_DESIGN_WIDTH)
      expect(plan.ovr.color).toBe('#FFFFFF')
    }
  })

  it('round-10 contrast rule: pristine renders the plate rainbow and keeps text at AA (white → black)', () => {
    const platinum = TIER_PALETTE.platinum
    // The plate carries the same five UI stops as the border.
    expect(platinum.plateStops).toEqual(platinum.borderStops)
    expect(platinum.plateStops).toHaveLength(5)
    // White cannot hold AA anywhere on that plate; black can (the flip).
    for (const stop of platinum.plateStops ?? []) {
      expect(contrastRatio('#ffffff', stop.color)).toBeLessThan(4.5)
      expect(contrastRatio('#000000', stop.color)).toBeGreaterThanOrEqual(4.5)
    }
    expect(resolveCardTextFill(platinum)).toBe('#000000')
    // Metals keep their dark brown — the rule never re-tints a passing fill.
    for (const tier of ['bronze', 'silver', 'gold'] as const) {
      expect(resolveCardTextFill(TIER_PALETTE[tier])).toBe('#241a10')
    }
  })
})

describe('buildCardPlan — round-5 photo contract (crop path + fallbacks)', () => {
  it('carries the parsed crop path as the photo clip on BOTH surfaces, with its scaled bbox', () => {
    const design = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(design.photoClipPath).toBe(CARD_GEOMETRY.cropPath)
    expect(design.photoBBox).toEqual({
      x: CARD_GEOMETRY.cropBBox.x,
      y: CARD_GEOMETRY.cropBBox.y,
      w: CARD_GEOMETRY.cropBBox.w,
      h: CARD_GEOMETRY.cropBBox.h,
    })
    const backing = buildCardPlan(data, 2160)
    expect(backing.photoClipPath).toBe(CARD_GEOMETRY.cropPath)
    expect(backing.photoBBox.w).toBe(CARD_GEOMETRY.cropBBox.w * 2)
    expect(backing.photoBBox.h).toBe(CARD_GEOMETRY.cropBBox.h * 2)
  })

  it('backs the over-photo OVR block with a top legibility scrim inside the crop area', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(plan.scrim.y1).toBe(plan.photoBBox.y)
    // The scrim must cover the OVR number AND the job name below it.
    expect(plan.scrim.y2).toBeGreaterThan(plan.ovr.jobY)
    expect(plan.scrim.y2).toBeLessThan(plan.photoBBox.y + plan.photoBBox.h)
    expect(plan.scrim.alpha).toBeGreaterThan(0)
    expect(plan.scrim.alpha).toBeLessThan(1)
  })

  it('carries the image draw when a photo src is set (screenshot or class portrait)', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(plan.photo.kind).toBe('image')
    if (plan.photo.kind === 'image') {
      expect(plan.photo.src).toBe('/assets/classes/class-f-assassin-cross.webp')
    }
  })

  it('carries the ASST-01 monogram fallback when no photo exists (photoSrc null)', () => {
    const plan = buildCardPlan({ ...data, photoSrc: null }, CARD_DESIGN_WIDTH)
    expect(plan.photo.kind).toBe('monogram')
    if (plan.photo.kind === 'monogram') {
      expect(plan.photo.letter).toBe('A')
    } else {
      expect.fail('expected monogram photo fallback')
    }
  })
})

describe('fitCardText — the round-6 shared fit contract (measured, not estimated)', () => {
  // The REAL advance that caused the round-5 page overflow, measured in the
  // headless harness: Orbitron 700 '88' at 128px rendered 213.5px — 0.834em
  // per glyph, far wider than the 0.62em estimate the SVG squeeze used.
  const realOrbitron: TextMeasurer = (text, _weight, size) => text.length * size * 0.834

  it('shrinks a slot the old 0.62em estimate would have passed (the regression that hit Destaques)', () => {
    // '88' points at 128px in the last column (bound 161): the estimate said
    // 158.7 ≤ 161 → no squeeze → real render 213.5px, out of the plate.
    const fit = fitCardText('88', 700, 128, 161, realOrbitron)
    expect(fit.size).toBeLessThan(128)
    expect(fit.squeezeTo).toBeUndefined()
    // The fitted result MEASURES inside the bound (the contract's invariant).
    expect(realOrbitron('88', 700, fit.size)).toBeLessThanOrEqual(161 + 1e-9)
    // Same for the 3-letter labels that bled into the next column.
    const label = fitCardText('PCB', 700, 72, 136.5, realOrbitron)
    expect(label.size).toBeLessThan(72)
    expect(realOrbitron('PCB', 700, label.size)).toBeLessThanOrEqual(136.5 + 1e-9)
  })

  it('keeps fitting text untouched (no distortion when the design size fits)', () => {
    const narrow: TextMeasurer = (t, _w, s) => t.length * s * 0.5
    const fit = fitCardText('87', 900, 256, 920, narrow)
    expect(fit).toEqual({ size: 256 })
  })

  it('clamps at the readability floor and squeezes glyphs only past it (the emergency path)', () => {
    const extreme: TextMeasurer = (t, _w, s) => t.length * s * 3
    const fit = fitCardText('888', 700, 128, 161, extreme)
    expect(fit.size).toBeCloseTo(128 * CARD_FIT_FLOOR, 6)
    expect(fit.squeezeTo).toBe(161)
    // A moderately long name shrinks WITHOUT reaching the floor.
    const name = fitCardText('Maria Silva', 700, 128, 885, realOrbitron)
    expect(name.size).toBeGreaterThan(128 * CARD_FIT_FLOOR)
    expect(name.squeezeTo).toBeUndefined()
  })

  it('keeps the big points type readable under real Orbitron widths (≥ 8% of the card width)', () => {
    // The 2-digit points hero number after fitting stays above the round-4
    // readability lock (8% of 1080 = 86.4px at design scale).
    const fit = fitCardText('88', 700, 128, 161, realOrbitron)
    expect(fit.size / CARD_DESIGN_WIDTH).toBeGreaterThan(0.08)
  })

  it('bounds the OVR number (plan insurance shared by both surfaces)', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(plan.ovr.maxW).toBeCloseTo(CARD_DESIGN_WIDTH - CARD_GEOMETRY.slots.ovr.x - 40, 6)
    // The 2-3 digit OVR hero never binds at design size.
    const fit = fitCardText(plan.ovr.text, 400, plan.ovr.size, plan.ovr.maxW)
    expect(fit.size).toBe(plan.ovr.size)
  })

  it('measures real metrics in the browser and falls back to the conservative estimate outside it', () => {
    // In vitest there is no 2D canvas → the measurer degrades to the
    // deliberately-wide estimate (never zero, never NaN).
    const w = measureOrbitron('PCB', 700, 72)
    expect(w).toBeGreaterThan(0)
    expect(Number.isFinite(w)).toBe(true)
    expect(w).toBe(estimateOrbitron('PCB', 700, 72))
  })
})

describe('buildCardPlan — round-7 font split (Bebas everywhere, Orbitron only in the name)', () => {
  it('carries the font strings IN the plan — both surfaces read them, no drift possible', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(plan.fonts.slots).toBe('Bebas Neue')
    expect(plan.fonts.name).toBe('Orbitron')
    expect(plan.fonts).toBe(CARD_FONTS)
  })

  it('measures Bebas with real metrics in the browser; falls back to the estimate outside it', () => {
    // Node/vitest has no 2D canvas → the conservative estimate (never 0/NaN).
    const w = measureBebas('PDMG.R', 400, 48)
    expect(w).toBeGreaterThan(0)
    expect(Number.isFinite(w)).toBe(true)
    expect(w).toBe(estimateBebas('PDMG.R', 400, 48))
  })

  it('keeps the estimate conservative: 0.5em/char (Bebas is narrow — never crush labels)', () => {
    // 0.5em/char over-estimates real Bebas advances (harness-verified) while
    // keeping 4–6-char labels comfortably above the readability floor.
    expect(estimateBebas('PDMG.R', 400, 48)).toBe(6 * 48 * 0.5)
    expect(estimateBebas('PVP.R', 400, 48)).toBe(5 * 48 * 0.5)
  })

  it('fits a 6-char label (PDMG.R) inside its column under Bebas metrics, above the floor', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    for (const cell of plan.stats) {
      const fit = fitCardText('PDMG.R', 400, cell.labelSize, cell.labelMaxW, estimateBebas)
      expect(fit.squeezeTo).toBeUndefined() // shrink-to-fit, no emergency squeeze
      expect(fit.size).toBeGreaterThanOrEqual(cell.labelSize * CARD_FIT_FLOOR)
      expect(estimateBebas('PDMG.R', 400, fit.size)).toBeLessThanOrEqual(cell.labelMaxW + 1e-9)
      // The fitted label stays legible (well above the 0.55 floor at design size).
      expect(fit.size / CARD_DESIGN_WIDTH).toBeGreaterThan(0.03)
    }
  })
})

describe('downloadCard — round-7 PNG export contract (recorded paint sequence)', () => {
  interface Op { op: string; args: unknown[] }
  function makeFakeEnv(): { ops: Op[]; toBlobTypes: string[]; downloads: string[]; canvas: { width: number; height: number } } {
    const ops: Op[] = []
    const toBlobTypes: string[] = []
    const downloads: string[] = []
    const gradient = { addColorStop: () => {} }
    const ctx: Record<string, unknown> = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
      shadowColor: '',
      shadowBlur: 0,
      save: () => ops.push({ op: 'save', args: [] }),
      restore: () => ops.push({ op: 'restore', args: [] }),
      translate: (...a: unknown[]) => ops.push({ op: 'translate', args: a }),
      scale: (...a: unknown[]) => ops.push({ op: 'scale', args: a }),
      fill: () => ops.push({ op: 'fill', args: [] }),
      stroke: () => ops.push({ op: 'stroke', args: [] }),
      clip: () => ops.push({ op: 'clip', args: [] }),
      fillRect: (...a: unknown[]) => ops.push({ op: 'fillRect', args: a }),
      fillText: (...a: unknown[]) => ops.push({ op: 'fillText', args: a }),
      drawImage: (...a: unknown[]) => ops.push({ op: 'drawImage', args: a }),
      measureText: () => ({ width: 42 }),
      createLinearGradient: () => gradient,
    }
    const canvas = { width: 2160, height: 3200 }
    const fakeCanvas = {
      ...canvas,
      getContext: () => ctx,
      toBlob: (cb: (b: Blob | null) => void, type?: string) => {
        toBlobTypes.push(type ?? '')
        cb(new Blob([new Uint8Array([1, 2, 3])], { type: type ?? 'application/octet-stream' }))
      },
    }
    const fakeDocument = {
      fonts: { load: async () => [], ready: Promise.resolve() },
      body: { appendChild: () => {} },
      createElement: (tag: string) => {
        if (tag === 'canvas') return { ...fakeCanvas }
        return {
          href: '',
          download: '',
          click: () => downloads.push('clicked'),
          remove: () => {},
        }
      },
    }
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = 0
      height = 0
      set src(_v: string) {
        // No image ever loads in this stub — the graceful fallback runs.
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Path2D', class P2D {
      d: string | undefined
      constructor(d?: string) {
        this.d = d
      }
    })
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('document', fakeDocument)
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })
    return { ops, toBlobTypes, downloads, canvas }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('encodes image/png, keeps the requested hellz-*.png filename, and paints NO full-canvas background', async () => {
    const { ops, toBlobTypes, downloads, canvas } = makeFakeEnv()
    await downloadCard(data, cardFilename('Maria Silva'))
    // PNG (round 7): toBlob called with 'image/png' — the transparent card.
    expect(toBlobTypes).toEqual(['image/png'])
    expect(downloads).toEqual(['clicked'])
    // NO background: every fillRect is the in-crop legibility scrim —
    // strictly narrower than the canvas (nothing paints edge to edge).
    const fillRects = ops.filter((o) => o.op === 'fillRect')
    expect(fillRects.length).toBeGreaterThan(0)
    for (const r of fillRects) {
      const [x, y, w] = r.args as number[]
      expect(w).toBeLessThan(canvas.width)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y + (r.args[3] as number)).toBeLessThanOrEqual(canvas.height)
    }
    // The plate path paints (tier fill), the border strokes, and text draws.
    expect(ops.some((o) => o.op === 'fill')).toBe(true)
    expect(ops.some((o) => o.op === 'stroke')).toBe(true)
    expect(ops.filter((o) => o.op === 'fillText').length).toBeGreaterThanOrEqual(2 + 6 * 3 + 1)
  })
})

describe('buildCardPlan — stat slot text (round 5: points as big palette text)', () => {
  it('rounds points for display and renders the muted — slot for null (never invents numbers)', () => {
    const plan = buildCardPlan(
      { ...data, stats: data.stats.map((s, i) => (i === 1 ? { ...s, points: null } : s)) },
      CARD_DESIGN_WIDTH,
    )
    expect(plan.stats[0].points).toBe('96')
    expect(plan.stats[1].points).toBe('—')
    // Null points changes ONLY the text — the slot positions stay put
    // (centerX stays the derived column center).
    expect(plan.stats[1].centerX).toBeCloseTo(
      CARD_GEOMETRY.slots.stats[1].points.x + measureBebas('99', 400, 148) / 2,
      6,
    )
  })
})

describe('buildCardPlan — exact 2× scaling onto the download backing store', () => {
  it('maps the 1080×1600 design space exactly onto 2160×3200 (2×, no drift)', () => {
    const base = buildCardPlan(data, CARD_DESIGN_WIDTH)
    const backing = buildCardPlan(data, 2160)
    expect(backing.height).toBe(3200)
    expect(backing.ovr.x).toBe(base.ovr.x * 2)
    expect(backing.ovr.y).toBe(base.ovr.y * 2)
    expect(backing.ovr.jobY).toBe(base.ovr.jobY * 2)
    expect(backing.name.x).toBe(base.name.x * 2)
    expect(backing.name.y).toBe(base.name.y * 2)
    expect(backing.mark.y).toBe(base.mark.y * 2)
    expect(backing.mark.size).toBe(base.mark.size * 2)
    for (let i = 0; i < 6; i++) {
      expect(backing.stats[i].centerX).toBe(base.stats[i].centerX * 2)
      expect(backing.stats[i].labelMaxW).toBe(base.stats[i].labelMaxW * 2)
      expect(backing.stats[i].pointsY).toBe(base.stats[i].pointsY * 2)
      expect(backing.stats[i].pointsSize).toBe(base.stats[i].pointsSize * 2)
      expect(backing.stats[i].valueY).toBe(base.stats[i].valueY * 2)
      expect(backing.stats[i].valueMaxW).toBe(base.stats[i].valueMaxW * 2)
    }
  })
})

describe('cardFilename — export slugification', () => {
  it("slugifies the player name: 'Maria Silva' → 'hellz-maria-silva.png'", () => {
    expect(cardFilename('Maria Silva')).toBe('hellz-maria-silva.png')
  })

  it('strips diacritics and collapses punctuation', () => {
    expect(cardFilename('João Álvares')).toBe('hellz-joao-alvares.png')
    expect(cardFilename('  Ana   B  ')).toBe('hellz-ana-b.png')
  })
})
