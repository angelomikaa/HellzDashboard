// Validações — staff validation queue (06-UI-SPEC Surface 1, AUTH-05).
// The tab is UX-only gating (T-02-09 / T-06-01): enforcement lives INSIDE the
// 0011 SECURITY DEFINER RPCs — a member JWT raises 'forbidden' in
// officer_queue and set_submission_status, so a tampered client receives
// nothing. D-04: the review is READ-ONLY in the absolute sense — this file
// contains no value-modification affordance of any kind; the only writes are
// the two status transitions, both scoped server-side to status='pending'
// (a two-officer race surfaces as 'not_pending').
import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  fetchOfficerQueue,
  setSubmissionStatus,
  type OfficerQueueRow,
} from '../../lib/api'
import { FUNCTION_LABELS, GROUP_LABELS, GROUP_ORDER, type GroupKey } from '../../lib/groups'
import { formatStatValue } from '../../lib/parseStatValue'
import { ConfirmDialog } from './ConfirmDialog'
import type { NeoFootSession } from '../auth/session'

// Enumeration-safe pt-BR copy (UI contract): never expose HTTP codes, gateway
// internals, or which check failed.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Falha ao salvar — tente novamente.'
const STALE_ROW_ERROR = 'Este envio já foi avaliado por outro oficial.'
const VALIDATED_MESSAGE = 'Envio validado.'
const REJECTED_MESSAGE = 'Envio rejeitado.'
const EMPTY_MESSAGE = 'Nenhuma submissão aguardando validação.'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

// Group sections default: first group open, the other two collapsed.
const DEFAULT_OPEN_GROUPS: Record<GroupKey, boolean> = {
  general: true,
  quasi: false,
  special: false,
}

export function ValidacoesPage({ session }: { session: NeoFootSession }) {
  const [rows, setRows] = useState<OfficerQueueRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // One expanded review at a time; fresh group defaults per expansion.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>(DEFAULT_OPEN_GROUPS)

  // Per-row action state machine + single-flight busy lock (page precedent).
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [savedRowId, setSavedRowId] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [saveErrorRowId, setSaveErrorRowId] = useState<string | null>(null)
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)

  // Success line persists above the list: the acted-on row leaves the queue
  // on refetch, so a per-row-only line would vanish with it.
  const [lastSuccess, setLastSuccess] = useState<string | null>(null)

  // The destructive transition goes through the shared confirm modal first.
  const [rejectTarget, setRejectTarget] = useState<OfficerQueueRow | null>(null)

  const load = useCallback(async () => {
    const queue = await fetchOfficerQueue(session)
    setRows(queue)
  }, [session])

  useEffect(() => {
    let cancelled = false
    load().catch((err: unknown) => {
      if (cancelled) return
      setError(
        err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
      )
    })
    return () => {
      cancelled = true
    }
  }, [load])

  // Any in-flight request disables every CTA on the page.
  const busy = savingRowId !== null

  function toggleRow(row: OfficerQueueRow) {
    if (busy) return
    setExpandedId((prev) => (prev === row.submission_id ? null : row.submission_id))
    setOpenGroups(DEFAULT_OPEN_GROUPS)
    setSavedRowId(null)
    setSavedMessage(null)
    setSaveErrorRowId(null)
    setSaveErrorMessage(null)
  }

  function toggleGroup(group: GroupKey) {
    setOpenGroups((prev) => {
      const next: Record<GroupKey, boolean> = { ...prev }
      next[group] = !prev[group]
      return next
    })
  }

  async function handleSetStatus(row: OfficerQueueRow, status: 'validated' | 'rejected') {
    if (busy) return
    const id = row.submission_id
    setSavingRowId(id)
    setSavedRowId(null)
    setSavedMessage(null)
    setSaveErrorRowId(null)
    setSaveErrorMessage(null)
    setLastSuccess(null)
    setRejectTarget(null)
    try {
      await setSubmissionStatus(session, id, status)
      setSavedRowId(id)
      const message = status === 'validated' ? VALIDATED_MESSAGE : REJECTED_MESSAGE
      setSavedMessage(message)
      setLastSuccess(message)
      // The row leaves the queue on refetch (no longer pending). A refetch
      // failure keeps the stale rows — the status change itself succeeded.
      try {
        await load()
      } catch {
        /* stale queue; success line still shown */
      }
    } catch (err) {
      setSaveErrorRowId(id)
      if (err instanceof ApiError && err.kind === 'unauthorized') {
        setSaveErrorMessage(SESSION_ERROR)
      } else if (
        err instanceof ApiError &&
        err.message.includes('not_pending')
      ) {
        // Two-officer race (T-06-11): another officer adjudicated first —
        // show the stale-row copy and refresh so the outdated row leaves.
        setSaveErrorMessage(STALE_ROW_ERROR)
        try {
          await load()
        } catch {
          /* refresh failed; the stale-row line stays visible */
        }
      } else {
        setSaveErrorMessage(SAVE_ERROR)
      }
    } finally {
      setSavingRowId(null)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="text-xl font-semibold text-content">Validações</h2>
      <p className="mt-1 text-sm text-muted">Revise e valide os envios pendentes da guilda.</p>

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : rows === null ? (
        <p className="mt-6 text-base text-muted">Carregando…</p>
      ) : (
        <>
          {lastSuccess !== null && (
            <p aria-live="polite" className="mt-4 text-sm font-semibold text-success">
              {lastSuccess}
            </p>
          )}
          {rows.length === 0 ? (
            <p className="mt-6 text-center text-base text-muted">{EMPTY_MESSAGE}</p>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              {rows.map((row) => {
                const isExpanded = expandedId === row.submission_id
                const regionId = `queue-review-${row.submission_id}`
                return (
                  <div key={row.submission_id} className="flex flex-col">
                    {/* The WHOLE row is the toggle (UI-SPEC list-item contract). */}
                    <button
                      type="button"
                      onClick={() => toggleRow(row)}
                      aria-expanded={isExpanded}
                      aria-controls={regionId}
                      disabled={busy}
                      className="flex min-h-11 w-full items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span aria-hidden="true" className="text-sm text-muted">
                        {isExpanded ? '▾' : '▸'}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-base text-content">{row.display_name}</span>
                        <span className="text-sm text-muted">
                          {row.char_class ?? '—'} · {FUNCTION_LABELS[row.char_function]} ·{' '}
                          {dateTimeFormatter.format(new Date(row.submitted_at))}
                        </span>
                      </span>
                    </button>
                    {isExpanded && (
                      <div id={regionId} className="rounded-md border border-line bg-surface p-3">
                        {/* Read-only review: all values in server order, grouped
                            Geral → Quasi → Especial. No inputs exist on this page. */}
                        {GROUP_ORDER.map((group, index) => {
                          const open = openGroups[group]
                          const groupRegionId = `${regionId}-${group}`
                          return (
                            <div key={group} className={index === 0 ? '' : 'mt-3'}>
                              <button
                                type="button"
                                onClick={() => toggleGroup(group)}
                                aria-expanded={open}
                                aria-controls={groupRegionId}
                                className="flex w-full items-center gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                <span aria-hidden="true" className="text-sm text-muted">
                                  {open ? '▾' : '▸'}
                                </span>
                                <span className="text-sm font-semibold text-content">
                                  {GROUP_LABELS[group]}
                                </span>
                              </button>
                              {open && (
                                <div id={groupRegionId} className="mt-1 flex flex-col">
                                  {row.stats
                                    .filter((stat) => stat.group_name === group)
                                    .map((stat) => (
                                      <div
                                        key={stat.stat_key}
                                        className="flex items-center justify-between gap-2 py-1"
                                      >
                                        <span className="flex min-w-0 items-baseline gap-2">
                                          <span className="text-sm font-semibold text-content">
                                            {stat.label}
                                          </span>
                                          <span className="text-sm text-muted">
                                            {stat.value_type === 'percentual' ? 'PERCENTUAL' : 'FLAT'}
                                          </span>
                                        </span>
                                        <span className="shrink-0 text-sm text-content">
                                          {formatStatValue(stat.value, stat.value_type)}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {/* Actions bar: full-width stacked on mobile, right-aligned ≥ sm. */}
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            onClick={() => void handleSetStatus(row, 'validated')}
                            disabled={busy}
                            aria-busy={busy}
                            className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Validar
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectTarget(row)}
                            disabled={busy}
                            aria-busy={busy}
                            className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Rejeitar
                          </button>
                        </div>
                        {savedRowId === row.submission_id && savedMessage !== null && (
                          <p aria-live="polite" className="mt-2 text-sm font-semibold text-success">
                            {savedMessage}
                          </p>
                        )}
                        {saveErrorRowId === row.submission_id && saveErrorMessage !== null && (
                          <p
                            role="alert"
                            aria-live="polite"
                            className="mt-2 text-sm font-semibold text-destructive"
                          >
                            {saveErrorMessage}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Destructive confirm: locked copy, destructive-styled confirm button. */}
      <ConfirmDialog
        open={rejectTarget !== null}
        title="Rejeitar envio"
        body={
          rejectTarget === null
            ? ''
            : `O envio de ${rejectTarget.display_name} será marcado como rejeitado e deixará de contar para os ranks. O jogador poderá enviar novamente.`
        }
        confirmLabel="Rejeitar"
        destructive
        busy={busy}
        onConfirm={() => {
          if (rejectTarget !== null) void handleSetStatus(rejectTarget, 'rejected')
        }}
        onCancel={() => setRejectTarget(null)}
      />
    </section>
  )
}
