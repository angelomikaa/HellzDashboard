// PublicLanding — the unauthenticated face of the app (Phase 10, owner
// decision 2026-10-24: Início is a landing page "that can be seen when a
// visitor arrives and also visible to logged in users").
//
// Before this, opening the site dropped straight onto the login card and the
// showcase was members-only. Now a visitor lands on the same Início page a
// member sees, minus the personal blocks: the Impecáveis carousel is fetched
// with the anon-callable get_promotion_public RPC (0029), and the header
// offers the two doors in — Entrar (existing nickname + PIN login) and
// Solicitar acesso (existing request wizard).
//
// No data access is widened here beyond the deliberate showcase: this shell
// never renders member data of its own and never sees a session.
import hellzMark from '../../assets/hellz-mark.svg'
import { InicioPage } from '../dashboard/InicioPage'
import { PageErrorBoundary } from './PageErrorBoundary'

export function PublicLanding({
  onLogin,
  onRequestAccess,
}: {
  onLogin: () => void
  onRequestAccess: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col bg-dominant backdrop-neon-grid text-content">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <img src={hellzMark} alt="" aria-hidden="true" className="h-7 w-7 shrink-0" />
          <span className="font-display text-base font-semibold text-content">Hellz</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRequestAccess}
            className="h-11 rounded-md border border-line px-3 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Solicitar acesso
          </button>
          <button
            type="button"
            onClick={onLogin}
            className="h-11 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Entrar
          </button>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 xl:max-w-7xl">
          {/* Same containment as the authenticated shell: a broken showcase
              must never blank the whole landing. */}
          <PageErrorBoundary>
            <InicioPage />
          </PageErrorBoundary>
        </div>
      </main>
    </div>
  )
}
