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
//
// Staff controls (AUTH-03/AUTH-04, 06-UI-SPEC Surface 3): role/active are
// ungranted for client UPDATE (migration 0005:30–33) — ALL role and
// removal/reactivation writes go through the setMemberRole/setMemberActive
// RPC wrappers; no PATCH path exists or is added. The RPCs re-check the
// target rules server-side (owner-only role changes, officer→member-only
// removal, owner rows untouchable), so the per-viewer rendering below is
// UX-only gating per the house pattern (02-02 precedent). Role changes take
// effect at the next login (D-10) — the success copy says so.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  createClass,
  fetchClasses,
  fetchMembers,
  setMemberActive,
  setMemberRole,
  updateCharacter,
  type MemberRow,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { ConfirmDialog } from './ConfirmDialog'

// Enumeration-safe pt-BR copy (UI contract): never expose HTTP codes, gateway
// internals, or which check failed.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Falha ao salvar — tente novamente.'
const ADD_CLASS_ERROR = 'Não foi possível adicionar. Verifique a conexão.'

// Staff-action feedback copy (06-UI-SPEC Surface 3, locked verbatim).
const ROLE_UPDATED_MESSAGE = 'Papel atualizado. Efetivo no próximo login.'
const MEMBER_REMOVED_MESSAGE = 'Membro removido.'
const MEMBER_REACTIVATED_MESSAGE = 'Membro reativado.'

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

// Per-row feedback for the shared state machine: the success text differs per
// action (edit vs role change vs removal/reactivation), so the row state
// carries its message.
interface RowFeedback {
  id: string
  text: string
}

// A staff action awaiting modal confirmation (06-UI-SPEC Surface 3): role
// grant/revoke is OWNER-only; removal/reactivation is role-differentiated
// (D-08) and the visible buttons already enforce that matrix before the
// dialog ever opens.
type PendingAction =
  | { kind: 'promote'; member: MemberRow }
  | { kind: 'demote'; member: MemberRow }
  | { kind: 'deactivate'; member: MemberRow }
  | { kind: 'activate'; member: MemberRow }

interface ConfirmConfig {
  title: string
  body: string
  confirmLabel: string
  destructive: boolean
}

function confirmConfig(action: PendingAction): ConfirmConfig {
  const name = action.member.display_name
  switch (action.kind) {
    case 'promote':
      return {
        title: 'Conceder papel de oficial',
        body: `${name} se tornará oficial no próximo login.`,
        confirmLabel: 'Conceder oficial',
        destructive: false,
      }
    case 'demote':
      return {
        title: 'Revogar papel de oficial',
        body: `${name} voltará a ser membro no próximo login.`,
        confirmLabel: 'Revogar oficial',
        destructive: false,
      }
    case 'deactivate':
      return {
        title: `Remover ${name}`,
        // The officer-target sentence is appended only in the owner-removing-
        // officer scenario (the officer viewer never reaches this dialog for
        // an officer row).
        body:
          `${name} perderá o acesso ao painel imediatamente e sairá dos ranks. ` +
          'Os envios permanecem salvos e o acesso pode ser restaurado.' +
          (action.member.role === 'officer' ? ' Somente você pode remover oficiais.' : ''),
        confirmLabel: 'Remover',
        destructive: true,
      }
    case 'activate':
      return {
        title: `Reativar ${name}?`,
        body: `${name} voltará a ter acesso ao painel e aos ranks imediatamente.`,
        confirmLabel: 'Reativar',
        destructive: false,
      }
  }
}

export function CharactersPage({ session }: { session: NeoFootSession }) {
  // Role-differentiated controls (D-08). The page itself is staff-only via the
  // App shell nav (UX-only gating; enforcement is the staff RLS policies).
  const isOwner = session.member_role === 'owner'
  const isStaff = isOwner || session.member_role === 'officer'
  const [data, setData] = useState<{ members: MemberRow[]; classes: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Add-class form (REG-02)
  const [newClassName, setNewClassName] = useState('')
  const [addClassState, setAddClassState] = useState<AddClassState>({ kind: 'idle' })

  // Inline edit (REG-01) — a single row is editable at a time. The same
  // per-row state machine + single-flight lock serves the staff controls.
  const [draft, setDraft] = useState<Draft | null>(null)
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [savedRow, setSavedRow] = useState<RowFeedback | null>(null)
  const [saveError, setSaveError] = useState<RowFeedback | null>(null)

  // Staff action awaiting confirm-modal confirmation.
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

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

  // Confirm-modal copy for the pending staff action (null → dialog closed).
  const confirm = pendingAction === null ? null : confirmConfig(pendingAction)

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
    setSavedRow(null)
    setSaveError(null)
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
    setSaveError(null)
    try {
      await updateCharacter(session, memberId, {
        display_name: displayName,
        char_class: draft.charClass,
        char_function: draft.charFunction,
      })
      setDraft(null)
      setSavedRow({ id: memberId, text: 'Salvo.' })
      // Refresh the member list so the change persists on screen. A refresh
      // failure keeps the stale rows — the save itself succeeded.
      try {
        await load()
      } catch {
        /* stale table; Salvo. still shown */
      }
    } catch {
      setSaveError({ id: memberId, text: SAVE_ERROR })
    } finally {
      setSavingRowId(null)
    }
  }

  function openConfirm(action: PendingAction) {
    setSavedRow(null)
    setSaveError(null)
    setPendingAction(action)
  }

  // Staff confirm flow (AUTH-03/AUTH-04): one shared handler — the action
  // kind decides the RPC and the success copy. Errors are enumeration-safe
  // per-row copy; the unauthorized kind maps to the session line. Never
  // expose which RPC check failed.
  async function handleConfirm() {
    if (pendingAction === null || busy) return
    const memberId = pendingAction.member.id
    setSavingRowId(memberId)
    try {
      if (pendingAction.kind === 'promote') {
        await setMemberRole(session, memberId, 'officer')
      } else if (pendingAction.kind === 'demote') {
        await setMemberRole(session, memberId, 'member')
      } else if (pendingAction.kind === 'deactivate') {
        await setMemberActive(session, memberId, false)
      } else {
        await setMemberActive(session, memberId, true)
      }
      const message =
        pendingAction.kind === 'promote' || pendingAction.kind === 'demote'
          ? ROLE_UPDATED_MESSAGE
          : pendingAction.kind === 'deactivate'
            ? MEMBER_REMOVED_MESSAGE
            : MEMBER_REACTIVATED_MESSAGE
      setPendingAction(null)
      setSavedRow({ id: memberId, text: message })
      // Refresh so the role/active change persists on screen. A refresh
      // failure keeps the stale rows — the action itself succeeded.
      try {
        await load()
      } catch {
        /* stale table; success copy still shown */
      }
    } catch (err) {
      setPendingAction(null)
      setSaveError({
        id: memberId,
        text:
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : SAVE_ERROR,
      })
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
                    <th scope="col" className="py-2 pr-4">
                      Controles
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
                      <tr
                        key={member.id}
                        className={`border-t border-line${member.active ? '' : ' opacity-60'}`}
                        aria-busy={saving}
                      >
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
                        {/* Staff Controles column (06-UI-SPEC Surface 3, D-08
                            matrix): owner rows are untouchable for every
                            viewer; officer viewers get controls on member
                            rows only; member-viewer sessions (tampered
                            client) also land on '—'. The RPCs re-check all
                            target rules server-side — this is UX-only. */}
                        <td className="py-3 pr-4">
                          {member.role === 'owner' ? (
                            <span className="text-sm text-muted">—</span>
                          ) : !isStaff || (!isOwner && member.role !== 'member') ? (
                            <span className="text-sm text-muted">—</span>
                          ) : (
                            <div className="flex flex-col items-start gap-1">
                              <div className="flex flex-wrap gap-1">
                                {/* Role buttons — OWNER viewer only
                                    (AUTH-03/D-08); the RPC re-checks the
                                    owner-only gate server-side. */}
                                {isOwner && member.role === 'member' && (
                                  <button
                                    type="button"
                                    onClick={() => openConfirm({ kind: 'promote', member })}
                                    disabled={busy}
                                    className="h-11 rounded-md border border-line px-3 text-sm font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Conceder oficial
                                  </button>
                                )}
                                {isOwner && member.role === 'officer' && (
                                  <button
                                    type="button"
                                    onClick={() => openConfirm({ kind: 'demote', member })}
                                    disabled={busy}
                                    className="h-11 rounded-md border border-line px-3 text-sm font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Revogar oficial
                                  </button>
                                )}
                                {/* Removal/reactivation — owner sees it on
                                    member + officer targets, officers on
                                    member targets only (AUTH-04/D-08). */}
                                {member.active ? (
                                  <button
                                    type="button"
                                    onClick={() => openConfirm({ kind: 'deactivate', member })}
                                    disabled={busy}
                                    className="h-11 rounded-md border border-line px-3 text-sm font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Remover
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openConfirm({ kind: 'activate', member })}
                                    disabled={busy}
                                    className="h-11 rounded-md border border-line px-3 text-sm font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Reativar
                                  </button>
                                )}
                              </div>
                              {savedRow?.id === member.id && (
                                <span aria-live="polite" className="text-sm font-semibold text-success">
                                  {savedRow.text}
                                </span>
                              )}
                              {saveError?.id === member.id && (
                                <span
                                  role="alert"
                                  aria-live="polite"
                                  className="text-sm font-semibold text-destructive"
                                >
                                  {saveError.text}
                                </span>
                              )}
                            </div>
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
                              {saveError?.id === member.id && (
                                <span
                                  role="alert"
                                  aria-live="polite"
                                  className="text-sm font-semibold text-destructive"
                                >
                                  {saveError.text}
                                </span>
                              )}
                            </div>
                          ) : savedRow?.id === member.id ? (
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
      {confirm !== null && (
        <ConfirmDialog
          open
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setPendingAction(null)}
          busy={savingRowId !== null}
        />
      )}
    </section>
  )
}
