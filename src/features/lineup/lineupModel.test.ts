import { describe, expect, it } from 'vitest'
import type { LineupParty, LineupsPayload, LineupRosterMember } from '../../lib/api'
import {
  absentRoster,
  assignmentBadge,
  assignmentCallout,
  availableRoster,
  battlefieldFilledCount,
  battlefieldForRaid,
  buildAssignmentMap,
  classAccentHex,
  CLASS_ACCENT_HEX,
  BATTLEFIELD_META,
  defaultEmperiumPartyCounts,
  filledInDroppedParties,
  filterAssignableRoster,
  findMemberAssignment,
  isPartyFull,
  isValidPartyCounts,
  MAX_PARTIES_PER_RAID,
  MAX_RAIDS,
  MIN_RAIDS,
  minPartyCount,
  NULL_CLASS_ACCENT_HEX,
  normalizeRoleLabel,
  partyFilledCount,
  raidCapacity,
  raidMeta,
  lineupWarnings,
  TOTAL_PARTIES,
  totalPartyCount,
  WAR_MODE_META,
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
  war_mode: 'vigrid',
  raid_count: 2,
  min_raids: 2,
  max_raids: 8,
  battlefields: [
    {
      battlefield: 'vigrid_field',
      raid_index: 1,
      parties: [party(1, ['a', 'b', null, null, null]), party(2, ['c', null, null, null, null])],
    },
    {
      battlefield: 'ruinscape',
      raid_index: 2,
      parties: [party(1, [null, null, null, null, null])],
    },
  ],
  roster,
  absences: [],
}

describe('lineupModel metadata', () => {
  it('names both battlefields with the owner titles and raid subtitles', () => {
    expect(BATTLEFIELD_META.vigrid_field).toEqual({ title: 'Vigrid Field', subtitle: 'Raid 1', fileSlug: 'vigrid-field' })
    expect(BATTLEFIELD_META.ruinscape).toEqual({ title: 'Ruinscape', subtitle: 'Raid 2', fileSlug: 'ruinscape' })
  })

  it('names the two war modes and their raid bounds', () => {
    expect(WAR_MODE_META.vigrid.title).toBe('Vingança de Vigrid')
    expect(WAR_MODE_META.emperium.title).toBe('Guerra do Emperium')
    expect(MIN_RAIDS).toBe(2)
    expect(MAX_RAIDS).toBe(8)
  })

  it('maps each raid to its owner-facing title and filename slug', () => {
    expect(raidMeta('vigrid', 1)).toEqual({ title: 'Vigrid Field', subtitle: 'Raid 1', fileSlug: 'vigrid-field' })
    expect(raidMeta('vigrid', 2)).toEqual({ title: 'Ruinscape', subtitle: 'Raid 2', fileSlug: 'ruinscape' })
    expect(raidMeta('emperium', 3)).toEqual({
      title: 'Guerra do Emperium',
      subtitle: 'Raid 3',
      fileSlug: 'emperium-raid-3',
    })
    expect(battlefieldForRaid('vigrid', 1)).toBe('vigrid_field')
    expect(battlefieldForRaid('vigrid', 2)).toBe('ruinscape')
    expect(battlefieldForRaid('emperium', 5)).toBe('emperium_raid_5')
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

  // Owner report 2026-11-01: "algumas cores de classe não condizem com a cor do
  // icone". The accents were re-sampled from the committed icons; this guard
  // measures every icon and fails if an accent drifts away from its own art.
  it('keeps each accent in the hue family of its own icon', async () => {
    const sharp = (await import('sharp')).default
    const { join } = await import('node:path')

    const hueOf = (r: number, g: number, b: number): number => {
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const d = max - min
      if (d === 0) return 0
      let h: number
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h *= 60
      return h < 0 ? h + 360 : h
    }
    const angularDistance = (a: number, b: number): number => {
      const diff = Math.abs(a - b) % 360
      return diff > 180 ? 360 - diff : diff
    }

    for (const [charClass, accent] of Object.entries(CLASS_ACCENT_HEX)) {
      const slug = charClass.toLowerCase().replace(/\s+/g, '-')
      const file = join(process.cwd(), 'public', 'assets', 'classes', `class-icon-${slug}.webp`)
      const { data, info } = await sharp(file)
        .resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Weighted circular mean of the icon's saturated pixels.
      let x = 0
      let y = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const sat = max === 0 ? 0 : (max - min) / max
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (sat < 0.18 || lum < 40 || lum > 235) continue
        const h = (hueOf(r, g, b) * Math.PI) / 180
        x += Math.cos(h) * sat
        y += Math.sin(h) * sat
      }
      expect(info.width).toBe(48)
      expect(Math.hypot(x, y), `${charClass}: icon has no usable hue`).toBeGreaterThan(0)
      const iconHue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360

      const ar = parseInt(accent.slice(1, 3), 16)
      const ag = parseInt(accent.slice(3, 5), 16)
      const ab = parseInt(accent.slice(5, 7), 16)
      const accentHue = hueOf(ar, ag, ab)

      const drift = angularDistance(iconHue, accentHue)
      expect(drift, `${charClass}: icon ${Math.round(iconHue)}° vs accent ${Math.round(accentHue)}°`).toBeLessThanOrEqual(40)
    }
  }, 30_000)
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

  it('derives capacity and total parties from the actual party counts', () => {
    const six = { parties: Array.from({ length: 6 }, (_, i) => party(i + 1, [])) }
    const four = { parties: Array.from({ length: 4 }, (_, i) => party(i + 1, [])) }
    expect(raidCapacity(six)).toBe(30)
    expect(raidCapacity(four)).toBe(20)
    expect(totalPartyCount([six, four])).toBe(10)
    expect(TOTAL_PARTIES).toBe(16)
  })
})

describe('Emperium party distribution invariant', () => {
  it('defaults to 6/6/4 for three raids and 8/8 for two', () => {
    expect(defaultEmperiumPartyCounts(2)).toEqual([8, 8])
    expect(defaultEmperiumPartyCounts(3)).toEqual([6, 6, 4])
    expect(defaultEmperiumPartyCounts(4)).toEqual([4, 4, 4, 4])
    expect(defaultEmperiumPartyCounts(5)).toEqual([4, 3, 3, 3, 3])
    expect(defaultEmperiumPartyCounts(8)).toEqual([2, 2, 2, 2, 2, 2, 2, 2])
    for (let raids = 2; raids <= 8; raids++) {
      const counts = defaultEmperiumPartyCounts(raids)
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(TOTAL_PARTIES)
      expect(counts.every((count) => count >= 1 && count <= MAX_PARTIES_PER_RAID)).toBe(true)
    }
  })

  it('accepts only 2..8 raids, 1..8 parties each, within the allowed total', () => {
    expect(isValidPartyCounts([6, 6, 4])).toBe(true)
    expect(isValidPartyCounts([8, 8])).toBe(true)
    expect(isValidPartyCounts([7, 5, 4])).toBe(true)
    expect(isValidPartyCounts([8, 8, 0])).toBe(false)
    expect(isValidPartyCounts([9, 7])).toBe(false)
    expect(isValidPartyCounts([6, 6])).toBe(false)
    expect(isValidPartyCounts([5, 5, 5])).toBe(false)
    expect(isValidPartyCounts([2])).toBe(false)
    // With five absences the officer may keep 16 or deliberately drop to 15.
    expect(isValidPartyCounts([6, 6, 4], 15, 16)).toBe(true)
    expect(isValidPartyCounts([6, 6, 3], 15, 16)).toBe(true)
    expect(isValidPartyCounts([5, 5, 5], 15, 16)).toBe(true)
    expect(isValidPartyCounts([5, 5, 4], 15, 16)).toBe(false)
    expect(isValidPartyCounts([6, 6, 5], 15, 16)).toBe(false)
  })

  it('counts only the trailing parties that a reduction would drop', () => {
    const current = [
      { parties: [party(1, ['a', 'b'])] },
      { parties: [party(1, ['c']), party(2, [])] },
    ]
    // Dropping to 1 party removes the filled then the empty trailing party.
    expect(filledInDroppedParties(current, 1)).toBe(1)
    // Dropping to 2 removes only the empty trailing party.
    expect(filledInDroppedParties(current, 2)).toBe(0)
  })
})

describe('absence-adjusted party count and roster split', () => {
  it('allows one party per five active absences, with a two-party floor', () => {
    expect(minPartyCount(0)).toBe(16)
    expect(minPartyCount(4)).toBe(16)
    expect(minPartyCount(5)).toBe(15)
    expect(minPartyCount(9)).toBe(15)
    expect(minPartyCount(10)).toBe(14)
    expect(minPartyCount(75)).toBe(2)
    expect(minPartyCount(80)).toBe(2)
  })

  it('splits the roster into available and absent members', () => {
    const assignments = new Map([
      [
        'a',
        {
          war_mode: 'emperium' as const,
          battlefield: 'emperium_raid_1' as const,
          raid_index: 1,
          party_index: 1,
          slot_index: 1,
        },
      ],
    ])
    const absent = new Set(['b'])
    expect(availableRoster(roster, assignments, absent).map((m) => m.member_id)).toEqual(['c'])
    expect(absentRoster(roster, absent).map((m) => m.member_id)).toEqual(['b'])
  })
})

describe('member assignment lookup', () => {
  it('finds where a member sits, or null when unassigned', () => {
    expect(findMemberAssignment(payload, 'b')).toEqual({
      war_mode: 'vigrid',
      battlefield: 'vigrid_field',
      raid_index: 1,
      party_index: 1,
      slot_index: 2,
    })
    expect(findMemberAssignment(payload, 'zzz')).toBeNull()
  })

  it('builds one map entry per seated member', () => {
    const map = buildAssignmentMap(payload)
    expect(map.size).toBe(3)
    expect(map.get('c')).toEqual({
      war_mode: 'vigrid',
      battlefield: 'vigrid_field',
      raid_index: 1,
      party_index: 2,
      slot_index: 1,
    })
  })

  it('renders the raid badge and the full callout for both war modes', () => {
    const at = {
      war_mode: 'vigrid' as const,
      battlefield: 'vigrid_field' as const,
      raid_index: 1,
      party_index: 7,
      slot_index: 5,
    }
    expect(assignmentBadge(at)).toBe('Raid 1 · G7')
    expect(assignmentCallout(at)).toBe('Vigrid Field (Raid 1) — G7 (Slot 5)')

    const emperium = {
      war_mode: 'emperium' as const,
      battlefield: 'emperium_raid_3' as const,
      raid_index: 3,
      party_index: 2,
      slot_index: 4,
    }
    expect(assignmentBadge(emperium)).toBe('Raid 3 · G2')
    expect(assignmentCallout(emperium)).toBe('Guerra do Emperium (Raid 3) — G2 (Slot 4)')
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
    const onlyZetaAssigned = new Map([
      [
        'a',
        {
          war_mode: 'vigrid' as const,
          battlefield: 'ruinscape' as const,
          raid_index: 2,
          party_index: 1,
          slot_index: 1,
        },
      ],
    ])
    const entries = filterAssignableRoster(roster, onlyZetaAssigned, '')
    expect(entries.map((e) => e.member.display_name)).toEqual(['alpha', 'Mike', 'Zeta'])
    expect(entries[2].assignment).toEqual({
      war_mode: 'vigrid',
      battlefield: 'ruinscape',
      raid_index: 2,
      party_index: 1,
      slot_index: 1,
    })
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

describe('lineupWarnings', () => {
  it('flags a raid with no support and its incomplete parties', () => {
    const warnings = lineupWarnings(payload)
    const byId = new Map(warnings.map((warning) => [warning.id, warning]))
    // Raid 1 has seated players but all of them are dps in the fixture.
    expect(byId.get('no-suporte-1')?.tone).toBe('warn')
    expect(byId.get('incomplete-1')?.tone).toBe('info')
    // Raid 2 is empty: no composition verdict at all.
    expect(byId.has('no-suporte-2')).toBe(false)
  })

  it('surfaces unassigned actives and marked absences', () => {
    const sparse: LineupsPayload = {
      ...payload,
      roster: [
        ...roster,
        { member_id: 'd', display_name: 'Delta', char_class: null, char_function: 'mdps' },
        { member_id: 'e', display_name: 'Echo', char_class: null, char_function: 'dps' },
      ],
      absences: ['d'],
    }
    const ids = lineupWarnings(sparse).map((warning) => warning.id)
    expect(ids).toContain('unassigned') // Echo
    expect(ids).toContain('absences') // Delta
  })

  it('clears the support warning once a suporte is seated', () => {
    const supportRaid = {
      battlefield: 'vigrid_field' as const,
      raid_index: 1,
      parties: [
        {
          party_index: 1,
          role_label: null,
          filled: 1,
          slots: [
            {
              slot_index: 1,
              member_id: 'c',
              display_name: 'Mike',
              char_class: 'Gypsy',
              char_function: 'suporte' as const,
            },
            slot(2, null),
            slot(3, null),
            slot(4, null),
            slot(5, null),
          ],
        },
        party(2, [null, null, null, null, null]),
      ],
    }
    const ids = lineupWarnings({ ...payload, battlefields: [supportRaid] }).map(
      (warning) => warning.id,
    )
    expect(ids).not.toContain('no-suporte-1')
    expect(ids).toContain('empty-1')
  })
})
