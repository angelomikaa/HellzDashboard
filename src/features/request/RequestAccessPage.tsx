// RequestAccessPage — the unauthenticated request entrance (08-03 task 4).
//
// Chooser (D-06): existing member (identity only, no stats) vs prospect (full
// application, handed to the 08-04 wizard). The identity/PIN form is shared:
// handle, 4-box PIN + confirmation, JPEG proof, pointed function, and an
// OCR-prefilled but editable ID/nickname/class (staff reviews applications, so
// a human edit always wins over the OCR read).
//
// Supersede (D-11): a 409 request_pending reveals a previous-PIN step and the
// retry carries it; a 401 clears only that PIN. Nothing here mints a session —
// approval stays staff-gated (T-08-20). The PIN is transient state only
// (T-08-18).
import { useRef, useState, type FormEvent } from 'react'
import { firstAccessIdentify, requestAccess, type RequestType } from '../../lib/api'
import { ProofField } from '../identity/ProofField'
import type { BasicProfileFields, CharFunction } from '../submit/identity'
import { PinBoxes } from '../auth/PinBoxes'
import {
  REQUEST_CLASS_OPTIONS,
  REQUEST_FUNCTION_OPTIONS,
  prefillIdentity,
  prospectDraftFrom,
  requestFormProblem,
  requestProblemMessage,
  submitMemberRequest,
  type ProspectDraft,
  type RequestFormDraft,
  type TouchedFields,
} from './requestFlow'
import { RequestStatusPage } from './RequestStatusPage'

export type { ProspectDraft } from './requestFlow'

export interface RequestAccessPageProps {
  initialHandle?: string
  /** Set when returning from the prospect application wizard (08-04): the
   *  success panel shows the protocol of the request just submitted. */
  initialRequestId?: string
  onBack: () => void
  onStartApplication: (draft: ProspectDraft) => void
  /** Identification path: when the handle is known without a PIN, hand off to
   *  the first-access claim flow instead of any PIN form. A handle whose account
   *  already has a PIN never opens a form at all (owner rule 2026-10-23). */
  onFirstAccess?: (handle: string) => void
}

type Step = 'chooser' | 'identify' | 'form'

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string; backToLogin: boolean }

const OCR_FAILED = 'Não foi possível ler o print. Envie outro print.'

export function RequestAccessPage({
  initialHandle = '',
  initialRequestId,
  onBack,
  onStartApplication,
  onFirstAccess,
}: RequestAccessPageProps) {
  const [step, setStep] = useState<Step>('chooser')
  const [requestType, setRequestType] = useState<RequestType>('member')
  const [showStatus, setShowStatus] = useState(false)

  const [handle, setHandle] = useState(initialHandle)
  const [identifyHandle, setIdentifyHandle] = useState(initialHandle)
  const [identifyStatus, setIdentifyStatus] = useState<Status>({ kind: 'idle' })
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [proof, setProof] = useState<string | null>(null)
  const [identity, setIdentity] = useState({ char_id: '', nickname: '', char_class: '' })
  const [charFunction, setCharFunction] = useState<CharFunction | ''>('')
  const [reading, setReading] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [needsPreviousPin, setNeedsPreviousPin] = useState(false)
  const [previousPin, setPreviousPin] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [requestId, setRequestId] = useState<string | null>(initialRequestId ?? null)
  const [proofKey, setProofKey] = useState(0)

  const touchedRef = useRef<TouchedFields>({})
  const readToken = useRef(0)
  const submitting = status.kind === 'submitting'

  function markTouched(field: keyof TouchedFields): void {
    touchedRef.current = { ...touchedRef.current, [field]: true }
  }

  function start(type: RequestType): void {
    setRequestType(type)
    if (type === 'member') {
      // Identificação path: probe the handle first. A known character without a
      // PIN routes to the print-first claim; an account that already has a PIN is
      // refused outright (owner rule 2026-10-23); unknown handles keep the
      // staff-approved re-link form.
      setIdentifyHandle(handle)
      setIdentifyStatus({ kind: 'idle' })
      setStep('identify')
      return
    }
    setStep('form')
    setStatus({ kind: 'idle' })
    setRequestId(null)
  }

  async function submitIdentify(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    const h = identifyHandle.trim()
    if (h.length === 0) return
    setIdentifyStatus({ kind: 'submitting' })
    try {
      const status = await firstAccessIdentify(h)
      // Owner rule (2026-10-23): an account that already has a PIN refuses the
      // PIN system entirely. No relink form, no PIN boxes — log in with the
      // nickname + PIN, or ask staff for a reset.
      if (status === 'claimed') {
        setIdentifyStatus({
          kind: 'error',
          message: 'Essa conta já tem PIN. Entre com o nick e o PIN.',
          backToLogin: true,
        })
        return
      }
      // A known character without a PIN claims it by PRINT (Phase 10), and so
      // does an unknown handle (owner decision 2026-10-23): the registry request
      // only becomes a member row after an officer approves the print. The PIN
      // setter opens on the next attempt, never before the approval.
      if (status === 'unclaimed' || status === 'none') {
        onFirstAccess?.(h)
        if (!onFirstAccess) {
          setIdentifyStatus({
            kind: 'error',
            message: 'Fluxo de primeiro acesso indisponível.',
            backToLogin: false,
          })
        }
        return
      }
      // Unreachable today (the three statuses are exhaustive); never open a PIN
      // form as a fallback.
      setIdentifyStatus({
        kind: 'error',
        message: 'Não foi possível verificar o handle agora. Tente de novo.',
        backToLogin: false,
      })
    } catch {
      setIdentifyStatus({
        kind: 'error',
        message: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
        backToLogin: false,
      })
    }
  }

  async function readProof(canvas: HTMLCanvasElement): Promise<void> {
    const token = ++readToken.current
    setReading(true)
    setOcrError(null)
    try {
      const { readBasicProfile } = await import('../submit/ocr')
      const read: BasicProfileFields = await readBasicProfile(canvas)
      if (token !== readToken.current) return
      setIdentity((current) => prefillIdentity(current, read, touchedRef.current))
    } catch {
      if (token === readToken.current) setOcrError(OCR_FAILED)
    } finally {
      if (token === readToken.current) setReading(false)
    }
  }

  function retake(): void {
    readToken.current += 1
    setReading(false)
    setProof(null)
    setOcrError(null)
    setProofKey((key) => key + 1)
  }

  function draft(): RequestFormDraft {
    return {
      handle,
      pin,
      confirmPin,
      char_id: identity.char_id,
      nickname: identity.nickname,
      char_class: identity.char_class,
      charFunction,
      proofDataUrl: proof,
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting || reading) return

    const problem = requestFormProblem(draft())
    if (problem !== null) {
      setStatus({ kind: 'error', message: requestProblemMessage(problem), backToLogin: false })
      return
    }
    if (needsPreviousPin && !/^\d{4}$/.test(previousPin)) {
      setStatus({
        kind: 'error',
        message: 'Informe o PIN da solicitação anterior.',
        backToLogin: false,
      })
      return
    }

    if (requestType === 'prospect') {
      // No submission here: the wizard adds stats and posts the same endpoint.
      onStartApplication(prospectDraftFrom(draft()))
      return
    }

    setStatus({ kind: 'submitting' })
    const outcome = await submitMemberRequest(
      draft(),
      { requestAccess },
      needsPreviousPin ? previousPin : undefined,
    )
    if (outcome.ok) {
      setRequestId(outcome.requestId)
      setStatus({ kind: 'idle' })
      return
    }
    if (outcome.needsPreviousPin) setNeedsPreviousPin(true)
    if (outcome.clearPreviousPin) setPreviousPin('')
    if (outcome.clearPreviousPin && !outcome.needsPreviousPin) setNeedsPreviousPin(false)
    setStatus({ kind: 'error', message: outcome.message, backToLogin: outcome.backToLogin })
  }

  if (showStatus) {
    return (
      <RequestStatusPage initialHandle={handle} onBack={() => setShowStatus(false)} />
    )
  }

  if (requestId !== null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
          <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">
            Solicitação enviada
          </h1>
          <p className="mt-2 text-center text-sm text-muted">Aguarde um oficial.</p>
          <p className="mt-2 break-all text-center text-xs text-muted">Protocolo: {requestId}</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowStatus(true)}
              className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Consultar status
            </button>
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Voltar para o login
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (step === 'chooser') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
          <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">
            Solicitar acesso
          </h1>
          <p className="mt-1 text-center text-sm font-medium text-muted">
            Escolha o tipo de solicitação.
          </p>
          <div aria-hidden="true" className="mx-auto mb-6 mt-4 h-px w-16 bg-line" />
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => start('member')}
              className="rounded-md border border-line bg-dominant px-4 py-3 text-left hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="block text-base font-semibold text-content">
                Identificação
              </span>
              <span className="mt-1 block text-sm text-muted">
                Já sou da guilda: vincular personagem (reivindicar PIN ou reenviar identidade).
              </span>
            </button>
            <button
              type="button"
              onClick={() => start('prospect')}
              className="rounded-md border border-line bg-dominant px-4 py-3 text-left hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="block text-base font-semibold text-content">
                Recrutamento
              </span>
              <span className="mt-1 block text-sm text-muted">
                Quero entrar na guilda: aplicação completa com os status do personagem.
              </span>
            </button>
          </div>
          <p className="mt-4 rounded-md border border-line bg-dominant px-3 py-2 text-xs text-muted">
            O envio de status precisa ser concluído de uma vez; nada é salvo antes do envio final.
          </p>
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowStatus(true)}
              className="text-sm font-semibold text-accent hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Consultar solicitação
            </button>
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Voltar
            </button>
          </div>
        </div>
      </main>
    )
  }

  const prospect = requestType === 'prospect'

  if (step === 'identify') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
          <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">
            Identificação
          </h1>
          <p className="mt-1 text-center text-sm font-medium text-muted">
            Informe seu handle para verificar se já possui cadastro.
          </p>
          <form onSubmit={submitIdentify} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="identify-handle" className="text-sm font-semibold text-content">
                Usuário do Discord
              </label>
              <input
                id="identify-handle"
                type="text"
                autoComplete="off"
                value={identifyHandle}
                onChange={(e) => setIdentifyHandle(e.target.value)}
                disabled={identifyStatus.kind === 'submitting'}
                className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
            {identifyStatus.kind === 'error' && (
              <p role="alert" className="text-sm font-semibold text-destructive">
                {identifyStatus.message}
              </p>
            )}
            {identifyStatus.kind === 'error' && identifyStatus.backToLogin && (
              <button
                type="button"
                onClick={onBack}
                className="text-sm font-semibold text-accent hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Voltar para o login
              </button>
            )}
            <button
              type="submit"
              disabled={identifyStatus.kind === 'submitting' || identifyHandle.trim().length === 0}
              className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {identifyStatus.kind === 'submitting' ? 'Verificando...' : 'Continuar'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('chooser'); setIdentifyStatus({ kind: 'idle' }) }}
              className="text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Voltar
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
      <div className="w-full max-w-lg rounded-lg border border-line bg-surface p-6">
        <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">
          {prospect ? 'Recrutamento' : 'Identificação'}
        </h1>
        <p className="mt-1 text-center text-sm font-medium text-muted">
          {prospect
            ? 'Confirme sua identidade; os status vêm na próxima etapa.'
            : 'Vincule um personagem à sua conta.'}
        </p>
        <div aria-hidden="true" className="mx-auto mb-6 mt-4 h-px w-16 bg-line" />

        <form onSubmit={handleSubmit} noValidate autoComplete="off" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="request-handle" className="text-sm font-semibold text-content">
              Usuário do Discord
            </label>
            <input
              id="request-handle"
              type="text"
              autoComplete="off"
              maxLength={64}
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              disabled={submitting}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <PinBoxes value={pin} onChange={setPin} disabled={submitting} />
          <PinBoxes
            value={confirmPin}
            onChange={setConfirmPin}
            disabled={submitting}
            label="Confirme o PIN"
          />

          <ProofField
            key={proofKey}
            value={proof}
            onChange={(dataUrl) => {
              setProof(dataUrl)
              if (dataUrl === null) setOcrError(null)
            }}
            onImage={(canvas) => {
              void readProof(canvas)
            }}
            disabled={submitting}
          />
          {reading && <p className="text-sm text-muted">Lendo o print…</p>}
          {ocrError !== null && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {ocrError}
            </p>
          )}
          {proof !== null && (
            <button
              type="button"
              onClick={retake}
              disabled={submitting}
              className="self-start text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Trocar print
            </button>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="request-char-id" className="text-sm font-semibold text-content">
              ID do personagem
            </label>
            <input
              id="request-char-id"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={identity.char_id}
              onChange={(event) => {
                markTouched('char_id')
                setIdentity((current) => ({
                  ...current,
                  char_id: event.target.value.replace(/\D/g, '').slice(0, 12),
                }))
              }}
              disabled={submitting}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="request-nickname" className="text-sm font-semibold text-content">
              Nick do personagem
            </label>
            <input
              id="request-nickname"
              type="text"
              autoComplete="off"
              maxLength={80}
              value={identity.nickname}
              onChange={(event) => {
                markTouched('nickname')
                setIdentity((current) => ({ ...current, nickname: event.target.value }))
              }}
              disabled={submitting}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="request-class" className="text-sm font-semibold text-content">
              Classe
            </label>
            <select
              id="request-class"
              value={identity.char_class}
              onChange={(event) => {
                markTouched('char_class')
                setIdentity((current) => ({ ...current, char_class: event.target.value }))
              }}
              disabled={submitting}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Selecione a classe</option>
              {REQUEST_CLASS_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="request-function" className="text-sm font-semibold text-content">
              Função
            </label>
            <select
              id="request-function"
              value={charFunction}
              onChange={(event) => setCharFunction(event.target.value as CharFunction | '')}
              disabled={submitting}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Selecione a função</option>
              {REQUEST_FUNCTION_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {name === 'dps' ? 'DPS' : name === 'mdps' ? 'M-DPS' : 'Suporte'}
                </option>
              ))}
            </select>
          </div>

          {needsPreviousPin && (
            <div className="rounded-md border border-line bg-dominant px-3 py-3">
              <PinBoxes
                value={previousPin}
                onChange={setPreviousPin}
                disabled={submitting}
                label="PIN da solicitação anterior"
              />
            </div>
          )}

          {prospect && (
            <p className="rounded-md border border-line bg-dominant px-3 py-2 text-xs text-muted">
              O envio de status precisa ser concluído de uma vez; nada é salvo antes do envio
              final.
            </p>
          )}

          {status.kind === 'error' && (
            <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || reading}
            aria-busy={submitting}
            className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {prospect
              ? 'Continuar para os status'
              : needsPreviousPin
                ? 'Substituir solicitação'
                : 'Enviar solicitação'}
          </button>

          {status.kind === 'error' && status.backToLogin && (
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-semibold text-accent hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Voltar para o login
            </button>
          )}
          <button
            type="button"
            onClick={() => setStep('chooser')}
            className="text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Voltar
          </button>
        </form>
      </div>
    </main>
  )
}
