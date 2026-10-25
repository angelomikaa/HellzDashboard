import { useState, type FormEvent } from 'react'
import hellzMark from '../../assets/hellz-mark.svg'
import { PinBoxes } from './PinBoxes'
import { isValidSession, saveSession, type NeoFootSession } from './session'

type LoginStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'needs-setup' }
  | { kind: 'error'; message: string }
  | { kind: 'locked'; message: string }
  | { kind: 'device-mismatch' }

export interface LoginPageProps {
  onLogin: (session: NeoFootSession) => void
  /** 409 pin_setup_required -> first-access claim (identity comes from the print). */
  onFirstAccess: () => void
  onRequestAccess: () => void
  /** Phase 10: return to the public Início landing (visitors arrive there). */
  onBack?: () => void
}

const NETWORK_ERROR = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'

// Plan 01-03 / D-01; Phase 10 (2026-10-23): login is by character NICKNAME +
// 4-digit PIN. No OAuth, no Discord API, no email. The nickname is the registry
// key (members.login_key, migration 0020); the Discord handle is a staff-facing
// contact field and plays no part here.
// Phase 8 (08-03, D-02): the PIN is entered in the shared 2FA-style PinBoxes —
// four masked boxes, no auto-submit. The PIN lives only in the transient form
// state + the HTTPS request body (T-08-18): never stored, logged or in a URL.
export function LoginPage({ onLogin, onFirstAccess, onRequestAccess, onBack }: LoginPageProps) {
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<LoginStatus>({ kind: 'idle' })

  const submitting = status.kind === 'submitting'
  const locked = status.kind === 'locked'
  const disabled = submitting || locked

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (disabled) return
    if (nickname.trim().length === 0 || !/^\d{4}$/.test(pin)) return
    setStatus({ kind: 'submitting' })
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-pin`, {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          // Plan 01-02 discovery: the /functions/v1 gateway requires BOTH apikey and
          // Authorization: Bearer <anon> — without the Bearer header the function is
          // never invoked (gateway 401 before the function runs).
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nickname: nickname.trim(), pin }),
      })

      if (res.ok) {
        // CR-02: validate the 200 body's shape before saving — a malformed body
        // (deploy glitch, proxy rewrite) is treated as NETWORK_ERROR instead of
        // persisting garbage that would crash RequireAuth on the next load.
        const data: unknown = await res.json().catch(() => null)
        const session = (data as { session?: unknown } | null)?.session
        if (!isValidSession(session)) {
          setStatus({ kind: 'error', message: NETWORK_ERROR })
          return
        }
        saveSession(session)
        onLogin(session)
        return
      }

      const body: {
        error?: string
        attempts_remaining?: number
        retry_after_seconds?: number
      } = await res.json().catch(() => ({}))

      if (res.status === 401) {
        // Enumeration-safe copy (T-01-03 / UI-SPEC): never reveals whether the
        // nickname or the PIN was wrong. WR-07: attempts_remaining comes from the
        // function (D-07), but the gateway can 401 before the function runs —
        // never render "undefined tentativas restantes".
        const remaining = body.attempts_remaining
        if (typeof remaining !== 'number' || remaining <= 0) {
          setStatus({ kind: 'error', message: 'Nick ou PIN incorreto.' })
        } else {
          setStatus({
            kind: 'error',
            message:
              remaining === 1
                ? 'Nick ou PIN incorreto — 1 tentativa restante.'
                : `Nick ou PIN incorreto — ${remaining} tentativas restantes.`,
          })
        }
        setPin('')
        return
      }

      if (res.status === 409 && body.error === 'ambiguous_identity') {
        setStatus({
          kind: 'error',
          message: 'Mais de um cadastro usa este nick. Fale com um oficial.',
        })
        setPin('')
        return
      }

      if (res.status === 409 && body.error === 'pin_setup_required') {
        // Unclaimed character (WHIT-01/02): route into first access instead of a
        // dead-end wrong-PIN message.
        setStatus({ kind: 'needs-setup' })
        return
      }

      if (res.status === 409 && body.error === 'pin_already_set') {
        // Claim race: someone set the PIN between this attempt and now.
        setStatus({ kind: 'error', message: 'PIN já criado. Entre com seu PIN.' })
        setPin('')
        return
      }

      if (res.status === 429 && typeof body.retry_after_seconds === 'number') {
        // D-07 UX: static lockout hint — the lockout itself is server-enforced.
        const minutes = Math.max(1, Math.ceil(body.retry_after_seconds / 60))
        setStatus({
          kind: 'locked',
          message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minutos.`,
        })
        return
      }

      setStatus({ kind: 'error', message: NETWORK_ERROR })
    } catch {
      setStatus({ kind: 'error', message: NETWORK_ERROR })
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
      <div className="neon-ring w-full max-w-96 rounded-lg border border-line bg-surface p-6">
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-sm font-semibold text-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ← Voltar para o início
          </button>
        )}
        <img src={hellzMark} alt="Hellz" className="mx-auto mb-3 mt-2 h-20 w-20 glow-accent" />
        <h1 className="text-center text-3xl font-bold leading-[1.2] text-content">Hellz</h1>
        <p className="mt-1 text-center text-sm font-medium text-muted">Painel Geral</p>
        <div aria-hidden="true" className="mx-auto mb-6 mt-4 h-px w-16 bg-line" />
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="login-nickname" className="text-sm font-semibold text-content">
              Nick do personagem
            </label>
            <input
              id="login-nickname"
              type="text"
              autoComplete="off"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={locked}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <p className="text-xs text-muted">
              O nick que aparece no print. O usuário do Discord também funciona.
            </p>
          </div>
          <PinBoxes value={pin} onChange={setPin} disabled={disabled} autoFocus />
          {status.kind === 'needs-setup' && (
            <div className="rounded-md border border-line bg-dominant px-3 py-3">
              <p className="text-sm font-semibold text-content">
                Este personagem ainda não tem PIN.
              </p>
              <button
                type="button"
                onClick={onFirstAccess}
                className="mt-2 h-10 w-full rounded-md bg-accent text-sm font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Criar meu PIN
              </button>
            </div>
          )}
          {(status.kind === 'error' || status.kind === 'locked') && (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm font-semibold text-error"
            >
              {status.message}
            </p>
          )}
          <button
            type="submit"
            disabled={disabled}
            aria-busy={submitting}
            className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Entrar
          </button>
        </form>
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={onRequestAccess}
            className="h-11 w-full rounded-md border border-line px-4 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Solicitar acesso
          </button>
        </div>
      </div>
    </main>
  )
}
