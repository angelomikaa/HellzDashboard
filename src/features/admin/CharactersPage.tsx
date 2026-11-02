// Personagens — officer/owner character registry (02-UI-SPEC Screen 2).
// The tab itself is UX-only gating (AGENTS.md / T-02-09): enforcement is the
// staff RLS policies from 02-01 — a member's tampered client gets only their
// own row back and every write is refused server-side. This page consumes
// ONLY the explicit safe projection in api.ts: the PIN hash column is
// ungranted at the DB (migration 0005), so it can never appear in any
// payload this file touches — and it is never named or referenced here.
// The card's single "Editar" action writes through correctIdentity (IDEN-03,
// D-21/D-22): it APPENDS a member_identity_history row and updates the member
// pointers (nickname, char_id, class, function) in one server-side call, so
// there is no second, divergent edit path. The id/classes edits of 02-02 were
// folded into it (2026-11-01).
//
// Staff controls (AUTH-03/AUTH-04, 06-UI-SPEC Surface 3): role/active are
// ungranted for client UPDATE (migration 0005:30–33) — ALL role and
// removal/reactivation writes go through the setMemberRole/setMemberActive
// RPC wrappers; no PATCH path exists or is added. The RPCs re-check the
// target rules server-side (owner-only role changes, officer→member-only
// removal, owner rows untouchable), so the per-viewer rendering below is
// UX-only gating per the house pattern (02-02 precedent). Role changes take
// effect at the next login (D-10) — the success copy says so.
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  FunctionError,
  fetchClasses,
  fetchStaffMembers,
  addMember,
  requestStepUp,
  resetMemberPin,
  fetchIdentityHistory,
  correctIdentity,
  setMemberActive,
  setMemberRole,
  type MemberRow,
  type StaffMember,
  type IdentityHistoryRow,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { FUNCTION_LABELS } from '../../lib/groups'
import { classLabel } from '../../lib/classLabels'
import {
  cohortGroup,
  groupLabel,
  isVirtualClassGroup as isClassGroup,
  mergedClassOptions,
} from '../../lib/classGroups'
import { validateIdentityDraft, OFFICIAL_CLASSES } from '../submit/identity'
import type { CharFunction } from '../submit/identity'
import { ClassCrest } from '../assets/ClassCrest'
import { PinBoxes } from '../auth/PinBoxes'
import { ConfirmDialog } from './ConfirmDialog'

// Enumeration-safe pt-BR copy (UI contract): never expose HTTP codes, gateway
// internals, or which check failed.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Falha ao salvar — tente novamente.'

// Staff-action feedback copy (06-UI-SPEC Surface 3, locked verbatim).
const ROLE_UPDATED_MESSAGE = 'Papel atualizado. Efetivo no próximo login.'
const MEMBER_REMOVED_MESSAGE = 'Membro removido.'
const MEMBER_REACTIVATED_MESSAGE = 'Membro reativado.'
const RESET_PIN_SUCCESS = 'PIN redefinido. O membro definirá um novo PIN no próximo acesso.'
const ADD_MEMBER_SUCCESS = 'Membro adicionado. O PIN será criado no primeiro acesso.'
const NO_FILTER_MATCH = 'Nenhum membro com esses filtros.'

// Step-up re-PIN copy (D-14/D-15, repaired in 0017): hierarchy changes are
// handling actions, so the owner re-authenticates before the RPC runs.
const PIN_REQUIRED = 'Digite seu PIN de 4 dígitos para continuar.'
const PIN_WRONG = 'PIN incorreto.'
const STEP_UP_EXPIRED = 'Confirmação expirada. Digite seu PIN novamente.'

const ROLE_LABELS: Record<'member' | 'officer' | 'owner', string> = {
  member: 'Membro',
  officer: 'Oficial',
  owner: 'Proprietário',
}

/** Origin of an identity snapshot, rendered in the member's history list.
 *  The server enum (IdentityHistoryRow['source']) stays English — only the
 *  label the officer reads is pt-BR. */
const IDENTITY_SOURCE_LABELS: Record<IdentityHistoryRow['source'], string> = {
  submission: 'envio validado',
  correction: 'ajuste de oficial',
  claim: 'reivindicação de PIN',
  request: 'solicitação aprovada',
}

// In-edit draft for one member row (IDEN-03). charClass '' is the display-only
// '—' option: saving is blocked client-side — a character must have a class.
// The same draft feeds the identity correction (history) and the registry
// pointers, because correct_identity writes both in one call.
interface EditDraft {
  memberId: string
  char_id: string
  nickname: string
  char_class: string
  char_function: CharFunction
}

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
  | { kind: 'resetPin'; member: MemberRow }

interface ConfirmConfig {
  title: string
  body: string
  confirmLabel: string
  destructive: boolean
}

function confirmConfig(action: PendingAction): ConfirmConfig {
  const name = action.member.display_name
  switch (action.kind) {
    case 'resetPin':
      return {
        title: `Redefinir o PIN de ${name}?`,
        body: 'O membro vai criar um novo PIN no próximo acesso.',
        confirmLabel: 'Redefinir PIN',
        destructive: true,
      }
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

/**
 * Enumeration-safe copy for a failed staff action. Role changes add the
 * step-up failures (wrong PIN, lockout, stale token) on top of the shared
 * unauthorized/forbidden mapping; everything else stays the generic save line
 * (T-06-03: never expose which server check failed). Exported for the node
 * test suite.
 */
export function roleChangeErrorCopy(error: unknown): string {
  if (error instanceof FunctionError) {
    switch (error.code) {
      case 'invalid_pin': {
        const remaining = error.attemptsRemaining
        if (typeof remaining === 'number' && remaining > 0) {
          return `${PIN_WRONG} ${
            remaining === 1 ? '1 tentativa restante.' : `${remaining} tentativas restantes.`
          }`
        }
        return PIN_WRONG
      }
      case 'locked': {
        const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 0) / 60))
        return `Muitas tentativas incorretas. Tente novamente em ${minutes} ${
          minutes === 1 ? 'minuto' : 'minutos'
        }.`
      }
      case 'pin_setup_required':
        return 'Seu PIN ainda não foi criado. Saia e entre novamente para definir um PIN.'
      case 'unauthorized':
      case 'invalid_session':
      case 'forbidden':
        return SESSION_ERROR
      default:
        return SAVE_ERROR
    }
  }
  if (error instanceof ApiError) {
    if (error.kind === 'unauthorized' || error.message.includes('forbidden')) return SESSION_ERROR
    if (error.message.includes('step_up_required')) return STEP_UP_EXPIRED
  }
  return SAVE_ERROR
}

export function CharactersPage({
  session,
  onOpenIdentityReview,
}: {
  session: NeoFootSession
  onOpenIdentityReview?: () => void
}) {
  // Role-differentiated controls (D-08). The page itself is staff-only via the
  // App shell nav (UX-only gating; enforcement is the staff RLS policies).
  const isOwner = session.member_role === 'owner'
  const isStaff = isOwner || session.member_role === 'officer'
  const [data, setData] = useState<{ members: StaffMember[]; classes: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Edit (single action, IDEN-03) — one row at a time. Saving writes the
  // identity correction (history + registry pointers) in ONE server call; the
  // same per-row state machine + single-flight lock serves the staff controls.
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [editHistory, setEditHistory] = useState<IdentityHistoryRow[] | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editFeedback, setEditFeedback] = useState<string | null>(null)
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [savedRow, setSavedRow] = useState<RowFeedback | null>(null)
  const [saveError, setSaveError] = useState<RowFeedback | null>(null)

  // Staff action awaiting confirm-modal confirmation.
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  // Step-up re-PIN for hierarchy changes (promote/demote, D-14/D-15). The PIN
  // lives only in this transient state — never stored or logged — and both
  // fields reset whenever the dialog opens or closes.
  const [stepUpPin, setStepUpPin] = useState('')
  const [dialogError, setDialogError] = useState<string | null>(null)

  // Owner feedback (07.2-06 checkpoint): quick class/function token filters —
  // pure view aid over the already-fetched roster (no server round trip).
  const [filterClass, setFilterClass] = useState('')
  const [filterFunction, setFilterFunction] = useState<'' | 'dps' | 'mdps' | 'suporte'>('')
  const [pinFilter, setPinFilter] = useState<'all' | 'pending' | 'active'>('all')
  // 2026-10-21 round: each filter category hides behind a collapsible divider
  // (collapsed by default) so the token rows stop eating the page.
  const [openFilters, setOpenFilters] = useState<Record<'pin' | 'class' | 'function', boolean>>({
    pin: false,
    class: false,
    function: false,
  })

  // Add-member panel (WHIT-01/06/07).
  const [addHandle, setAddHandle] = useState('')
  const [addDisplayName, setAddDisplayName] = useState('')
  const [addMemberStatus, setAddMemberStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const load = useCallback(async () => {
    const [members, classes] = await Promise.all([fetchStaffMembers(session), fetchClasses(session)])
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
  const busy = savingRowId !== null || editSaving

  // View aid only (owner feedback): apply the token filters to the loaded
  // roster; null char_class rows match the "Todas" class filter only.
  const pinFilteredMembers =
    data === null
      ? []
      : data.members.filter((member) =>
          pinFilter === 'all'
            ? true
            : pinFilter === 'pending'
              ? !member.pin_set
              : member.pin_set,
        )
  const visibleMembers =
    data === null
      ? []
      : pinFilteredMembers.filter(
          (member) =>
            // 10.3: the filter chip is a stats GROUP — a member matches when
            // their own class ranks inside it (Bard and Gypsy -> Artista).
            (filterClass === '' || cohortGroup(member.char_class) === filterClass) &&
            (filterFunction === '' || member.char_function === filterFunction),
        )

  // Confirm-modal copy for the pending staff action (null → dialog closed).
  const confirm = pendingAction === null ? null : confirmConfig(pendingAction)
  // Role changes are handling actions: they require the re-PIN step before the
  // RPC (the server rejects the call without a step-up token anyway).
  const needsStepUp =
    pendingAction !== null &&
    (pendingAction.kind === 'promote' || pendingAction.kind === 'demote')

  // The ONLY character edit path (2026-11-01 consolidation): one form, one
  // server call. correct_identity appends the history row AND refreshes the
  // registry pointers (nickname/ID/class/function), so the old registry PATCH
  // is gone instead of staying a second, divergent write.
  function openEdit(member: StaffMember) {
    setSavedRow(null)
    setSaveError(null)
    setEditingMemberId(member.id)
    setEditDraft({
      memberId: member.id,
      char_id: member.char_id ?? member.identity?.char_id ?? '',
      nickname: member.identity?.nickname ?? member.display_name,
      char_class: member.identity?.char_class ?? member.char_class ?? '',
      char_function: (member.identity?.char_function ?? member.char_function) as CharFunction,
    })
    setEditHistory(null)
    setEditError(null)
    setEditFeedback(null)
    setEditLoading(true)
    fetchIdentityHistory(session, member.id)
      .then((rows) => setEditHistory(sortIdentityHistory(rows)))
      .catch((err: unknown) => {
        setEditError(err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR)
      })
      .finally(() => setEditLoading(false))
  }

  function closeEdit() {
    setEditingMemberId(null)
    setEditDraft(null)
    setEditHistory(null)
    setEditError(null)
    setEditFeedback(null)
    setEditLoading(false)
  }

  async function handleEditSave() {
    if (editingMemberId === null || editDraft === null || editSaving) return
    const problems = validateIdentityDraft({
      char_id: editDraft.char_id,
      nickname: editDraft.nickname,
      char_class: editDraft.char_class,
      char_function: editDraft.char_function,
    })
    if (problems.length > 0) {
      setEditError(problems[0])
      return
    }
    setEditSaving(true)
    setEditError(null)
    setEditFeedback(null)
    try {
      await correctIdentity(session, editingMemberId, {
        char_id: editDraft.char_id.trim(),
        nickname: editDraft.nickname.trim(),
        char_class: editDraft.char_class.trim(),
        char_function: editDraft.char_function,
      })
      setEditFeedback('Salvo.')
      // Refresh the roster so the corrected name/class/function persists on
      // screen. A refresh failure keeps the stale rows — the write succeeded.
      try {
        await load()
      } catch {
        /* stale list; Salvo. still shown */
      }
      // The correction appended a history row: re-read it for the panel.
      try {
        setEditHistory(sortIdentityHistory(await fetchIdentityHistory(session, editingMemberId)))
      } catch {
        /* keep the previous history list */
      }
    } catch (err) {
      setEditError(identityErrorFor(err))
    } finally {
      setEditSaving(false)
    }
  }

  function openConfirm(action: PendingAction) {
    setSavedRow(null)
    setSaveError(null)
    setStepUpPin('')
    setDialogError(null)
    setPendingAction(action)
  }

  function closeConfirm() {
    setPendingAction(null)
    setStepUpPin('')
    setDialogError(null)
  }

  // Staff confirm flow (AUTH-03/AUTH-04): one shared handler — the action
  // kind decides the RPC and the success copy. Role changes first exchange the
  // owner's PIN for a single-use step-up token (0017), then present it to
  // set_member_role. Errors are enumeration-safe copy; a failed step-up keeps
  // the dialog open so the PIN can be retried in place. Never expose which
  // server check failed.
  async function handleConfirm() {
    if (pendingAction === null || busy) return
    const action = pendingAction
    const memberId = action.member.id
    const roleChange = action.kind === 'promote' || action.kind === 'demote'

    if (roleChange && stepUpPin.length !== 4) {
      setDialogError(PIN_REQUIRED)
      return
    }

    setSavingRowId(memberId)
    setDialogError(null)
    try {
      if (action.kind === 'promote' || action.kind === 'demote') {
        const token = await requestStepUp(session, stepUpPin)
        await setMemberRole(
          session,
          memberId,
          action.kind === 'promote' ? 'officer' : 'member',
          token,
        )
      } else if (action.kind === 'deactivate') {
        await setMemberActive(session, memberId, false)
      } else if (action.kind === 'activate') {
        await setMemberActive(session, memberId, true)
      } else {
        await resetMemberPin(session, memberId)
      }
      const message =
        roleChange
          ? ROLE_UPDATED_MESSAGE
          : action.kind === 'deactivate'
            ? MEMBER_REMOVED_MESSAGE
            : action.kind === 'activate'
              ? MEMBER_REACTIVATED_MESSAGE
              : RESET_PIN_SUCCESS
      closeConfirm()
      setSavedRow({ id: memberId, text: message })
      // Refresh so the role/active change persists on screen. A refresh
      // failure keeps the stale rows — the action itself succeeded.
      try {
        await load()
      } catch {
        /* stale list; success copy still shown */
      }
    } catch (err) {
      if (roleChange) {
        // Wrong PIN / lockout / stale token: keep the confirmation open, clear
        // the PIN and show the copy inline (the token is single-use, so a
        // retry needs a fresh re-PIN either way).
        setDialogError(roleChangeErrorCopy(err))
        setStepUpPin('')
      } else {
        closeConfirm()
        setSaveError({ id: memberId, text: roleChangeErrorCopy(err) })
      }
    } finally {
      setSavingRowId(null)
    }
  }

  async function handleAddMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const handle = addHandle.trim()
    const displayName = addDisplayName.trim()
    if (handle === '' || displayName === '') return
    setAddMemberStatus({ kind: 'saving' })
    try {
      await addMember(session, handle, displayName)
      setAddHandle('')
      setAddDisplayName('')
      setAddMemberStatus({ kind: 'success', message: ADD_MEMBER_SUCCESS })
      try {
        await load()
      } catch {
        /* stale list */
      }
    } catch (err) {
      setAddMemberStatus({
        kind: 'error',
        message: addMemberErrorFor(err),
      })
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-6 lg:p-8">
      <h2 className="text-xl font-semibold text-content">Personagens</h2>
      <p className="mt-1 text-sm text-muted">Registre nome, classe e função de cada membro.</p>

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-error">
          {error}
        </p>
      ) : data === null ? (
        <p className="mt-6 text-base text-muted">Carregando…</p>
      ) : (
        <>
          {/* Add-class UI REMOVED (owner decision 2026-10-21): classes are
              added via code/seed when needed — the owner-only staff_insert_
              classes policy stays, only the form is gone. */}

          {/* Add member (WHIT-01/06/07) */}
          <form
            onSubmit={handleAddMember}
            noValidate
            className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <label htmlFor="add-handle" className="text-sm font-semibold text-content">
                Usuário do Discord
              </label>
              <input
                id="add-handle"
                type="text"
                autoComplete="off"
                value={addHandle}
                onChange={(e) => setAddHandle(e.target.value)}
                disabled={busy || addMemberStatus.kind === 'saving'}
                className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <label htmlFor="add-display-name" className="text-sm font-semibold text-content">
                Nome do personagem
              </label>
              <input
                id="add-display-name"
                type="text"
                autoComplete="off"
                value={addDisplayName}
                onChange={(e) => setAddDisplayName(e.target.value)}
                disabled={busy || addMemberStatus.kind === 'saving'}
                className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={busy || addMemberStatus.kind === 'saving' || addHandle.trim() === '' || addDisplayName.trim() === ''}
              className="h-11 shrink-0 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Adicionar membro
            </button>
          </form>
          {addMemberStatus.kind === 'success' && (
            <p className="mt-2 text-sm font-semibold text-success">{addMemberStatus.message}</p>
          )}
          {addMemberStatus.kind === 'error' && (
            <p role="alert" aria-live="polite" className="mt-2 text-sm font-semibold text-error">
              {addMemberStatus.message}
            </p>
          )}

          {data.members.length === 0 ? (
            <p className="mt-6 text-center text-base text-muted">
              Nenhum membro na lista branca ainda.
            </p>
          ) : (
            <>
              {/* Owner feedback (07.2-06 checkpoint): token filters by class and
                  function. 2026-10-21 round: the token rows were too cramped —
                  each category now lives behind its own collapsible divider
                  (collapsed by default; the header always shows the active
                  selection). Chips only narrow the already-loaded roster — no
                  data flow change, the D-08 matrix still renders per row. */}
              <div className="mt-6 flex flex-col gap-2">
                <FilterDisclosure
                  id="pin"
                  label="PIN"
                  value={pinFilter === 'all' ? 'Todos' : pinFilter === 'pending' ? 'PIN pendente' : 'PIN ativo'}
                  open={openFilters.pin}
                  onToggle={() =>
                    setOpenFilters((prev) => ({ ...prev, pin: !prev.pin }))
                  }
                >
                  {(['all', 'pending', 'active'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setPinFilter(f)}
                      aria-pressed={pinFilter === f}
                      className={`h-9 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        pinFilter === f
                          ? 'border-accent bg-accent text-accent-foreground'
                          : 'border-line text-muted hover-control hover:text-content'
                      }`}
                    >
                      {f === 'all' ? 'Todos' : f === 'pending' ? 'PIN pendente' : 'PIN ativo'}
                    </button>
                  ))}
                </FilterDisclosure>
                <FilterDisclosure
                  id="class"
                  label="Classe"
                  value={filterClass === '' ? 'Todas' : classLabel(filterClass)}
                  open={openFilters.class}
                  onToggle={() =>
                    setOpenFilters((prev) => ({ ...prev, class: !prev.class }))
                  }
                >
                  <button
                    type="button"
                    onClick={() => setFilterClass('')}
                    aria-pressed={filterClass === ''}
                    className={`h-9 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      filterClass === ''
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-line text-muted hover-control hover:text-content'
                    }`}
                  >
                    Todas
                  </button>
                  {mergedClassOptions(data.classes).map((className) => (
                    <button
                      key={className}
                      type="button"
                      onClick={() => setFilterClass((prev) => (prev === className ? '' : className))}
                      aria-pressed={filterClass === className}
                      className={`h-9 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        filterClass === className
                          ? 'border-accent bg-accent text-accent-foreground'
                          : 'border-line text-muted hover-control hover:text-content'
                      }`}
                    >
                      {/* 10.3: merged classes appear ONCE as their stats group
                          (Artista) — the chip still selects every member who
                          ranks inside it, while each row keeps its own class. */}
                      {isClassGroup(className) ? groupLabel(className) : classLabel(className)}
                    </button>
                  ))}
                </FilterDisclosure>
                <FilterDisclosure
                  id="function"
                  label="Função"
                  value={filterFunction === '' ? 'Todas' : FUNCTION_LABELS[filterFunction]}
                  open={openFilters.function}
                  onToggle={() =>
                    setOpenFilters((prev) => ({ ...prev, function: !prev.function }))
                  }
                >
                  <button
                    type="button"
                    onClick={() => setFilterFunction('')}
                    aria-pressed={filterFunction === ''}
                    className={`h-9 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      filterFunction === ''
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-line text-muted hover-control hover:text-content'
                    }`}
                  >
                    Todas
                  </button>
                  {(Object.keys(FUNCTION_LABELS) as Array<keyof typeof FUNCTION_LABELS>).map(
                    (role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setFilterFunction((prev) => (prev === role ? '' : role))}
                        aria-pressed={filterFunction === role}
                        className={`h-9 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          filterFunction === role
                            ? 'border-accent bg-accent text-accent-foreground'
                            : 'border-line text-muted hover-control hover:text-content'
                        }`}
                      >
                        {FUNCTION_LABELS[role]}
                      </button>
                    ),
                  )}
                </FilterDisclosure>
              </div>
              {visibleMembers.length === 0 ? (
                <p className="mt-6 text-center text-base text-muted">
                  {pinFilter === 'pending' && pinFilteredMembers.length === 0
                    ? 'Nenhum membro com PIN pendente.'
                    : pinFilter === 'active' && pinFilteredMembers.length === 0
                      ? 'Nenhum membro com PIN ativo.'
                      : NO_FILTER_MATCH}
                </p>
              ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {/* Owner gate round 4 (07.1-02): per-character card list. The
                  old 7-column table needed horizontal expansion (scroll or
                  negative-margin) to keep the edge controls' focus rings from
                  clipping — the owner rejected both as "ruining the
                  aesthetic" and asked to "move the content of the controles
                  column to below each character, freeing up space without
                  actually expanding the box". So: character info on top, ALL
                  controls (Editar + staff actions) in a row below the card's
                  divider. No overflow container anywhere — nothing can scroll
                  or clip, and focus-visible rings (box-shadow, which never
                  contributes to scrollable overflow) always have clearance
                  inside the card's own padding. DOM order = character info
                  first, then its controls: the focus order follows the visual
                  reading order.
                  07.2-06 LAYT-01: the list uses the wide shell as a 2-up card
                  register at xl (NOT the rejected 7-column table); the card
                  being edited spans both columns so the inline form keeps its
                  comfortable field widths. Mobile/tablet stay 1-up exactly as
                  before. */}
              {visibleMembers.map((member) => {
                const editing = editingMemberId === member.id
                const saving = savingRowId === member.id
                // Staff controls (06-UI-SPEC Surface 3, D-08 matrix): owner
                // rows are untouchable for every viewer; officer viewers get
                // controls on member rows only; member-viewer sessions
                // (tampered client) get none. The RPCs re-check all target
                // rules server-side — this is UX-only.
                const hasStaffControls =
                  isStaff && member.role !== 'owner' && (isOwner || member.role === 'member')
                return (
                  <article
                    key={member.id}
                    aria-busy={saving}
                    className={`rounded-lg border border-line bg-surface p-4 sm:p-5 hover-card${
                      member.active ? '' : ' opacity-60'
                    }${editing ? ' xl:col-span-2' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {/* 07.2-06 D-17: leading class icon (decorative; the
                          class name still renders as text below). */}
                      <ClassCrest charClass={member.char_class} size="sm" />
                      <span className="text-base font-semibold text-content">
                        {member.display_name}
                      </span>
                      {member.char_id && (
                        <span className="font-mono text-sm text-muted">{member.char_id}</span>
                      )}
                      {member.identity?.nickname && member.identity.nickname !== member.display_name && (
                        <span className="text-sm text-muted">{member.identity.nickname}</span>
                      )}
                      <span
                        className={`rounded-full border border-line px-2 py-0.5 text-sm font-semibold ${
                          member.pin_set ? 'text-muted' : 'text-amber-400'
                        }`}
                      >
                        {member.pin_set ? 'PIN ativo' : 'PIN pendente'}
                      </span>
                      {member.has_pending_proof && (
                        <button
                          type="button"
                          onClick={onOpenIdentityReview}
                          className="rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-amber-400 hover-control"
                        >
                          Identidade pendente
                        </button>
                      )}
                      <span className="rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-muted">
                        {ROLE_LABELS[member.role]}
                      </span>
                      <span className="text-sm text-muted">{member.discord_handle}</span>
                      <span className="text-sm text-muted">
                        Classe: <span className="text-content">{classLabel(member.char_class)}</span>
                      </span>
                      <span className="text-sm text-muted">
                        Função: <span className="text-content">{FUNCTION_LABELS[member.char_function]}</span>
                      </span>
                    </div>
                    {/* Controls BELOW the character (owner round 4 request),
                        kept out of the info's way by the card divider. Role
                        buttons — OWNER viewer only (AUTH-03/D-08); the RPC
                        re-checks the owner-only gate server-side. */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                      {isStaff && !editing && (
                        <button
                          type="button"
                          onClick={() => openEdit(member)}
                          disabled={busy}
                          className="h-11 rounded-md border border-line px-4 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Editar
                        </button>
                      )}
                      {!editing && hasStaffControls && (
                        <>
                          {isOwner && member.role === 'member' && (
                            <button
                              type="button"
                              onClick={() => openConfirm({ kind: 'promote', member })}
                              disabled={busy}
                              className="h-11 rounded-md border border-line px-4 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Conceder oficial
                            </button>
                          )}
                          {isOwner && member.role === 'officer' && (
                            <button
                              type="button"
                              onClick={() => openConfirm({ kind: 'demote', member })}
                              disabled={busy}
                              className="h-11 rounded-md border border-line px-4 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
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
                              className="h-11 rounded-md border border-line px-4 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Remover
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openConfirm({ kind: 'activate', member })}
                              disabled={busy}
                              className="h-11 rounded-md border border-line px-4 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Reativar
                            </button>
                          )}
                          {canResetPin(session, member) && (
                            <button
                              type="button"
                              onClick={() => openConfirm({ kind: 'resetPin', member })}
                              disabled={busy}
                              className="h-11 rounded-md border border-line px-4 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Redefinir PIN
                            </button>
                          )}
                        </>
                      )}
                      {/* Per-row feedback for the shared state machine (edit
                          save, role change, removal/reactivation) — one place
                          now that Controles/Ações are merged. */}
                      {savedRow?.id === member.id && (
                        <span aria-live="polite" className="text-sm font-semibold text-success">
                          {savedRow.text}
                        </span>
                      )}
                      {saveError?.id === member.id && (
                        <span
                          role="alert"
                          aria-live="polite"
                          className="text-sm font-semibold text-error"
                        >
                          {saveError.text}
                        </span>
                      )}
                    </div>
                    {/* The single character edit panel (2026-11-01
                        consolidation): the old "Identidade" panel and the
                        registry inline form are ONE action now. It expands
                        inline with the character (owner decision 2026-10-21)
                        and saves through correct_identity, which appends the
                        history row and updates the registry in one call. */}
                    {editing && editDraft && (
                      <div className="mt-4 border-t border-line pt-4">
                        <h3 className="text-base font-semibold text-content">Editar personagem</h3>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`edit-id-${member.id}`}
                              className="text-sm font-semibold text-content"
                            >
                              ID
                            </label>
                            <input
                              id={`edit-id-${member.id}`}
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              value={editDraft.char_id}
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, char_id: e.target.value } : d))
                              }
                              disabled={editSaving}
                              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`edit-nickname-${member.id}`}
                              className="text-sm font-semibold text-content"
                            >
                              Nick
                            </label>
                            <input
                              id={`edit-nickname-${member.id}`}
                              type="text"
                              autoComplete="off"
                              value={editDraft.nickname}
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, nickname: e.target.value } : d))
                              }
                              disabled={editSaving}
                              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`edit-class-${member.id}`}
                              className="text-sm font-semibold text-content"
                            >
                              Classe
                            </label>
                            <select
                              id={`edit-class-${member.id}`}
                              value={editDraft.char_class}
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, char_class: e.target.value } : d))
                              }
                              disabled={editSaving}
                              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {/* Display-only '—'; a character must have a
                                  class, so saving with it is blocked by
                                  validateIdentityDraft. */}
                              <option value="">—</option>
                              {/* 10.3: PLAYABLE classes only — a merged group
                                  (Artista) is a stats identity, never a
                                  member's class, so a Bard keeps registering as
                                  Bard. */}
                              {OFFICIAL_CLASSES.map((c) => (
                                <option key={c} value={c}>
                                  {classLabel(c)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`edit-function-${member.id}`}
                              className="text-sm font-semibold text-content"
                            >
                              Função
                            </label>
                            <select
                              id={`edit-function-${member.id}`}
                              value={editDraft.char_function}
                              onChange={(e) =>
                                setEditDraft((d) =>
                                  d
                                    ? { ...d, char_function: e.target.value as CharFunction }
                                    : d,
                                )
                              }
                              disabled={editSaving}
                              className="h-11 rounded-md border border-line bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {(Object.keys(FUNCTION_LABELS) as Array<keyof typeof FUNCTION_LABELS>).map(
                                (role) => (
                                  <option key={role} value={role}>
                                    {FUNCTION_LABELS[role]}
                                  </option>
                                ),
                              )}
                            </select>
                          </div>
                        </div>
                        {editError && (
                          <p role="alert" className="mt-2 text-sm font-semibold text-error">
                            {editError}
                          </p>
                        )}
                        {editFeedback && (
                          <p aria-live="polite" className="mt-2 text-sm font-semibold text-success">
                            {editFeedback}
                          </p>
                        )}
                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleEditSave()}
                            disabled={editSaving}
                            className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={closeEdit}
                            disabled={editSaving}
                            className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        </div>
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold text-content">Histórico</h4>
                          {editLoading ? (
                            <p className="text-sm text-muted">Carregando…</p>
                          ) : editHistory === null ? (
                            <p className="text-sm text-muted">—</p>
                          ) : editHistory.length === 0 ? (
                            <p className="text-sm text-muted">Sem histórico.</p>
                          ) : (
                            <ul className="mt-2 space-y-1">
                              {editHistory.map((h) => (
                                <li key={h.id} className="text-sm text-muted">
                                  <span className="font-mono">{h.char_id}</span> — {h.nickname} —{' '}
                                  {classLabel(h.char_class)} —{' '}
                                  {h.char_function === null ? '—' : FUNCTION_LABELS[h.char_function]} —{' '}
                                  {IDENTITY_SOURCE_LABELS[h.source]}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
              )}
            </>
          )}
        </>
      )}
      {confirm !== null && pendingAction !== null && (
        <ConfirmDialog
          open
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          onConfirm={() => void handleConfirm()}
          onCancel={closeConfirm}
          busy={savingRowId !== null}
          confirmDisabled={needsStepUp && stepUpPin.length !== 4}
          error={dialogError}
        >
          {needsStepUp && (
            <div className="mt-4">
              <PinBoxes
                value={stepUpPin}
                onChange={(value) => {
                  setStepUpPin(value)
                  setDialogError(null)
                }}
                disabled={savingRowId !== null}
                label="Confirme seu PIN"
              />
              <p className="mt-2 text-xs text-muted">
                Alterações de papel exigem re-autenticação. O PIN vale por 10 minutos e uma
                alteração.
              </p>
            </div>
          )}
        </ConfirmDialog>
      )}
    </section>
  )
}

// ---- Testable helpers (node env) ----
export type PinFilter = 'all' | 'pending' | 'active'

/** Collapsible filter divider (owner feedback 2026-10-21): the token rows
 *  were too cramped, so each filter category hides behind its own divider —
 *  collapsed by default, the header always shows the active selection. Same
 *  disclosure pattern as the dashboard CollapsibleGroup: the body stays in
 *  the DOM (aria-controls resolves in both states) and only the className
 *  swaps, never `hidden` + a display rule together. */
function FilterDisclosure({
  id,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  id: string
  label: string
  value: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`filter-${id}`}
        className="flex h-11 w-full items-center justify-between rounded-md border border-line bg-surface px-3 text-sm font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          <span className="font-normal text-muted">{value}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path fill="currentColor" d="M6 3l5 5-5 5z" />
          </svg>
        </span>
      </button>
      <div
        id={`filter-${id}`}
        className={open ? 'mt-2 flex flex-wrap items-center gap-2' : 'hidden'}
      >
        {children}
      </div>
    </div>
  )
}

export function pinBadgeLabel(pin_set: boolean): string {
  return pin_set ? 'PIN ativo' : 'PIN pendente'
}

export function canResetPin(session: NeoFootSession, member: MemberRow): boolean {
  // 0021: the owner resets members and officers; an officer resets members only.
  // The owner account is never resettable (D-08).
  if (member.role === 'owner') return false
  if (session.member_role === 'owner') return true
  return session.member_role === 'officer' && member.role === 'member'
}

export function filterMembersByPin(members: StaffMember[], filter: PinFilter): StaffMember[] {
  return members.filter((member) =>
    filter === 'all' ? true : filter === 'pending' ? !member.pin_set : member.pin_set,
  )
}

export function addMemberErrorFor(error: unknown): string {
  const message =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : String(error ?? '')
  if (message.includes('already_member')) return 'Este handle já está ativo.'
  if (message.includes('duplicate_nickname'))
    return 'Já existe um membro ativo com esse nick. Escolha outro.'
  if (message.includes('dummy_handle')) return 'Handle reservado para dados de teste.'
  if (error instanceof ApiError && (error.kind === 'unauthorized' || message.includes('forbidden')))
    return SESSION_ERROR
  return 'Nao foi possivel adicionar. Verifique a conexao.'
}

export function identityErrorFor(error: unknown): string {
  const message =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : String(error ?? '')
  if (message.includes('duplicate_char_id'))
    return 'Este ID ja esta em uso (duplicate_char_id).'
  if (message.includes('duplicate_nickname'))
    return 'Já existe um membro ativo com esse nick. Escolha outro.'
  if (error instanceof ApiError && (error.kind === 'unauthorized' || message.includes('forbidden')))
    return SESSION_ERROR
  return SAVE_ERROR
}

export function sortIdentityHistory(rows: IdentityHistoryRow[]): IdentityHistoryRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

