// Personagens — officer/owner character registry (02-UI-SPEC Screen 2).
// The tab itself is UX-only gating (AGENTS.md / T-02-09): enforcement is the
// staff RLS policies from 02-01 — a member's tampered client gets only their
// own row back and every write is refused server-side. This page consumes
// ONLY the explicit safe projection in api.ts: the PIN hash column is
// ungranted at the DB (migration 0005), so it can never appear in any
// payload this file touches — and it is never named or referenced here.
// The edit form likewise sends ONLY {display_name, char_class,
// char_function} (T-02-10): the column grants make every other column
// unwritable even for a crafted request.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  createClass,
  fetchClasses,
  fetchMembers,
  updateCharacter,
  type MemberRow,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'

// Enumeration-safe pt-BR copy (UI contract): never expose HTTP codes, gateway
// internals, or which check failed.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Falha ao salvar — tente novamente.'
const ADD_CLASS_ERROR = 'Não foi possível adicionar. Verifique a conexão.'

const ROLE_LABELS: Record<'member' | 'officer' | 'owner', string> = {
  member: 'Membro',
  officer: 'Oficial',
  owner: 'Proprietário',
}

const FUNCTION_LABELS: Record<'dps' | 'tank', string> = {
  dps: 'DPS',
  tank: 'Tank',
}

// In-edit draft for one member row (REG-01). charClass '' is the display-only
// '—' option: saving is blocked client-side — a character must have a class.
interface Draft {
  memberId: string
  displayName: string
  charClass: string
  charFunction: 'dps' | 'tank'
}

type AddClassState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; name: string }
  | { kind: 'error' }

export function CharactersPage({ session }: { session: NeoFootSession }) {
  const [data, setData] = useState<{ members: MemberRow[]; classes: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Add-class form (REG-02)
  const [newClassName, setNewClassName] = useState('')
  const [addClassState, setAddClassState] = useState<AddClassState>({ kind: 'idle' })

  // Inline edit (REG-01) — a single row is editable at a time.
  const [draft, setDraft] = useState<Draft | null>(null)
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [savedRowId, setSavedRowId] = useState<string | null>(null)
  const [saveErrorRowId, setSaveErrorRowId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [members, classes] = await Promise.all([fetchMembers(session), fetchClasses(session)])
    setData({ members, classes })
  }, [session])

  useEffect(() => {
    let cancelled = false
    load().catch((err: unknown) => {
      if (cancelled) return
      setError(
        err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
      )
    })
    return () => {
      cancelled = true
    }
  }, [load])

  // Any in-flight request disables every CTA on the page.
  const busy = addClassState.kind === 'saving' || savingRowId !== null

  async function handleAddClass(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newClassName.trim()
    if (name === '' || busy) return
    setAddClassState({ kind: 'saving' })
    try {
      await createClass(session, name)
      setNewClassName('')
      setAddClassState({ kind: 'saved', name })
      // Refresh the dropdown so the new class is immediately selectable. A
      // refresh failure keeps the stale list — the insert itself succeeded.
      try {
        const classes = await fetchClasses(session)
        setData((d) => (d ? { ...d, classes } : d))
      } catch {
        /* stale dropdown; success copy still shown */
      }
    } catch {
      setAddClassState({ kind: 'error' })
    }
  }

  function startEdit(member: MemberRow) {
    setSavedRowId(null)
    setSaveErrorRowId(null)
    setDraft({
      memberId: member.id,
      displayName: member.display_name,
      charClass: member.char_class ?? '',
      charFunction: member.char_function,
    })
  }

  async function handleSave() {
    if (draft === null || busy) return
    const memberId = draft.memberId
    const displayName = draft.displayName.trim()
    // A character must have a class: the '—' option is display-only.
    if (displayName === '' || draft.charClass === '') return
    setSavingRowId(memberId)
    setSaveErrorRowId(null)
    try {
      await updateCharacter(session, memberId, {
        display_name: displayName,
        char_class: draft.charClass,
        char_function: draft.charFunction,
      })
      setDraft(null)
      setSavedRowId(memberId)
      // Refresh the member list so the change persists on screen. A refresh
      // failure keeps the stale rows — the save itself succeeded.
      try {
        await load()
      } catch {
        /* stale table; Salvo. still shown */
      }
    } catch {
      setSaveErrorRowId(memberId)
    } finally {
      setSavingRowId(null)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="text-xl font-semibold text-content">Personagens</h2>
      <p className="mt-1 text-sm text-muted">Registre nome, classe e função de cada membro.</p>

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : data === null ? (
        <p className="mt-6 text-base text-muted">Carregando…</p>
      ) : (
        <>
          {/* Add-class form (REG-02) */}
          <form onSubmit={handleAddClass} noValidate className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <label htmlFor="new-class" className="text-sm font-semibold text-content">
                Nova classe
              </label>
              <input
                id="new-class"
                type="text"
                autoComplete="off"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                disabled={busy}
                className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={busy || newClassName.trim() === ''}
              className="h-11 shrink-0 rounded-md border border-line px-4 text-base font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Adicionar Classe
            </button>
          </form>
          {addClassState.kind === 'saved' && (
            <p className="mt-2 text-sm font-semibold text-success">{`Classe "${addClassState.name}" adicionada.`}</p>
          )}
          {addClassState.kind === 'error' && (
            <p
              role="alert"
              aria-live="polite"
              className="mt-2 text-sm font-semibold text-destructive"
            >
              {ADD_CLASS_ERROR}
            </p>
          )}

          {data.members.length === 0 ? (
            <p className="mt-6 text-center text-base text-muted">
              Nenhum membro na lista branca ainda.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-sm font-semibold text-muted">
                    <th scope="col" className="py-2 pr-4">
                      Personagem
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Discord
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Papel
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Classe
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Função
                    </th>
                    <th scope="col" className="py-2">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((member) => {
                    const editing = draft?.memberId === member.id
                    const saving = savingRowId === member.id
                    return (
                      <tr key={member.id} className="border-t border-line" aria-busy={saving}>
                        <td className="py-3 pr-4 text-base text-content">
                          {editing && draft ? (
                            <>
                              <label htmlFor={`edit-name-${member.id}`} className="sr-only">
                                Nome do personagem
                              </label>
                              <input
                                id={`edit-name-${member.id}`}
                                type="text"
                                autoComplete="off"
                                value={draft.displayName}
                                onChange={(e) =>
                                  setDraft({ ...draft, displayName: e.target.value })
                                }
                                disabled={saving}
                                className="h-11 w-full min-w-32 rounded-md border border-line bg-surface px-3 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </>
                          ) : (
                            member.display_name
                          )}
                        </td>
                        <td className="py-3 pr-4 text-sm text-muted">{member.discord_handle}</td>
                        <td className="py-3 pr-4">
                          <span className="rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-muted">
                            {ROLE_LABELS[member.role]}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-base text-content">
                          {editing && draft ? (
                            <>
                              <label htmlFor={`edit-class-${member.id}`} className="sr-only">
                                Classe
                              </label>
                              <select
                                id={`edit-class-${member.id}`}
                                value={draft.charClass}
                                onChange={(e) => setDraft({ ...draft, charClass: e.target.value })}
                                disabled={saving}
                                className="h-11 w-full min-w-32 rounded-md border border-line bg-surface px-3 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {/* Display-only '—' (maps to null); saving with it
                                    selected is blocked client-side above. */}
                                <option value="">—</option>
                                {data.classes.map((className) => (
                                  <option key={className} value={className}>
                                    {className}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            member.char_class ?? '—'
                          )}
                        </td>
                        <td className="py-3 pr-4 text-base text-content">
                          {editing && draft ? (
                            <>
                              <label htmlFor={`edit-function-${member.id}`} className="sr-only">
                                Função
                              </label>
                              <select
                                id={`edit-function-${member.id}`}
                                value={draft.charFunction}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    charFunction: e.target.value === 'tank' ? 'tank' : 'dps',
                                  })
                                }
                                disabled={saving}
                                className="h-11 w-full min-w-24 rounded-md border border-line bg-surface px-3 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="dps">DPS</option>
                                <option value="tank">Tank</option>
                              </select>
                            </>
                          ) : (
                            FUNCTION_LABELS[member.char_function]
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {editing && draft ? (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={
                                  saving || busy || draft.charClass === '' || draft.displayName.trim() === ''
                                }
                                className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Salvar
                              </button>
                              {saveErrorRowId === member.id && (
                                <span
                                  role="alert"
                                  aria-live="polite"
                                  className="text-sm font-semibold text-destructive"
                                >
                                  {SAVE_ERROR}
                                </span>
                              )}
                            </div>
                          ) : savedRowId === member.id ? (
                            <span className="text-sm font-semibold text-success">Salvo.</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(member)}
                              disabled={busy}
                              className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
