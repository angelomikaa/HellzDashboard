// MiniStatTile — the ONE mini-stat anatomy shared by the hero column's key
// stats and the improvement focus (owner checkpoint round 12: "make the foco
// de melhoria look like the key stats"). Same surface tile, same label /
// value / points-chip rhythm, same tier color language; only the container
// (static tile vs progression button) and the label width differ.
//
// Phase 10.13 (owner 2026-11-06): the tiles became progression trackers. A
// `history` of 2+ points renders the 3-point sparkline, and hovering/focusing
// the tile reveals a pointer-events-none popover with the last three values and
// dates. `onOpen` turns the tile into the button that opens the detail modal.
//
// Points arrive opaque from the RPC — the chip only rounds the given number
// for display, nothing is recomputed here. Tier is communicated by COLOR only
// (StatCard D-03 idiom) and all tier classes flow through the render-layer
// display maps in tierDisplay.ts.
import type { StatProgressPoint } from '../../lib/api'
import { formatStatValue } from '../../lib/parseStatValue'
import { tierForPoints } from './presentation'
import { StatSparkline } from './StatTrendChart'
import { formatHistoryDate } from './statProgress'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY } from './tierDisplay'

function HistoryPopover({ history, valueType }: { history: readonly StatProgressPoint[]; valueType: 'flat' | 'percentual' }) {
  if (history.length === 0) return null
  return (
    <span className="pointer-events-none absolute inset-x-0 top-full z-30 mt-1 hidden rounded-md border border-line bg-dominant/95 p-2 text-left shadow-lg group-hover:block group-focus-visible:block">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">
        Últimas submissões
      </span>
      <span className="mt-1 block space-y-0.5">
        {history.map((point, index) => (
          <span
            key={`${point.submitted_at}-${index}`}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <span className="tabular-nums text-muted">{formatHistoryDate(point.submitted_at)}</span>
            <span className="font-semibold tabular-nums text-content">
              {formatStatValue(point.value, valueType)}
            </span>
          </span>
        ))}
      </span>
    </span>
  )
}

export function MiniStatTile({
  id,
  label,
  labelTitle,
  value,
  valueType,
  points,
  history = [],
  onOpen,
}: {
  id?: string
  label: string
  labelTitle?: string
  value: number | null
  valueType: 'flat' | 'percentual'
  points: number | null
  /** Own history, newest first (0074). 2+ points render the sparkline. */
  history?: readonly StatProgressPoint[]
  /** When given the tile opens that stat's progression modal. */
  onOpen?: () => void
}) {
  const missing = value === null
  const tier = points !== null ? tierForPoints(points) : null
  const valueLabel = missing ? 'sem registro' : formatStatValue(value as number, valueType)

  const content = (
    <>
      <span
        title={labelTitle}
        className="block truncate font-display text-xs font-semibold uppercase tracking-wide text-content"
      >
        {label}
      </span>
      <span className={`mt-1 block text-xl font-semibold ${missing ? 'text-muted' : 'text-content'}`}>
        {missing ? 'Sem registro' : formatStatValue(value as number, valueType)}
      </span>
      {history.length >= 2 && <StatSparkline history={history} className="mt-1" />}
      <div className="mt-2">
        {points === null ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
            Dados insuficientes
          </span>
        ) : tier !== null ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER_BORDER_DISPLAY[tier]} ${TIER_TEXT_DISPLAY[tier]}`}
          >
            {Math.round(points)}
          </span>
        ) : null}
      </div>
      <HistoryPopover history={history} valueType={valueType} />
    </>
  )

  const rootClass = `relative group rounded-lg bg-surface p-4 hover-card${missing ? ' opacity-60' : ''}`

  if (onOpen !== undefined) {
    return (
      <button
        id={id}
        type="button"
        onClick={onOpen}
        aria-label={`${label}: ${valueLabel}. Ver progressão.`}
        className={`${rootClass} w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      id={id}
      tabIndex={-1}
      className={`${rootClass} focus:outline-none focus:ring-2 focus:ring-accent`}
    >
      {content}
    </div>
  )
}
