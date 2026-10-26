// FirstAccessPage — manual-fill first access, officer-validated (0034).
//
// Owner decision 2026-10-26 (evolves Phase 10's print-first claim): the PRINT
// is eliminated. The player TYPES the identity (Discord handle, nick, char ID,
// class) and chooses the PIN in ONE form; every first access becomes a request
// an OFFICER validates — with no print and no OCR there is nothing else to
// verify identity at the boundary, so the check responsibility sits fully with
// the admins until the Phase 11 Discord OAuth link replaces it.
//
//   lookup(nick, ID, handle) -> 'ready'   -> claim request: the approval
//                                        activates the PIN on the registry row
//                              'unknown' -> registration request: the approval
//                                        registers the character WITH the PIN
//                              anything else -> explain, never submit
//
// No session is ever minted here: after the officer approves, the player logs
// in with nickname + PIN.
//
// T-08-18: the PIN lives only in this component's state and the HTTPS request
// body. It is never logged, persisted or put in a URL.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import hellzMark from '../../assets/hellz-mark.svg'
import { classLabel } from '../../lib/classLabels'
import {
  firstAccessLookup,
  requestClaim,
  requestFirstAccess,
  type FirstAccessStatus,
} from '../../lib/api'
import { OFFICIAL_CLASSES } from '../submit/identity'
import { PinBoxes } from './PinBoxes'
import {
  REQUEST_ALREADY_PENDING,
  REQUEST_SENT,
  canRequestClaim,
  canRequestRegistration,
  claimRequestInput,
  registrationRequestInput,
  statusMessage,
  statusBackToLogin,
  submitFirstAccessRequest,
} from './firstAccess'

export interface FirstAccessPageProps {
  initialHandle?: string
  onBack: () => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'sent'; message: string }

const LOOKUP_FAILED = 'Não foi possível verificar o personagem agora. Tente de novo.'
const SUBMIT_LABEL = 'Enviar solicitação'

export function FirstAccessPage({ initialHandle = '', onBack }: FirstAccessPageProps) {
  const [handle, setHandle] = useState(initialHandle)
  const [nickname, setNickname] = useState('')
  const [charId, setCharId] = useState('')
  const [charClass, setCharClass] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [lookup, setLookup] = useState<FirstAccessStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupNonce, setLookupNonce] = useState(0)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const lookupToken = useRef(0)

  const busy = status.kind === 'submitting'
  const claimable = canRequestClaim(lookup)
  const registrable = canRequestRegistration(lookup)
  const submittable = claimable || registrable
  const sent = status.kind === 'sent'
  const mismatch = confirmPin.length === 4 && confirmPin !== pin

  // Ask the registry what the TYPED identity resolves to (and again when the
  // handle changes, since a pending request is keyed by it).
  useEffect(() => {
    const trimmedNick = nickname.trim()
    const trimmedId = charId.trim()
    if (trimmedNick === '' || !/^\d{1,12}$/.test(trimmedId)) return
    const token = ++lookupToken.current
    const timer = setTimeout(() => {
      setChecking(true)
      setLookupError(null)
      void firstAccessLookup({
        nickname: trimmedNick,
        char_id: trimmedId,
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
  }, [nickname, charId, handle, lookupNonce])

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (busy || checking || !submittable) return
    setStatus({ kind: 'submitting' })
    const draft = {
      handle,
      nickname,
      char_id: charId,
      char_class: charClass,
      pin,
      confirmPin,
      status: lookup,
    }
    const outcome = await submitFirstAccessRequest(draft, {
      // 'ready' claims the registry row the typed nick resolved to; 'unknown'
      // asks the officer to register the character. Both are officer-approved.
      send: () =>
        claimable
          ? requestClaim(claimRequestInput(draft))
          : requestFirstAccess(registrationRequestInput(draft)),
    })
    if (!outcome.ok) {
      setStatus({ kind: 'error', message: outcome.message })
      return
    }
    setStatus({
      kind: 'sent',
      message: outcome.duplicate ? REQUEST_ALREADY_PENDING : REQUEST_SENT,
    })
  }

  const statusLine: string | null =
    lookupError !== null
      ? lookupError
      : checking
        ? 'Verificando o personagem…'
        : lookup !== null
          ? statusMessage(lookup)
          : null

  return (
    <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
      <div className="neon-ring w-full max-w-2xl rounded-lg border border-line bg-surface p-6">
        <img src={hellzMark} alt="Hellz" className="mx-auto mb-3 mt-2 h-16 w-16 glow-accent" />
        <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">Primeiro acesso</h1>
        <p className="mt-1 text-center text-sm font-medium text-muted">
          Preencha seus dados e escolha o PIN. Um oficial confirma o acesso e o PIN fica ativo.
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
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="first-access-nickname" className="text-sm font-semibold text-content">
              Nick do personagem
            </label>
            <input
              id="first-access-nickname"
              type="text"
              autoComplete="off"
              maxLength={80}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              disabled={busy}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="first-access-char-id" className="text-sm font-semibold text-content">
              ID do personagem
            </label>
            <input
              id="first-access-char-id"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              value={charId}
              onChange={(event) => setCharId(event.target.value.replace(/\D/g, '').slice(0, 12))}
              disabled={busy}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="first-access-class" className="text-sm font-semibold text-content">
              Classe
            </label>
            <select
              id="first-access-class"
              value={charClass}
              onChange={(event) => setCharClass(event.target.value)}
              disabled={busy}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Selecione a classe</option>
              {OFFICIAL_CLASSES.map((name) => (
                <option key={name} value={name}>
                  {classLabel(name)}
                </option>
              ))}
            </select>
          </div>

          <div aria-live="polite" className="rounded-md border border-line bg-dominant px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Verificação do personagem
            </p>
            {statusLine !== null && (
              <p
                className={`mt-1 text-sm ${
                  lookup === 'ready' || lookup === 'unknown'
                    ? 'text-content'
                    : lookupError !== null || checking
                      ? 'text-muted'
                      : 'font-semibold text-error'
                }`}
              >
                {statusLine}
              </p>
            )}
            {statusLine === null && (
              <p className="mt-1 text-sm text-muted">
                Preencha o nick e o ID para verificar o personagem na lista da guilda.
              </p>
            )}
            {lookupError !== null && !checking && (
              <button
                type="button"
                onClick={() => setLookupNonce((n) => n + 1)}
                disabled={busy}
                className="mt-2 text-sm font-semibold text-accent hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Verificar de novo
              </button>
            )}
            {lookup !== null && statusBackToLogin(lookup) && (
              <button
                type="button"
                onClick={onBack}
                disabled={busy}
                className="mt-2 text-sm font-semibold text-accent hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Voltar para o login
              </button>
            )}
          </div>

          <PinBoxes value={pin} onChange={setPin} disabled={busy} />
          <PinBoxes
            value={confirmPin}
            onChange={setConfirmPin}
            disabled={busy}
            label="Confirme o PIN"
          />
          {mismatch && <p className="text-sm font-semibold text-error">Os PINs não conferem.</p>}

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

          {submittable && !sent && (
            <button
              type="submit"
              disabled={busy || checking}
              aria-busy={busy}
              className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {SUBMIT_LABEL}
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
