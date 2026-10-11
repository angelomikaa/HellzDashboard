// HistoryList — "Minhas entradas" (INPT-04 made visible). The player's own
// submissions, newest first, with their validation status. Append-only:
// nothing here can edit or remove a row — the CTA always starts a NEW
// submission with fresh inputs (nothing prefilled, nothing overwritten).
import { useEffect, useState } from 'react'
import { ApiError, fetchMySubmissions, type SubmissionRow } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'

// Enumeration-safe copy (UI contract): never expose HTTP codes or internals.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'

const STATUS_LABELS: Record<SubmissionRow['status'], string> = {
  pending: 'Aguarda validação',
  validated: 'Validado',
  rejected: 'Rejeitado',
  discarded: 'Descartado',
}

const STATUS_CLASSES: Record<SubmissionRow['status'], string> = {
  pending: 'text-muted',
  validated: 'text-success',
  rejected: 'text-destructive',
  // Same visual weight as Aguarda validação — the player's own replaced
  // pending (0010 one-pending rule), not an officer judgment (per UI-SPEC).
  discarded: 'text-muted',
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

interface HistoryListProps {
  session: NeoFootSession
  /** restart the wizard as a NEW submission (fresh inputs — append-only) */
  onNewSubmission: () => void
}

export function HistoryList({ session, onNewSubmission }: HistoryListProps) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMySubmissions(session).then(
      (submissions) => {
        if (!cancelled) setRows(submissions)
      },
      (err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      },
    )
    return () => {
      cancelled = true
    }
  }, [session])

  return (
    <section className="mt-8" aria-labelledby="my-submissions-heading">
      <h2 id="my-submissions-heading" className="text-xl font-semibold text-content">
        Minhas entradas
      </h2>

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-4 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : rows === null ? (
        <p className="mt-4 text-base text-muted">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-base text-muted">Você ainda não enviou status.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex h-11 items-center justify-between gap-4 rounded-md border border-line bg-surface px-3"
            >
              <span className="text-base text-content">
                {`Envio de ${dateTimeFormatter.format(new Date(row.submitted_at))} — `}
                <span className={`font-semibold ${STATUS_CLASSES[row.status]}`}>
                  {STATUS_LABELS[row.status]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onNewSubmission}
        className="mt-6 h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Enviar novos status
      </button>
    </section>
  )
}
