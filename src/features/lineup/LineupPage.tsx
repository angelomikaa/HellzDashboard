// Lineup — Campos de Batalha (phase 10.4, LNUP-01..03).
//
// Members see a read-only grid of both battlefields with their own party/slot
// highlighted ("Sua PT"). Officers and the owner additionally edit any slot
// (searchable member picker, cross-party move/swap indicator, "Limpar slot")
// and any party's role label. Every write goes through a device-bound
// SECURITY DEFINER RPC (migration 0040/0041); the isStaff flag only decides
// which controls render. It is UX-only, never the security boundary.
import { useEffect, useState } from 'react'
import {
  fetchLineups,
  setLineupPartyLabel,
  setLineupSlot,
  type BattlefieldId,
  type LineupParty,
  type LineupRosterMember,
  type LineupSlot,
  type LineupsPayload,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { ClassCrest } from '../assets/ClassCrest'
import { classLabel } from '../../lib/classLabels'
import {
  assignmentCallout,
  assignmentBadge,
  battlefieldFilledCount,
  BATTLEFIELD_IDS,
  BATTLEFIELD_META,
  buildAssignmentMap,
  classAccentHex,
  filterAssignableRoster,
  findMemberAssignment,
  isPartyFull,
  lineupErrorCopy,
  normalizeRoleLabel,
  partyFilledCount,
  ROLE_LABEL_MAX,
  ROLE_LABEL_PRESETS,
  SLOTS_PER_PARTY,
  TOTAL_CAPACITY_PER_BATTLEFIELD,
  type LineupAssignment,
} from './lineupModel'

type Mutation = (
  session: NeoFootSession,
) => Promise<LineupsPayload>

export function LineupPage({ session }: { session: NeoFootSession }) {
  const isStaff = session.member_role === 'officer' || session.member_role === 'owner'

  const [payload, setPayload] = useState<LineupsPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [battlefield, setBattlefield] = useState<BattlefieldId>('vigrid_field')
  const [stacked, setStacked] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchLineups(session)
      .then((data) => {
        if (!cancelled) setPayload(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(lineupErrorCopy(err))
      })
    return () => {
      cancelled = true
    }
  }, [session])

  async function runMutation(mutation: Mutation) {
    setSaving(true)
    setActionError(null)
    try {
      setPayload(await mutation(session))
    } catch (err) {
      setActionError(lineupErrorCopy(err))
    } finally {
      setSaving(false)
    }
  }

  if (loadError !== null) {
    return (
      <p role="alert" className="rounded-md border border-line bg-surface p-4 text-base text-content">
        {loadError}
      </p>
    )
  }
  if (payload === null) {
    return <p className="text-base text-muted">Carregando…</p>
  }

  const own = findMemberAssignment(payload, session.member_id)
  const visible: BattlefieldId[] = stacked ? [...BATTLEFIELD_IDS] : [battlefield]

  return (
    <section aria-labelledby="lineup-title" className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 id="lineup-title" className="font-display text-2xl font-bold text-content">
          Lineup — Campos de Batalha
        </h1>
        {own !== null && (
          <p className="rounded-md border border-accent bg-surface px-3 py-2 text-sm text-content glow-accent-soft">
            <span className="font-semibold">Você está em:</span> {assignmentCallout(own)}
          </p>
        )}
        <div role="group" aria-label="Baixar JPG" className="flex flex-wrap gap-2">
          {/* JPG export is wired in plan 10.4-03; disabled until then. */}
          <button type="button" disabled title="Exportação JPG disponível em breve" className="h-11 rounded-md border border-line px-3 text-sm text-muted disabled:opacity-60">
            Baixar JPG — Vigrid Field
          </button>
          <button type="button" disabled title="Exportação JPG disponível em breve" className="h-11 rounded-md border border-line px-3 text-sm text-muted disabled:opacity-60">
            Baixar JPG — Ruinscape
          </button>
          <button type="button" disabled title="Exportação JPG disponível em breve" className="h-11 rounded-md border border-line px-3 text-sm text-muted disabled:opacity-60">
            Baixar ambas
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Campos de batalha">
        {BATTLEFIELD_IDS.map((bf) => {
          const meta = BATTLEFIELD_META[bf]
          const filled = battlefieldFilledCount(
            payload.battlefields.find((b) => b.battlefield === bf) ?? { parties: [] },
          )
          const active = !stacked && battlefield === bf
          return (
            <button
              key={bf}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setStacked(false)
                setBattlefield(bf)
              }}
              className={`h-11 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
              }`}
            >
              {meta.title} ({meta.subtitle}) <span className="ml-1 text-muted">{filled}/{TOTAL_CAPACITY_PER_BATTLEFIELD}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setStacked((v) => !v)}
          aria-pressed={stacked}
          className="hidden h-11 rounded-md border border-line px-3 text-sm text-content hover-control md:inline-flex md:items-center"
        >
          {stacked ? 'Ver um campo' : 'Ver ambas'}
        </button>
      </div>

      {actionError !== null && (
        <p role="alert" className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-content">
          {actionError}
        </p>
      )}

      {visible.map((bf) => (
        <BattlefieldGrid
          key={bf}
          battlefield={bf}
          payload={payload}
          memberId={session.member_id}
          isStaff={isStaff}
          saving={saving}
          onAssign={(party, slot, memberId) =>
            void runMutation((s) => setLineupSlot(s, bf, party, slot, memberId))
          }
          onLabel={(party, label) => void runMutation((s) => setLineupPartyLabel(s, bf, party, label))}
        />
      ))}
    </section>
  )
}

/** Pure grid for one battlefield: 8 party cards, responsive. Exported for tests. */
export function BattlefieldGrid({
  battlefield,
  payload,
  memberId,
  isStaff,
  saving,
  onAssign,
  onLabel,
}: {
  battlefield: BattlefieldId
  payload: LineupsPayload
  memberId: string
  isStaff: boolean
  saving: boolean
  onAssign: (partyIndex: number, slotIndex: number, memberId: string | null) => void
  onLabel: (partyIndex: number, label: string | null) => void
}) {
  const meta = BATTLEFIELD_META[battlefield]
  const lineup = payload.battlefields.find((b) => b.battlefield === battlefield)
  const parties = lineup?.parties ?? []
  const filled = battlefieldFilledCount({ parties })
  const assignments = buildAssignmentMap(payload)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-xl font-bold text-content">
          {meta.title} — {meta.subtitle}
        </h2>
        <span className="rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-muted">
          {filled}/{TOTAL_CAPACITY_PER_BATTLEFIELD} escalados
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {parties.map((party) => (
          <PartyCard
            key={party.party_index}
            party={party}
            roster={payload.roster}
            assignments={assignments}
            memberId={memberId}
            isStaff={isStaff}
            saving={saving}
            onAssign={(slotIndex, target) => onAssign(party.party_index, slotIndex, target)}
            onLabel={(label) => onLabel(party.party_index, label)}
          />
        ))}
      </div>
    </div>
  )
}

function PartyCard({
  party,
  roster,
  assignments,
  memberId,
  isStaff,
  saving,
  onAssign,
  onLabel,
}: {
  party: LineupParty
  roster: LineupRosterMember[]
  assignments: ReadonlyMap<string, LineupAssignment>
  memberId: string
  isStaff: boolean
  saving: boolean
  onAssign: (slotIndex: number, memberId: string | null) => void
  onLabel: (label: string | null) => void
}) {
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const ownParty = party.slots.some((s) => s.member_id === memberId)
  const full = isPartyFull(party)
  const count = partyFilledCount(party)

  return (
    <article
      aria-label={`Party G${party.party_index}`}
      className={`flex flex-col gap-2 rounded-lg border bg-surface p-3 ${ownParty ? 'border-accent glow-accent-soft' : 'border-line'}`}
    >
      <RoleLabel label={party.role_label} isStaff={isStaff} saving={saving} onSave={onLabel} />
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-content">G{party.party_index}</h3>
        {ownParty && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">Sua PT</span>
        )}
      </div>
      <ol aria-label={`Slots da G${party.party_index}`} className="flex flex-col gap-1.5">
        {party.slots.map((slot) => (
          <li key={slot.slot_index}>
            <SlotRow
              slot={slot}
              partyIndex={party.party_index}
              own={slot.member_id !== null && slot.member_id === memberId}
              isStaff={isStaff}
              open={openSlot === slot.slot_index}
              onToggle={() => setOpenSlot((cur) => (cur === slot.slot_index ? null : slot.slot_index))}
            />
            {isStaff && openSlot === slot.slot_index && (
              <SlotPicker
                roster={roster}
                assignments={assignments}
                currentMemberId={slot.member_id}
                saving={saving}
                onPick={(target) => {
                  setOpenSlot(null)
                  onAssign(slot.slot_index, target)
                }}
                onClose={() => setOpenSlot(null)}
              />
            )}
          </li>
        ))}
      </ol>
      <footer className="flex justify-end">
        <span
          className={`rounded-full border px-2 py-0.5 text-sm font-bold ${
            full ? 'border-success text-success' : 'border-amber-400 text-amber-400'
          }`}
          aria-label={`${count} de ${SLOTS_PER_PARTY} escalados na G${party.party_index}`}
        >
          {count}/{SLOTS_PER_PARTY}
        </span>
      </footer>
    </article>
  )
}

function SlotRow({
  slot,
  partyIndex,
  own,
  isStaff,
  open,
  onToggle,
}: {
  slot: LineupSlot
  partyIndex: number
  own: boolean
  isStaff: boolean
  open: boolean
  onToggle: () => void
}) {
  const leader = slot.slot_index === 1
  const vacant = slot.member_id === null
  const accent = classAccentHex(slot.char_class)
  const body = (
    <>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
      <ClassCrest charClass={slot.char_class} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className={`flex items-center gap-1.5 truncate text-sm ${leader ? 'font-bold' : 'font-semibold'} ${vacant ? 'text-muted' : 'text-content'}`}>
          {vacant ? '— Vago —' : slot.display_name}
          {leader && <span className="rounded bg-amber-400 px-1 text-[10px] font-bold uppercase text-black">Líder</span>}
          {own && <span className="rounded bg-accent px-1 text-[10px] font-bold text-accent-foreground">Você</span>}
        </span>
        {!vacant && <span className="truncate text-xs text-muted">{classLabel(slot.char_class)}</span>}
      </span>
    </>
  )
  const base = `relative flex items-center gap-2 overflow-hidden rounded-md border py-1.5 pl-3 pr-2 ${
    own ? 'border-accent glow-accent-soft' : 'border-line'
  } ${leader ? 'bg-dominant' : 'bg-surface'}`
  const tint = vacant ? undefined : { backgroundImage: `linear-gradient(90deg, ${accent}24, transparent 70%)` }

  if (!isStaff) {
    return (
      <div className={base} style={tint} aria-current={own ? 'true' : undefined}>
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`Editar slot ${slot.slot_index} da G${partyIndex}`}
      className={`${base} w-full text-left hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      style={tint}
    >
      {body}
    </button>
  )
}

function SlotPicker({
  roster,
  assignments,
  currentMemberId,
  saving,
  onPick,
  onClose,
}: {
  roster: LineupRosterMember[]
  assignments: ReadonlyMap<string, LineupAssignment>
  currentMemberId: string | null
  saving: boolean
  onPick: (memberId: string | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const entries = filterAssignableRoster(roster, assignments, query)

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-md border border-line bg-dominant p-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          aria-label="Buscar jogador"
          placeholder="Buscar jogador…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-content"
        />
        <button type="button" onClick={onClose} className="h-11 rounded-md border border-line px-3 text-sm text-content hover-control">
          Fechar
        </button>
      </div>
      <button
        type="button"
        disabled={saving || currentMemberId === null}
        onClick={() => onPick(null)}
        className="h-11 rounded-md border border-line px-3 text-left text-sm text-content hover-control disabled:opacity-50"
      >
        Limpar slot
      </button>
      <ul aria-label="Jogadores disponíveis" className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {entries.map(({ member, assignment }) => {
          const isCurrent = member.member_id === currentMemberId
          return (
            <li key={member.member_id}>
              <button
                type="button"
                disabled={saving || isCurrent}
                onClick={() => onPick(member.member_id)}
                className="flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-content hover-control disabled:opacity-60"
              >
                <span className="flex-1 truncate">{member.display_name}</span>
                <span className="text-xs text-muted">{classLabel(member.char_class)}</span>
                {assignment !== null && (
                  <span className="whitespace-nowrap rounded border border-line px-1.5 text-xs text-amber-400">
                    {assignmentBadge(assignment)} · mover
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {entries.length === 0 && <li className="px-2 py-2 text-sm text-muted">Nenhum jogador encontrado.</li>}
      </ul>
    </div>
  )
}

function RoleLabel({
  label,
  isStaff,
  saving,
  onSave,
}: {
  label: string | null
  isStaff: boolean
  saving: boolean
  onSave: (label: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label ?? '')

  if (!editing) {
    if (label === null && !isStaff) return null
    if (label !== null) {
      return (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate rounded-full border border-amber-400 px-2 py-0.5 text-xs font-bold text-amber-400">
            {label}
          </span>
          {isStaff && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(label)
                setEditing(true)
              }}
              className="h-11 px-2 text-xs text-muted hover:text-content disabled:opacity-50"
            >
              Editar função
            </button>
          )}
        </div>
      )
    }
    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setDraft('')
          setEditing(true)
        }}
        className="h-11 rounded-md border border-dashed border-line px-2 text-left text-xs text-muted hover-control disabled:opacity-50"
      >
        + Função da PT
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-dominant p-2">
      <div className="flex flex-wrap gap-1">
        {ROLE_LABEL_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setDraft(preset)}
            className="h-11 rounded-md border border-line px-2 text-xs text-content hover-control"
          >
            {preset}
          </button>
        ))}
      </div>
      <input
        type="text"
        aria-label="Função da PT"
        maxLength={ROLE_LABEL_MAX}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ex.: MOBS CIMA/BAIXO"
        className="h-11 rounded-md border border-line bg-surface px-3 text-sm text-content"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            onSave(normalizeRoleLabel(draft))
            setEditing(false)
          }}
          className="h-11 rounded-md border border-accent px-3 text-sm font-semibold text-content disabled:opacity-50"
        >
          Salvar
        </button>
        <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-md border border-line px-3 text-sm text-content hover-control">
          Cancelar
        </button>
        {label !== null && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              onSave(null)
              setEditing(false)
            }}
            className="h-11 rounded-md border border-line px-3 text-sm text-muted hover-control disabled:opacity-50"
          >
            Limpar função
          </button>
        )}
      </div>
    </div>
  )
}
