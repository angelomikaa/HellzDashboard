import { useState, type ReactNode } from 'react'
import { RequestAccessPage, type ProspectDraft } from '../request/RequestAccessPage'
import { FirstAccessPage } from './FirstAccessPage'
import { LoginPage } from './LoginPage'
import { clearSession, isExpired, loadSession, type NeoFootSession } from './session'

export interface AuthContext {
  session: NeoFootSession
  /** Drops the guard back to LoginPage without touching storage (logout calls clearSession first). */
  invalidate: () => void
}

/** Unauthenticated views (08-03): login is the default. */
type AuthView =
  | { kind: 'login' }
  | { kind: 'first-access'; handle: string }
  | { kind: 'request'; handle?: string }

// Route guard — UX ONLY by design (T-01-08): real enforcement is RLS server-side
// (Plan 01-02). D-06: expired sessions are cleared silently on mount — no banner,
// no toast, straight to LoginPage.
//
// Phase 8 (08-03): the unauthenticated screen is a small view machine. Login
// hands a typed handle to first access (409 pin_setup_required or the explicit
// entry link) and opens the request surface. The prospect handoff keeps the
// draft in memory only (no session, nothing persisted — T-08-20); 08-04
// replaces the interim panel with the full-stats application wizard.
export function RequireAuth({ children }: { children: (auth: AuthContext) => ReactNode }) {
  const [session, setSession] = useState<NeoFootSession | null>(() => {
    const stored = loadSession()
    if (stored && isExpired(stored)) {
      clearSession() // D-06: silent expiry
      return null
    }
    return stored
  })
  const [view, setView] = useState<AuthView>({ kind: 'login' })
  const [application, setApplication] = useState<ProspectDraft | null>(null)

  if (session) return <>{children({ session, invalidate: () => setSession(null) })}</>

  if (view.kind === 'first-access') {
    return (
      <FirstAccessPage
        initialHandle={view.handle}
        onDone={setSession}
        onBack={() => setView({ kind: 'login' })}
      />
    )
  }

  if (view.kind === 'request') {
    if (application !== null) {
      // Interim handoff (task 3/4): the draft survives here until 08-04's
      // ProspectApplicationPage consumes it. No request was submitted yet.
      return (
        <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
            <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">
              Aplicação iniciada
            </h1>
            <p className="mt-2 text-center text-sm text-muted">
              {application.nickname} · {application.char_class} · {application.char_function}
            </p>
            <p className="mt-2 text-center text-sm text-muted">
              O envio dos status será concluído no formulário completo.
            </p>
            <button
              type="button"
              onClick={() => {
                setApplication(null)
                setView({ kind: 'login' })
              }}
              className="mt-6 h-11 w-full rounded-md border border-line text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Voltar para o login
            </button>
          </div>
        </main>
      )
    }
    return (
      <RequestAccessPage
        initialHandle={view.handle}
        onBack={() => setView({ kind: 'login' })}
        onStartApplication={setApplication}
      />
    )
  }

  return (
    <LoginPage
      onLogin={setSession}
      onFirstAccess={(handle) => {
        setApplication(null)
        setView({ kind: 'first-access', handle })
      }}
      onRequestAccess={() => {
        setApplication(null)
        setView({ kind: 'request' })
      }}
    />
  )
}
