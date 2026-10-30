import { lazy, Suspense, useState, type ReactNode } from 'react'
import type { ProspectDraft } from '../request/RequestAccessPage'
import { PublicLanding } from '../shell/PublicLanding'
import { LoginPage } from './LoginPage'
import { clearSession, isExpired, loadSession, type NeoFootSession } from './session'

// The request and first-access flows are code-split: a returning member logs
// in and never needs them, so their modules load on first use.
const FirstAccessPage = lazy(() =>
  import('./FirstAccessPage').then((m) => ({ default: m.FirstAccessPage })),
)
const RequestAccessPage = lazy(() =>
  import('../request/RequestAccessPage').then((m) => ({ default: m.RequestAccessPage })),
)
const ProspectApplicationPage = lazy(() =>
  import('../request/ProspectApplicationPage').then((m) => ({
    default: m.ProspectApplicationPage,
  })),
)

const VIEW_LOADING = <p className="p-6 text-center text-base text-muted">Carregando…</p>

export interface AuthContext {
  session: NeoFootSession
  /** Drops the guard back to the landing page without touching storage (logout calls clearSession first). */
  invalidate: () => void
}

/** Unauthenticated views (08-03/08-04; Phase 10 landing). The PUBLIC LANDING
 *  is the default — Início is the guild's landing page, so a visitor sees the
 *  showcase before choosing Entrar. The application view keeps the confirmed
 *  request draft in memory only. */
export type AuthView =
  | { kind: 'landing' }
  | { kind: 'login' }
  | { kind: 'first-access'; handle?: string }
  | { kind: 'request'; handle?: string; requestId?: string }
  | { kind: 'application'; draft: ProspectDraft }

export interface RequireAuthProps {
  children: (auth: AuthContext) => ReactNode
  /** Test seam (node-env Vitest cannot click through the view machine):
   *  renders a specific unauthenticated view. Production never passes it. */
  initialView?: AuthView
}

// Route guard — UX ONLY by design (T-01-08): real enforcement is RLS server-side
// (Plan 01-02). D-06: expired sessions are cleared silently on mount — no banner,
// no toast, straight to LoginPage.
//
// Phase 8 (08-03/08-04): the unauthenticated screen is a small view machine.
// Phase 10: login is nickname + PIN, so login only OPENS first access (409
// pin_setup_required or the explicit entry link) — never a session. 0034
// manual first access: the identity is TYPED by the player and validated by an
// OFFICER (no print), so first access returns to the login, not to a session.
// The request probe still hands its typed handle over for prefill. The
// prospect handoff keeps the draft in memory only (no session, nothing
// persisted — T-08-20): 08-04 renders the full-stats application wizard, and a
// successful prospect submit returns to the request view's success panel with
// its protocol.
export function RequireAuth({ children, initialView }: RequireAuthProps) {
  const [session, setSession] = useState<NeoFootSession | null>(() => {
    const stored = loadSession()
    if (stored && isExpired(stored)) {
      clearSession() // D-06: silent expiry
      return null
    }
    return stored
  })
  const [view, setView] = useState<AuthView>(initialView ?? { kind: 'landing' })

  // Logout / invalidation returns to the PUBLIC LANDING (Início), not the login
  // card: visitors and ex-members both see the showcase, and Entrar is one
  // click away. An expired session on mount lands there too (view default).
  function invalidate() {
    setView({ kind: 'landing' })
    setSession(null)
  }

  if (session) return <>{children({ session, invalidate })}</>

  if (view.kind === 'landing') {
    return (
      <PublicLanding
        onLogin={() => setView({ kind: 'login' })}
        onRequestAccess={() => setView({ kind: 'request' })}
      />
    )
  }

  if (view.kind === 'first-access') {
    return (
      <Suspense fallback={VIEW_LOADING}>
        <FirstAccessPage initialHandle={view.handle} onBack={() => setView({ kind: 'login' })} />
      </Suspense>
    )
  }

  if (view.kind === 'application') {
    return (
      <Suspense fallback={VIEW_LOADING}>
        <ProspectApplicationPage
          draft={view.draft}
          onBack={() => setView({ kind: 'request', handle: view.draft.handle })}
          onSubmitted={(requestId) =>
            setView({ kind: 'request', handle: view.draft.handle, requestId })
          }
        />
      </Suspense>
    )
  }

  if (view.kind === 'request') {
    return (
      <Suspense fallback={VIEW_LOADING}>
        <RequestAccessPage
          initialHandle={view.handle}
          initialRequestId={view.requestId}
          onBack={() => setView({ kind: 'landing' })}
          onStartApplication={(draft) => setView({ kind: 'application', draft })}
          onFirstAccess={(handle) => setView({ kind: 'first-access', handle })}
        />
      </Suspense>
    )
  }

  return (
    <LoginPage
      onLogin={setSession}
      onFirstAccess={() => setView({ kind: 'first-access' })}
      onRequestAccess={() => setView({ kind: 'request' })}
      onBack={() => setView({ kind: 'landing' })}
    />
  )
}
