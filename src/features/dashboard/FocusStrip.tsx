// FocusStrip — the improvement-focus strip (07.2 D-07 rewire), the explicit
// improvement loop: the 3 stats MOST BEHIND the class average among the
// member's key ∪ relevant stats, as full jump buttons.
//
// Round 11 (owner checkpoint): the strip now lives INSIDE the hero's right
// column, under the identity header and the key-stat tiles, so the column
// carries the whole read — who you are, where you stand, what to improve.
// It therefore renders as an inline block (a divider + heading + chips)
// instead of its former standalone bordered card.
//
// 07.2-03: selection happens INSIDE via the unit-locked improvementFocus
// rule (07.2-02) — eligible = points non-null AND stat_key ∈ priorityKeys
// (key ∪ relevant, assembled by keyStatStrip.priorityKeySet from my_card).
// This replaces the retired 3-lowest-points selection rule: "there's
// no need for an assassin to improve his cura realizada stat" — the
// priorityKeys filter IS the essence. The strip hides itself entirely when
// nothing is eligible (an empty priorityKeys set yields [] — UI-SPEC edge
// rule).
// Points arrive opaque from the RPC — the item only rounds the given number
// for display; the color comes from tierForPoints via the literal TIER_TEXT
// map. The accent-red heading is one of the four reserved accent uses
// (interaction red #DC3538 — a different token from tier gold #E9B44C).
import type { MyReportStat } from '../../lib/api'
import type { GroupKey } from '../../lib/groups'
import { improvementFocus, tierForPoints } from './presentation'
import { TIER_TEXT_DISPLAY } from './tierDisplay'

export function FocusStrip({
  stats,
  priorityKeys,
  onJump,
}: {
  stats: MyReportStat[]
  priorityKeys: ReadonlySet<string>
  onJump: (statKey: string, group: GroupKey) => void
}) {
  const focus = improvementFocus(stats, priorityKeys)
  if (focus.length === 0) return null

  return (
    <div className="border-t border-line pt-3">
      <h2 className="text-sm font-semibold text-accent">Foco de melhoria</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {focus.map((stat) => {
          const tier = tierForPoints(stat.points)
          return (
            <button
              key={stat.stat_key}
              type="button"
              onClick={() => onJump(stat.stat_key, stat.group_name)}
              className="flex h-11 items-center gap-2 rounded-md bg-surface px-3 hover-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="text-sm text-content">{stat.label}</span>
              <span className={`text-sm font-semibold ${tier ? TIER_TEXT_DISPLAY[tier] : ''}`}>
                {Math.round(stat.points as number)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
