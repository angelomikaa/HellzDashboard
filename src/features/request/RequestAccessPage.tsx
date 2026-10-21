// RequestAccessPage — INTERIM shell created in 08-03 task 3 so the guard can
// render the `request` view without changing the session semantics. Task 4 of
// this plan replaces this file with the full chooser + identity form; 08-04
// consumes the prospect handoff draft.
import type { CharFunction } from '../submit/identity'

/** Prospect handoff payload: the wizard of 08-04 adds stats and submits. */
export interface ProspectDraft {
  handle: string
  pin: string
  char_id: string
  nickname: string
  char_class: string
  char_function: CharFunction
  proof_data_url: string
}

export interface RequestAccessPageProps {
  initialHandle?: string
  onBack: () => void
  onStartApplication: (draft: ProspectDraft) => void
}

export function RequestAccessPage({ onBack }: RequestAccessPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6">
        <h1 className="text-center text-2xl font-bold leading-[1.2] text-content">
          Solicitar acesso
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          O formulário de solicitação está sendo preparado.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 h-11 w-full rounded-md border border-line text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Voltar
        </button>
      </div>
    </main>
  )
}
