// Locks the Menestrel + Cigana merge contract (owner request 2026-10-29, Phase
// 10.3). Node-env vitest — pure helpers, no DOM.
import { describe, expect, it } from 'vitest'
import {
  ARTISTA,
  cohortGroup,
  groupLabel,
  isMergedClass,
  isVirtualClassGroup,
  mergedClassOptions,
  playableClassOptions,
} from './classGroups'

// The real /classes list as the migration leaves it: the 15 official classes plus
// the ONE virtual group the merge introduces.
const CLASS_LIST = [
  'Assassin Cross',
  'Bard',
  'Biochemist',
  'Champion',
  'Gypsy',
  'High Priest',
  'High Wizard',
  'Lord Knight',
  'Mastersmith',
  'Paladin',
  'Professor',
  'Rebellion',
  'Sniper',
  'Stalker',
  'Summoner',
  ARTISTA,
]

describe('cohortGroup — one stats identity per merged pair', () => {
  it('maps both artist classes onto the Artista group', () => {
    expect(cohortGroup('Bard')).toBe('Artista')
    expect(cohortGroup('Gypsy')).toBe('Artista')
  })

  it('leaves every other class its own group (the exception never leaks)', () => {
    expect(cohortGroup('Sniper')).toBe('Sniper')
    expect(cohortGroup('High Wizard')).toBe('High Wizard')
    expect(cohortGroup('Summoner')).toBe('Summoner')
  })

  it('passes null through (never a string that would match a cohort)', () => {
    expect(cohortGroup(null)).toBeNull()
    expect(cohortGroup(undefined)).toBeNull()
  })
})

describe('groupLabel — the merged class is called Artista', () => {
  it('labels the group in pt-BR', () => {
    expect(groupLabel('Artista')).toBe('Artista')
  })

  it('falls back to the key for anything else, em-dash for empty', () => {
    expect(groupLabel('Sniper')).toBe('Sniper')
    expect(groupLabel('')).toBe('—')
    expect(groupLabel(null)).toBe('—')
  })
})

describe('mergedClassOptions — the stats-surface selector', () => {
  it('lists Artista ONCE, where Menestrel and Cigana used to be two entries', () => {
    const options = mergedClassOptions(CLASS_LIST)

    expect(options.filter((option) => option === 'Artista')).toHaveLength(1)
    expect(options).toContain('Artista')
    expect(options).not.toContain('Bard')
    expect(options).not.toContain('Gypsy')
    expect(options).toContain('Sniper')
  })

  it('keeps the catalog order and never duplicates a group', () => {
    const options = mergedClassOptions(CLASS_LIST)
    expect(new Set(options).size).toBe(options.length)
    expect(options[0]).toBe('Assassin Cross')
  })

  it('works on a list WITHOUT the virtual group (server not yet migrated)', () => {
    // The client must not depend on the virtual class row existing: the merge map
    // alone must produce the group.
    expect(mergedClassOptions(['Bard', 'Gypsy', 'Sniper'])).toEqual([
      'Artista',
      'Sniper',
    ])
  })
})

describe('playableClassOptions — the registration selector', () => {
  it('offers the real classes and never a virtual group', () => {
    const options = playableClassOptions(CLASS_LIST)

    expect(options).toContain('Bard')
    expect(options).toContain('Gypsy')
    expect(options).not.toContain('Artista')
    expect(options).toHaveLength(15)
  })
})

describe('isMergedClass / isVirtualClassGroup', () => {
  it('identifies merged classes and the virtual group', () => {
    expect(isMergedClass('Bard')).toBe(true)
    expect(isMergedClass('Gypsy')).toBe(true)
    expect(isMergedClass('Sniper')).toBe(false)
    expect(isMergedClass(null)).toBe(false)

    expect(isVirtualClassGroup('Artista')).toBe(true)
    expect(isVirtualClassGroup('Bard')).toBe(false)
    expect(isVirtualClassGroup(null)).toBe(false)
  })

  it('ARTISTA is the one group the merge creates', () => {
    expect(ARTISTA).toBe('Artista')
  })
})
