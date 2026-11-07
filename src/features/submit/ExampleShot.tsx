// ExampleShot — the standardized example-print frame (owner alignment
// rule, 2026-10-23): every example screenshot that accompanies a capture
// dropzone renders at the SAME vertical height as the zone — h-40, the
// CaptureDropzone minimum height — with its width following the capture's
// aspect ratio. The print is a rectangle and may be wider than the
// square-ish upload box; the shared vertical height is what keeps the pair
// aligned (the portrait Details examples used to render far taller than
// the button beside them).
//
// Responsive: below lg there is no side-by-side strip, so the example
// keeps its readable full-width rendering; from lg up — where the strip
// places the example BESIDE the upload zone (07.2-06 checkpoint round 2)
// — the height lock applies. Tapping the example opens the full-size
// asset in a new tab; it is a static panel-provided reference image, never
// member screenshot data.
//
// Owner request 2026-11-07: the submit wizard's desktop screens moved to a
// two-column layout (StepLayout), where the example no longer sits beside a
// dropzone but heads a rail BESIDE the fields. That variant ('rail') drops
// the h-40 lock and renders the print at the rail's width, capped at 60vh —
// the fixed height was what kept the examples thumbnail-sized on desktop.
// The locked variant stays for the proof/prospect strips.

interface ExampleShotProps {
  /** The example asset — also the full-size href. */
  src: string
  alt: string
  /**
   * 'locked' (default): the strip pairing used by the identification proof
   * and the prospect wizard — h-40 from lg up, matching the dropzone height.
   * 'rail': the submit wizard's desktop rail (owner request 2026-11-07) —
   * the print renders as large as the rail allows (its own aspect, capped at
   * 60vh so the sticky rail still fits the window) instead of the tiny
   * thumbnail-sized lock.
   */
  variant?: 'locked' | 'rail'
}

export function ExampleShot({ src, alt, variant = 'locked' }: ExampleShotProps) {
  const rail = variant === 'rail'
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className={
        rail
          ? 'block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          : 'mx-auto block w-full max-w-xs shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:mx-0 lg:w-auto lg:self-start'
      }
    >
      <img
        src={src}
        alt={alt}
        className={
          rail
            ? 'mx-auto block h-auto max-h-[min(34rem,60vh)] w-auto max-w-full rounded-md border border-line bg-card object-contain'
            : 'h-auto w-full rounded-md border border-line object-contain lg:h-40 lg:w-auto'
        }
      />
      {rail && (
        <span className="mt-2 block text-center text-xs text-muted">
          Clique na imagem para ampliar
        </span>
      )}
    </a>
  )
}
