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

/** D-16: the 3 weakest stats — eligible (points !== null), stable ascending sort. */
export function focusCandidates(stats: MyReportStat[]): MyReportStat[] {
  return stats
    .map((stat, index) => ({ stat, index }))
    .filter((e) => e.stat.points !== null)
    .sort((a, b) => (a.stat.points as number) - (b.stat.points as number) || a.index - b.index)
    .slice(0, 3)
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
