// cardExport.test.ts — unit locks for the card layout plan (plan
// 07.2-05, CARD-03/D-09/D-10/D-12; checkpoint round 5, owner supersession:
// ONE card.svg is the source of truth, tier colors applied by code).
// The DOM shell (drawCard/downloadCard) needs a canvas — these tests lock
// the PURE core (buildCardPlan) and the filename slugification, which is
// where the correctness contracts live:
//
//  - T-072-12: the exported JPEG is a celebration artifact that circulates
//    OUTSIDE the guild (D-09) — the plan must carry ZERO guild-average data
//    (no class_average, no best), only identity + the 6 key stats + points.
//  - D-10 (round-5 edition): PORTRAIT 27:40 card; OVR number + job name
//    (NO "OVR" tag) at the parsed over-photo slot; PLAYERNAME on the plate;
//    the 6 stats in the parsed slot columns in SERVER/highlight order
//    (never re-sorted).
//  - Round-5 palette contract: tier colors come from TIER_PALETTE (code) —
//    dark text on the light metals, white on the pristine magenta; the
//    border keeps card.svg's stroke geometry with per-tier gradient stops.
//  - Round-5 typography contract: Orbitron replaced the Bebas placeholder,
//    and Orbitron is WIDER — every slot carries a fitText maxWidth bounded
//    by its column (labels/points/values never collide across columns).
//  - Round-2 lessons carried forward: exact design-space→backing-store
//    scaling (scalePath contract).
//  - Round-5 photo contract: the photo area IS the parsed crop path (both
//    surfaces clip to it); fallback chain monogram (never an empty hole).
import { describe, expect, it } from 'vitest'
import {
  buildCardPlan,
  cardFilename,
  CARD_DESIGN_HEIGHT,
  CARD_DESIGN_WIDTH,
  CARD_FIT_FLOOR,
  CARD_GEOMETRY,
  estimateOrbitron,
  fitCardText,
  measureOrbitron,
  TIER_PALETTE,
  type CardExportData,
  type TextMeasurer,
} from './cardExport'

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
  photoSrc: '/assets/classes/class-icon-assassin-cross.png',
  monogramLetter: 'A',
}

describe('buildCardPlan — card geometry (D-10, round-5 single-design edition)', () => {
  it('is PORTRAIT 27:40 at any width (card.svg\'s 1080×1600 design space), OVR above name above stats', () => {
    for (const width of [360, 1080, 2160]) {
      const plan = buildCardPlan(data, width)
      expect(plan.height).toBe((width * CARD_DESIGN_HEIGHT) / CARD_DESIGN_WIDTH)
      expect(plan.scale).toBe(width / CARD_DESIGN_WIDTH)
      // Vertical composition order: OVR number (over the photo) → job name
      // → PLAYERNAME (on the plate) → stat labels → points → values.
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
    // The name is re-centered (round-5 decision) but keeps the slot's
    // baseline + size.
    expect(plan.name.x).toBe(CARD_DESIGN_WIDTH / 2)
    expect(plan.name.y).toBe(slots.name.y)
    expect(plan.name.size).toBe(slots.name.size)
    // Each stat column rides its parsed slot, server order preserved.
    plan.stats.forEach((cell, i) => {
      expect(cell.labelX).toBe(slots.stats[i].label.x)
      expect(cell.labelY).toBe(slots.stats[i].label.y)
      expect(cell.pointsX).toBe(slots.stats[i].points.x)
      expect(cell.pointsY).toBe(slots.stats[i].points.y)
      expect(cell.valueX).toBe(slots.stats[i].value.x)
      expect(cell.valueY).toBe(slots.stats[i].value.y)
    })
  })

  it('renders the 6 stats in server order (never re-sorted), left → right', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(plan.stats.map((c) => c.label)).toEqual(['PCB', 'CRT', 'HP', 'ASP', 'PAT', 'SPM'])
    for (let i = 1; i < 6; i++) {
      expect(plan.stats[i].labelX).toBeGreaterThan(plan.stats[i - 1].labelX)
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
    for (const cell of plan.stats) {
      expect(Object.keys(cell).sort()).toEqual([
        'label',
        'labelMaxW',
        'labelSize',
        'labelX',
        'labelY',
        'points',
        'pointsMaxW',
        'pointsSize',
        'pointsX',
        'pointsY',
        'value',
        'valueMaxW',
        'valueSize',
        'valueX',
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
      expect(cell.labelSize / CARD_DESIGN_WIDTH).toBeGreaterThan(0.05)
      expect(plan.ovr.size / CARD_DESIGN_WIDTH).toBeGreaterThan(0.2)
    }
    // Same contract at any render width (linear scaling).
    const small = buildCardPlan(data, 360)
    expect(small.stats[0].pointsSize).toBeCloseTo(plan.stats[0].pointsSize * (360 / 1080), 5)
  })

  it('bounds every slot text inside its own column — no collision with the next column', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    for (let i = 0; i < 6; i++) {
      const cell = plan.stats[i]
      // The column bound: distance to the next column's label (last column
      // runs to the plate's inner right, mirrored from the crop bbox).
      const nextX =
        i < 5 ? CARD_GEOMETRY.slots.stats[i + 1].label.x : CARD_DESIGN_WIDTH - CARD_GEOMETRY.cropBBox.x
      const colW = nextX - CARD_GEOMETRY.slots.stats[i].label.x - 8
      expect(cell.labelMaxW).toBeCloseTo(colW, 6)
      expect(cell.pointsMaxW).toBeCloseTo(colW, 6)
      expect(cell.valueMaxW).toBeCloseTo(colW, 6)
      expect(cell.labelMaxW).toBeGreaterThan(100)
      // A 2-digit points value at the design size fits (possibly shrunk by
      // fitText — the maxW is the hard bound either way).
      expect(cell.pointsMaxW).toBeGreaterThan(cell.pointsSize * 0.8)
    }
  })

  it('names shrink-to-fit inside a generous plate bound, still readable', () => {
    const plan = buildCardPlan(data, CARD_DESIGN_WIDTH)
    expect(plan.name.maxWidth).toBeGreaterThan(CARD_DESIGN_WIDTH * 0.7)
    expect(plan.name.size / CARD_DESIGN_WIDTH).toBeGreaterThan(0.1)
  })
})

describe('buildCardPlan — round-5 palette contract (tier colors applied by code)', () => {
  it('keys the palette by the OVR tier and carries THAT tier\'s plate fill + border stops + text fill', () => {
    const ovrByTier = { bronze: 60, silver: 70, gold: 80, platinum: 87 } as const
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const plan = buildCardPlan({ ...data, ovr: ovrByTier[tier] }, CARD_DESIGN_WIDTH)
      expect(plan.tier).toBe(tier)
      expect(plan.palette).toBe(TIER_PALETTE[tier])
      // Text contrast: dark on the light metals, white on the deep magenta.
      expect(plan.name.color).toBe(TIER_PALETTE[tier].textFill)
      if (tier === 'platinum') {
        expect(plan.name.color).toBe('#ffffff')
      } else {
        expect(plan.name.color).toBe('#241a10')
      }
      // The border keeps card.svg's GEOMETRY with the palette's stops.
      expect(plan.card.borderStroke.width).toBe(40)
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
      expect(plan.photo.src).toBe('/assets/classes/class-icon-assassin-cross.png')
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
    const fit = fitCardText(plan.ovr.text, 900, plan.ovr.size, plan.ovr.maxW)
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

describe('buildCardPlan — stat slot text (round 5: points as big palette text)', () => {
  it('rounds points for display and renders the muted — slot for null (never invents numbers)', () => {
    const plan = buildCardPlan(
      { ...data, stats: data.stats.map((s, i) => (i === 1 ? { ...s, points: null } : s)) },
      CARD_DESIGN_WIDTH,
    )
    expect(plan.stats[0].points).toBe('96')
    expect(plan.stats[1].points).toBe('—')
    // Null points changes ONLY the text — the slot positions stay put.
    expect(plan.stats[1].pointsX).toBe(plan.stats[1].labelX + (CARD_GEOMETRY.slots.stats[1].points.x - CARD_GEOMETRY.slots.stats[1].label.x))
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
      expect(backing.stats[i].labelX).toBe(base.stats[i].labelX * 2)
      expect(backing.stats[i].pointsY).toBe(base.stats[i].pointsY * 2)
      expect(backing.stats[i].pointsSize).toBe(base.stats[i].pointsSize * 2)
      expect(backing.stats[i].valueY).toBe(base.stats[i].valueY * 2)
      expect(backing.stats[i].valueMaxW).toBe(base.stats[i].valueMaxW * 2)
    }
  })
})

describe('cardFilename — export slugification', () => {
  it("slugifies the player name: 'Maria Silva' → 'hellz-maria-silva.jpg'", () => {
    expect(cardFilename('Maria Silva')).toBe('hellz-maria-silva.jpg')
  })

  it('strips diacritics and collapses punctuation', () => {
    expect(cardFilename('João Álvares')).toBe('hellz-joao-alvares.jpg')
    expect(cardFilename('  Ana   B  ')).toBe('hellz-ana-b.jpg')
  })
})
