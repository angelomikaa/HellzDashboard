// Layout contract for the lineup JPG (10.4-03, LNUP-05). The pure planner is
// tested directly; the canvas shell needs a real 2D context, so it is not run
// here (jsdom has none).
import { describe, expect, it } from 'vitest'
import type { BattlefieldId, BattlefieldLineup, LineupParty } from '../../lib/api'
import { buildLineupExportPlan, LINEUP_EXPORT_HEIGHT, LINEUP_EXPORT_WIDTH, lineupFilename } from './lineupExport'

/** Raid position for the battlefield id used by the tests. */
function raidIndexFor(battlefield: BattlefieldId): number {
  if (battlefield === 'vigrid_field') return 1
  if (battlefield === 'ruinscape') return 2
  return Number(battlefield.replace('emperium_raid_', ''))
}

/** A battlefield with all 8 parties; `seated(party, slot)` decides occupancy. */
function lineup(
  battlefield: BattlefieldId,
  seated: (party: number, slot: number) => boolean = () => true,
  labels: Partial<Record<number, string | null>> = {},
): BattlefieldLineup {
  const parties: LineupParty[] = Array.from({ length: 8 }, (_, p) => {
    const partyIndex = p + 1
    const slots = Array.from({ length: 5 }, (_, s) => {
      const slotIndex = s + 1
      const on = seated(partyIndex, slotIndex)
      return {
        slot_index: slotIndex,
        member_id: on ? `m-${partyIndex}-${slotIndex}` : null,
        display_name: on ? `Player${partyIndex}${slotIndex}` : null,
        char_class: on ? 'Bard' : null,
        char_function: on ? ('dps' as const) : null,
      }
    })
    return {
      party_index: partyIndex,
      role_label: labels[partyIndex] ?? null,
      filled: slots.filter((s) => s.member_id !== null).length,
      slots,
    }
  })
  return { battlefield, raid_index: raidIndexFor(battlefield), parties }
}

describe('buildLineupExportPlan — canvas and grid geometry', () => {
  it('paints a 1920x1080 canvas', () => {
    const plan = buildLineupExportPlan(lineup('vigrid_field'))
    expect(plan.width).toBe(1920)
    expect(plan.height).toBe(1080)
    expect(LINEUP_EXPORT_WIDTH).toBe(1920)
    expect(LINEUP_EXPORT_HEIGHT).toBe(1080)
  })

  it('lays out 8 party cards in a 4x2 grid, left to right, top to bottom', () => {
    const { columns } = buildLineupExportPlan(lineup('vigrid_field'))
    expect(columns).toHaveLength(8)
    expect(columns.map((c) => c.header.label)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'])
    for (const col of columns) expect(col.rect.w).toBe(448)
    // First row: 4 cards side by side.
    for (let i = 1; i < 4; i++) {
      const prev = columns[i - 1].rect
      expect(columns[i].rect.x).toBeGreaterThanOrEqual(prev.x + prev.w)
      expect(columns[i].rect.y).toBe(prev.y)
    }
    // Second row wraps below the first.
    expect(columns[4].rect.x).toBe(columns[0].rect.x)
    expect(columns[4].rect.y).toBeGreaterThan(columns[0].rect.y + columns[0].rect.h)
  })

  it('keeps every drawn rectangle inside the canvas', () => {
    const plan = buildLineupExportPlan(lineup('ruinscape', (p, s) => (p + s) % 2 === 0, { 3: 'MOBS CIMA/BAIXO' }))
    const rects = [
      plan.header.mark.rect,
      plan.header.status.rect,
      plan.header.rule,
      ...plan.columns.flatMap((c) => [
        c.rect,
        c.header.rect,
        c.footer.rect,
        ...(c.roleLabel ? [c.roleLabel.rect] : []),
        ...c.slots.map((s) => s.rect),
      ]),
      ...plan.legend.map((l) => l.rect),
    ]
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(plan.width)
      expect(r.y + r.h).toBeLessThanOrEqual(plan.height)
    }
  })

  it('gives each slot card room for a readable name (4-col grid)', () => {
    const { columns } = buildLineupExportPlan(lineup('vigrid_field'))
    for (const col of columns) {
      expect(col.slots).toHaveLength(5)
      expect(col.slots.map((s) => s.slotIndex)).toEqual([1, 2, 3, 4, 5])
      for (const slot of col.slots) {
        expect(slot.rect.w).toBeGreaterThanOrEqual(400)
        expect(slot.rect.x).toBeGreaterThanOrEqual(col.rect.x)
        expect(slot.rect.x + slot.rect.w).toBeLessThanOrEqual(col.rect.x + col.rect.w)
      }
      const last = col.slots[4].rect
      expect(last.y + last.h).toBeLessThan(col.footer.rect.y)
    }
  })
})

describe('buildLineupExportPlan — slots, leader and counters', () => {
  it('flags only slot 1 of each party as the leader', () => {
    const { columns } = buildLineupExportPlan(lineup('vigrid_field'))
    for (const col of columns) {
      expect(col.slots.map((s) => s.leader)).toEqual([true, false, false, false, false])
    }
  })

  it('uses the class label and accent for seated slots and the vacant placeholder otherwise', () => {
    const plan = buildLineupExportPlan(lineup('vigrid_field', (p, s) => p === 1 && s === 1))
    const seated = plan.columns[0].slots[0]
    expect(seated.vacant).toBe(false)
    expect(seated.name).toBe('Player11')
    expect(seated.classText).toBe('Menestrel')
    expect(seated.accent).toBe('#8FD3F4')
    expect(seated.iconSrc).toBe('/assets/classes/class-icon-bard.webp')

    const vacant = plan.columns[0].slots[1]
    expect(vacant.vacant).toBe(true)
    expect(vacant.name).toBeNull()
    expect(vacant.classText).toBe('')
    expect(vacant.iconSrc).toBeNull()
  })

  it('falls back to a monogram with no icon when the class is null', () => {
    const base = lineup('vigrid_field')
    const party = base.parties[0]
    party.slots[0] = { ...party.slots[0], member_id: 'x', display_name: 'NoClass', char_class: null }
    const slot = buildLineupExportPlan(base).columns[0].slots[0]
    expect(slot.vacant).toBe(false)
    expect(slot.iconSrc).toBeNull()
    expect(slot.monogram).toBe('—')
    expect(slot.classText).toBe('')
  })

  it('shows N/5 with green when full and amber when short', () => {
    const plan = buildLineupExportPlan(lineup('vigrid_field', (p, s) => p === 2 ? s <= 3 : true))
    const full = plan.columns[0].footer
    expect(full.text).toBe('5/5')
    expect(full.full).toBe(true)
    expect(full.color).toBe('#3FB950')

    const short = plan.columns[1].footer
    expect(short.text).toBe('3/5')
    expect(short.filled).toBe(3)
    expect(short.full).toBe(false)
    expect(short.color).toBe('#E9B44C')
  })

  it('reports the battlefield total as filled / 40 ESCALADOS', () => {
    expect(buildLineupExportPlan(lineup('vigrid_field')).header.status.text).toBe('40 / 40 ESCALADOS')
    const sparse = buildLineupExportPlan(lineup('vigrid_field', (p) => p === 1))
    expect(sparse.header.status.text).toBe('5 / 40 ESCALADOS')
  })
})

describe('buildLineupExportPlan — labels, title and filenames', () => {
  it('draws a role banner only for parties that have a label', () => {
    const plan = buildLineupExportPlan(
      lineup('vigrid_field', () => true, { 1: 'MOBS CIMA/BAIXO', 2: 'MOBS DIREITA/ESQUERDA' }),
    )
    expect(plan.columns[0].roleLabel?.text).toBe('MOBS CIMA/BAIXO')
    expect(plan.columns[1].roleLabel?.text).toBe('MOBS DIREITA/ESQUERDA')
    expect(plan.columns[2].roleLabel).toBeNull()
  })

  it('titles each raid with its owner-facing name and war mode', () => {
    expect(buildLineupExportPlan(lineup('vigrid_field')).header.title.text).toBe('VIGRID FIELD — RAID 1')
    expect(buildLineupExportPlan(lineup('ruinscape')).header.title.text).toBe('RUINSCAPE — RAID 2')
    expect(buildLineupExportPlan(lineup('emperium_raid_3'), 'emperium').header.title.text).toBe(
      'GUERRA DO EMPERIUM — RAID 3',
    )
    expect(buildLineupExportPlan(lineup('vigrid_field')).header.kicker.text).toBe('HELLZ — ESCALAÇÃO')
  })

  it('names the download hellz-escalacao-<raid>.jpg', () => {
    expect(buildLineupExportPlan(lineup('vigrid_field')).fileName).toBe('hellz-escalacao-vigrid-field.jpg')
    expect(buildLineupExportPlan(lineup('ruinscape')).fileName).toBe('hellz-escalacao-ruinscape.jpg')
    expect(buildLineupExportPlan(lineup('emperium_raid_3'), 'emperium').fileName).toBe(
      'hellz-escalacao-emperium-raid-3.jpg',
    )
    expect(lineupFilename(lineup('ruinscape'))).toBe('hellz-escalacao-ruinscape.jpg')
  })

  it('builds a class colour legend with one entry per catalog class', () => {
    const { legend } = buildLineupExportPlan(lineup('vigrid_field'))
    expect(legend).toHaveLength(15)
    expect(legend.find((l) => l.charClass === 'Bard')?.label).toBe('Menestrel')
  })

  it('renders a missing party as five vacant slots instead of dropping the column', () => {
    const partial: BattlefieldLineup = { battlefield: 'ruinscape', raid_index: 2, parties: [] }
    const plan = buildLineupExportPlan(partial)
    expect(plan.columns).toHaveLength(8)
    expect(plan.columns.every((c) => c.slots.length === 5 && c.footer.filled === 0)).toBe(true)
    expect(plan.header.status.text).toBe('0 / 40 ESCALADOS')
  })

  it('paints only the actual parties of an Emperium raid (6/6/4 layout)', () => {
    const six = lineup('emperium_raid_1')
    six.parties = six.parties.slice(0, 6)
    const plan = buildLineupExportPlan(six, 'emperium')
    expect(plan.columns).toHaveLength(6)
    expect(plan.columns.map((c) => c.header.label)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
    expect(plan.header.status.text).toBe('30 / 30 ESCALADOS')
    expect(plan.columns[0].rect.w).toBeGreaterThan(400)

    const four = lineup('emperium_raid_3')
    four.parties = four.parties.slice(0, 4)
    const short = buildLineupExportPlan(four, 'emperium')
    expect(short.columns).toHaveLength(4)
    expect(short.header.status.text).toBe('20 / 20 ESCALADOS')

    for (const rect of short.columns.flatMap((c) => [c.rect, c.header.rect, c.footer.rect, ...c.slots.map((s) => s.rect)])) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.w).toBeLessThanOrEqual(short.width)
    }
  })
})
