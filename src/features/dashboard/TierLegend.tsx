// TierLegend — the always-visible one-line color decoder (D-03/D-04).
// Tier meaning on cards is color-only, so this line directly under the OVR
// hero makes the four-color code self-explanatory. Labels + dot fills come
// from the render-layer display maps (tierDisplay.ts) — the top band shows
// as "Impecável" with a rainbow gradient dot (owner decision, 07.1-02 gate).
// All class strings are literals or come from the literal maps in
// tierDisplay.ts/presentation.ts (Tailwind v4 JIT-safe).
import { TIER_DISPLAY_LABELS, TIER_DOT_DISPLAY } from './tierDisplay'
import type { Tier } from './presentation'

const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'platinum']

export function TierLegend() {
  return (
    <p className="mt-2 text-sm text-muted">
      {TIERS.map((tier, index) => (
        <span key={tier}>
          {index > 0 && <span className="mx-1">·</span>}
          <span
            className={`mr-1 inline-block h-3 w-3 rounded-full align-middle ${TIER_DOT_DISPLAY[tier]}`}
            aria-hidden="true"
          />
          {TIER_DISPLAY_LABELS[tier]}
        </span>
      ))}
    </p>
  )
}
