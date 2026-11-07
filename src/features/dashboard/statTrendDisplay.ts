// Render-layer colors for the Phase 10.13 progression charts (tierDisplay.ts
// pattern): literal values in ONE place so the plot lines, the comparison dots
// and the legend can never drift apart.
//
// Own series = the interactive accent red. The references reuse the existing
// semantic tokens: class = tier silver, function = tier gold, cohort =
// relevant purple, best = success green (owner revision 2026-11-07: the
// cohort BEST is the denominator behind every point, so it must be visible).
// None of them collide with each other.
export type ReferenceKey = 'class' | 'function' | 'cohort' | 'best'

export const OWN_COLOR = '#DC3538' // --color-accent

export const REFERENCE_COLORS: Record<ReferenceKey, string> = {
  class: '#B8C0CC', // --color-tier-silver
  function: '#E9B44C', // --color-tier-gold
  cohort: '#A78BFA', // --color-relevant-bright
  best: '#4ADE80', // --color-success
}
