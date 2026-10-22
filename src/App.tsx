import { useEffect, useState, type ReactNode } from 'react'
import hellzMark from './assets/hellz-mark.svg'
import { clearSession, type NeoFootSession } from './features/auth/session'
import { RequireAuth } from './features/auth/RequireAuth'
import { CharactersPage } from './features/admin/CharactersPage'
import { KeyStatsPage } from './features/admin/KeyStatsPage'
import { ValidacoesPage } from './features/admin/ValidacoesPage'
import { RankPage } from './features/rank/RankPage'
import { HighlightsPage } from './features/highlights/HighlightsPage'
import { SubmitPage } from './features/submit/SubmitPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { fetchMyIdentity } from './lib/api'

const ROLE_LABELS: Record<'member' | 'officer' | 'owner', string> = {
  member: 'Membro',
  officer: 'Oficial',
  owner: 'Proprietário',
}

// Exported for DashboardPage's type-only import (erased at build — no
// runtime cycle: App imports the page's value, the page imports only the
// Tab union as a type).
export type Tab =
  | 'painel'
  | 'submit'
  | 'validacoes'
  | 'destaques'
  | 'characters'
  | 'keystats'
  | 'ranking'

/**
 * Coalesced identity for the shell (08-08, UAT test 4): the header greeting and
 * the Painel card show the newest validated nickname, not the registry row the
 * session JWT was minted with. my_identity() is member-pinned and returns the
 * same coalesce the officer-validated identity uses; a failed read degrades to
 * the session name so the shell never blocks on it. Mounted once per session
 * (App keys it by access_token), mirroring the pages' mount-only fetch pattern.
 */
function IdentityName({
  session,
  children,
}: {
  session: NeoFootSession
  children: (displayName: string) => ReactNode
}) {
  const [displayName, setDisplayName] = useState(session.display_name)

  useEffect(() => {
    let cancelled = false
    fetchMyIdentity(session)
      .then((identity) => {
        if (!cancelled) setDisplayName(identity.display_name)
      })
      .catch(() => {
        // Stale session name is the safe fallback — never break the shell.
      })
    return () => {
      cancelled = true
    }
  }, [session])

  return <>{children(displayName)}</>
}

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
        // staff buttons, but enforcement is the staff RLS policies / RPC
        // internal gates — a tampered client is refused server-side. Every
        // show* flag is also a content re-check covering a staff tab lingering
        // after a logout/login switch on the same browser (App stays mounted
        // across sessions); the new Validações staff tab follows the same
        // UX-only gate + content re-check pattern (T-06-01).
        const isStaff =
          session.member_role === 'officer' || session.member_role === 'owner'
        const showCharacters = tab === 'characters' && isStaff
        // Stats-Chave (03-04): same pattern — UX-only tab gating with a
        // content-level re-check. Enforcement is the staff RLS policy + the
        // internal gates in the 0009 RPCs; a member session never receives
        // key-stat data even if a staff tab lingers across logout/login.
        const showKeyStats = tab === 'keystats' && isStaff
        // Validações (06-04): same UX-only staff gate + content re-check —
        // enforcement is the officer_queue/set_submission_status RPC staff
        // gates (0011); a member session never receives queue data.
        const showValidacoes = tab === 'validacoes' && isStaff
        // Ranking (07.2-04, RANK-02): same UX-only staff gate + content
        // re-check — enforcement is role_rank's internal staff gate inside
        // the 0013 SECURITY DEFINER RPC (member JWT raises 'forbidden',
        // smoke-proven in 07.2-01); a member session never receives rank
        // data even if a staff tab lingers across logout/login (D-20).
        const showRanking = tab === 'ranking' && isStaff
        // Enviar Status is for EVERY role (members submit their own stats).
        const showSubmit = tab === 'submit'
        // Destaques (06-04): every logged-in member — celebration is the point
        // (D-12); mirrors showSubmit with no role condition. Enforcement is
        // the member-invocable get_promotion RPC.
        const showHighlights = tab === 'destaques'

        return (
          <IdentityName key={session.access_token} session={session}>
            {(identityName) => (
              <div className="flex min-h-screen flex-col bg-dominant backdrop-neon-grid text-content">
                <header className="flex items-center justify-between border-b border-line px-4 py-3">
                  <div className="flex items-center gap-2">
                    <img src={hellzMark} alt="" aria-hidden="true" className="h-7 w-7 shrink-0" />
                    <span className="text-base text-content">Olá, {identityName}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-muted">
                      {ROLE_LABELS[session.member_role]}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLogout(invalidate)}
                    className="h-11 rounded-md border border-line px-4 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Sair
                  </button>
                </header>
                <nav aria-label="Seções" className="border-b border-line">
                  <div className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 xl:max-w-7xl">
                    <button
                      type="button"
                      onClick={() => setTab('painel')}
                      aria-current={tab === 'painel' ? 'page' : undefined}
                      className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        tab === 'painel' ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
                      }`}
                    >
                      Painel
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('submit')}
                      aria-current={showSubmit ? 'page' : undefined}
                      className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        showSubmit ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
                      }`}
                    >
                      Enviar Status
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('destaques')}
                      aria-current={showHighlights ? 'page' : undefined}
                      className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        showHighlights ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
                      }`}
                    >
                      Destaques
                    </button>
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => setTab('validacoes')}
                        aria-current={showValidacoes ? 'page' : undefined}
                        className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          showValidacoes ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
                        }`}
                      >
                        Validações
                      </button>
                    )}
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => setTab('characters')}
                        aria-current={showCharacters ? 'page' : undefined}
                        className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          showCharacters ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
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
                        className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          showKeyStats ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
                        }`}
                      >
                        Stats-Chave
                      </button>
                    )}
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => setTab('ranking')}
                        aria-current={showRanking ? 'page' : undefined}
                        className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          showRanking ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
                        }`}
                      >
                        Ranking
                      </button>
                    )}
                  </div>
                </nav>
                <main className="flex-1">
                  {/* LAYT-01 (07.2 D-21): the ONE breakpoint system — the shell
                      widens for data views (max-w-6xl, xl:max-w-7xl). Pages that
                      need a scannable column (submit wizard, login) cap
                      themselves internally. */}
                  <div className="mx-auto w-full max-w-6xl px-4 py-6 xl:max-w-7xl">
                    {showValidacoes ? (
                      <ValidacoesPage session={session} />
                    ) : showHighlights ? (
                      <HighlightsPage session={session} />
                    ) : showCharacters ? (
                      <CharactersPage session={session} />
                    ) : showKeyStats ? (
                      <KeyStatsPage session={session} />
                    ) : showRanking ? (
                      // Content re-check: showRanking re-evaluates isStaff, so a
                      // lingering staff tab across a logout/login switch renders
                      // nothing for a member (App-stays-mounted lesson).
                      <RankPage session={session} />
                    ) : showSubmit ? (
                      <SubmitPage session={session} />
                    ) : (
                      <DashboardPage
                        session={session}
                        onNavigate={setTab}
                        identityName={identityName}
                      />
                    )}
                  </div>
                </main>
              </div>
            )}
          </IdentityName>
        )
      }}
    </RequireAuth>
  )
}

export default App
