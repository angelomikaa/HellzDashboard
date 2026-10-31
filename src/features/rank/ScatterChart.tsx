// ScatterChart — dependency-free SVG chart for the regression dashboard.
//
// Draws real observations, one or two regression lines and an optional OLS
// confidence band. Points are clickable (the parent shows the detail card) and
// carry an SVG <title> for a native tooltip. No chart library, no canvas.
import { useId } from 'react'
import { tCritical95 } from './regression'

export interface ChartPoint {
  id: string
  label: string
  x: number
  y: number
  highlight?: boolean
  meta?: string
}

export interface ChartLine {
  slope: number
  intercept: number
  color: string
  label: string
  dashed?: boolean
}

export interface ConfidenceBand {
  slope: number
  intercept: number
  se: number
  n: number
  meanX: number
  sxx: number
  color: string
}

export interface ReferenceChartPoint {
  label: string
  x: number
  y: number
}

interface ScatterChartProps {
  title: string
  xLabel: string
  yLabel: string
  points: readonly ChartPoint[]
  lines: readonly ChartLine[]
  ci?: ConfidenceBand | null
  referencePoints?: readonly ReferenceChartPoint[]
  selectedId?: string | null
  onSelect?: (point: ChartPoint) => void
  height?: number
}

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const WIDTH = 640
const MARGIN = { top: 18, right: 18, bottom: 46, left: 62 }

function domain(values: readonly number[], padRatio = 0.06): [number, number] {
  if (values.length === 0) return [0, 1]
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    min -= pad
    max += pad
  }
  const pad = (max - min) * padRatio
  return [min - pad, max + pad]
}

function ticks(min: number, max: number, count = 5): number[] {
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1))
}

export function ScatterChart({
  title,
  xLabel,
  yLabel,
  points,
  lines,
  ci = null,
  referencePoints = [],
  selectedId = null,
  onSelect,
  height = 320,
}: ScatterChartProps) {
  const clipId = useId()
  const plotW = WIDTH - MARGIN.left - MARGIN.right
  const plotH = height - MARGIN.top - MARGIN.bottom

  const allX = [...points.map((p) => p.x), ...referencePoints.map((p) => p.x)]
  const allY = [...points.map((p) => p.y), ...referencePoints.map((p) => p.y)]
  for (const line of lines) {
    allY.push(line.intercept + line.slope * (allX.length ? Math.min(...allX) : 0))
    allY.push(line.intercept + line.slope * (allX.length ? Math.max(...allX) : 1))
  }
  const [xMin, xMax] = domain(allX)
  const [yMin, yMax] = domain(allY)

  const sx = (x: number) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * plotW
  const sy = (y: number) => MARGIN.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH

  const xTicks = ticks(xMin, xMax)
  const yTicks = ticks(yMin, yMax)

  let ciPath: string | null = null
  if (ci !== null && ci.sxx > 0 && Number.isFinite(ci.se) && ci.n > 2) {
    const t = tCritical95(ci.n - 2)
    const upper: string[] = []
    const lower: string[] = []
    for (let i = 0; i <= 24; i++) {
      const x = xMin + ((xMax - xMin) * i) / 24
      const yhat = ci.intercept + ci.slope * x
      const half =
        t * ci.se * Math.sqrt(1 / ci.n + ((x - ci.meanX) * (x - ci.meanX)) / ci.sxx)
      upper.push(`${sx(x)},${sy(yhat + half)}`)
      lower.unshift(`${sx(x)},${sy(yhat - half)}`)
    }
    ciPath = `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`
  }

  return (
    <figure className="rounded-lg border border-line bg-surface p-3">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-content">{title}</span>
        <span className="text-xs text-muted">{`n=${points.length}`}</span>
      </figcaption>
      <svg
        role="img"
        aria-label={`${title}. ${yLabel} por ${xLabel}.`}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full"
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={plotW}
              height={plotH}
            />
          </clipPath>
        </defs>

        {/* grid + axes */}
        {yTicks.map((value) => (
          <g key={`y-${value}`}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotW}
              y1={sy(value)}
              y2={sy(value)}
              stroke="currentColor"
              className="text-line"
              strokeOpacity={0.55}
            />
            <text
              x={MARGIN.left - 8}
              y={sy(value) + 4}
              textAnchor="end"
              className="fill-muted text-[11px]"
            >
              {number.format(value)}
            </text>
          </g>
        ))}
        {xTicks.map((value) => (
          <g key={`x-${value}`}>
            <line
              x1={sx(value)}
              x2={sx(value)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotH}
              stroke="currentColor"
              className="text-line"
              strokeOpacity={0.35}
            />
            <text
              x={sx(value)}
              y={MARGIN.top + plotH + 18}
              textAnchor="middle"
              className="fill-muted text-[11px]"
            >
              {number.format(value)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {ciPath !== null && (
            <path d={ciPath} fill={ci?.color ?? 'currentColor'} fillOpacity={0.12} stroke="none" />
          )}
          {lines.map((line) => (
            <line
              key={line.label}
              x1={sx(xMin)}
              y1={sy(line.intercept + line.slope * xMin)}
              x2={sx(xMax)}
              y2={sy(line.intercept + line.slope * xMax)}
              stroke={line.color}
              strokeWidth={2}
              strokeDasharray={line.dashed ? '6 5' : undefined}
            />
          ))}
          {referencePoints.map((point) => (
            <g key={point.label}>
              <polygon
                points={`${sx(point.x)},${sy(point.y) - 6} ${sx(point.x) + 6},${sy(point.y)} ${sx(point.x)},${sy(point.y) + 6} ${sx(point.x) - 6},${sy(point.y)}`}
                fill="none"
                stroke="#E9B44C"
                strokeWidth={2}
              />
              <title>{`${point.label}: (${number.format(point.x)}, ${number.format(point.y)})`}</title>
            </g>
          ))}
          {points.map((point) => {
            const selected = point.id === selectedId
            return (
              <g key={point.id}>
                <circle
                  cx={sx(point.x)}
                  cy={sy(point.y)}
                  r={selected ? 7 : point.highlight ? 5 : 4}
                  fill={point.highlight ? '#F0883E' : '#e6e6e6'}
                  fillOpacity={selected ? 1 : 0.82}
                  stroke={selected ? '#ff2d55' : point.highlight ? '#F0883E' : '#141414'}
                  strokeWidth={selected ? 2.5 : 1}
                  className={onSelect ? 'cursor-pointer' : undefined}
                  onClick={onSelect ? () => onSelect(point) : undefined}
                >
                  <title>{`${point.label}: (${number.format(point.x)}, ${number.format(point.y)})${
                    point.meta ? ` · ${point.meta}` : ''
                  }`}</title>
                </circle>
              </g>
            )
          })}
        </g>

        <text
          x={MARGIN.left + plotW / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-muted text-[11px]"
        >
          {xLabel}
        </text>
        <text
          x={12}
          y={MARGIN.top + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${MARGIN.top + plotH / 2})`}
          className="fill-muted text-[11px]"
        >
          {yLabel}
        </text>
      </svg>
      {lines.length > 0 && (
        <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {lines.map((line) => (
            <span key={line.label} className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4"
                style={{ backgroundColor: line.color }}
              />
              {line.label}
            </span>
          ))}
          {ci !== null && (
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-4"
                style={{ backgroundColor: ci.color, opacity: 0.25 }}
              />
              IC 95% (média)
            </span>
          )}
          {referencePoints.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rotate-45 border-2"
                style={{ borderColor: '#E9B44C' }}
              />
              Referência do dono (externa)
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
