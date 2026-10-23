// Identidades — staff review of pending identity proofs (IDEN-03, D-05/D-15).
// Reads staff_identity_queue and adjudicates via reviewIdentity; the proof object
// is purged best-effort after either decision (D-15).
import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  deleteIdentityProof,
  fetchIdentityQueue,
  identityProofUrl,
  reviewIdentity,
  type IdentityQueueRow,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { ConfirmDialog } from './ConfirmDialog'

const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Falha ao salvar — tente novamente.'
const STALE_ROW_ERROR = 'Esta identidade já foi avaliada por outro oficial.'
const EMPTY_MESSAGE = 'Nenhuma identidade aguardando revisão.'
const CONFIRMED_MESSAGE = 'Identidade confirmada.'
const REJECTED_MESSAGE = 'Identidade rejeitada.'

export function IdentityReview({ session }: { session: NeoFootSession }) {
  const [rows, setRows] = useState<IdentityQueueRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<IdentityQueueRow | null>(null)
  const [lastSuccess, setLastSuccess] = useState<string | null>(null)
  const [failedProofs, setFailedProofs] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const queue = await fetchIdentityQueue(session)
    setRows(queue)
  }, [session])

  useEffect(() => {
    let cancelled = false
    load().catch((err: unknown) => {
      if (cancelled) return
      setError(err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR)
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const busy = busyId !== null

  async function handleConfirm(row: IdentityQueueRow) {
    if (busy) return
    setBusyId(row.proof_id)
    setLastSuccess(null)
    try {
      await reviewIdentity(session, row.proof_id, true)
      setLastSuccess(CONFIRMED_MESSAGE)
      try {
        await deleteIdentityProof(session, row.proof_path)
      } catch {
        /* best-effort purge */
      }
      try {
        await load()
      } catch {
        /* keep success line */
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.message.includes('not_pending')
          ? STALE_ROW_ERROR
          : err instanceof ApiError && err.kind === 'unauthorized'
            ? SESSION_ERROR
            : SAVE_ERROR,
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(row: IdentityQueueRow) {
    if (busy) return
    setBusyId(row.proof_id)
    setRejectTarget(null)
    setLastSuccess(null)
    try {
      await reviewIdentity(session, row.proof_id, false)
      setLastSuccess(REJECTED_MESSAGE)
      try {
        await deleteIdentityProof(session, row.proof_path)
      } catch {
        /* best-effort purge */
      }
      try {
        await load()
      } catch {
        /* keep success line */
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.message.includes('not_pending')
          ? STALE_ROW_ERROR
          : err instanceof ApiError && err.kind === 'unauthorized'
            ? SESSION_ERROR
            : SAVE_ERROR,
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-error">
          {error}
        </p>
      )}
      {lastSuccess !== null && (
        <p aria-live="polite" className="text-sm font-semibold text-success">
          {lastSuccess}
        </p>
      )}
      {rows === null ? (
        <p className="text-base text-muted">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-base text-muted">{EMPTY_MESSAGE}</p>
      ) : (
        rows.map((row) => {
          const failed = failedProofs.has(row.proof_id)
          const url = identityProofUrl(session, row.proof_path)
          return (
            <div key={row.proof_id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex flex-col gap-2">
                <p className="text-base text-content">
                  {row.discord_handle} · {row.display_name}
                </p>
                <p className="text-sm text-muted">
                  #{row.char_id} · {row.nickname}
                  {row.char_class ? ` · ${row.char_class}` : ''}
                </p>
                {failed ? (
                  <p className="text-sm text-muted">Comprovante indisponível.</p>
                ) : (
                  <img
                    src={url}
                    alt="Comprovante de identidade"
                    onError={() =>
                      setFailedProofs((prev) => {
                        const next = new Set(prev)
                        next.add(row.proof_id)
                        return next
                      })
                    }
                    className="max-h-64 w-full object-contain"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleConfirm(row)}
                    disabled={busy}
                    className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectTarget(row)}
                    disabled={busy}
                    className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            </div>
          )
        })
      )}
      <ConfirmDialog
        open={rejectTarget !== null}
        title="Rejeitar identidade"
        body={
          rejectTarget === null
            ? ''
            : 'Rejeitar esta identidade? O membro perderá o acesso até falar com um oficial.'
        }
        confirmLabel="Rejeitar"
        destructive
        busy={busy}
        onConfirm={() => {
          if (rejectTarget !== null) void handleReject(rejectTarget)
        }}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  )
}

// ---- helpers ----
export function identityReviewEmptyMessage(): string {
  return 'Nenhuma identidade aguardando revisão.'
}

export function identityReviewErrorFor(error: unknown): string {
  const message =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : String(error ?? '')
  if (message.includes('not_pending')) return STALE_ROW_ERROR
  if (error instanceof ApiError && (error.kind === 'unauthorized' || message.includes('forbidden')))
    return SESSION_ERROR
  return SAVE_ERROR
}

export const identityEmptyMessage = identityReviewEmptyMessage
export const identityReviewEmpty = identityReviewEmptyMessage
export const EMPTY_IDENTITY_MESSAGE = identityReviewEmptyMessage()
export const mapIdentityReviewError = identityReviewErrorFor
export const identityReviewErrorMessage = identityReviewErrorFor
export const emptyMessage = identityReviewEmptyMessage
export const identityErrorFor = identityReviewErrorFor
export const mapIdentityError = identityReviewErrorFor
export const identityErrorMessage = identityReviewErrorFor
export const rejectConfirmCopy = () => 'Rejeitar esta identidade? O membro perderá o acesso até falar com um oficial.'
