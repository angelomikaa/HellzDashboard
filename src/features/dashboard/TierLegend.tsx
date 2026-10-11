// TierLegend — the always-visible one-line color decoder (D-03/D-04).
// Tier meaning on cards is color-only, so this line directly under the OVR
// hero makes the four-color code self-explanatory.
// The four dot classes are literal strings (Tailwind v4 JIT-safe), generated
// from the existing @theme tier tokens in src/index.css.
export function TierLegend() {
  return (
    <p className="mt-2 text-sm text-muted">
      <span
        className="mr-1 inline-block h-3 w-3 rounded-full bg-tier-bronze align-middle"
        aria-hidden="true"
      />
      Bronze
      <span className="mx-1">·</span>
      <span
        className="mr-1 inline-block h-3 w-3 rounded-full bg-tier-silver align-middle"
        aria-hidden="true"
      />
      Prata
      <span className="mx-1">·</span>
      <span
        className="mr-1 inline-block h-3 w-3 rounded-full bg-tier-gold align-middle"
        aria-hidden="true"
      />
      Ouro
      <span className="mx-1">·</span>
      <span
        className="mr-1 inline-block h-3 w-3 rounded-full bg-tier-platinum align-middle"
        aria-hidden="true"
      />
      Platina
    </p>
  )
}
