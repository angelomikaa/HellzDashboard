// Build (function) grouping for the Início showcase — the Phase 10.2 client
// half (owner request 2026-10-29: "according to the meta builds registered,
// add more carousel scroller to each class — the objective is to show jobs
// based on their function. Summoner has 3 meta builds, so it must have 3
// scrollers; High Priest has one, so it must have one. Non-viable builds must
// be ignored.").
//
// Two functions, because the payload can arrive in TWO shapes and both are
// live (the showCASE must own ONE class per index either way):
//
//  1. ONE SECTION PER CLASS carrying the top 3 cards of EACH of that class's
//     meta cohorts mixed in a single OVR-ordered card list (the repo's 0037
//     body: `group by t.char_class`), or
//  2. ONE SECTION PER (class, function) COHORT, each with its own top 3 and
//     the section's own `char_function` (the body currently deployed on the
//     live project — verified live 2026-10-29: Summoner arrived as TWO
//     sections, dps at index 9 and mdps at index 10, which rotated as two
//     "classes" and split the guild's Summoner showcase in half).
//
// So: `mergeCohortSections` normalizes shape 2 into shape 1 (one section per
// CLASS — the class must be the rotation unit, never a build), and
// `groupCardsByBuild` then splits a class's cards into ONE GROUP PER BUILD so
// each build owns its own scroller (Summoner → 3 rows, High Priest → 1). Both
// are pure DISPLAY grouping over fields the payload already carries:
//   - no value is recomputed (rank math lives only in Postgres — AGENTS.md);
//   - every card is kept, in its exact server position relative to the other
//     cards of its OWN build (server order is authoritative, never re-sorted);
//   - non-viable builds never enter here — the server already dropped them
//     (class_cohorts.meta), and a build with no cards yields NO group, so an
//     empty scroller can never render.
//
// Order: canonical build order (dps → mdps → suporte, the FUNCTION_LABELS
// vocabulary), so a class's build rows read the same way at every width and
// never shuffle with the data. Unknown/missing functions keep their cards
// (they sort after the known ones in first-appearance order) — a card is
// never dropped for a label problem. Class order is first-appearance, which
// respects the server's own ordering in both shapes.
import type { PromotionCardRow, PromotionSection } from '../../lib/api'
import { FUNCTION_LABELS } from '../../lib/groups'

/** Canonical build order, the FUNCTION_LABELS key order — the order the staff
 *  form, the dashboard and the submit flow already present them in. */
export const BUILD_ORDER = ['dps', 'mdps', 'suporte'] as const

export type BuildKey = (typeof BUILD_ORDER)[number]

export interface BuildGroup {
  /** The build key exactly as it arrives on the cards ('dps' | 'mdps' |
   *  'suporte'; an unexpected value passes through untouched). */
  fn: string
  /** pt-BR build label (FUNCTION_LABELS — one shared vocabulary, KeyStatsPage
   *  test locks it): unknown keys pass through, missing renders '—'. */
  label: string
  /** The build's cards in SERVER order (highest OVR first, as ranked inside
   *  the RPC) — never re-sorted here. */
  cards: PromotionCardRow[]
}

/** The pt-BR label for a build key: FUNCTION_LABELS with the classLabels
 *  passthrough contract (unknown key → the key, empty → '—'). Never throws. */
export function buildLabel(fn: string | null | undefined): string {
  const key = String(fn ?? '').trim()
  if (key === '') return '—'
  return FUNCTION_LABELS[key as BuildKey] ?? key
}

/** Sort key for the canonical build order; unknown builds sort after the
 *  known ones, first appearance breaking the tie (stable enough to keep the
 *  ordering deterministic without depending on the arrival order). */
function buildRank(fn: string): number {
  const index = BUILD_ORDER.indexOf(fn as BuildKey)
  return index === -1 ? BUILD_ORDER.length : index
}

/**
 * Merge the payload's sections into ONE SECTION PER CLASS.
 *
 * The live RPC ranks each meta cohort independently, so a multi-build class
 * arrives as N sections that share only `class_name` (the owner's report:
 * "instead of creating a 10th index just for the magic damage role of the
 * summoner class" — the class is ONE guild showcase slot, its builds are the
 * rows inside it). Merging concatenates each class's cohort cards in payload
 * order (the server orders cohort sections by class then function, so the
 * merged card list is deterministic) and keeps the first-seen section
 * metadata for the class. With the per-class shape (0037's body) this is a
 * pass-through — every class already has exactly one section — so the
 * showcase is identical either way.
 */
export function mergeCohortSections(
  sections: readonly PromotionSection[],
): PromotionSection[] {
  const merged = new Map<string, PromotionSection>()

  for (const section of sections) {
    const key = String(section?.class_name ?? '')
    const existing = merged.get(key)
    if (existing === undefined) {
      merged.set(key, { ...section, cards: [...(section?.cards ?? [])] })
      continue
    }
    // A class's later cohorts append AFTER the ones already merged, in the
    // order the server sent them — never re-sorted, never de-duplicated by
    // hand (the RPC already ranks and de-duplicates per cohort).
    existing.cards.push(...(section?.cards ?? []))
  }

  return [...merged.values()]
}

/**
 * Split one class section's cards into ONE group per build (function).
 *
 * The cards arrive ordered by OVR desc ACROSS the class's meta cohorts, so
 * grouping must preserve each card's relative order inside its own build —
 * the RPC's per-cohort ranking survives intact. Summoner's three cohorts
 * become three groups (three scrollers); High Priest's single cohort becomes
 * one group (one scroller); a cohort with no cards produces nothing, so a
 * class with N builds but data in fewer shows exactly the builds that have
 * something to show.
 */
export function groupCardsByBuild(cards: readonly PromotionCardRow[]): BuildGroup[] {
  const groups = new Map<string, PromotionCardRow[]>()
  for (const card of cards) {
    const key = String(card?.char_function ?? '').trim()
    const bucket = groups.get(key)
    if (bucket === undefined) groups.set(key, [card])
    else bucket.push(card)
  }

  return [...groups.entries()]

    .map(([fn, groupCards]) => ({ fn, label: buildLabel(fn), cards: groupCards }))
    .sort((a, b) => {
      const byRank = buildRank(a.fn) - buildRank(b.fn)
      return byRank !== 0 ? byRank : a.fn.localeCompare(b.fn)
    })
}
