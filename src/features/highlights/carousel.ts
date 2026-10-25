// Pure geometry helpers for the Destaques carousel (SHWC-01, UAT round 1
// rework 2026-10-24). Extracted from the component so the "which card is in
// the spotlight" rule is unit-testable without a DOM: the component measures
// client rects and hands the numbers here, these decide the index.

/**
 * Index of the card whose center is closest to the viewport center.
 * Ties resolve to the lower index (server order is authoritative — the first
 * card is the highest-OVR player, so an ambiguous center must never promote a
 * later card). An empty list yields 0.
 */
export function nearestCardIndex(
  centers: readonly number[],
  viewportCenter: number,
): number {
  if (centers.length === 0) return 0
  let best = 0
  let bestDistance = Math.abs(centers[0] - viewportCenter)
  for (let index = 1; index < centers.length; index += 1) {
    const distance = Math.abs(centers[index] - viewportCenter)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

/** Clamp a navigation target into the valid card range. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}
