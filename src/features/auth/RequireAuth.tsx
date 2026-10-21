import { useState, type ReactNode } from 'react'
import { RequestAccessPage, type ProspectDraft } from '../request/RequestAccessPage'
import { ProspectApplicationPage } from '../request/ProspectApplicationPage'
import { FirstAccessPage } from './FirstAccessPage'
import { LoginPage } from './LoginPage'
import { clearSession, isExpired, loadSession, type NeoFootSession } from './session'

export interface AuthContext {
  session: NeoFootSession
  /** Drops the guard back to LoginPage without touching storage (logout calls clearSession first). */
  invalidate: () => void
}

/** Unauthenticated views (08-03/08-04): login is the default. The
 *  application view keeps the confirmed request draft in memory only. */
export type AuthView =
  | { kind: 'login' }
  | { kind: 'first-access'; handle: string }
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
// Login hands a typed handle to first access (409 pin_setup_required or the
// explicit entry link) and opens the request surface. The prospect handoff
// keeps the draft in memory only (no session, nothing persisted — T-08-20):
// 08-04 renders the full-stats application wizard, and a successful prospect
// submit returns to the request view's success panel with its protocol.
export function RequireAuth({ children, initialView }: RequireAuthProps) {
  const [session, setSession] = useState<NeoFootSession | null>(() => {
    const stored = loadSession()
    if (stored && isExpired(stored)) {
      clearSession() // D-06: silent expiry
      return null
    }
    return stored
  })
  const [view, setView] = useState<AuthView>(initialView ?? { kind: 'login' })

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

  if (view.kind === 'application') {
    return (
      <ProspectApplicationPage
        draft={view.draft}
        onBack={() => setView({ kind: 'request', handle: view.draft.handle })}
        onSubmitted={(requestId) =>
          setView({ kind: 'request', handle: view.draft.handle, requestId })
        }
      />
    )
  }

  if (view.kind === 'request') {
    return (
      <RequestAccessPage
        initialHandle={view.handle}
        initialRequestId={view.requestId}
        onBack={() => setView({ kind: 'login' })}
        onStartApplication={(draft) => setView({ kind: 'application', draft })}
        onFirstAccess={(handle) => setView({ kind: 'first-access', handle })}
      />
    )
  }

  return (
    <LoginPage
      onLogin={setSession}
      onFirstAccess={(handle) => setView({ kind: 'first-access', handle })}
      onRequestAccess={() => setView({ kind: 'request' })}
    />
  )
}
