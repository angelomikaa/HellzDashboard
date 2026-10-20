// keyStatStrip — the PURE model behind the Painel EAFC key-stat hero strip
// (plan 07.2-03, D-01/D-02/D-07). Extracted from the render layer so the
// strip's state machine and the foco priority assembly are unit-testable in
// the node environment (zero new dependencies); DashboardPage and FocusStrip
// consume these verbatim.
//
// RNK-02 discipline: everything here is pure presentation of the my_card
// payload — no rank math, no sorting of the key_stats (server order is
// sacred), no derivation of key identity beyond what my_card legitimately
// reveals (the sanctioned 07.2 D-03 reveal).
import type { CardKeyStat, MyCard } from '../../lib/api'

/**
 * The strip's render state (DashboardPage's success branch):
 *  - 'hidden'    : myCard is null (the my_card fetch failed) — the strip
 *                  self-hides; the grouped 57-stat view renders regardless.
 *  - 'explainer' : the class-missing state (key_stats [] — char_class null
 *                  implies this server-side) — render the muted explainer
 *                  line, never placeholder cards.
 *  - 'cards'     : the key stats IN SERVER ORDER (D-01 — never re-sorted).
 */
export type KeyStatStripModel =
  | { kind: 'hidden' }
  | { kind: 'explainer' }
  | { kind: 'cards'; stats: readonly CardKeyStat[] }

export function keyStatStripModel(myCard: MyCard | null): KeyStatStripModel {
  if (myCard === null) return { kind: 'hidden' }
  if (myCard.key_stats.length === 0) return { kind: 'explainer' }
  return { kind: 'cards', stats: myCard.key_stats }
}

/**
 * The D-07 foco priority set: key ∪ relevant stat keys from my_card.
 * Null-safe: a null myCard yields an EMPTY set — improvementFocus then
 * returns [] and the FocusStrip self-hides (a my_card failure must never
 * take the grouped view or the foco strip down with it).
 */
export function priorityKeySet(myCard: MyCard | null): ReadonlySet<string> {
  if (myCard === null) return new Set()
  return new Set([...myCard.key_stats.map((k) => k.stat_key), ...myCard.relevant_stat_keys])
}
