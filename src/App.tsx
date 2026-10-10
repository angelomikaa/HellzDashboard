import { useState } from 'react'
import { clearSession } from './features/auth/session'
import { RequireAuth } from './features/auth/RequireAuth'
import { CharactersPage } from './features/admin/CharactersPage'
import { KeyStatsPage } from './features/admin/KeyStatsPage'
import { SubmitPage } from './features/submit/SubmitPage'

const ROLE_LABELS: Record<'member' | 'officer' | 'owner', string> = {
  member: 'Membro',
  officer: 'Oficial',
  owner: 'Proprietário',
}

type Tab = 'painel' | 'submit' | 'characters' | 'keystats'

function App() {
  const [tab, setTab] = useState<Tab>('painel')

  // D-06: logout is one click, no confirmation — clearSession() wipes the stored
  // session and invalidate() drops RequireAuth back to LoginPage.
  function handleLogout(invalidate: () => void) {
    clearSession()
    invalidate()
  }

  return (
    <RequireAuth>
      {({ session, invalidate }) => {
        // Tab visibility is UX-ONLY gating (T-02-09): members never see the
        // Personagens button, but enforcement is the staff RLS policies from
        // 02-01 — a tampered client is refused server-side. The showCharacters
        // fallback also covers a staff tab lingering after a logout/login
        // switch on the same browser (App stays mounted across sessions).
        const isStaff =
          session.member_role === 'officer' || session.member_role === 'owner'
        const showCharacters = tab === 'characters' && isStaff
        // Stats-Chave (03-04): same pattern — UX-only tab gating with a
        // content-level re-check. Enforcement is the staff RLS policy + the
        // internal gates in the 0009 RPCs; a member session never receives
        // key-stat data even if a staff tab lingers across logout/login.
        const showKeyStats = tab === 'keystats' && isStaff
        // Enviar Status is for EVERY role (members submit their own stats).
        const showSubmit = tab === 'submit'

        return (
          <div className="flex min-h-screen flex-col bg-dominant text-content">
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-base text-content">Olá, {session.display_name}</span>
                <span className="rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-muted">
                  {ROLE_LABELS[session.member_role]}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleLogout(invalidate)}
                className="h-11 rounded-md border border-line px-4 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Sair
              </button>
            </header>
            <nav aria-label="Seções" className="border-b border-line">
              <div className="mx-auto flex w-full max-w-3xl gap-1 overflow-x-auto px-4">
                <button
                  type="button"
                  onClick={() => setTab('painel')}
                  aria-current={tab === 'painel' ? 'page' : undefined}
                  className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    tab === 'painel' ? 'border-accent text-content' : 'border-transparent text-muted'
                  }`}
                >
                  Painel
                </button>
                <button
                  type="button"
                  onClick={() => setTab('submit')}
                  aria-current={showSubmit ? 'page' : undefined}
                  className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    showSubmit ? 'border-accent text-content' : 'border-transparent text-muted'
                  }`}
                >
                  Enviar Status
                </button>
                {isStaff && (
                  <button
                    type="button"
                    onClick={() => setTab('characters')}
                    aria-current={showCharacters ? 'page' : undefined}
                    className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      showCharacters ? 'border-accent text-content' : 'border-transparent text-muted'
                    }`}
                  >
                    Personagens
                  </button>
                )}
                {isStaff && (
                  <button
                    type="button"
                    onClick={() => setTab('keystats')}
                    aria-current={showKeyStats ? 'page' : undefined}
                    className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      showKeyStats ? 'border-accent text-content' : 'border-transparent text-muted'
                    }`}
                  >
                    Stats-Chave
                  </button>
                )}
              </div>
            </nav>
            <main className="flex-1">
              <div className="mx-auto w-full max-w-3xl px-4 py-6">
                {showCharacters ? (
                  <CharactersPage session={session} />
                ) : showKeyStats ? (
                  <KeyStatsPage session={session} />
                ) : showSubmit ? (
                  <SubmitPage session={session} />
                ) : (
                  <p className="pt-16 text-center text-base text-muted">
                    O painel de status está em construção — as próximas telas chegam em breve.
                  </p>
                )}
              </div>
            </main>
          </div>
        )
      }}
    </RequireAuth>
  )
}

export default App
