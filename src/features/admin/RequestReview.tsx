// Solicitações — staff review of pending membership requests (WHIT-09/10, D-14).
// Ranking-style row: OVR block, #char_id · nickname, class + desired function,
// type badge, created date. Proof + full details behind "Detalhes" expansion.
import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  approveRequest,
  deleteIdentityProof,
  fetchStaffRequests,
  identityProofUrl,
  rejectRequest,
  type StaffRequestRow,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { FUNCTION_LABELS } from '../../lib/groups'
import { ConfirmDialog } from './ConfirmDialog'

const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Falha ao salvar — tente novamente.'
const STALE_ROW_ERROR = 'Esta solicitação já foi avaliada por outro oficial.'
const EMPTY_MESSAGE = 'Nenhuma solicitação pendente.'
const APPROVED_MESSAGE = 'Solicitação aprovada.'
const REJECTED_MESSAGE = 'Solicitação rejeitada.'
const INSUFFICIENT_OVR_COPY = 'Dados insuficientes para OVR'
const APPROVE_DIALOG_COPY = 'O PIN será ativado e o membro entra como Membro.'
const REJECT_CONFIRM_COPY = 'Rejeitar esta solicitação? A pessoa poderá enviar outra.'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export function RequestReview({ session }: { session: NeoFootSession }) {
  const [rows, setRows] = useState<StaffRequestRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [approveTarget, setApproveTarget] = useState<StaffRequestRow | null>(null)
  const [approveFunction, setApproveFunction] = useState<'dps' | 'mdps' | 'suporte'>('dps')
  const [rejectTarget, setRejectTarget] = useState<StaffRequestRow | null>(null)
  const [lastSuccess, setLastSuccess] = useState<string | null>(null)
  const [failedProofs, setFailedProofs] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const queue = await fetchStaffRequests(session)
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

  function openApprove(row: StaffRequestRow) {
    setApproveTarget(row)
    setApproveFunction(row.char_function)
  }

  async function handleApprove() {
    if (busy || approveTarget === null) return
    const row = approveTarget
    const fn = approveFunction
    setBusyId(row.request_id)
    setLastSuccess(null)
    try {
      await approveRequest(session, row.request_id, fn)
      setLastSuccess(APPROVED_MESSAGE)
      setApproveTarget(null)
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
      const message =
        err instanceof ApiError && err.message.includes('already_member')
          ? 'Este handle já está ativo.'
          : err instanceof ApiError && err.message.includes('not_pending')
            ? STALE_ROW_ERROR
            : err instanceof ApiError && err.message.includes('invalid_function')
              ? 'Função inválida.'
              : err instanceof ApiError && err.kind === 'unauthorized'
                ? SESSION_ERROR
                : SAVE_ERROR
      setError(message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(row: StaffRequestRow) {
    if (busy) return
    setBusyId(row.request_id)
    setRejectTarget(null)
    setLastSuccess(null)
    try {
      await rejectRequest(session, row.request_id)
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

  function toggleDetails(row: StaffRequestRow) {
    setExpandedId((prev) => (prev === row.request_id ? null : row.request_id))
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
          const isExpanded = expandedId === row.request_id
          const failed = failedProofs.has(row.request_id)
          const url = identityProofUrl(session, row.proof_path)
          const insufficient = !row.data_sufficient || row.ovr === null
          const typeBadge = requestTypeBadge(row.request_type)
          return (
            <div key={row.request_id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <div className="flex min-w-[3.5rem] flex-col items-center justify-center rounded border border-line bg-surface px-2 py-1 text-center">
                  <span className="text-lg font-bold text-content">
                    {insufficient ? '—' : row.ovr!.toFixed(1)}
                  </span>
                  {insufficient && (
                    <span className="text-[10px] leading-tight text-muted">{INSUFFICIENT_OVR_COPY}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base text-content">
                    #{row.char_id} · {row.nickname}
                  </p>
                  <p className="text-sm text-muted">
                    {row.char_class} · {FUNCTION_LABELS[row.char_function]}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-muted">
                      {typeBadge}
                    </span>
                    <span className="text-xs text-muted">
                      {dateTimeFormatter.format(new Date(row.created_at))}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => toggleDetails(row)}
                  className="text-sm font-semibold text-accent"
                >
                  Detalhes
                </button>
              </div>
              {isExpanded && (
                <div className="mt-3 rounded-md border border-line bg-surface p-3">
                  <p className="text-sm text-muted">Prova de identidade:</p>
                  {failed ? (
                    <p className="text-sm text-muted">Comprovante indisponível.</p>
                  ) : (
                    <img
                      src={url}
                      alt="Comprovante de identidade"
                      onError={() =>
                        setFailedProofs((prev) => {
                          const next = new Set(prev)
                          next.add(row.request_id)
                          return next
                        })
                      }
                      className="max-h-64 w-full object-contain"
                    />
                  )}
                  {row.request_type === 'registration' ? (
                    <p className="mt-3 text-sm text-muted">
                      Primeiro acesso: a aprovação cria o cadastro do personagem. O PIN é definido
                      pelo jogador no próximo acesso.
                    </p>
                  ) : (
                    row.stats &&
                    row.stats.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {row.stats.map((s) => (
                          <div key={s.stat_key} className="flex justify-between text-sm">
                            <span className="text-content">{s.label}</span>
                            <span className="text-muted">
                              {s.value === null ? '—' : s.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openApprove(row)}
                  disabled={busy}
                  className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground"
                >
                  Aprovar
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
          )
        })
      )}
      {/* Approve dialog with function select */}
      {approveTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dominant/80 px-4">
          <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6">
            <h2 className="text-base font-semibold text-content">Aprovar solicitação</h2>
            <p className="mt-2 text-sm text-muted">{APPROVE_DIALOG_COPY}</p>
            <label className="mt-4 block text-sm text-content">
              Função
              <select
                value={approveFunction}
                onChange={(e) => setApproveFunction(e.target.value as 'dps' | 'mdps' | 'suporte')}
                className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2"
              >
                <option value="dps">{FUNCTION_LABELS.dps}</option>
                <option value="mdps">{FUNCTION_LABELS.mdps}</option>
                <option value="suporte">{FUNCTION_LABELS.suporte}</option>
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                disabled={busy}
                className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleApprove()}
                disabled={busy}
                className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground"
              >
                Aprovar
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={rejectTarget !== null}
        title="Rejeitar solicitação"
        body={REJECT_CONFIRM_COPY}
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
export function requestTypeBadge(requestType: StaffRequestRow['request_type']): string {
  if (requestType === 'member') return 'Já é membro'
  // 0020: first access with no registry match -> officer-approved registration.
  if (requestType === 'registration') return 'Cadastro'
  return 'Novo no clã'
}

export function requestTypeLabel(requestType: StaffRequestRow['request_type']): string {
  return requestTypeBadge(requestType)
}

export function formatRequestOvr(ovr: number | null, dataSufficient: boolean): string {
  if (!dataSufficient || ovr === null) return '—'
  return ovr.toFixed(1)
}

export function requestOvrLabel(ovr: number | null, dataSufficient: boolean): string {
  return formatRequestOvr(ovr, dataSufficient)
}

export function requestOvrInsufficient(ovr: number | null, dataSufficient: boolean): boolean {
  return !dataSufficient || ovr === null
}

export function requestRowTitle(charId: string, nickname: string): string {
  return `#${charId} · ${nickname}`
}

export function requestRowSubtitle(charClass: string, charFunction: StaffRequestRow['char_function']): string {
  return `${charClass} · ${FUNCTION_LABELS[charFunction]}`
}

export function requestEmptyMessage(): string {
  return 'Nenhuma solicitação pendente.'
}

export function requestApproveErrorFor(error: unknown): string {
  const message =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : String(error ?? '')
  if (message.includes('already_member')) return 'Este handle já está ativo.'
  if (message.includes('not_pending')) return STALE_ROW_ERROR
  if (message.includes('invalid_function')) return 'Função inválida.'
  if (message.includes('not_member')) return 'Handle sem cadastro de membro.'
  if (message.includes('duplicate_nickname')) return 'Este nick já pertence a outro cadastro ativo.'
  if (error instanceof ApiError && (error.kind === 'unauthorized' || message.includes('forbidden')))
    return SESSION_ERROR
  return SAVE_ERROR
}

export function requestRejectErrorFor(error: unknown): string {
  const message =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : String(error ?? '')
  if (message.includes('not_pending')) return STALE_ROW_ERROR
  if (error instanceof ApiError && (error.kind === 'unauthorized' || message.includes('forbidden')))
    return SESSION_ERROR
  return SAVE_ERROR
}

export function requestInsufficientOvrCopy(): string {
  return INSUFFICIENT_OVR_COPY
}

// aliases
export const requestBadge = requestTypeBadge
export const requestTypeText = requestTypeBadge
export const requestOvrText = formatRequestOvr
export const requestOvr = formatRequestOvr
export const requestEmpty = requestEmptyMessage
export const REQUEST_EMPTY_MESSAGE = requestEmptyMessage()
export const APPROVE_DIALOG_COPY_EXPORT = APPROVE_DIALOG_COPY
export const requestApproveDialogCopy = () => APPROVE_DIALOG_COPY
export const requestRejectConfirmCopy = () => REJECT_CONFIRM_COPY
export const requestApproveCopy = APPROVE_DIALOG_COPY
export const requestRejectCopy = REJECT_CONFIRM_COPY
export const mapRequestApproveError = requestApproveErrorFor
export const mapRequestRejectError = requestRejectErrorFor
export const requestApproveErrorMessage = requestApproveErrorFor
export const requestRejectErrorMessage = requestRejectErrorFor
export const requestBadgeLabel = requestTypeBadge
export const requestOvrValue = formatRequestOvr
export const insufficientOvrCopy = requestInsufficientOvrCopy
export const insufficientCopy = requestInsufficientOvrCopy
export const approveErrorFor = requestApproveErrorFor
export const rejectErrorFor = requestRejectErrorFor
export const mapApproveError = requestApproveErrorFor
export const mapRejectError = requestRejectErrorFor
export const approveErrorMessage = requestApproveErrorFor
export const rejectErrorMessage = requestRejectErrorFor
export const approveDialogCopy = APPROVE_DIALOG_COPY
export const rejectConfirmCopy = REJECT_CONFIRM_COPY
