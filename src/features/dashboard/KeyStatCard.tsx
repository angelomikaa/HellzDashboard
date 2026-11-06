// KeyStatCard — the EAFC mini key-stat card (07.2-03, CARD-01/CARD-02,
// D-01/D-02). Pure presentational: ONE CardKeyStat from the my_card payload,
// rendered VERBATIM — 3-letter label_short + own value + the points chip +
// tier styling, NOTHING else (D-02 EXACT anatomy: NO Média/Melhor aggregate
// line, NO percentile phrase, NO FLAT/PERCENTUAL tag — the full 57-stat
// view below keeps its anatomy; these mini cards are the at-a-glance hero
// strip above it). Points arrive opaque from the RPC — the chip only rounds
// the given number for display, nothing is recomputed here. Tier is
// communicated by COLOR only (StatCard D-03 idiom) and all tier classes
// flow through the render-layer display maps in tierDisplay.ts. Owner
// checkpoint round 5: the card root lost its border (the surrounding OVR
// strip already carries the tier frame); the points chip keeps the tier
// color. Round 12: the anatomy moved to MiniStatTile so the improvement
// focus below renders as the SAME tile.
//
// Phase 10.13 (owner 2026-11-06): the tile carries the 3-point history
// sparkline and opens the progression modal. The `key-<stat_key>` anchor is
// kept on the button for programmatic jumps.
import type { CardKeyStat, StatProgressPoint } from '../../lib/api'
import { MiniStatTile } from './MiniStatTile'

export function KeyStatCard({
  stat,
  history = [],
  onOpen,
}: {
  stat: CardKeyStat
  history?: readonly StatProgressPoint[]
  onOpen?: () => void
}) {
  return (
    <MiniStatTile
      id={`key-${stat.stat_key}`}
      label={stat.label_short}
      value={stat.own_value}
      valueType={stat.value_type}
      points={stat.points}
      history={history}
      onOpen={onOpen}
    />
  )
}
