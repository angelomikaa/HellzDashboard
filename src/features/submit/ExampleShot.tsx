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

interface ExampleShotProps {
  /** The example asset — also the full-size href. */
  src: string
  alt: string
}

export function ExampleShot({ src, alt }: ExampleShotProps) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mx-auto block w-full max-w-xs shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:mx-0 lg:w-auto lg:self-start"
    >
      <img
        src={src}
        alt={alt}
        className="h-auto w-full rounded-md border border-line object-contain lg:h-40 lg:w-auto"
      />
    </a>
  )
}
