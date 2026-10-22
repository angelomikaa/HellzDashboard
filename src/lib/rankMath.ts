// NeoFoot rank math — EXECUTABLE SPEC (plan 03-01, Phase 3 rank engine; re-baselined
// plan 09-02 for the Phase 9 value-proportional scale).
//
// ⚠ SPEC ONLY — NOT THE PRODUCTION RANK PATH. Production rank truth lives in
// Postgres RPCs (AGENTS.md non-negotiable: all rank math in Postgres). No UI
// may import this module to compute displayed points — Phase 4 consumes RPC
// outputs only. The Postgres RPC (migration 0018) and scripts/smoke-rank.mjs
// must reproduce the exact values locked in rankMath.test.ts.

/** Minimum cohort size for points/OVR (D-12): at n=3 the formula yields a genuine middle value; n=2 would be binary. */
export const MIN_COHORT_SIZE = 3

export interface PercentileResult {
  /** Value-proportional points in [0, 99], or null when data is insufficient (RNK-05). */
  points: number | null
  /** False when the cohort (own entry included) is smaller than MIN_COHORT_SIZE (D-12). */
  dataSufficient: boolean
}

/**
 * Value-proportional percentile points within a cohort (Phase 9 SCALE-01).
 *
 * `others` = cohort values EXCLUDING the caller's own entry, so the cohort
 * size is `n = others.length + 1` (the caller is a cohort member).
 *
 * - Insufficient data (D-12 / RNK-05): n < MIN_COHORT_SIZE → `{ points: null, dataSufficient: false }`.
 * - higher-is-better (default): `best = max(ownValue, ...others)`;
 *   `points = round(ownValue / best * 99, 2)` clamped to [0, 99].
 * - lower-is-better: `best = min(ownValue, ...others)` (most negative = best);
 *   `points = round(ownValue / best * 99, 2)` clamped to [0, 99]. A more
 *   negative value yields more points (lower is better).
 * - Ties: equal values → equal points (the best value holder gets exactly 99;
 *   everyone with that value shares 99).
 * - Best of any cohort n>=3 gets exactly 99; worst (highest for higher,
 *   least-negative for lower) gets 0.
 */
export function percentilePoints(
  ownValue: number,
  others: number[],
  direction: 'higher' | 'lower' = 'higher',
): PercentileResult {
  const n = others.length + 1
  if (n < MIN_COHORT_SIZE) {
    return { points: null, dataSufficient: false }
  }
  const best = direction === 'lower' ? Math.min(ownValue, ...others) : Math.max(ownValue, ...others)
  const rawPoints = (ownValue / best) * 99
  // Clamp to [0, 99] so OVR math never breaks from negative or >99 intermediates (D-05).
  const points = Math.min(99, Math.max(0, Math.round(rawPoints * 100) / 100))
  return { points, dataSufficient: true }
}

/**
 * Overall rating from exactly 6 key-stat percentile points (D-09 + D-10).
 *
 * OVR = 51 + mean(points) * 48 / 99 — a LINEAR RESCALE, not a clamp (D-10):
 * the worst player in class shows 51, the best 99, and bottom-half players
 * keep differentiation from each other (EAFC bronze→icon feel). Never below 51.
 *
 * Strict length-6 gate (D-11): the all-6-or-nothing decision is enforced by
 * the CALLER (missing any key stat → insufficient-data state); this function
 * itself throws RangeError unless given exactly 6 points.
 *
 * Returns the UNROUNDED decimal — rounding is a Phase 4 display concern.
 */
export function ovrFromPoints(points: number[]): number {
  if (points.length !== 6) {
    throw new RangeError('ovr requires exactly 6 key-stat points')
  }
  const mean = points.reduce((sum, p) => sum + p, 0) / 6
  return 51 + (mean * 48 / 99)
}
