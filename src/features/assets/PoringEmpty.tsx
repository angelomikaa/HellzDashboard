// PoringEmpty — the decorative empty-state mascot (owner decision 2026-10-23:
// ROOCDB game assets, fetched by scripts/fetch-roo-assets.mjs from the
// manifest's misc section). Purely decorative: the empty-state message text
// remains the sole accessible content — the poring is aria-hidden and never
// carries meaning. Self-hosted same-origin (public/assets/poring.webp,
// D-15), so it can never break or leak a request to a third party.
export function PoringEmpty({ className = '' }: { className?: string }) {
  return (
    <img
      src="/assets/poring.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`mx-auto h-16 w-16 select-none ${className}`}
    />
  )
}
