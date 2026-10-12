// Shared accessible confirm modal (06-UI-SPEC Surface 3 modal pattern,
// reserving 01-UI-SPEC:226's promise that Phase 6 destructive actions get a
// modal confirmation). One component reused by Validações (reject) and
// Personagens (Remover/Reativar/role changes).
//
// Accessibility contract: role="dialog" + aria-modal + aria-labelledby,
// Escape cancels, overlay backdrop click cancels, focus moves to the confirm
// button on open and returns to the previously focused element on close.
// Flat-border language only — no icons, no shadows, no new color tokens.
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean // destructive-styled confirm vs accent primary
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean // disables both buttons while the RPC is in flight
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
}: ConfirmDialogProps) {
  const titleId = 'confirm-dialog-title'
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Remember the trigger so focus can return when the dialog closes.
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    confirmRef.current?.focus()
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

  // The dialog contains exactly two buttons — Tab cycles between them, so a
  // two-element wrap keeps focus trapped inside while open.
  function handleTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const active = document.activeElement
    if (e.shiftKey && (active === cancelRef.current || active === confirmRef.current)) {
      e.preventDefault()
      confirmRef.current?.focus()
    } else if (!e.shiftKey && active === cancelRef.current) {
      e.preventDefault()
      confirmRef.current?.focus()
    } else if (!e.shiftKey && active === confirmRef.current) {
      e.preventDefault()
      cancelRef.current?.focus()
    }
  }

  const confirmClasses = destructive
    ? 'h-11 rounded-md border border-destructive px-4 text-base font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60'
    : 'h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dominant/80 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      onKeyDown={handleTab}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-6"
      >
        <h2 id={titleId} className="text-base font-semibold text-content">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            aria-busy={busy}
            className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
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
