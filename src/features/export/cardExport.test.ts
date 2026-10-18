// cardExport.test.ts — unit locks for the crest card layout plan (plan
// 07.2-05, CARD-03/D-09/D-10/D-12; checkpoint round 4 readability redesign).
// The DOM shell (drawCard/downloadCard) needs a canvas — these tests lock
// the PURE core (buildCardPlan) and the filename slugification, which is
// where the correctness contracts live:
//
//  - T-072-12: the exported JPEG is a celebration artifact that circulates
//    OUTSIDE the guild (D-09) — the plan must carry ZERO guild-average data
//    (no class_average, no best), only identity + the 6 key stats + points.
//  - D-10 (round-4 crest edition): PORTRAIT 27:40 card, OVR number + job
//    name (NO "OVR" tag) in the top box, name-only band, and the 6 stats in
//    the 2-col × 3-row arrangement in SERVER/highlight order (never
//    re-sorted) inside the tier's solid six-key-stats band.
//  - Round-2 lessons carried forward: a REAL column gutter (chips never
//    under the next column's label), every chip inside its OWN cell, and
//    exact design-space→backing-store scaling (scalePath contract).
//  - Round 4 (owner's readability redesign): the photo area IS the
//    Content-safezone; Name-only + six-key-stats are SOLID tier-fill bands
//    with per-tier contrast-aware text (dark on the light metals, white on
//    the pristine magenta); type sized for READABILITY (value type ~40%
//    larger than round 3 relative to card width — LOCKED here so a future
//    edit cannot silently shrink it again).
import { describe, expect, it } from 'vitest'
import {
  buildCardPlan,
  cardFilename,
  CREST_DESIGN_HEIGHT,
  CREST_DESIGN_WIDTH,
  CREST_GEOMETRY,
  TIER_CHIP_HEX,
  BAND_TEXT_HEX,
  type CardExportData,
} from './cardExport'

const data: CardExportData = {
  name: 'Maria Silva',
  charClass: 'Assassin Cross',
  charFunction: 'dps',
  ovr: 87.4,
  stats: [
    { label_short: 'PCB', value: '1.234', points: 96, tier: 'platinum' },
    { label_short: 'CRT', value: '42,5%', points: 71, tier: 'gold' },
    { label_short: 'HP', value: '98.765', points: 55, tier: 'silver' },
    { label_short: 'ASP', value: '183%', points: 30, tier: 'bronze' },
    { label_short: 'PAT', value: '2.345', points: 12, tier: 'bronze' },
    { label_short: 'SPM', value: '67,8%', points: 88, tier: 'platinum' },
  ],
  photoSrc: '/assets/classes/class-icon-assassin-cross.png',
  monogramLetter: 'A',
}

describe('buildCardPlan — card geometry (D-10, round-4 crest edition)', () => {
  it('is PORTRAIT 27:40 at any width (the 1080×1600 crest design space), with the OVR block above the stat band and the 6 stats in server order', () => {
    for (const width of [360, 1080, 2160]) {
      const plan = buildCardPlan(data, width)
      expect(plan.height).toBe((width * CREST_DESIGN_HEIGHT) / CREST_DESIGN_WIDTH)
      expect(plan.scale).toBe(width / CREST_DESIGN_WIDTH)
      // OVR number sits above the stats grid.
      expect(plan.ovr.y).toBeLessThan(plan.stats[0].y)
      // 2 columns × 3 rows: index 0/1 share row 0, 2/3 row 1, 4/5 row 2 —
      // left column first (server order preserved, never re-sorted).
      const [s0, s1, s2, s3, s4, s5] = plan.stats
      expect(s0.label).toBe('PCB')
      expect(s1.label).toBe('CRT')
      expect(s2.label).toBe('HP')
      expect(s3.label).toBe('ASP')
      expect(s4.label).toBe('PAT')
      expect(s5.label).toBe('SPM')
      expect(s0.y).toBe(s1.y)
      expect(s2.y).toBe(s3.y)
      expect(s4.y).toBe(s5.y)
      expect(s0.x).toBeLessThan(s1.x)
      expect(s2.x).toBe(s0.x)
      expect(s1.x).toBe(s3.x)
      expect(plan.stats).toHaveLength(6)
    }
  })

  it('places every content block INSIDE its owner guideline rect (round-4 rects are the placement authority)', () => {
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const ovrByTier = { bronze: 60, silver: 70, gold: 80, platinum: 87 } as const
      const plan = buildCardPlan({ ...data, ovr: ovrByTier[tier] }, CREST_DESIGN_WIDTH)
      const g = plan.crest.guides
      // OVR number + job name inside the OVR-number-and-job box.
      expect(plan.ovr.x).toBeGreaterThanOrEqual(g.ovrBox.x)
      expect(plan.ovr.x + plan.ovr.size * 1.9).toBeLessThanOrEqual(g.ovrBox.x + g.ovrBox.w + 1)
      expect(plan.ovr.y).toBeGreaterThan(g.ovrBox.y)
      expect(plan.ovr.y).toBeLessThanOrEqual(g.ovrBox.y + g.ovrBox.h)
      expect(plan.ovr.jobY).toBeGreaterThan(plan.ovr.y)
      expect(plan.ovr.jobY).toBeLessThanOrEqual(g.ovrBox.y + g.ovrBox.h)
      // The photo area IS the Content-safezone (round 4: no crop path).
      expect(plan.photoRect).toEqual({
        x: g.contentSafezone.x,
        y: g.contentSafezone.y,
        w: g.contentSafezone.w,
        h: g.contentSafezone.h,
      })
      // Name inside the Name-only band.
      expect(plan.name.y).toBeGreaterThan(g.nameOnly.y)
      expect(plan.name.y).toBeLessThan(g.nameOnly.y + g.nameOnly.h)
      // Every stat cell inside the six-key-stats band.
      for (const cell of plan.stats) {
        expect(cell.x).toBeGreaterThanOrEqual(g.sixKeyStats.x)
        expect(cell.x + cell.w).toBeLessThanOrEqual(g.sixKeyStats.x + g.sixKeyStats.w + 0.01)
        expect(cell.y).toBeGreaterThanOrEqual(g.sixKeyStats.y)
        expect(cell.y + cell.h).toBeLessThanOrEqual(g.sixKeyStats.y + g.sixKeyStats.h + 0.01)
      }
      // The Hellz mark sits below the stat band (inside the plate tip).
      expect(plan.mark.y).toBeGreaterThan(g.sixKeyStats.y + g.sixKeyStats.h)
      expect(plan.mark.y).toBeLessThan(CREST_DESIGN_HEIGHT)
    }
  })

  it('has NO "OVR" tag and NO subtitle line (round 4: OVR = number + job name; Name-only band = name only)', () => {
    const plan = buildCardPlan(data, CREST_DESIGN_WIDTH)
    expect(plan.ovr.jobText).toBe('Assassin Cross')
    const serialized = JSON.stringify(plan)
    expect(serialized).not.toContain('caption')
    expect(serialized).not.toContain('subtitle')
    expect(serialized).not.toContain('OVR')
  })

  it('carries ZERO guild-average data anywhere in the plan (D-09/T-072-12 export contract)', () => {
    const plan = buildCardPlan(data, CREST_DESIGN_WIDTH)
    const serialized = JSON.stringify(plan).toLowerCase()
    expect(serialized).not.toContain('class_average')
    expect(serialized).not.toContain('average')
    expect(serialized).not.toContain('"best"')
    // And no stat cell carries an aggregate-shaped field beyond the closed set.
    for (const cell of plan.stats) {
      expect(Object.keys(cell).sort()).toEqual([
        'chipColor',
        'chipH',
        'chipText',
        'chipTextColor',
        'chipW',
        'chipX',
        'chipY',
        'h',
        'label',
        'labelSize',
        'labelX',
        'labelY',
        'points',
        'tier',
        'value',
        'valueMaxW',
        'valueSize',
        'valueX',
        'valueY',
        'w',
        'x',
        'y',
      ])
    }
  })
})

describe('buildCardPlan — round-4 readability contract (the WHOLE point of this round)', () => {
  it('sizes stat type for READABILITY — value type ≥ 3.5% of the card width (≈40% larger than round 3)', () => {
    // Round 3's verdict: "all the info was small and unreadable". This lock
    // keeps a future edit from silently shrinking the type again.
    const plan = buildCardPlan(data, CREST_DESIGN_WIDTH)
    for (const cell of plan.stats) {
      expect(cell.valueSize / CREST_DESIGN_WIDTH).toBeGreaterThan(0.035)
      expect(cell.labelSize / CREST_DESIGN_WIDTH).toBeGreaterThan(0.018)
      expect(cell.chipH / CREST_DESIGN_WIDTH).toBeGreaterThan(0.03)
    }
    // Same contract holds at any render width (linear scaling).
    const small = buildCardPlan(data, 360)
    expect(small.stats[0].valueSize).toBeCloseTo(plan.stats[0].valueSize * (360 / 1080), 5)
  })

  it('lays the name at readable scale inside the Name-only band (no subtitle competing for space)', () => {
    const plan = buildCardPlan(data, CREST_DESIGN_WIDTH)
    expect(plan.name.size / CREST_DESIGN_WIDTH).toBeGreaterThan(0.06)
    // Name band holds ONLY the name — so the type got bigger than round 3's
    // shared name+job band.
    expect(plan.name.size).toBeGreaterThan(plan.ovr.jobSize)
  })

  it('paints the SOLID bands with the tier fill and picks contrast-aware text per tier', () => {
    const ovrByTier = { bronze: 60, silver: 70, gold: 80, platinum: 87 } as const
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const plan = buildCardPlan({ ...data, ovr: ovrByTier[tier] }, CREST_DESIGN_WIDTH)
      // Bands: the OWNER's tier hex (from the SVGs), both bands identical.
      expect(plan.nameBand.fill).toBe(CREST_GEOMETRY[tier].tierFillHex)
      expect(plan.statsBand.fill).toBe(CREST_GEOMETRY[tier].tierFillHex)
      // Text contrast: dark on the light metals, white on the deep magenta.
      expect(plan.nameBand.text).toBe(BAND_TEXT_HEX[tier])
      expect(plan.name.color).toBe(plan.nameBand.text)
      if (tier === 'platinum') {
        expect(plan.nameBand.text).toBe('#FFFFFF')
      } else {
        expect(plan.nameBand.text).toBe('#241A10')
      }
    }
  })

  it('backs the over-photo OVR block with a top legibility scrim inside the photo rect', () => {
    const plan = buildCardPlan(data, CREST_DESIGN_WIDTH)
    expect(plan.scrim.y1).toBe(plan.photoRect.y)
    expect(plan.scrim.y2).toBeGreaterThan(plan.ovr.jobY)
    expect(plan.scrim.y2).toBeLessThan(plan.photoRect.y + plan.photoRect.h)
    expect(plan.scrim.alpha).toBeGreaterThan(0)
    expect(plan.scrim.alpha).toBeLessThan(1)
  })
})

describe('buildCardPlan — checkpoint round-2 lessons carried forward', () => {
  it('keeps a REAL column gutter — a chip never touches or underlaps the next column', () => {
    for (const width of [1080, 2160]) {
      const plan = buildCardPlan(data, width)
      const [s0, s1] = plan.stats
      // Column gutter: cell 0's right edge sits clearly left of cell 1.
      const gutter = s1.x - (s0.x + s0.w)
      expect(gutter).toBeGreaterThan(width * 0.01)
      // Chips are right-aligned INSIDE their own cell, never past it.
      for (const cell of plan.stats) {
        expect(cell.chipX + cell.chipW).toBeLessThanOrEqual(cell.x + cell.w)
        expect(cell.chipX).toBeGreaterThan(cell.x)
      }
      // The gap between a left-column chip and the right column's label is
      // strictly positive (the round-2 bug glued '96' to 'CRT').
      const chipGap = s1.x - (s0.chipX + s0.chipW)
      expect(chipGap).toBeGreaterThan(width * 0.01)
    }
  })

  it('maps the 1080×1600 design space exactly onto the 2160×3200 download backing store (2×, no drift)', () => {
    const base = buildCardPlan(data, CREST_DESIGN_WIDTH)
    const backing = buildCardPlan(data, 2160)
    expect(backing.height).toBe(3200)
    expect(backing.ovr.x).toBe(base.ovr.x * 2)
    expect(backing.ovr.y).toBe(base.ovr.y * 2)
    expect(backing.ovr.jobY).toBe(base.ovr.jobY * 2)
    expect(backing.name.x).toBe(base.name.x * 2)
    expect(backing.photoRect.x).toBe(base.photoRect.x * 2)
    expect(backing.photoRect.h).toBe(base.photoRect.h * 2)
    expect(backing.mark.y).toBe(base.mark.y * 2)
    expect(backing.mark.size).toBe(base.mark.size * 2)
    for (let i = 0; i < 6; i++) {
      expect(backing.stats[i].x).toBe(base.stats[i].x * 2)
      expect(backing.stats[i].y).toBe(base.stats[i].y * 2)
      expect(backing.stats[i].chipX).toBe(base.stats[i].chipX * 2)
      expect(backing.stats[i].valueSize).toBe(base.stats[i].valueSize * 2)
    }
  })
})

describe('buildCardPlan — crest selection (owner superseding design)', () => {
  it('keys the crest by the OVR tier: the plan carries THAT tier\'s crest geometry and palette', () => {
    const ovrByTier = { bronze: 60, silver: 70, gold: 80, platinum: 87 } as const
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const plan = buildCardPlan({ ...data, ovr: ovrByTier[tier] }, CREST_DESIGN_WIDTH)
      expect(plan.tier).toBe(tier)
      expect(plan.crest).toBe(CREST_GEOMETRY[tier])
      expect(plan.nameBand.fill).toBe(CREST_GEOMETRY[tier].tierFillHex)
    }
  })

  it('colors points chips with the site tier tokens; the photo rect rides on the plan for BOTH surfaces', () => {
    const plan = buildCardPlan(data, CREST_DESIGN_WIDTH)
    expect(plan.stats[0].chipColor).toBe(TIER_CHIP_HEX.platinum)
    expect(plan.stats[3].chipColor).toBe(TIER_CHIP_HEX.bronze)
  })
})

describe('buildCardPlan — photo fallback chain (never an empty hole)', () => {
  it('carries the image draw when a photo src is set (screenshot or class portrait)', () => {
    const plan = buildCardPlan(data, CREST_DESIGN_WIDTH)
    expect(plan.photo.kind).toBe('image')
    if (plan.photo.kind === 'image') {
      expect(plan.photo.src).toBe('/assets/classes/class-icon-assassin-cross.png')
    }
  })

  it('carries the ASST-01 monogram fallback when no photo exists (photoSrc null)', () => {
    const plan = buildCardPlan({ ...data, photoSrc: null }, CREST_DESIGN_WIDTH)
    expect(plan.photo.kind).toBe('monogram')
    if (plan.photo.kind === 'monogram') {
      expect(plan.photo.letter).toBe('A')
    } else {
      expect.fail('expected monogram photo fallback')
    }
  })
})

describe('buildCardPlan — chip slots', () => {
  it('renders the muted — chip slot for null points (never crashes, never invents numbers)', () => {
    const plan = buildCardPlan(
      { ...data, stats: data.stats.map((s, i) => (i === 1 ? { ...s, points: null, tier: null } : s)) },
      CREST_DESIGN_WIDTH,
    )
    const muted = plan.stats[1]
    expect(muted.chipText).toBe('—')
    expect(muted.points).toBeNull()
    expect(muted.tier).toBeNull()
    // Muted slot is visually distinct from every tiered chip color.
    for (const cell of plan.stats) {
      if (cell.points === null) continue
      expect(cell.chipText).not.toBe('—')
      expect(cell.chipColor).not.toBe(muted.chipColor)
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
