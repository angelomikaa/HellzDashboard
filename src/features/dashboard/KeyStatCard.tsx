// KeyStatCard — the EAFC mini key-stat card (07.2-03, CARD-01/CARD-02,
// D-01/D-02). Pure presentational: ONE CardKeyStat from the my_card payload,
// rendered VERBATIM — 3-letter label_short + own value + the points chip +
// tier styling, NOTHING else (D-02 EXACT anatomy: NO Média/Melhor aggregate
// line, NO percentile phrase, NO FLAT/PERCENTUAL tag — the full 57-stat
// view below keeps its anatomy; these mini cards are the at-a-glance hero
// strip above it). Points arrive opaque from the RPC — the chip only rounds
// the given number for display, nothing is recomputed here. Tier is
// communicated by COLOR only (StatCard D-03 idiom) and all tier classes
// flow through the render-layer display maps in tierDisplay.ts.
//
// The `key-<stat_key>` anchor with tabIndex={-1} mirrors StatCard's
// `stat-<stat_key>` anchor so programmatic foco jumps can target the strip
// too (the grouped view below remains the jump target — anchors kept in
// symmetry by construction).
import type { CardKeyStat } from '../../lib/api'
import { formatStatValue } from '../../lib/parseStatValue'
import { tierForPoints } from './presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY } from './tierDisplay'

export function KeyStatCard({ stat }: { stat: CardKeyStat }) {
  // State matrix (StatCard idiom, locked order): missing > insufficient > tiered.
  const missing = stat.own_value === null
  const tier = stat.points !== null ? tierForPoints(stat.points) : null
  const borderClass = !missing && tier !== null ? TIER_BORDER_DISPLAY[tier] : 'border-line'

  return (
    <div
      id={`key-${stat.stat_key}`}
      tabIndex={-1}
      className={`rounded-lg border bg-surface p-3 hover-card focus:outline-none focus:ring-2 focus:ring-accent ${borderClass}${missing ? ' opacity-60' : ''}`}
    >
      <span className="block font-display text-xs font-semibold uppercase tracking-wide text-content">
        {stat.label_short}
      </span>
      <span
        className={`mt-1 block text-xl font-semibold ${missing ? 'text-muted' : 'text-content'}`}
      >
        {missing ? 'Sem registro' : formatStatValue(stat.own_value as number, stat.value_type)}
      </span>
      <div className="mt-2">
        {stat.points === null ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
            Dados insuficientes
          </span>
        ) : tier !== null ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER_BORDER_DISPLAY[tier]} ${TIER_TEXT_DISPLAY[tier]}`}
          >
            {Math.round(stat.points)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
