// FocusStrip — the improvement-focus strip (07.2 D-07 rewire), the explicit
// improvement loop: the 6 stats MOST BEHIND the class average among the
// member's key ∪ relevant stats, as progression tiles.
//
// Round 11: the strip lives INSIDE the hero's right column, under the
// identity header and the key-stat tiles, so the column carries the whole
// read — who you are, where you stand, what to improve.
// Round 12 (owner checkpoint): the tiles now reuse MiniStatTile, the SAME
// anatomy as the key stats above — label / value / points chip on a surface
// tile — and the list grew from 3 to 6 so both rows read as one rhythm.
//
// 07.2-03: selection happens in the PURE unit-locked improvementFocus rule
// (07.2-02), computed ONCE by DashboardPage (the progression modal needs the
// same list) and passed in as `focus`. "There's no need for an assassin to
// improve his cura realizada stat" — the priorityKeys filter IS the essence.
// The strip hides itself entirely when nothing is eligible.
//
// Phase 10.13 (owner 2026-11-06): each tile is a progression tracker — the
// 3-point sparkline + hover read-out, and clicking opens the detail modal.
// Points arrive opaque from the RPC — the tile only rounds the given number
// for display; the color comes from tierForPoints via the literal TIER_TEXT
// map. The accent-red heading is one of the four reserved accent uses.
import type { MyReportStat, StatProgressPoint } from '../../lib/api'
import { MiniStatTile } from './MiniStatTile'

export function FocusStrip({
  focus,
  historyByKey,
  onOpen,
}: {
  focus: readonly MyReportStat[]
  /** stat_key -> own history (newest first) from the 0074 payload. */
  historyByKey: ReadonlyMap<string, readonly StatProgressPoint[]>
  onOpen: (statKey: string) => void
}) {
  if (focus.length === 0) return null

  return (
    <div className="border-t border-line pt-4">
      <h2 className="text-sm font-semibold text-accent">Foco de melhoria</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {focus.map((stat) => (
          <MiniStatTile
            key={stat.stat_key}
            label={stat.label}
            labelTitle={stat.label}
            value={stat.own_value}
            valueType={stat.value_type}
            points={stat.points}
            history={historyByKey.get(stat.stat_key) ?? []}
            onOpen={() => onOpen(stat.stat_key)}
          />
        ))}
      </div>
    </div>
  )
}
