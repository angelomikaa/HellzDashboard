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
// The `key-<stat_key>` anchor with tabIndex={-1} mirrors StatCard's
// `stat-<stat_key>` anchor so programmatic foco jumps can target the strip
// too (the grouped view below remains the jump target — anchors kept in
// symmetry by construction).
import type { CardKeyStat } from '../../lib/api'
import { MiniStatTile } from './MiniStatTile'

export function KeyStatCard({ stat }: { stat: CardKeyStat }) {
  return (
    <MiniStatTile
      id={`key-${stat.stat_key}`}
      label={stat.label_short}
      value={stat.own_value}
      valueType={stat.value_type}
      points={stat.points}
    />
  )
}
