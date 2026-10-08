import { clearSession } from './features/auth/session'
import { RequireAuth } from './features/auth/RequireAuth'

const ROLE_LABELS: Record<'member' | 'officer' | 'owner', string> = {
  member: 'Membro',
  officer: 'Oficial',
  owner: 'Proprietário',
}

function App() {
  // D-06: logout is one click, no confirmation — clearSession() wipes the stored
  // session and invalidate() drops RequireAuth back to LoginPage.
  function handleLogout(invalidate: () => void) {
    clearSession()
    invalidate()
  }

  return (
    <RequireAuth>
      {({ session, invalidate }) => (
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
          <main className="flex flex-1 items-center justify-center px-4">
            <p className="text-center text-base text-muted">
              O painel de status está em construção — as próximas telas chegam em breve.
            </p>
          </main>
        </div>
      )}
    </RequireAuth>
  )
}

export default App
