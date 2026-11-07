// StepLayout — the desktop two-column capture screen (owner request
// 2026-11-07: the submit tab was still a narrow mobile column on desktop).
// The example print and its upload entry share a LEFT rail that stays in
// view while the player scrolls the fields; the fields sit in the RIGHT
// column beside them, so a typed value can be compared with the game screen
// it came from without scrolling the example out of sight.
//
// Below lg the two columns stack in reading order — example, upload, fields
// — so the mobile flow is exactly the one before this change.
//
// Sticky cost note: the rail sticks to the viewport (top-6), which only
// works while the rail is shorter than the window. ExampleShot's rail
// variant caps the print at 60vh and the upload box is a fixed ~11rem, so
// the pair fits any normal desktop height instead of fighting the scroll.
import type { ReactNode } from 'react'
import { ExampleShot } from './ExampleShot'

interface StepLayoutProps {
  /** panel-provided example of THIS step's game screen (static asset) */
  exampleSrc: string
  exampleAlt: string
  /** the step's upload/OCR entry — renders under the example in the rail */
  capture?: ReactNode
  /** the step's fields (the RIGHT column on desktop) */
  children: ReactNode
}

export function StepLayout({ exampleSrc, exampleAlt, capture, children }: StepLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
        <ExampleShot src={exampleSrc} alt={exampleAlt} variant="rail" />
        {capture}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
