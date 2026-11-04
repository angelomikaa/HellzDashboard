// Per-field example values for the submit wizard (owner request 2026-11-03).
//
// The wizard used to label every numeric field with the same two generic
// hints (`1.234.567` / `12,5%`), which told the player nothing about the
// expected magnitude of that specific stat. The owner's rule: an example must
// be a VALID entry for its own field, and the guild average is the reference
// value. The member-facing source is my_report's class_average — the exact
// "Média" already shown on the Painel for the player's class+function cohort
// (aggregates only; no individual value ever crosses this module).
//
// A missing average (cohort n < 3) means NO hint rather than a made-up generic
// value — the owner explicitly rejected the generic copy. This module is pure
// so the display rule is unit-testable without a DOM.
import type { StatCatalogEntry } from '../../lib/api'
import { formatStatValue } from '../../lib/parseStatValue'

/** stat_key -> class+function average from the my_report payload. */
export type StatAverages = Readonly<Record<string, number>>

/** The only two my_report fields this module needs (keeps tests DOM/data-free). */
interface AverageSource {
  stats: ReadonlyArray<{ stat_key: string; class_average: number | null }>
}

/**
 * Reduce a my_report payload to the per-stat average map the wizard consumes.
 * A failed/absent report degrades to an empty map (no examples, never an
 * error) — example hints must never block the submission path.
 */
export function averagesFromReport(report: AverageSource | null): StatAverages {
  if (report === null) return {}
  const out: Record<string, number> = {}
  for (const stat of report.stats) {
    if (stat.class_average !== null && Number.isFinite(stat.class_average)) {
      out[stat.stat_key] = stat.class_average
    }
  }
  return out
}

/**
 * The formatted example for one catalog field, or null when the cohort has no
 * average. Formatting follows the catalog's value_type, so a percentual field
 * always shows the `%` form and a flat field never does.
 */
export function statExample(
  averages: StatAverages,
  entry: Pick<StatCatalogEntry, 'stat_key' | 'value_type'>,
): string | null {
  const average = averages[entry.stat_key]
  if (average === undefined) return null
  return formatStatValue(average, entry.value_type)
}

/**
 * Equipment example for the hidden-defense inputs (Phase 9.1). The stored raw
 * defense is `floor(equipment / (1 + pct / 100))`, so the equipment value that
 * produces the cohort's average raw defense at its average percentage is the
 * inverse: `raw * (1 + pct / 100)`. Null when either average is unavailable or
 * the percentage would make the denominator invalid (<= 0).
 */
export function equipmentExample(
  averages: StatAverages,
  rawKey: 'rpdef' | 'rmdef',
  pctKey: 'equip_pdef_pct' | 'equip_mdef_pct',
): string | null {
  const raw = averages[rawKey]
  const pct = averages[pctKey]
  if (raw === undefined || pct === undefined) return null
  const denominator = 1 + pct / 100
  if (!Number.isFinite(denominator) || denominator <= 0) return null
  const equipment = Math.round(raw * denominator)
  if (!Number.isFinite(equipment) || equipment < 0) return null
  return formatStatValue(equipment, 'flat')
}
