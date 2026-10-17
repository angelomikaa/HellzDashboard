// cardExport.test.ts — unit locks for the code-drawn JPEG card export
// (plan 07.2-05, CARD-03/D-09/D-10/D-12 + checkpoint round 2 geometry locks).
// The DOM shell (drawCard/downloadCard) needs a canvas — these tests lock the
// PURE core (buildCardPlan) and the filename slugification, which is where
// the correctness contracts live:
//
//  - T-072-12: the exported JPEG is a celebration artifact that circulates
//    OUTSIDE the guild (D-09) — the plan must carry ZERO guild-average data
//    (no class_average, no best), only identity + the 6 key stats + points.
//  - D-10: classic EAFC proportions — 2:3 portrait, OVR block on top, the
//    6 stats in the 2-col × 3-row vertical arrangement in SERVER/highlight
//    order (never re-sorted).
//  - Checkpoint round 2 (the owner's "extremely distorted" report): the plan
//    must carry a REAL column gutter (chips never under the next column's
//    label — the original grid spanned the full card width), every chip must
//    sit inside its OWN cell, and all content must stay inside the shield's
//    safe area at every tier (nothing clipped by the tapered silhouette).
//  - Shield frames (owner's superseding design decision): bronze/silver
//    SIMPLE, gold/Impecável ORNATE — same path strings the on-page SVG uses.
//  - D-16: crestSrc null ⇒ the plan carries the monogram fallback, never an
//    image draw of a missing file.
import { describe, expect, it } from 'vitest'
import { buildCardPlan, cardFilename, type CardExportData } from './cardExport'
import { buildShieldFrame, isOrnateTier, scalePath } from './shieldFrame'

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
      expect(Object.keys(cell).sort()).toEqual([
        'chipColor',
        'chipH',
        'chipText',
        'chipW',
        'chipX',
        'chipY',
        'h',
        'label',
        'points',
        'tier',
        'value',
        'w',
        'x',
        'y',
      ])
    }
  })
})

describe('buildCardPlan — checkpoint round 2: no more distorted stat grid', () => {
  it('keeps a REAL column gutter — a chip never touches or underlaps the next column (would-have-caught bug)', () => {
    for (const width of [750, 1500]) {
      const plan = buildCardPlan(data, width)
      const [s0, s1] = plan.stats
      // Column gutter: cell 0's right edge sits clearly left of cell 1.
      const gutter = s1.x - (s0.x + s0.w)
      expect(gutter).toBeGreaterThan(width * 0.03)
      // Chips are right-aligned INSIDE their own cell, never past it.
      for (const cell of plan.stats) {
        expect(cell.chipX + cell.chipW).toBeLessThanOrEqual(cell.x + cell.w)
        expect(cell.chipX).toBeGreaterThan(cell.x)
      }
      // The gap between a left-column chip and the right column's label is
      // strictly positive (the original bug glued '96' to 'CRT').
      const chipGap = s1.x - (s0.chipX + s0.chipW)
      expect(chipGap).toBeGreaterThan(width * 0.03)
    }
  })

  it('fills the card vertically — no dead void between the stat grid and the mark', () => {
    const plan = buildCardPlan(data, 750)
    const lastRowBottom = Math.max(...plan.stats.slice(4).map((c) => c.y + c.h))
    // The mark anchors the lower third (was floating in a ~150px void before).
    expect(plan.mark.y).toBeGreaterThan(plan.height * 0.8)
    expect(plan.mark.y).toBeLessThan(plan.height * 0.92)
    // And the stats occupy the middle band instead of ending at ~74% height.
    expect(lastRowBottom).toBeGreaterThan(plan.height * 0.72)
  })

  it('keeps every stat cell inside the shield safe area at all tiers (nothing clipped by the taper)', () => {
    // The safe rect the composition guarantees inside the inner outline:
    // x 115..635, content ends by y≈900 at base scale (taper still ~±150px
    // half-width there); the mark centers at y=980 where the taper spans
    // ~±115px — the 60px mark fits with margin.
    for (const ovr of [60, 70, 80, 87]) {
      const plan = buildCardPlan({ ...data, ovr }, 750)
      for (const cell of plan.stats) {
        expect(cell.x).toBeGreaterThanOrEqual(110)
        expect(cell.chipX + cell.chipW).toBeLessThanOrEqual(640)
        expect(cell.y + cell.h).toBeLessThanOrEqual(900)
      }
      expect(plan.mark.x - plan.mark.size / 2).toBeGreaterThan(300)
      expect(plan.mark.x + plan.mark.size / 2).toBeLessThan(450)
    }
  })
})

describe('buildCardPlan — backing-store invariants (the "extremely distorted" export)', () => {
  it('maps the 750×1125 design space exactly onto the 1500×2250 download backing store (2×, no drift)', () => {
    const base = buildCardPlan(data, 750)
    const backing = buildCardPlan(data, 1500)
    // The download canvas is exactly 2× the design space — every plan
    // coordinate must land at precisely 2× base (integer-clean, no rounding
    // drift), and the height must be exactly 2250 (2:3 aspect, not approx).
    expect(backing.height).toBe(2250)
    expect(backing.ovr.x).toBe(base.ovr.x * 2)
    expect(backing.ovr.y).toBe(base.ovr.y * 2)
    expect(backing.crest.x).toBe(base.crest.x * 2)
    expect(backing.crest.size).toBe(base.crest.size * 2)
    expect(backing.mark.y).toBe(base.mark.y * 2)
    for (let i = 0; i < 6; i++) {
      expect(backing.stats[i].x).toBe(base.stats[i].x * 2)
      expect(backing.stats[i].y).toBe(base.stats[i].y * 2)
      expect(backing.stats[i].chipX).toBe(base.stats[i].chipX * 2)
    }
  })

  it('keeps every frame path in the 750×1125 design space and scales it exactly onto any backing store (would-have-caught: unscaled paths stroked at half size on the 2× canvas)', () => {
    const frame = buildShieldFrame('gold')
    // Design-space contract: the outer silhouette's bounds ≈ 750×1125 no
    // matter the requested plan width — the shell owns the mapping.
    const bounds = (d: string) => {
      const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      return { maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
    expect(bounds(frame.outer).maxX).toBeCloseTo(720, 0)
    expect(bounds(frame.outer).maxY).toBeCloseTo(1108, 0)
    // scalePath is the shell's mapping: at 2× the bounds must be exactly 2×
    // design bounds (the canvas has no viewBox to do it for free).
    const scaled = bounds(scalePath(frame.outer, 2))
    expect(scaled.maxX).toBeCloseTo(1440, 0)
    expect(scaled.maxY).toBeCloseTo(2216, 0)
    // Identity at 1× (the on-page SVG renders the unscaled strings).
    expect(scalePath(frame.outer, 1)).toBe(frame.outer)
    // Ornament paths scale too (studs/flourish stay on the frame band).
    const stud = frame.fills[0]
    expect(bounds(scalePath(stud, 2)).maxX).toBeCloseTo(bounds(stud).maxX * 2, 0)
  })
})

describe('buildCardPlan — shield frames (owner superseding design decision)', () => {
  it('carries the shield frame paths and the tier complexity split: bronze/silver simple, gold/Impecável ornate', () => {
    for (const [tier, ornate] of [
      ['bronze', false],
      ['silver', false],
      ['gold', true],
      ['platinum', true],
    ] as const) {
      const plan = buildCardPlan({ ...data, ovr: { bronze: 60, silver: 70, gold: 80, platinum: 87 }[tier] }, 750)
      expect(plan.shield.outer).toContain('M ')
      expect(plan.shield.outer).toBe(buildShieldFrame(tier).outer)
      if (ornate) {
        expect(isOrnateTier(tier)).toBe(true)
        expect(plan.shield.inner2).not.toBeNull()
        expect(plan.shield.fills.length).toBeGreaterThan(0)
      } else {
        expect(plan.shield.inner2).toBeNull()
        expect(plan.shield.fills).toHaveLength(0)
      }
    }
  })

  it('strokes the Impecável frame with the rainbow gradient; metallic tiers with their own hex', () => {
    expect(buildCardPlan({ ...data, ovr: 87 }, 750).rainbow).not.toBeNull()
    expect(buildCardPlan({ ...data, ovr: 80 }, 750).rainbow).toBeNull()
    expect(buildCardPlan({ ...data, ovr: 80 }, 750).tierColor).toBe('#E9B44C')
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
