// ReviewHistory — the staff audit trail of validation decisions (0065).
//
// Read-only: every row is an append-only record written by
// set_submission_status (officer, decision, timestamp). The table itself has
// no client grants; this list is the staff-gated recent_submission_reviews()
// payload, capped server-side at 200. Copy is enumeration-safe (fixed strings,
// never raw server errors).
import { useEffect, useState } from 'react'
import { ApiError, fetchRecentReviews, type SubmissionReviewRow } from '../../lib/api'
import { classLabel } from '../../lib/classLabels'
import type { NeoFootSession } from '../auth/session'

const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const EMPTY_MESSAGE = 'Nenhuma decisão de validação registrada ainda.'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const DECISION_DISPLAY: Record<
  SubmissionReviewRow['decision'],
  { label: string; chip: string }
> = {
  validated: { label: 'Validado', chip: 'border-success/40 bg-success/10 text-success' },
  rejected: { label: 'Rejeitado', chip: 'border-error/40 bg-error/10 text-error' },
  reopened: { label: 'Reaberto', chip: 'border-line bg-surface text-muted' },
}

export function ReviewHistory({ session }: { session: NeoFootSession }) {
  const [rows, setRows] = useState<SubmissionReviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRecentReviews(session, 50)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      })
    return () => {
      cancelled = true
    }
  }, [session])

  if (error !== null) {
    return (
      <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-error">
        {error}
      </p>
    )
  }
  if (rows === null) {
    return <p className="mt-6 text-base text-muted">Carregando…</p>
  }
  if (rows.length === 0) {
    return <p className="mt-6 text-center text-base text-muted">{EMPTY_MESSAGE}</p>
  }

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        Últimas {rows.length} decisões — quem validou, o quê e quando.
      </p>
      <ol className="mt-3 flex flex-col gap-2">
        {rows.map((row) => {
          const decision = DECISION_DISPLAY[row.decision]
          return (
            <li
              key={row.review_id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface px-3 py-2"
            >
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${decision.chip}`}
              >
                {decision.label}
              </span>
              <span className="min-w-0 text-base text-content">
                {row.member_name ?? '—'}
                {row.char_class !== null && row.char_class !== '' && (
                  <span className="text-sm text-muted"> · {classLabel(row.char_class)}</span>
                )}
              </span>
              <span className="text-sm text-muted">
                por {row.officer_name ?? '—'}
              </span>
              <span className="ml-auto font-mono text-xs text-muted">
                {dateTimeFormatter.format(new Date(row.created_at))}
              </span>
              {row.note !== null && row.note.trim() !== '' && (
                <span className="basis-full text-sm text-muted">{row.note}</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
