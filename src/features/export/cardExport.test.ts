// cardExport.test.ts — unit locks for the code-drawn JPEG card export
// (plan 07.2-05, CARD-03/D-09/D-10/D-12). The DOM shell (drawCard/downloadCard)
// needs a canvas — these tests lock the PURE core (buildCardPlan) and the
// filename slugification, which is where the correctness contracts live:
//
//  - T-072-12: the exported JPEG is a celebration artifact that circulates
//    OUTSIDE the guild (D-09) — the plan must carry ZERO guild-average data
//    (no class_average, no best), only identity + the 6 key stats + points.
//  - D-10: classic EAFC proportions — 2:3 portrait, OVR block on top, the
//    6 stats in the 2-col × 3-row vertical arrangement in SERVER/highlight
//    order (never re-sorted).
//  - D-16: crestSrc null ⇒ the plan carries the monogram fallback, never an
//    image draw of a missing file.
import { describe, expect, it } from 'vitest'
import { buildCardPlan, cardFilename, type CardExportData } from './cardExport'

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
  crestSrc: '/assets/classes/class-icon-assassin-cross.png',
}

describe('buildCardPlan — EAFC geometry (D-10)', () => {
  it('is a 2:3 portrait at any width, with the OVR block at the top and the 6 stats in a 2-col × 3-row grid in server order', () => {
    for (const width of [300, 750, 1500]) {
      const plan = buildCardPlan(data, width)
      expect(plan.height).toBe(width * 1.5)
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
      // All 6 stats present, in order, no extras.
      expect(plan.stats).toHaveLength(6)
    }
  })

  it('carries ZERO guild-average data anywhere in the plan (D-09/T-072-12 export contract)', () => {
    const plan = buildCardPlan(data, 750)
    const serialized = JSON.stringify(plan).toLowerCase()
    expect(serialized).not.toContain('class_average')
    expect(serialized).not.toContain('average')
    expect(serialized).not.toContain('"best"')
    // And no stat cell carries an aggregate-shaped field beyond the closed set.
    for (const cell of plan.stats) {
      expect(Object.keys(cell).sort()).toEqual(['chipColor', 'chipText', 'h', 'label', 'points', 'tier', 'value', 'w', 'x', 'y'])
    }
  })
})

describe('buildCardPlan — chip slots', () => {
  it('renders the muted — chip slot for null points (never crashes, never invents numbers)', () => {
    const plan = buildCardPlan(
      { ...data, stats: data.stats.map((s, i) => (i === 1 ? { ...s, points: null, tier: null } : s)) },
      750,
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

describe('buildCardPlan — crest fallback (D-16)', () => {
  it('carries the monogram fallback (class initial) when crestSrc is null', () => {
    const plan = buildCardPlan({ ...data, crestSrc: null }, 750)
    expect(plan.crest.kind).toBe('monogram')
    if (plan.crest.kind === 'monogram') {
      expect(plan.crest.letter).toBe('A')
    } else {
      expect.fail('expected monogram crest')
    }
  })

  it('carries the same-origin image draw when crestSrc is set', () => {
    const plan = buildCardPlan(data, 750)
    expect(plan.crest.kind).toBe('image')
    if (plan.crest.kind === 'image') {
      expect(plan.crest.src).toBe('/assets/classes/class-icon-assassin-cross.png')
    } else {
      expect.fail('expected image crest')
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
