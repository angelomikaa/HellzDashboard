// RequestStatusPage — handle-only lookup (08-03 task 4, T-08-21).
//
// Shows EXACTLY status/type/dates: fetchRequestStatus strips everything else,
// and this page has no identity fields to render even if a payload drifted.
import { useState, type FormEvent } from 'react'
import { fetchRequestStatus, FunctionError, type RequestStatus } from '../../lib/api'
import { REQUEST_HANDLE_ERROR, statusView } from './requestFlow'

export interface RequestStatusPageProps {
  initialHandle?: string
  onBack: () => void
}

type Lookup =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: RequestStatus | null }
  | { kind: 'error'; message: string }

export function RequestStatusPage({ initialHandle = '', onBack }: RequestStatusPageProps) {
  const [handle, setHandle] = useState(initialHandle)
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' })
  const loading = lookup.kind === 'loading'

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (loading) return
    if (handle.trim() === '') {
      setLookup({ kind: 'error', message: REQUEST_HANDLE_ERROR })
      return
    }
    setLookup({ kind: 'loading' })
    try {
      const result = await fetchRequestStatus(handle.trim())
      setLookup({ kind: 'done', result })
    } catch (err) {
      setLookup({
        kind: 'error',
        message:
          err instanceof FunctionError && err.code === 'network'
            ? 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
            : 'Não foi possível consultar a solicitação. Tente novamente.',
      })
    }
  }

  const view = lookup.kind === 'done' ? statusView(lookup.result) : null

  return (
    <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
        <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">
          Consultar solicitação
        </h1>
        <p className="mt-1 text-center text-sm font-medium text-muted">
          Informe o handle usado no pedido.
        </p>
        <div aria-hidden="true" className="mx-auto mb-6 mt-4 h-px w-16 bg-line" />

        <form onSubmit={handleSubmit} noValidate autoComplete="off" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="status-handle" className="text-sm font-semibold text-content">
              Usuário do Discord
            </label>
            <input
              id="status-handle"
              type="text"
              autoComplete="off"
              maxLength={64}
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              disabled={loading}
              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
        </form>

        {lookup.kind === 'error' && (
          <p role="alert" className="mt-4 text-sm font-semibold text-destructive">
            {lookup.message}
          </p>
        )}

        {view !== null && (
          <div
            aria-live="polite"
            className="mt-4 rounded-md border border-line bg-dominant px-3 py-3"
          >
            <p className="text-base font-semibold text-content">{view.title}</p>
            {view.detail !== null && <p className="mt-1 text-sm text-muted">{view.detail}</p>}
          </div>
        )}

        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Voltar
        </button>
      </div>
    </main>
  )
}
