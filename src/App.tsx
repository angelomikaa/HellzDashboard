import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import hellzMark from './assets/hellz-mark.svg'
import { clearSession, type NeoFootSession } from './features/auth/session'
import { RequireAuth } from './features/auth/RequireAuth'
import { CharactersPage } from './features/admin/CharactersPage'
import { KeyStatsPage } from './features/admin/KeyStatsPage'
import { ValidacoesPage } from './features/admin/ValidacoesPage'
import { RankPage } from './features/rank/RankPage'
import { SubmitPage } from './features/submit/SubmitPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { InicioPage } from './features/dashboard/InicioPage'
import { PageErrorBoundary } from './features/shell/PageErrorBoundary'
import { pendingTotal, usePendingValidations } from './features/shell/usePendingValidations'
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
  | 'inicio'
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
  // HOME-01 (Phase 10) + owner correction 2026-10-25 (round 9): Início is the
  // guild landing page and sits LEFTMOST in the nav, but members land on
  // PAINEL — the panel is the first screen (the owner's words: "the panel is
  // the first screen the user sees when logged in, meaning he starts
  // navigation on the second tab, not the first one"). Início is the second
  // tab; the personal stats that used to sit over its carousel are gone.
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
        // Início (Phase 10, HOME-01 + round 9): the guild landing page —
        // the Impecáveis showcase, identical for members and visitors (the
        // redundant personal blocks were removed by owner correction
        // 2026-10-25).
        const showInicio = tab === 'inicio'

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
                    {/* Round 9: Início is the leftmost tab (owner), but the
                        landing tab after login is Painel — the second
                        button. */}
                    <button
                      type="button"
                      onClick={() => setTab('inicio')}
                      aria-current={showInicio ? 'page' : undefined}
                      className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        showInicio ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
                      }`}
                    >
                      Início
                    </button>
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
                    {isStaff && (
                      <ValidacoesTab
                        session={session}
                        active={showValidacoes}
                        onSelect={() => setTab('validacoes')}
                      />
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
                </nav>                <main className="flex-1">
                  {/* LAYT-01 (07.2 D-21): the ONE breakpoint system — the shell
                      widens for data views (max-w-6xl, xl:max-w-7xl). Pages that
                      need a scannable column (submit wizard, login) cap
                      themselves internally. */}
                  <div className="mx-auto w-full max-w-6xl px-4 py-6 xl:max-w-7xl">
                    {/* Page errors stay inside the content region: without this
                        boundary a render throw in one page unmounted the whole
                        shell (blank screen, no nav). Keyed by tab so switching
                        tabs (or "Tentar novamente") resets it. */}
                    <PageErrorBoundary key={tab}>
                      {showValidacoes ? (
                        <ValidacoesPage session={session} />
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
                      ) : showInicio ? (
                        <InicioPage />
                      ) : (
                        <DashboardPage
                          session={session}
                          onNavigate={setTab}
                          identityName={identityName}
                        />
                      )}
                    </PageErrorBoundary>
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

/**
 * The Validações nav button with its round-9 notification badge (owner
 * 2026-10-25: officers "need to blindly check the tab to see if something
 * new arrived"). A component (not inline JSX) so the polling hook lives in
 * a proper component context; only mounted for staff sessions, so the poll
 * never runs for members. The nav button is always mounted for staff on
 * EVERY tab, which makes it the right home for the whole notification
 * surface:
 *
 *   - the BADGE pill: all three pending queues summed (submissions +
 *     identity proofs + requests — 0031), animate-pulse is the "ping"
 *     (killed by prefers-reduced-motion), count in the aria-label, 9+ cap;
 *   - the TOAST (portal to body): fires when a poll INCREASES the total —
 *     "ping officers", the owner's words — with a Ver button that jumps to
 *     Validações; auto-dismisses after 8s;
 *   - the TAB TITLE count "(N) " — the only affordance that reads while
 *     the browser tab is parked in the background (where the browser
 *     throttles the poll to ~1/min anyway).
 */
function ValidacoesTab({
  session,
  active,
  onSelect,
}: {
  session: NeoFootSession
  active: boolean
  onSelect: () => void
}) {
  const { counts, ping, clearPing } = usePendingValidations(session, true)
  const total = pendingTotal(counts)

  // (N) title prefix while anything is pending — restored to the app's own
  // title at zero (and by the cleanup on unmount/logout).
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '')
    document.title = total > 0 ? `(${total}) ${base}` : base
    return () => {
      document.title = base
    }
  }, [total])

  // Auto-dismiss the toast; the Ver button clears early.
  useEffect(() => {
    if (ping === null) return
    const timer = window.setTimeout(clearPing, 8_000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [ping, clearPing])

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        aria-label={
          total > 0 ? `Validações — ${total} pendente${total === 1 ? '' : 's'}` : 'Validações'
        }
        className={`inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          active ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
        }`}
      >
        Validações
        {total > 0 && (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-accent px-1 text-xs font-bold leading-none text-accent-foreground"
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>
      {ping !== null &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-lg"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground"
            >
              {ping > 9 ? '9+' : ping}
            </span>
            <p className="text-sm text-content">
              {ping === 1
                ? 'Nova validação pendente'
                : `${ping} novas validações pendentes`}
            </p>
            <button
              type="button"
              onClick={() => {
                clearPing()
                onSelect()
              }}
              className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Ver
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}

export default App
