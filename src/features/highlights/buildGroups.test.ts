// Unit SPEC for the Início per-build grouping (Phase 10.2 client half, owner
// request 2026-10-29). Node-env vitest — pure functions, no DOM/React.
import { describe, expect, it } from 'vitest'
import type { PromotionCardRow, PromotionSection } from '../../lib/api'
import { BUILD_ORDER, buildLabel, groupCardsByBuild, mergeCohortSections } from './buildGroups'

function card(
  display_name: string,
  char_function: PromotionCardRow['char_function'],
  ovr = 99,
): PromotionCardRow {
  return {
    display_name,
    char_function,
    ovr,
    highlights: [],
    photo_path: `card-photos/${display_name}/card.jpg`,
  }
}

describe('buildLabel (FUNCTION_LABELS passthrough contract)', () => {
  it('renders the pt-BR build names', () => {
    expect(buildLabel('dps')).toBe('Dano Físico')
    expect(buildLabel('mdps')).toBe('Dano Mágico')
    expect(buildLabel('suporte')).toBe('Suporte')
  })

  it('passes an unknown key through and renders the em-dash for empty', () => {
    expect(buildLabel('tank')).toBe('tank')
    expect(buildLabel('')).toBe('—')
    expect(buildLabel(null)).toBe('—')
    expect(buildLabel(undefined)).toBe('—')
  })
})

describe('groupCardsByBuild — one scroller per meta build', () => {
  it('gives a three-build class (Summoner) three groups', () => {
    const groups = groupCardsByBuild([
      card('Caladoh', 'dps', 99),
      card('Invocador Um', 'dps', 96),
      card('Smoke Invocador Um', 'mdps', 94),
      card('Suporte Sum', 'suporte', 91),
    ])

    expect(groups.map((group) => group.fn)).toEqual(['dps', 'mdps', 'suporte'])
    expect(groups.map((group) => group.label)).toEqual([
      'Dano Físico',
      'Dano Mágico',
      'Suporte',
    ])
    expect(groups.map((group) => group.cards.length)).toEqual([2, 1, 1])
  })

  it('gives a single-build class (High Priest) exactly one group', () => {
    const groups = groupCardsByBuild([card('Ahrya', 'suporte', 99)])

    expect(groups).toHaveLength(1)
    expect(groups[0].fn).toBe('suporte')
    expect(groups[0].label).toBe('Suporte')
    expect(groups[0].cards.map((c) => c.display_name)).toEqual(['Ahrya'])
  })

  it('never invents an empty scroller for a build the class has no cards in', () => {
    // The server drops non-viable cohorts (class_cohorts.meta) and omits
    // data-insufficient classes, so only builds WITH cards may reach the
    // client — every group must carry at least one card.
    const groups = groupCardsByBuild([card('Algoz Um', 'dps'), card('Algoz Dois', 'mdps')])

    expect(groups.map((group) => group.fn)).toEqual(['dps', 'mdps'])
    expect(groups.every((group) => group.cards.length > 0)).toBe(true)
  })

  it('keeps each build in server order (highest OVR first) — never re-sorts', () => {
    const groups = groupCardsByBuild([
      card('top-dano', 'dps', 99),
      card('top-magico', 'mdps', 98),
      card('second-dano', 'dps', 97),
      card('second-magico', 'mdps', 96),
    ])

    expect(groups[0].cards.map((c) => c.display_name)).toEqual(['top-dano', 'second-dano'])
    expect(groups[1].cards.map((c) => c.display_name)).toEqual(['top-magico', 'second-magico'])
  })

  it('orders builds canonically (dps → mdps → suporte), not by arrival', () => {
    // The class's cards arrive OVR-ordered across cohorts; the build rows must
    // still read in the shared vocabulary order so the layout never shuffles.
    const groups = groupCardsByBuild([
      card('Suporte Um', 'suporte', 99),
      card('Magico Um', 'mdps', 98),
      card('Dano Um', 'dps', 97),
    ])

    expect(groups.map((group) => group.fn)).toEqual(['dps', 'mdps', 'suporte'])
  })

  it('keeps every card exactly once across the groups (nothing dropped)', () => {
    const incoming = [
      card('a', 'dps'),
      card('b', 'suporte'),
      card('c', 'mdps'),
      card('d', 'dps'),
      card('e', 'suporte'),
    ]
    const groups = groupCardsByBuild(incoming)

    const names = groups.flatMap((group) => group.cards.map((c) => c.display_name))
    expect(names.slice().sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(new Set(names).size).toBe(incoming.length)
  })

  it('returns no groups for no cards (the caller renders nothing)', () => {
    expect(groupCardsByBuild([])).toEqual([])
  })

  it('keeps a card whose function is missing/invalid instead of dropping it', () => {
    // Defensive: a malformed payload must never lose a player's card.
    const groups = groupCardsByBuild([
      card('Sem Funcao', null as unknown as PromotionCardRow['char_function']),
      card('Inventada', 'tank' as PromotionCardRow['char_function']),
      card('Normal', 'dps'),
    ])

    expect(groups.map((group) => group.fn).sort()).toEqual(['', 'dps', 'tank'])
    const unknown = groups.find((group) => group.fn === '')
    expect(unknown?.label).toBe('—')
    expect(unknown?.cards.map((c) => c.display_name)).toEqual(['Sem Funcao'])
  })

  it('BUILD_ORDER matches the FUNCTION_LABELS vocabulary key order', () => {
    expect([...BUILD_ORDER]).toEqual(['dps', 'mdps', 'suporte'])
  })
})

// --- The live payload answers one section PER COHORT (verified 2026-10-29) ---

function section(class_name: string, cards: PromotionCardRow[], char_function?: PromotionSection['char_function']): PromotionSection {
  return { class_name, char_function, cards }
}

describe('mergeCohortSections — one class, one showcase index', () => {
  it('joins a multi-build class that arrived as several cohort sections', () => {
    // The owner's report: Summoner landed as class index 9 (dps) AND index 10
    // (mdps) — two showcase slots, one class. Merging makes it ONE class whose
    // cards then split into two rows (the next describe's job).
    const merged = mergeCohortSections([
      section('Biochemist', [card('Outsider', 'suporte')], 'suporte'),
      section('Summoner', [card('Caladoh', 'dps'), card('Invocador Fis Um', 'dps')], 'dps'),
      section('Summoner', [card('MaxX1', 'mdps'), card('Umbreon', 'mdps')], 'mdps'),
    ])

    expect(merged.map((s) => s.class_name)).toEqual(['Biochemist', 'Summoner'])
    expect(merged[1].cards.map((c) => c.display_name)).toEqual([
      'Caladoh',
      'Invocador Fis Um',
      'MaxX1',
      'Umbreon',
    ])
  })

  it('leaves a single-build class (High Priest) exactly as it arrived', () => {
    const incoming = [section('High Priest', [card('Ahrya', 'suporte')], 'suporte')]

    const merged = mergeCohortSections(incoming)

    expect(merged).toHaveLength(1)
    expect(merged[0].class_name).toBe('High Priest')
    expect(merged[0].cards).toHaveLength(1)
  })

  it('is a pass-through for a payload already grouped per class (0037 body)', () => {
    // One section per class carrying its builds' cards mixed in OVR order.
    const incoming = [section('Summoner', [
      card('Caladoh', 'dps'),
      card('MaxX1', 'mdps'),
      card('Invocador Fis Um', 'dps'),
    ])]

    const merged = mergeCohortSections(incoming)

    expect(merged).toHaveLength(1)
    expect(merged[0].cards.map((c) => c.display_name)).toEqual([
      'Caladoh',
      'MaxX1',
      'Invocador Fis Um',
    ])
  })

  it('merges three builds into one class (Summoner fps/mago/suporte)', () => {
    const merged = mergeCohortSections([
      section('Summoner', [card('a1', 'dps')], 'dps'),
      section('Summoner', [card('b1', 'mdps')], 'mdps'),
      section('Summoner', [card('c1', 'suporte')], 'suporte'),
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].cards.map((c) => c.display_name)).toEqual(['a1', 'b1', 'c1'])
  })

  it('keeps the payload class order (first appearance) never alphabetises', () => {
    const merged = mergeCohortSections([
      section('Sniper', [card('choseN', 'dps')], 'dps'),
      section('Biochemist', [card('Outsider', 'suporte')], 'suporte'),
      section('Biochemist', [card('Criador Um', 'dps')], 'dps'),
    ])

    expect(merged.map((s) => s.class_name)).toEqual(['Sniper', 'Biochemist'])
  })

  it('never mutates the payload sections it merges', () => {
    const sectionA = section('Summoner', [card('Caladoh', 'dps')], 'dps')
    const sectionB = section('Summoner', [card('MaxX1', 'mdps')], 'mdps')
    mergeCohortSections([sectionA, sectionB])

    expect(sectionA.cards.map((c) => c.display_name)).toEqual(['Caladoh'])
    expect(sectionB.cards.map((c) => c.display_name)).toEqual(['MaxX1'])
  })

  it('returns nothing for no sections, and never drops a card while merging', () => {
    expect(mergeCohortSections([])).toEqual([])

    const merged = mergeCohortSections([
      section('Summoner', [card('a', 'dps')], 'dps'),
      section('Summoner', [card('b', 'mdps')], 'mdps'),
      section('High Priest', [card('c', 'suporte')], 'suporte'),
    ])
    expect(merged.reduce((n, s) => n + s.cards.length, 0)).toBe(3)
  })
})

describe('merge + group — the showcase row count per class', () => {
  it('gives Summoner 2 builds from two cohort sections (one class index)', () => {
    const merged = mergeCohortSections([
      section('Summoner', [card('Caladoh', 'dps'), card('Um', 'dps')], 'dps'),
      section('Summoner', [card('MaxX1', 'mdps'), card('Dois', 'mdps')], 'mdps'),
    ])
    const groups = groupCardsByBuild(merged[0].cards)

    expect(groups.map((g) => [g.fn, g.cards.length])).toEqual([
      ['dps', 2],
      ['mdps', 2],
    ])
  })

  it('gives High Priest exactly one build from one section', () => {
    const merged = mergeCohortSections([section('High Priest', [card('Ahrya', 'suporte')], 'suporte')])

    expect(groupCardsByBuild(merged[0].cards).map((g) => g.fn)).toEqual(['suporte'])
  })
})
