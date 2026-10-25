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

/**
 * Map ANY physical slot index of the 3-copy loop (UAT round 2: "make it round")
 * onto the equivalent slot of the MIDDLE copy.
 *
 * The carousel renders the server-ordered list three times so every logical
 * card has a real neighbour on both sides — the first card shows the last one
 * peeking in from the left, the last shows the first on the right. Navigation
 * and post-scroll normalisation always work from the middle copy; the outer
 * copies are inert duplicates. `length` is the logical card count (one copy),
 * so for 3 cards the middle copy is 3..5: 0→3, 2→5, 6→3, -1→5.
 * A non-positive length yields 0 (no cards to map).
 */
export function loopIndex(index: number, length: number): number {
  if (length <= 0) return 0
  const offset = ((index % length) + length) % length
  return length + offset
}
