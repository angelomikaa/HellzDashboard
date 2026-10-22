// Shared accessible confirm modal (06-UI-SPEC Surface 3 modal pattern,
// reserving 01-UI-SPEC:226's promise that Phase 6 destructive actions get a
// modal confirmation). One component reused by Validações (reject) and
// Personagens (Remover/Reativar/role changes).
//
// Accessibility contract: role="dialog" + aria-modal + aria-labelledby,
// Escape cancels, overlay backdrop click cancels, focus moves to the first
// enabled field on open (the step-up PIN box when present, else the confirm
// button), Tab cycles through every focusable inside the dialog, and focus
// returns to the previously focused element on close.
// Flat-border language only — no icons, no shadows, no new color tokens.
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean // destructive-styled confirm vs accent primary
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean // disables both buttons while the RPC is in flight
  confirmDisabled?: boolean // extra gate (e.g. step-up PIN not complete)
  error?: string | null // inline failure copy; the dialog stays open
  children?: ReactNode // extra fields between the body and the buttons
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
  busy = false,
  confirmDisabled = false,
  error = null,
  children,
}: ConfirmDialogProps) {
  const titleId = 'confirm-dialog-title'
  const errorId = 'confirm-dialog-error'
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Remember the trigger so focus can return when the dialog closes.
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Step-up dialogs open with a PIN field: focus it so the owner can type
    // immediately. Everything else keeps the confirm-button focus.
    const field = dialogRef.current?.querySelector<HTMLElement>('input:not([disabled])')
    ;(field ?? confirmRef.current)?.focus()
    return () => {
      returnFocusRef.current?.focus()
      returnFocusRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onCancel])

  if (!open) return null

  // Every focusable inside the dialog participates in the trap (the two
  // buttons plus any step-up PIN inputs), so Tab can never leave the modal.
  function handleTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const root = dialogRef.current
    if (root === null) return
    const items = Array.from(
      root.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.getClientRects().length > 0)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    const inside = active instanceof HTMLElement && root.contains(active)
    if (e.shiftKey) {
      if (!inside || active === first) {
        e.preventDefault()
        last.focus()
      }
    } else if (!inside || active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const confirmClasses = destructive
    ? 'h-11 rounded-md border border-destructive px-4 text-base font-semibold text-destructive hover-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60'
    : 'h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dominant/80 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      onKeyDown={handleTab}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error !== null ? errorId : undefined}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-6"
      >
        <h2 id={titleId} className="text-base font-semibold text-content">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        {children}
        {error !== null && (
          <p id={errorId} role="alert" className="mt-3 text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-busy={busy}
            className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            aria-busy={busy}
            className={confirmClasses}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
