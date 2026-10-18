// cardExport.test.ts — unit locks for the crest card layout plan (plan
// 07.2-05, CARD-03/D-09/D-10/D-12; checkpoint round 3 superseding design).
// The DOM shell (drawCard/downloadCard) needs a canvas — these tests lock
// the PURE core (buildCardPlan) and the filename slugification, which is
// where the correctness contracts live:
//
//  - T-072-12: the exported JPEG is a celebration artifact that circulates
//    OUTSIDE the guild (D-09) — the plan must carry ZERO guild-average data
//    (no class_average, no best), only identity + the 6 key stats + points.
//  - D-10 (crest-geometry edition): square card, OVR block on top, the 6
//    stats in the 2-col × 3-row arrangement in SERVER/highlight order
//    (never re-sorted) inside the tier's six-key-stats guideline band.
//  - Round-2 lessons carried forward: a REAL column gutter (chips never
//    under the next column's label), every chip inside its OWN cell, and
//    exact design-space→backing-store scaling (scalePath contract).
//  - Round 3 (owner's crest design): every content position is DERIVED from
//    the guideline rects parsed from the owner's crest SVGs; the tier's
//    crest (plate palette + photo-crop path) rides on the plan; the photo
//    fallback chain never leaves an empty hole (screenshot → portrait →
//    ASST-01 monogram).
import { describe, expect, it } from 'vitest'
import { buildCardPlan, cardFilename, CREST_DESIGN_SIZE, CREST_GEOMETRY, TIER_CHIP_HEX, type CardExportData } from './cardExport'

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

describe('buildCardPlan — card geometry (D-10, crest edition)', () => {
  it('is SQUARE at any width (the crest design space), with the OVR block above the stat band and the 6 stats in server order', () => {
    for (const width of [400, 1000, 2000]) {
      const plan = buildCardPlan(data, width)
      expect(plan.height).toBe(width)
      expect(plan.scale).toBe(width / CREST_DESIGN_SIZE)
      // OVR block sits above the stats grid.
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

  it('places every content block INSIDE its owner guideline rect (the "fake rectangle" contract)', () => {
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const ovrByTier = { bronze: 60, silver: 70, gold: 80, platinum: 87 } as const
      const plan = buildCardPlan({ ...data, ovr: ovrByTier[tier] }, CREST_DESIGN_SIZE)
      const g = plan.crest.guides
      // OVR hero inside the OVR-number box.
      expect(plan.ovr.x).toBeGreaterThanOrEqual(g.ovrNumber.x)
      expect(plan.ovr.x).toBeLessThanOrEqual(g.ovrNumber.x + g.ovrNumber.w)
      expect(plan.ovr.y).toBeGreaterThan(g.ovrNumber.y)
      expect(plan.ovr.y).toBeLessThanOrEqual(g.ovrNumber.y + g.ovrNumber.h)
      // Name + subtitle inside the Name-and-job band.
      expect(plan.name.y).toBeGreaterThan(g.nameAndJob.y)
      expect(plan.name.y).toBeLessThan(g.nameAndJob.y + g.nameAndJob.h)
      expect(plan.subtitle.y).toBeGreaterThan(g.nameAndJob.y)
      expect(plan.subtitle.y).toBeLessThanOrEqual(g.nameAndJob.y + g.nameAndJob.h)
      // Every stat cell inside the six-key-stats band.
      for (const cell of plan.stats) {
        expect(cell.x).toBeGreaterThanOrEqual(g.sixKeyStats.x)
        expect(cell.x + cell.w).toBeLessThanOrEqual(g.sixKeyStats.x + g.sixKeyStats.w + 0.01)
        expect(cell.y).toBeGreaterThanOrEqual(g.sixKeyStats.y)
        expect(cell.y + cell.h).toBeLessThanOrEqual(g.sixKeyStats.y + g.sixKeyStats.h + 0.01)
      }
      // The Hellz mark sits below the stat band (inside the crest tip).
      expect(plan.mark.y).toBeGreaterThan(g.sixKeyStats.y + g.sixKeyStats.h)
      expect(plan.mark.y).toBeLessThan(CREST_DESIGN_SIZE)
    }
  })

  it('carries ZERO guild-average data anywhere in the plan (D-09/T-072-12 export contract)', () => {
    const plan = buildCardPlan(data, CREST_DESIGN_SIZE)
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

describe('buildCardPlan — checkpoint round-2 lessons carried forward', () => {
  it('keeps a REAL column gutter — a chip never touches or underlaps the next column', () => {
    for (const width of [1000, 2000]) {
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

  it('maps the 1000×1000 design space exactly onto the 2000×2000 download backing store (2×, no drift)', () => {
    const base = buildCardPlan(data, CREST_DESIGN_SIZE)
    const backing = buildCardPlan(data, 2000)
    expect(backing.height).toBe(2000)
    expect(backing.ovr.x).toBe(base.ovr.x * 2)
    expect(backing.ovr.y).toBe(base.ovr.y * 2)
    expect(backing.name.x).toBe(base.name.x * 2)
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
  it('keys the crest by the OVR tier: the plan carries THAT tier\'s crest geometry and plate palette', () => {
    const ovrByTier = { bronze: 60, silver: 70, gold: 80, platinum: 87 } as const
    for (const tier of ['bronze', 'silver', 'gold', 'platinum'] as const) {
      const plan = buildCardPlan({ ...data, ovr: ovrByTier[tier] }, CREST_DESIGN_SIZE)
      expect(plan.tier).toBe(tier)
      expect(plan.crest).toBe(CREST_GEOMETRY[tier])
      expect(plan.plateFill).toEqual(CREST_GEOMETRY[tier].plateFill)
    }
    // The owner's plate palette rides on the plan: metals solid, Impecável
    // gradient (parsed from the SVGs, not hardcoded here).
    expect(buildCardPlan({ ...data, ovr: 60 }, 1000).plateFill).toEqual({ kind: 'solid', hex: '#b58c58' })
    expect(buildCardPlan({ ...data, ovr: 87 }, 1000).plateFill.kind).toBe('gradient')
  })

  it('colors points chips with the site tier tokens; the photo crop path rides on the plan for BOTH surfaces', () => {
    const plan = buildCardPlan(data, 1000)
    expect(plan.stats[0].chipColor).toBe(TIER_CHIP_HEX.platinum)
    expect(plan.stats[3].chipColor).toBe(TIER_CHIP_HEX.bronze)
    // The SAME path string the on-page SVG clips is what the canvas shell
    // scalePaths onto the backing store.
    expect(plan.crest.photoCropPath).toBe(CREST_GEOMETRY[plan.tier].photoCropPath)
  })
})

describe('buildCardPlan — photo fallback chain (never an empty hole)', () => {
  it('carries the image draw when a photo src is set (screenshot or class portrait)', () => {
    const plan = buildCardPlan(data, 1000)
    expect(plan.photo.kind).toBe('image')
    if (plan.photo.kind === 'image') {
      expect(plan.photo.src).toBe('/assets/classes/class-icon-assassin-cross.png')
    }
  })

  it('carries the ASST-01 monogram fallback when no photo exists (photoSrc null)', () => {
    const plan = buildCardPlan({ ...data, photoSrc: null }, 1000)
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
      1000,
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
