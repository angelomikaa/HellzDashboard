// Phase 4 presentation logic (04-CONTEXT D-01/D-02/D-09..D-12/D-16).
// PURE presentation of the numbers my_report() already computed — this is
// NOT rank math: points/OVR arrive opaque from the RPC (RNK-02; the 03-01
// spec module is never imported here and key-stat identity is never derived).
import type { MyReportStat } from '../../lib/api'

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum'

/** D-01: stat-card tier from the 0–99 points scale (top-heavy bands). */
export function tierForPoints(points: number | null): Tier | null {
  if (points === null) return null
  if (points < 35) return 'bronze'
  if (points < 60) return 'silver'
  if (points < 85) return 'gold'
  return 'platinum'
}

/** D-02: OVR hero tier from its own 51–99 scale (floor 51). */
export function tierForOvr(ovr: number | null): Tier | null {
  if (ovr === null) return null
  if (ovr < 65) return 'bronze'
  if (ovr < 75) return 'silver'
  if (ovr < 85) return 'gold'
  return 'platinum'
}

/** D-09/D-10/D-11: pt-BR percentile phrase, 10% steps, direct tone. */
export function percentilePhrase(points: number, label: string): string {
  const band = points >= 50
    ? 10 * Math.ceil((100 - points) / 10)
    : 10 * Math.ceil(points / 10)
  const b = Math.min(90, Math.max(10, band))
  const word = points >= 50 ? 'melhores' : 'piores'
  return `Você está entre os ${b}% ${word} em ${label}.`
}

// 07.2 D-07: the three negative lower-is-better stats — a LOWER-than-average
// value (more negative) is BETTER, not behind (owner-locked D-07 semantics).
export const LOWER_IS_BETTER_STATS: ReadonlySet<string> = new Set([
  'fixed_ct_pct',
  'global_cd_pct',
  'variable_ct_pct',
])

/**
 * 07.2 D-07 foco de melhoria: evaluates the key∪relevant stats (priorityKeys
 * from my_card's key_stats ∪ relevant_stat_keys) and picks the ones MOST BEHIND
 * compared to the class average — replacing the retired 3-lowest-points
 * selection rule. "There's no need for an assassin to improve his cura realizada stat":
 * the priorityKeys filter IS the essence.
 *
 * - Eligible: points !== null && own_value !== null && priorityKeys.has(stat_key).
 * - Signed gap: (own_value − class_average), flipped (× −1) for the three
 *   lower-is-better stats — a lower-than-average negative stat is BETTER.
 * - Scale-free (flat vs percentual): normalized = gap / |class_average| when
 *   |class_average| ≥ 1e-9, else the raw signed gap (near-zero averages — no
 *   division blowup). class_average ?? 0 is a defensive fallback: points !==
 *   null implies a n ≥ 3 cohort, which implies a non-null average server-side.
 * - Sort: ascending normalized (most-behind = most-negative first); non-behind
 *   stats only FILL after every behind stat; stable tie-break by input index.
 * - Returns at most `limit` (default 6, round 12: the focus row mirrors the
 *   6-tile key row) — most-behind first. PURE: consumes my_report payload
 *   fields only — points/OVR stay opaque, no rank math (RNK-02).
 */
export function improvementFocus(
  stats: MyReportStat[],
  priorityKeys: ReadonlySet<string>,
  lowerIsBetter: ReadonlySet<string> = LOWER_IS_BETTER_STATS,
  limit = 6,
): MyReportStat[] {
  return stats
    .map((stat, index) => {
      if (stat.points === null || stat.own_value === null || !priorityKeys.has(stat.stat_key)) {
        return null
      }
      const dir = lowerIsBetter.has(stat.stat_key) ? -1 : 1
      const avg = stat.class_average ?? 0
      const gap = (stat.own_value - avg) * dir
      const normalized = Math.abs(avg) >= 1e-9 ? gap / Math.abs(avg) : gap
      return { stat, index, normalized }
    })
    .filter((e): e is { stat: MyReportStat; index: number; normalized: number } => e !== null)
    .sort((a, b) => a.normalized - b.normalized || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((e) => e.stat)
}

// Literal Tailwind tier class maps (Tailwind v4 JIT requires literal class
// names — never template-interpolate them). Components in 04-02/04-03
// consume these so all tier styling comes from ONE place; the utilities
// are generated from the existing @theme tier tokens in src/index.css.
export const TIER_BORDER: Record<Tier, string> = {
  bronze: 'border-tier-bronze',
  silver: 'border-tier-silver',
  gold: 'border-tier-gold',
  platinum: 'border-tier-platinum',
}

export const TIER_TEXT: Record<Tier, string> = {
  bronze: 'text-tier-bronze',
  silver: 'text-tier-silver',
  gold: 'text-tier-gold',
  platinum: 'text-tier-platinum',
}

export const TIER_BG: Record<Tier, string> = {
  bronze: 'bg-tier-bronze',
  silver: 'bg-tier-silver',
  gold: 'bg-tier-gold',
  platinum: 'bg-tier-platinum',
}
