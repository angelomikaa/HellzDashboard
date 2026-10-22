// StatCard — the one-glance stat card (04-UI-SPEC § StatCard anatomy,
// D-08/D-09/D-12) with the locked D-14/D-15 variants. Pure function of the
// MyReportStat prop: label + FLAT/PERCENTUAL tag, own value, tier-colored
// points badge, percentile phrase, and the muted Média/Melhor aggregate line.
// Points/OVR arrive opaque from the RPC — the badge only rounds the given
// number for display, nothing is recomputed here. Tier is communicated by
// COLOR only (D-03) and all tier classes flow through the render-layer
// display maps in tierDisplay.ts (wrapping the literal presentation.ts maps).
import type { ReactNode } from 'react'
import type { MyReportStat } from '../../lib/api'
import { formatStatValue } from '../../lib/parseStatValue'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY } from './tierDisplay'
import { tierForPoints } from './presentation'

export function StatCard({ stat }: { stat: MyReportStat }) {
  // State matrix (locked order): missing > insufficient > tiered.
  const missing = stat.own_value === null
  const tier = stat.points !== null ? tierForPoints(stat.points) : null
  const borderClass = !missing && tier !== null ? TIER_BORDER_DISPLAY[tier] : 'border-line'

  // Badge slot (D-14/D-15): empty when the stat is missing; the muted
  // insufficient-data chip when the cohort is too small; the tier-colored
  // integer points badge when points exist (integer only — no "pts" suffix).
  let badge: ReactNode = null
  if (!missing) {
    badge =
      stat.points === null ? (
        <span className="rounded-full border border-line px-2 py-1 text-sm text-muted">
          Dados insuficientes
        </span>
      ) : tier !== null ? (
        <span
          className={`rounded-full border px-2 py-1 text-sm font-semibold ${TIER_BORDER_DISPLAY[tier]} ${TIER_TEXT_DISPLAY[tier]}`}
        >
          {Math.round(stat.points)}
        </span>
      ) : null
  }

  return (
    <div
      id={`stat-${stat.stat_key}`}
      tabIndex={-1}
      className={`rounded-lg border bg-surface p-4 hover-card focus:outline-none focus:ring-2 focus:ring-accent ${borderClass}${missing ? ' opacity-60' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-content">{stat.label}</span>
        <span className="text-sm text-muted">
          {stat.value_type === 'flat' ? 'FLAT' : 'PERCENTUAL'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className={missing ? 'text-base text-muted' : 'text-xl font-semibold text-content'}>
          {missing ? 'Sem registro' : formatStatValue(stat.own_value as number, stat.value_type)}
        </span>
        {badge}
      </div>
      <p className="mt-1 text-sm text-muted">
        Média: {stat.class_average === null ? '—' : formatStatValue(stat.class_average, stat.value_type)}
        {' · '}Melhor: {stat.best === null ? '—' : formatStatValue(stat.best, stat.value_type)}
      </p>
    </div>
  )
}
