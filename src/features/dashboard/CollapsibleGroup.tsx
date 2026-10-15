// CollapsibleGroup — controlled collapsible section (04-UI-SPEC § Layout &
// Grid, D-05/D-06). The PAGE owns the open state (04-03 will expand a group
// when a FocusStrip jump targets a card inside it). The 44px h-11 header is
// a full-width button with aria-expanded/aria-controls and an inline-SVG
// chevron (aria-hidden) rotating 90° when open.
//
// LANDMINE (checked by the UI checker, commit 4260f4b): the collapsed body
// must NOT use the HTML `hidden` attribute alongside the grid class — author
// CSS `display: grid` overrides the attribute's UA `display: none` and the
// collapsed group would stay visible. Instead the whole className is swapped
// on `open`: when closed ONLY the `hidden` utility applies (no competing
// display rule), and the element always stays in the DOM so aria-controls
// resolves in both states.
import type { ReactNode } from 'react'
import type { GroupKey } from '../../lib/groups'

export function CollapsibleGroup({
  groupName,
  label,
  open,
  onToggle,
  children,
}: {
  groupName: GroupKey
  label: string
  open: boolean
  onToggle: (g: GroupKey) => void
  children: ReactNode
}) {
  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => onToggle(groupName)}
        aria-expanded={open}
        aria-controls={`dashboard-group-${groupName}`}
        className="flex h-11 w-full items-center justify-between rounded-md border border-line bg-surface px-3 text-sm font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {label}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path fill="currentColor" d="M6 3l5 5-5 5z" />
        </svg>
      </button>
      <div
        id={`dashboard-group-${groupName}`}
        className={
          // Owner gate fix (07.1-02): stat cards cap at 2 columns on desktop —
          // 3-up inside the max-w-3xl container squished cards (~220px each).
          // Full desktop layout rework is 07.2 scope; this is the targeted
          // spacing fix only.
          open
            ? 'mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2'
            : 'hidden'
        }
      >
        {children}
      </div>
    </section>
  )
}
