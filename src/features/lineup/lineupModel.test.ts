import { describe, expect, it } from 'vitest'
import type { LineupParty, LineupsPayload, LineupRosterMember } from '../../lib/api'
import {
  assignmentBadge,
  assignmentCallout,
  battlefieldFilledCount,
  buildAssignmentMap,
  classAccentHex,
  CLASS_ACCENT_HEX,
  BATTLEFIELD_META,
  filterAssignableRoster,
  findMemberAssignment,
  isPartyFull,
  NULL_CLASS_ACCENT_HEX,
  normalizeRoleLabel,
  partyFilledCount,
} from './lineupModel'

function slot(index: number, memberId: string | null, name: string | null = null) {
  return {
    slot_index: index,
    member_id: memberId,
    display_name: name,
    char_class: memberId ? 'Bard' : null,
    char_function: memberId ? ('dps' as const) : null,
  }
}

function party(index: number, seated: (string | null)[]): LineupParty {
  const slots = [1, 2, 3, 4, 5].map((i) => slot(i, seated[i - 1] ?? null, seated[i - 1] ? `P${seated[i - 1]}` : null))
  return {
    party_index: index,
    role_label: null,
    filled: slots.filter((s) => s.member_id !== null).length,
    slots,
  }
}

const roster: LineupRosterMember[] = [
  { member_id: 'a', display_name: 'Zeta', char_class: 'Bard', char_function: 'dps' },
  { member_id: 'b', display_name: 'alpha', char_class: null, char_function: 'mdps' },
  { member_id: 'c', display_name: 'Mike', char_class: 'Gypsy', char_function: 'suporte' },
]

const payload: LineupsPayload = {
  battlefields: [
    {
      battlefield: 'vigrid_field',
      parties: [party(1, ['a', 'b', null, null, null]), party(2, ['c', null, null, null, null])],
    },
    {
      battlefield: 'ruinscape',
      parties: [party(1, [null, null, null, null, null])],
    },
  ],
  roster,
}

describe('lineupModel metadata', () => {
  it('names both battlefields with the owner titles and raid subtitles', () => {
    expect(BATTLEFIELD_META.vigrid_field).toEqual({ title: 'Vigrid Field', subtitle: 'Raid 1', fileSlug: 'vigrid-field' })
    expect(BATTLEFIELD_META.ruinscape).toEqual({ title: 'Ruinscape', subtitle: 'Raid 2', fileSlug: 'ruinscape' })
  })
})

describe('class accents', () => {
  it('maps every canonical class to a distinct hex', () => {
    const keys = Object.keys(CLASS_ACCENT_HEX)
    expect(keys).toHaveLength(15)
    expect(new Set(Object.values(CLASS_ACCENT_HEX)).size).toBe(15)
    for (const hex of Object.values(CLASS_ACCENT_HEX)) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('falls back to the neutral accent for null and unknown classes', () => {
    expect(classAccentHex(null)).toBe(NULL_CLASS_ACCENT_HEX)
    expect(classAccentHex('Unknown Class')).toBe(NULL_CLASS_ACCENT_HEX)
    expect(classAccentHex('Bard')).toBe(CLASS_ACCENT_HEX.Bard)
  })
})

describe('party and battlefield counts', () => {
  it('counts seated slots per party and across a battlefield', () => {
    expect(partyFilledCount(payload.battlefields[0].parties[0])).toBe(2)
    expect(battlefieldFilledCount(payload.battlefields[0])).toBe(3)
    expect(battlefieldFilledCount(payload.battlefields[1])).toBe(0)
  })

  it('reports a full party only at 5/5', () => {
    expect(isPartyFull(party(1, ['a', 'b', 'c', 'd', 'e']))).toBe(true)
    expect(isPartyFull(party(1, ['a', 'b', 'c', 'd', null]))).toBe(false)
  })
})

describe('member assignment lookup', () => {
  it('finds where a member sits, or null when unassigned', () => {
    expect(findMemberAssignment(payload, 'b')).toEqual({ battlefield: 'vigrid_field', party_index: 1, slot_index: 2 })
    expect(findMemberAssignment(payload, 'zzz')).toBeNull()
  })

  it('builds one map entry per seated member', () => {
    const map = buildAssignmentMap(payload)
    expect(map.size).toBe(3)
    expect(map.get('c')).toEqual({ battlefield: 'vigrid_field', party_index: 2, slot_index: 1 })
  })

  it('renders the raid badge and the full callout', () => {
    const at = { battlefield: 'vigrid_field' as const, party_index: 7, slot_index: 5 }
    expect(assignmentBadge(at)).toBe('Raid 1 · G7')
    expect(assignmentCallout(at)).toBe('Vigrid Field (Raid 1) — G7 (Slot 5)')
  })
})

describe('filterAssignableRoster', () => {
  const assignments = buildAssignmentMap(payload)

  it('lists unassigned members first, then assigned ones, each alphabetical', () => {
    const entries = filterAssignableRoster(roster, assignments, '')
    // All three are assigned here, so the order is purely alphabetical
    // (alpha=b, Mike=c, Zeta=a).
    expect(entries.map((e) => e.member.member_id)).toEqual(['b', 'c', 'a'])
  })

  it('puts unassigned members before assigned ones', () => {
    const onlyZetaAssigned = new Map([['a', { battlefield: 'ruinscape' as const, party_index: 1, slot_index: 1 }]])
    const entries = filterAssignableRoster(roster, onlyZetaAssigned, '')
    expect(entries.map((e) => e.member.display_name)).toEqual(['alpha', 'Mike', 'Zeta'])
    expect(entries[2].assignment).toEqual({ battlefield: 'ruinscape', party_index: 1, slot_index: 1 })
    expect(entries[0].assignment).toBeNull()
  })

  it('filters case-insensitively by display name', () => {
    const entries = filterAssignableRoster(roster, assignments, '  ALPH ')
    expect(entries.map((e) => e.member.display_name)).toEqual(['alpha'])
  })
})

describe('normalizeRoleLabel', () => {
  it('trims, clears blanks and caps at 40 characters', () => {
    expect(normalizeRoleLabel('  MOBS CIMA/BAIXO  ')).toBe('MOBS CIMA/BAIXO')
    expect(normalizeRoleLabel('   ')).toBeNull()
    expect(normalizeRoleLabel('x'.repeat(60))).toHaveLength(40)
  })
})
