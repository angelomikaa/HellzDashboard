// StatTrendChart — the dependency-free SVG chart behind the Phase 10.13
// progression trackers.
//
// Two variants:
//  - StatSparkline : the 3-point micro chart inside a Stats-Chave / Foco tile
//                    (polyline only — no axes, no labels).
//  - StatTrendChart: the detail plot inside the progression modal — the own
//                    history in accent red plus four DISTINCT reference lines
//                    (class silver, function gold, cohort purple, best green).
//
// Everything is drawn in percentages inside a 0..100 viewBox with
// vector-effect="non-scaling-stroke", so the chart fills any container without
// distorting stroke widths. Points/labels are HTML, so text keeps its real
// size at every width.
import type { StatProgressPoint } from '../../lib/api'
import { formatStatValue } from '../../lib/parseStatValue'
import { chartDomain, formatHistoryDate, historySeries } from './statProgress'
import { OWN_COLOR, REFERENCE_COLORS, type ReferenceKey } from './statTrendDisplay'

export interface StatReferenceLine {
  key: ReferenceKey
  label: string
  value: number | null
  /** Sample size behind the average (rendered in the legend). */
  sampleSize: number
}

const PAD = 6 // % padding inside the plot area

function yPercent(value: number, domain: { min: number; max: number }): number {
  const span = domain.max - domain.min
  const ratio = span === 0 ? 0.5 : (value - domain.min) / span
  const clamped = Math.min(1, Math.max(0, ratio))
  return 100 - PAD - clamped * (100 - PAD * 2)
}

function xPercent(index: number, count: number): number {
  if (count <= 1) return 50
  return PAD + (index * (100 - PAD * 2)) / (count - 1)
}

/** The 3-point micro chart. Renders nothing below 2 points (a dot is not a trend). */
export function StatSparkline({
  history,
  className,
}: {
  history: readonly StatProgressPoint[]
  className?: string
}) {
  const points = historySeries(history)
  if (points.length < 2) return null
  const domain = chartDomain(points.map((point) => point.value))
  const path = points
    .map((point, index) => {
      const x = xPercent(index, points.length)
      const y = yPercent(point.value, domain)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`block h-6 w-full ${className ?? ''}`}
    >
      <path
        d={`${path} L${xPercent(points.length - 1, points.length).toFixed(2)} ${(100 - PAD).toFixed(2)} L${xPercent(0, points.length).toFixed(2)} ${(100 - PAD).toFixed(2)} Z`}
        fill={OWN_COLOR}
        opacity={0.12}
      />
      <path
        d={path}
        fill="none"
        stroke={OWN_COLOR}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/**
 * The detail plot: own history + class/function/cohort horizontal references.
 * The own line is chronological; references are the CURRENT averages (the RPC
 * has no per-date aggregates), so they read as "where the group stands now".
 */
export function StatTrendChart({
  history,
  valueType,
  references,
  className,
}: {
  history: readonly StatProgressPoint[]
  valueType: 'flat' | 'percentual'
  references: readonly StatReferenceLine[]
  className?: string
}) {
  const points = historySeries(history)
  const visibleReferences = references.filter(
    (reference): reference is StatReferenceLine & { value: number } => reference.value !== null,
  )
  const domain = chartDomain([
    ...points.map((point) => point.value),
    ...visibleReferences.map((reference) => reference.value),
  ])

  // Equal references (class + cohort often share the same members) would
  // overprint their labels — nudge them apart by a minimum gap.
  const MIN_LABEL_GAP = 7
  const labelY = new Map<string, number>()
  let previousLabelY = Number.NEGATIVE_INFINITY
  for (const reference of [...visibleReferences].sort(
    (a, b) => yPercent(a.value, domain) - yPercent(b.value, domain),
  )) {
    const raw = yPercent(reference.value, domain)
    const y = Math.min(94, Math.max(raw, previousLabelY + MIN_LABEL_GAP))
    labelY.set(reference.key, y)
    previousLabelY = y
  }

  return (
    <div className={`relative h-52 w-full ${className ?? ''}`} aria-hidden="true">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {[25, 50, 75].map((tick) => (
          <line
            key={tick}
            x1={PAD}
            x2={100 - PAD}
            y1={tick}
            y2={tick}
            stroke="#3D2A2B"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {visibleReferences.map((reference) => {
          const y = yPercent(reference.value, domain)
          return (
            <line
              key={reference.key}
              x1={PAD}
              x2={100 - PAD}
              y1={y}
              y2={y}
              stroke={REFERENCE_COLORS[reference.key]}
              strokeWidth={1.25}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
        {points.length >= 2 && (
          <path
            d={points
              .map((point, index) => {
                const x = xPercent(index, points.length)
                const y = yPercent(point.value, domain)
                return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
              })
              .join(' ')}
            fill="none"
            stroke={OWN_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Own points as HTML dots so they stay round at any width. */}
      {points.map((point, index) => (
        <span
          key={`${point.submitted_at}-${index}`}
          title={`${formatStatValue(point.value, valueType)} · ${formatHistoryDate(point.submitted_at)}`}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dominant"
          style={{
            left: `${xPercent(index, points.length)}%`,
            top: `${yPercent(point.value, domain)}%`,
            backgroundColor: OWN_COLOR,
          }}
        />
      ))}

      {/* Reference value labels, right-aligned inside the plot. */}
      {visibleReferences.map((reference) => (
        <span
          key={reference.key}
          className="absolute right-1 -translate-y-1/2 rounded bg-surface/85 px-1 text-[11px] font-semibold tabular-nums"
          style={{
            top: `${labelY.get(reference.key) ?? yPercent(reference.value, domain)}%`,
            color: REFERENCE_COLORS[reference.key],
          }}
        >
          {formatStatValue(reference.value, valueType)}
        </span>
      ))}
    </div>
  )
}
