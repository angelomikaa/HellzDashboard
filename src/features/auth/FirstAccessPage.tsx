// FirstAccessPage — claim an unclaimed handle (08-03 task 3, D-02/D-03).
//
// Collects ONLY handle + PIN + confirmation + one basic screenshot. The
// character ID / nickname / class are read from that screenshot and shown
// read-only as evidence: there is no typed in-game-name field, no class select
// and no build role at claim time. If OCR cannot read all three, submission is
// blocked and the page asks for another screenshot (never guesses).
//
// T-08-18: the PIN lives only in this component's state and the HTTPS request
// body. It is never logged, persisted or put in a URL.
import { useRef, useState, type FormEvent } from 'react'
import hellzMark from '../../assets/hellz-mark.svg'
import { setupPin } from '../../lib/api'
import type { BasicProfileFields } from '../submit/identity'
import { ProofField } from '../identity/ProofField'
import { PinBoxes } from './PinBoxes'
import { profileComplete, profileProblemMessage, profileSummary, submitFirstAccess } from './firstAccess'
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

const OCR_FAILED = 'Não foi possível ler o print. Envie outro print.'

export function FirstAccessPage({ initialHandle = '', onDone, onBack }: FirstAccessPageProps) {
  const [handle, setHandle] = useState(initialHandle)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [proof, setProof] = useState<string | null>(null)
  const [profile, setProfile] = useState<BasicProfileFields | null>(null)
  const [reading, setReading] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [proofKey, setProofKey] = useState(0)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const readToken = useRef(0)

  const submitting = status.kind === 'submitting'
  const summary = profileSummary(profile)
  const incomplete = proof !== null && !reading && ocrError === null && !profileComplete(profile)
  const mismatch = confirmPin.length === 4 && confirmPin !== pin

  async function readProof(canvas: HTMLCanvasElement): Promise<void> {
    const token = ++readToken.current
    setReading(true)
    setOcrError(null)
    setProfile(null)
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

  function retake(): void {
    readToken.current += 1
    setReading(false)
    setProof(null)
    setProfile(null)
    setOcrError(null)
    setProofKey((key) => key + 1)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting || reading) return
    setStatus({ kind: 'submitting' })
    const outcome = await submitFirstAccess(
      { handle, pin, confirmPin, profile, proofDataUrl: proof },
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
        <img src={hellzMark} alt="Hellz" className="mx-auto mb-3 mt-2 h-16 w-16 glow-accent" />
        <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">Primeiro acesso</h1>
        <p className="mt-1 text-center text-sm font-medium text-muted">
          Crie seu PIN e envie um print do personagem.
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
          {mismatch && <p className="text-sm font-semibold text-destructive">Os PINs não conferem.</p>}

          <ProofField
            key={proofKey}
            value={proof}
            onChange={(dataUrl) => {
              setProof(dataUrl)
              if (dataUrl === null) {
                setProfile(null)
                setOcrError(null)
              }
            }}
            onImage={(canvas) => {
              void readProof(canvas)
            }}
            disabled={submitting}
          />

          <div aria-live="polite" className="rounded-md border border-line bg-dominant px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Identidade lida do print
            </p>
            {reading && <p className="mt-1 text-sm text-muted">Lendo o print…</p>}
            {!reading && summary !== null && <p className="mt-1 text-sm text-content">{summary}</p>}
            {!reading && ocrError !== null && (
              <p role="alert" className="mt-1 text-sm font-semibold text-destructive">
                {ocrError}
              </p>
            )}
            {!reading && incomplete && (
              <p role="alert" className="mt-1 text-sm font-semibold text-destructive">
                {profileProblemMessage(profile)}
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
                disabled={submitting}
                className="mt-2 text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Trocar print
              </button>
            )}
          </div>

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
            Criar meu PIN
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
          {!(status.kind === 'error' && status.backToLogin) && (
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Voltar
            </button>
          )}
        </form>
      </div>
    </main>
  )
}
