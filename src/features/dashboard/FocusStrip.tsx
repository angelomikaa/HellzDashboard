// FocusStrip — the improvement-focus strip (07.2 D-07 rewire), the explicit
// improvement loop: the 6 stats MOST BEHIND the class average among the
// member's key ∪ relevant stats, as jump tiles.
//
// Round 11: the strip lives INSIDE the hero's right column, under the
// identity header and the key-stat tiles, so the column carries the whole
// read — who you are, where you stand, what to improve.
// Round 12 (owner checkpoint): the tiles now reuse MiniStatTile, the SAME
// anatomy as the key stats above — label / value / points chip on a surface
// tile — and the list grew from 3 to 6 so both rows read as one rhythm.
//
// 07.2-03: selection happens INSIDE via the unit-locked improvementFocus
// rule (07.2-02) — eligible = points non-null AND stat_key ∈ priorityKeys
// (key ∪ relevant, assembled by keyStatStrip.priorityKeySet from my_card).
// This replaces the retired 3-lowest-points selection rule: "there's
// no need for an assassin to improve his cura realizada stat" — the
// priorityKeys filter IS the essence. The strip hides itself entirely when
// nothing is eligible (an empty priorityKeys set yields [] — UI-SPEC edge
// rule).
// Points arrive opaque from the RPC — the tile only rounds the given number
// for display; the color comes from tierForPoints via the literal TIER_TEXT
// map. The accent-red heading is one of the four reserved accent uses
// (interaction red #DC3538 — a different token from tier gold #E9B44C).
import { useMemo } from 'react'
import type { MyReportStat } from '../../lib/api'
import type { GroupKey } from '../../lib/groups'
import { MiniStatTile } from './MiniStatTile'
import { improvementFocus } from './presentation'

export function FocusStrip({
  stats,
  priorityKeys,
  onJump,
}: {
  stats: MyReportStat[]
  priorityKeys: ReadonlySet<string>
  onJump: (statKey: string, group: GroupKey) => void
}) {
  const focus = useMemo(() => improvementFocus(stats, priorityKeys), [stats, priorityKeys])
  if (focus.length === 0) return null

  return (
    <div className="border-t border-line pt-3">
      <h2 className="text-sm font-semibold text-accent">Foco de melhoria</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {focus.map((stat) => (
          <MiniStatTile
            key={stat.stat_key}
            label={stat.label}
            labelTitle={stat.label}
            value={stat.own_value}
            valueType={stat.value_type}
            points={stat.points}
            onSelect={() => onJump(stat.stat_key, stat.group_name)}
          />
        ))}
      </div>
    </div>
  )
}
