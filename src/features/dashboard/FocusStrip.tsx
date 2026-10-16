// FocusStrip — the improvement-focus strip (04-UI-SPEC § FocusStrip, D-16),
// the explicit improvement loop: the 3 lowest-points stats as full jump
// buttons.
// Selection happens INSIDE via the 04-01 tested focusCandidates rule
// (eligible = points non-null, stable ascending sort, first 3). The strip
// hides itself entirely when nothing is eligible (UI-SPEC edge rule).
// Points arrive opaque from the RPC — the item only rounds the given number
// for display; the color comes from tierForPoints via the literal TIER_TEXT
// map. The accent-red heading is one of the four reserved accent uses
// (interaction red #DC3538 — a different token from tier gold #E9B44C).
import type { MyReportStat } from '../../lib/api'
import type { GroupKey } from '../../lib/groups'
import { focusCandidates, tierForPoints } from './presentation'
import { TIER_TEXT_DISPLAY } from './tierDisplay'

export function FocusStrip({
  stats,
  onJump,
}: {
  stats: MyReportStat[]
  onJump: (statKey: string, group: GroupKey) => void
}) {
  const focus = focusCandidates(stats)
  if (focus.length === 0) return null

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-accent">Foco de melhoria</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {focus.map((stat) => {
          const tier = tierForPoints(stat.points)
          return (
            <button
              key={stat.stat_key}
              type="button"
              onClick={() => onJump(stat.stat_key, stat.group_name)}
              className="flex h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="text-sm text-content">{stat.label}</span>
              <span className={`text-sm font-semibold ${tier ? TIER_TEXT_DISPLAY[tier] : ''}`}>
                {Math.round(stat.points as number)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
