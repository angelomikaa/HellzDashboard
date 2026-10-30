// Identidades — staff review of pending identity proofs (IDEN-03, D-05/D-15).
// Reads staff_identity_queue and adjudicates via reviewIdentity; the proof object
// is purged best-effort after either decision (D-15).
import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  deleteIdentityProof,
  fetchIdentityQueue,
  reviewIdentity,
  type IdentityQueueRow,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { classLabel } from '../../lib/classLabels'
import { ConfirmDialog } from './ConfirmDialog'
import { ProofImage } from './ProofImage'

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
          return (
            <div key={row.proof_id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex flex-col gap-2">
                <p className="text-base text-content">
                  {row.discord_handle} · {row.display_name}
                </p>
                <p className="text-sm text-muted">
                  #{row.char_id} · {row.nickname}
                  {row.char_class ? ` · ${classLabel(row.char_class)}` : ''}
                </p>
                <ProofImage session={session} path={row.proof_path} />
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
