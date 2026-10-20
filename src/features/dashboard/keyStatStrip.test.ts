// Plan 07.2-03 task 2 (TDD): the Painel card-strip SPEC. The strip's render
// decisions are extracted into a PURE model (keyStatStripModel) + the D-07
// priority-key assembly (priorityKeySet) so the behavior is testable in the
// node test environment (zero new dependencies) — the DashboardPage/FocusStrip
// components consume these verbatim. Behavior contracts (plan <behavior>):
//   1. a MyCard with 6 key_stats -> 6 cards IN SERVER ORDER (D-01: never
//      re-sorted client-side);
//   2. the class-missing state (char_class null / key_stats []) -> a muted
//      explainer state — never a crash, never placeholder cards;
//   3. FocusStrip's priority keys = key ∪ relevant from my_card — a stat
//      OUTSIDE the set can never be a foco candidate even with points 0
//      (the D-07 filter IS the essence: no assassin improves cura realizada).
import { describe, expect, it } from 'vitest'
import type { CardKeyStat, MyCard, MyReportStat } from '../../lib/api'
import { improvementFocus } from './presentation'
import { keyStatStripModel, priorityKeySet } from './keyStatStrip'

function keyStat(stat_key: string, overrides?: Partial<CardKeyStat>): CardKeyStat {
  return {
    stat_key,
    label: stat_key.toUpperCase(),
    label_short: stat_key.slice(0, 3).toUpperCase(),
    value_type: 'flat',
    own_value: 100,
    points: 50,
    ...overrides,
  }
}

function myCard(overrides?: Partial<MyCard>): MyCard {
  return {
    char_class: 'Assassin Cross',
    char_function: 'dps',
    ovr: { value: 77.2, data_sufficient: true },
    key_stats: ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => keyStat(k)),
    relevant_stat_keys: [],
    ...overrides,
  }
}

/** Minimal MyReportStat factory (presentation.test.ts idiom). */
function stat(points: number | null, overrides?: Partial<MyReportStat>): MyReportStat {
  return {
    stat_key: 's1',
    label: 'S1',
    group_name: 'general',
    value_type: 'flat',
    own_value: 1,
    class_average: 1,
    best: 2,
    points,
    data_sufficient: points !== null,
    ...overrides,
  }
}

describe('keyStatStripModel (D-01: the Painel hero-strip state machine)', () => {
  it('a MyCard with 6 key_stats renders 6 cards IN SERVER ORDER', () => {
    const card = myCard({ key_stats: ['f', 'a', 'c', 'b', 'e', 'd'].map((k) => keyStat(k)) })
    const model = keyStatStripModel(card)
    expect(model.kind).toBe('cards')
    if (model.kind === 'cards') {
      expect(model.stats.map((s) => s.stat_key)).toEqual(['f', 'a', 'c', 'b', 'e', 'd'])
      expect(model.stats).toHaveLength(6)
    }
  })

  it('key_stats [] -> the muted explainer state (never cards, never a crash)', () => {
    const model = keyStatStripModel(myCard({ key_stats: [], relevant_stat_keys: [] }))
    expect(model.kind).toBe('explainer')
  })

  it('char_class null (class-missing) -> the muted explainer state', () => {
    const model = keyStatStripModel(myCard({ char_class: null, key_stats: [] }))
    expect(model.kind).toBe('explainer')
  })

  it('myCard null (my_card fetch failed) -> hidden — the strip self-hides and the grouped view survives', () => {
    expect(keyStatStripModel(null).kind).toBe('hidden')
  })
})

describe('priorityKeySet (D-07 wiring: foco priority = key ∪ relevant from my_card)', () => {
  it('unions key_stats stat_keys with relevant_stat_keys', () => {
    const set = priorityKeySet(myCard({ relevant_stat_keys: ['cura', 'sp_rec'] }))
    expect([...set].sort()).toEqual(['a', 'b', 'c', 'cura', 'd', 'e', 'f', 'sp_rec'].sort())
  })

  it('null myCard -> an EMPTY set (the strip self-hides; improvementFocus returns [])', () => {
    expect(priorityKeySet(null).size).toBe(0)
  })

  it('D-07 filter is the essence: a stat with points 0 OUTSIDE key∪relevant is never a foco candidate', () => {
    // 'c' would be the MOST behind stat by gap, but it is neither key nor
    // relevant — improvementFocus over priorityKeySet(myCard) must ignore it.
    const stats = [
      stat(50, { stat_key: 'a', own_value: 10, class_average: 20 }), // behind (−0.5)
      stat(60, { stat_key: 'b', own_value: 5, class_average: 6 }), // behind (−1/6)
      stat(0, { stat_key: 'c', own_value: 0, class_average: 100 }), // most behind, IRRELEVANT
    ]
    const card = myCard({
      key_stats: [keyStat('a'), keyStat('b')],
      relevant_stat_keys: [],
    })
    const focus = improvementFocus(stats, priorityKeySet(card))
    expect(focus.map((s) => s.stat_key)).toEqual(['a', 'b'])
    expect(focus.map((s) => s.stat_key)).not.toContain('c')
  })
})
