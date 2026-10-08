import { useState, type ReactNode } from 'react'
import { LoginPage } from './LoginPage'
import { clearSession, isExpired, loadSession, type NeoFootSession } from './session'

export interface AuthContext {
  session: NeoFootSession
  /** Drops the guard back to LoginPage without touching storage (logout calls clearSession first). */
  invalidate: () => void
}

// Route guard — UX ONLY by design (T-01-08): real enforcement is RLS server-side
// (Plan 01-02). D-06: expired sessions are cleared silently on mount — no banner,
// no toast, straight to LoginPage.
export function RequireAuth({ children }: { children: (auth: AuthContext) => ReactNode }) {
  const [session, setSession] = useState<NeoFootSession | null>(() => {
    const stored = loadSession()
    if (stored && isExpired(stored)) {
      clearSession() // D-06: silent expiry
      return null
    }
    return stored
  })

  if (!session) return <LoginPage onLogin={setSession} />

  return <>{children({ session, invalidate: () => setSession(null) })}</>
}
