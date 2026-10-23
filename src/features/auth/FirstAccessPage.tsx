// FirstAccessPage — claim a character by PRINT, then set the PIN (Phase 10).
//
// Owner decision (2026-10-23) supersedes the handle-first claim of 08-03:
//
//   1. Discord handle + the Basic print (the same optimal-example capture the
//      stats wizard uses).
//   2. The print is read (char_id / nickname / class) and looked up in the
//      guild registry by NICKNAME.
//   3. `ready` -> the PIN setter opens and the claim mints the session.
//      `unknown` -> the handle + print go to an officer as a registration
//      request; once approved the character exists (without a PIN) and the next
//      attempt lands on `ready`.
//      `pin_set` / `identity_mismatch` / `ambiguous_identity` -> never reach the
//      PIN boxes; the page explains and points at the login/officer.
//
// T-08-18: the PIN lives only in this component's state and the HTTPS request
// body. It is never logged, persisted or put in a URL.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import hellzMark from '../../assets/hellz-mark.svg'
import {
  firstAccessLookup,
  requestFirstAccess,
  setupPin,
  type FirstAccessStatus,
} from '../../lib/api'
import type { BasicProfileFields } from '../submit/identity'
import { ProofField } from '../identity/ProofField'
import { PinBoxes } from './PinBoxes'
import {
  REQUEST_ALREADY_PENDING,
  REQUEST_SENT,
  canRequestRegistration,
  canSetPin,
  profileComplete,
  profileProblemMessage,
  profileSummary,
  statusMessage,
  submitFirstAccess,
  submitRegistration,
} from './firstAccess'
import { saveSession, type NeoFootSession } from './session'

export interface FirstAccessPageProps {
  initialHandle?: string
  onDone: (session: NeoFootSession) => void
  onBack: () => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string; backToLogin: boolean }
  | { kind: 'sent'; message: string }

const OCR_FAILED = 'Não foi possível ler o print. Envie outro print.'
const LOOKUP_FAILED = 'Não foi possível verificar o personagem agora. Tente de novo.'

export function FirstAccessPage({ initialHandle = '', onDone, onBack }: FirstAccessPageProps) {
  const [handle, setHandle] = useState(initialHandle)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [proof, setProof] = useState<string | null>(null)
  const [profile, setProfile] = useState<BasicProfileFields | null>(null)
  const [reading, setReading] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [lookup, setLookup] = useState<FirstAccessStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupNonce, setLookupNonce] = useState(0)
  const [proofKey, setProofKey] = useState(0)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const readToken = useRef(0)
  const lookupToken = useRef(0)

  const busy = status.kind === 'submitting'
  const summary = profileSummary(profile)
  const incomplete = proof !== null && !reading && ocrError === null && !profileComplete(profile)
  const mismatch = confirmPin.length === 4 && confirmPin !== pin
  const ready = canSetPin(lookup)
  const canRequest = canRequestRegistration(lookup)
  const sent = status.kind === 'sent'

  async function readProof(canvas: HTMLCanvasElement): Promise<void> {
    const token = ++readToken.current
    setReading(true)
    setOcrError(null)
    setProfile(null)
    setLookup(null)
    setLookupError(null)
    try {
      // Lazy import keeps Tesseract out of the login bundle.
      const { readBasicProfile } = await import('../submit/ocr')
      const read = await readBasicProfile(canvas)
      if (token !== readToken.current) return // a newer proof superseded this read
      setProfile(read)
    } catch {
      if (token === readToken.current) setOcrError(OCR_FAILED)
    } finally {
      if (token === readToken.current) setReading(false)
    }
  }

  // Ask the registry once the print reads complete (and again when the Discord
  // handle changes, since a pending registration is keyed by it).
  useEffect(() => {
    if (!profileComplete(profile)) return
    const printed = profile as { nickname: string; char_id: string }
    const token = ++lookupToken.current
    const timer = setTimeout(() => {
      setChecking(true)
      setLookupError(null)
      void firstAccessLookup({
        nickname: printed.nickname,
        char_id: printed.char_id,
        discord_handle: handle.trim() || undefined,
      })
        .then((result) => {
          if (token === lookupToken.current) setLookup(result)
        })
        .catch(() => {
          if (token === lookupToken.current) setLookupError(LOOKUP_FAILED)
        })
        .finally(() => {
          if (token === lookupToken.current) setChecking(false)
        })
    }, 350)
    return () => clearTimeout(timer)
  }, [profile, handle, lookupNonce])

  function retake(): void {
    readToken.current += 1
    lookupToken.current += 1
    setReading(false)
    setChecking(false)
    setProof(null)
    setProfile(null)
    setLookup(null)
    setLookupError(null)
    setOcrError(null)
    setProofKey((key) => key + 1)
    setStatus({ kind: 'idle' })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    // Enter in the handle field must not submit while the registry answer is
    // missing: the PIN setter is gated on `ready`.
    if (busy || reading || checking || !ready) return
    setStatus({ kind: 'submitting' })
    const outcome = await submitFirstAccess(
      { handle, pin, confirmPin, profile, proofDataUrl: proof, status: lookup },
      { setupPin, saveSession },
    )
    if (outcome.ok) {
      // Saved once inside submitFirstAccess; the guard advances exactly once.
      onDone(outcome.session)
      return
    }
    if (outcome.clearPin) {
      setPin('')
      setConfirmPin('')
    }
    setStatus({
      kind: 'error',
      message: outcome.message,
      backToLogin: outcome.backToLogin,
    })
  }

  async function handleRequestRegistration(): Promise<void> {
    if (busy) return
    setStatus({ kind: 'submitting' })
    const outcome = await submitRegistration(
      { handle, pin, confirmPin, profile, proofDataUrl: proof, status: lookup },
      { requestFirstAccess },
    )
    if (!outcome.ok) {
      setStatus({ kind: 'error', message: outcome.message, backToLogin: false })
      return
    }
    setStatus({
      kind: 'sent',
      message: outcome.duplicate ? REQUEST_ALREADY_PENDING : REQUEST_SENT,
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
      <div className="neon-ring w-full max-w-md rounded-lg border border-line bg-surface p-6">
        <img src={hellzMark} alt="Hellz" className="mx-auto mb-3 mt-2 h-16 w-16 glow-accent" />
        <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">Primeiro acesso</h1>
        <p className="mt-1 text-center text-sm font-medium text-muted">
          Envie o print do personagem. O nick vem da imagem e define o seu login.
        </p>
        <div aria-hidden="true" className="mx-auto mb-6 mt-4 h-px w-16 bg-line" />

        <form onSubmit={handleSubmit} noValidate autoComplete="off" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="first-access-handle" className="text-sm font-semibold text-content">
              Usuário do Discord
            </label>
            <input
              id="first-access-handle"
              type="text"
              autoComplete="off"
              maxLength={64}
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              disabled={busy}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="text-xs text-muted">
              Usado só se o personagem ainda não estiver na lista da guilda.
            </p>
          </div>

          <ProofField
            key={proofKey}
            value={proof}
            onChange={(dataUrl) => {
              setProof(dataUrl)
              if (dataUrl === null) {
                setProfile(null)
                setLookup(null)
                setOcrError(null)
                setLookupError(null)
                setStatus({ kind: 'idle' })
              }
            }}
            onImage={(canvas) => {
              void readProof(canvas)
            }}
            disabled={busy}
          />

          <div aria-live="polite" className="rounded-md border border-line bg-dominant px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Identidade lida do print
            </p>
            {reading && <p className="mt-1 text-sm text-muted">Lendo o print…</p>}
            {!reading && summary !== null && <p className="mt-1 text-sm text-content">{summary}</p>}
            {!reading && ocrError !== null && (
              <p role="alert" className="mt-1 text-sm font-semibold text-error">
                {ocrError}
              </p>
            )}
            {!reading && incomplete && (
              <p role="alert" className="mt-1 text-sm font-semibold text-error">
                {profileProblemMessage(profile)}
              </p>
            )}
            {!reading && !incomplete && summary !== null && checking && (
              <p className="mt-1 text-sm text-muted">Verificando o personagem…</p>
            )}
            {!reading && summary !== null && !checking && lookupError !== null && (
              <div className="mt-1 flex flex-col gap-2">
                <p role="alert" className="text-sm font-semibold text-error">
                  {lookupError}
                </p>
                <button
                  type="button"
                  onClick={() => setLookupNonce((n) => n + 1)}
                  disabled={busy}
                  className="text-sm font-semibold text-accent hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Verificar de novo
                </button>
              </div>
            )}
            {!reading && summary !== null && !checking && lookup !== null && (
              <p
                className={`mt-1 text-sm ${
                  lookup === 'ready' ? 'text-content' : 'font-semibold text-error'
                }`}
              >
                {statusMessage(lookup)}
              </p>
            )}
            {!reading && summary === null && ocrError === null && !incomplete && (
              <p className="mt-1 text-sm text-muted">
                Selecione o print da aba Básico. O ID, o nick e a classe vêm da imagem.
              </p>
            )}
            {proof !== null && (
              <button
                type="button"
                onClick={retake}
                disabled={busy}
                className="mt-2 text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Trocar print
              </button>
            )}
          </div>

          {ready && (
            <>
              <PinBoxes value={pin} onChange={setPin} disabled={busy} />
              <PinBoxes
                value={confirmPin}
                onChange={setConfirmPin}
                disabled={busy}
                label="Confirme o PIN"
              />
              {mismatch && (
                <p className="text-sm font-semibold text-error">Os PINs não conferem.</p>
              )}
            </>
          )}

          {status.kind === 'error' && (
            <p role="alert" aria-live="polite" className="text-sm font-semibold text-error">
              {status.message}
            </p>
          )}
          {status.kind === 'sent' && (
            <p role="status" aria-live="polite" className="text-sm font-semibold text-accent">
              {status.message}
            </p>
          )}

          {ready && (
            <button
              type="submit"
              disabled={busy || reading || checking}
              aria-busy={busy}
              className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Criar meu PIN
            </button>
          )}
          {canRequest && !sent && (
            <button
              type="button"
              onClick={() => void handleRequestRegistration()}
              disabled={busy || reading || checking}
              aria-busy={busy}
              className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Enviar print para aprovação
            </button>
          )}
          {/* Owner decision 2026-10-23: one way out, styled like every other
              secondary action (outline), never a stack of back links. */}
          <button
            type="button"
            onClick={onBack}
            className="h-11 w-full rounded-md border border-line px-4 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Voltar para o login
          </button>
        </form>
      </div>
    </main>
  )
}
