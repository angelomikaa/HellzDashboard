// MiniStatTile — the ONE mini-stat anatomy shared by the hero column's key
// stats and the improvement focus (owner checkpoint round 12: "make the foco
// de melhoria look like the key stats"). Same surface tile, same label /
// value / points-chip rhythm, same tier color language; only the container
// (static tile vs jump button) and the label width differ.
//
// Points arrive opaque from the RPC — the chip only rounds the given number
// for display, nothing is recomputed here. Tier is communicated by COLOR only
// (StatCard D-03 idiom) and all tier classes flow through the render-layer
// display maps in tierDisplay.ts.
import { formatStatValue } from '../../lib/parseStatValue'
import { tierForPoints } from './presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_DISPLAY } from './tierDisplay'

export function MiniStatTile({
  id,
  label,
  labelTitle,
  value,
  valueType,
  points,
  onSelect,
}: {
  id?: string
  label: string
  labelTitle?: string
  value: number | null
  valueType: 'flat' | 'percentual'
  points: number | null
  /** When given the tile is a jump button for that stat's card below. */
  onSelect?: () => void
}) {
  const missing = value === null
  const tier = points !== null ? tierForPoints(points) : null

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
    </>
  )

  const rootClass = `rounded-lg bg-surface p-3 hover-card${missing ? ' opacity-60' : ''}`

  if (onSelect !== undefined) {
    return (
      <button
        type="button"
        onClick={onSelect}
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
