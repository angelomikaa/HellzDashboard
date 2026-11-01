// Escalação — war modes (phase 10.4 / 0056, LNUP-01..03).
//
// Vingança de Vigrid keeps the two fixed battlefields (Vigrid Field = Raid 1,
// Ruinscape = Raid 2), 8 parties x 5 slots each. Guerra do Emperium uses 2..8
// raids with the same 8x5 structure; officers can add/remove raids (empty ones
// only). Members see a read-only grid with their own party/slot highlighted
// ("Sua PT") and their current raid in the callout. Officers and the owner
// additionally edit any slot (searchable picker, cross-party move/swap
// indicator, "Limpar slot") and any party role label. Every write goes through
// a device-bound SECURITY DEFINER RPC (migrations 0040/0044/0056); isStaff only
// decides which controls render. It is UX-only, never the security boundary.
import { useEffect, useRef, useState } from 'react'
import {
  fetchLineups,
  setLineupPartyLabel,
  setLineupRaidCount,
  setLineupSlot,
  type BattlefieldLineup,
  type LineupParty,
  type LineupRosterMember,
  type LineupSlot,
  type LineupsPayload,
  type WarMode,
} from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { ClassCrest } from '../assets/ClassCrest'
import { downloadLineupJpg } from './lineupExport'
import { classLabel } from '../../lib/classLabels'
import {
  assignmentCallout,
  assignmentBadge,
  battlefieldFilledCount,
  buildAssignmentMap,
  classAccentHex,
  filterAssignableRoster,
  findMemberAssignment,
  isPartyFull,
  lineupErrorCopy,
  normalizeRoleLabel,
  partyFilledCount,
  raidMeta,
  ROLE_LABEL_MAX,
  ROLE_LABEL_PRESETS,
  SLOTS_PER_PARTY,
  TOTAL_CAPACITY_PER_BATTLEFIELD,
  WAR_MODES,
  WAR_MODE_META,
  type LineupAssignment,
} from './lineupModel'

type Mutation = (session: NeoFootSession) => Promise<LineupsPayload>

/** Which JPG button is busy: one raid id, or all raids ("todas"). */
type ExportScope = string

/** Enumeration-safe copy for a failed JPG render/download (no internals). */
const EXPORT_ERROR_COPY = 'Não foi possível gerar o JPG. Tente novamente.'

export function LineupPage({ session }: { session: NeoFootSession }) {
  const isStaff = session.member_role === 'officer' || session.member_role === 'owner'

  const [mode, setMode] = useState<WarMode>('vigrid')
  const modeRef = useRef<WarMode>(mode)
  const [payload, setPayload] = useState<LineupsPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingMode, setLoadingMode] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedRaid, setSelectedRaid] = useState(1)
  const [stacked, setStacked] = useState(false)
  const [exporting, setExporting] = useState<ExportScope | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    let cancelled = false
    setLoadingMode(true)
    setLoadError(null)
    fetchLineups(session, mode)
      .then((data) => {
        if (cancelled) return
        setPayload(data)
        setSelectedRaid((current) =>
          data.battlefields.some((raid) => raid.raid_index === current)
            ? current
            : (data.battlefields[0]?.raid_index ?? 1),
        )
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(lineupErrorCopy(err, 'read'))
      })
      .finally(() => {
        if (!cancelled) setLoadingMode(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, mode])

  async function runMutation(mutation: Mutation) {
    setSaving(true)
    setActionError(null)
    try {
      const next = await mutation(session)
      // A mode switch may have landed while this write was in flight; the new
      // mode's effect already owns the payload, so never overwrite it with the
      // old mode's response.
      if (next.war_mode !== modeRef.current) return
      setPayload(next)
      setSelectedRaid((current) =>
        next.battlefields.some((raid) => raid.raid_index === current)
          ? current
          : (next.battlefields[next.battlefields.length - 1]?.raid_index ?? 1),
      )
    } catch (err) {
      setActionError(lineupErrorCopy(err))
    } finally {
      setSaving(false)
    }
  }

  // Sequential, not parallel: browsers block a burst of programmatic downloads.
  async function exportJpgs(raids: BattlefieldLineup[]) {
    if (payload === null || raids.length === 0) return
    setExporting(raids.length === 1 ? raids[0].battlefield : 'todas')
    setExportError(null)
    try {
      for (const raid of raids) {
        await downloadLineupJpg(raid, payload.war_mode)
      }
    } catch {
      setExportError(EXPORT_ERROR_COPY)
    } finally {
      setExporting(null)
    }
  }

  if (loadError !== null) {
    return (
      <p role="alert" className="rounded-md border border-line bg-surface p-4 text-base text-content">
        {loadError}
      </p>
    )
  }
  if (payload === null || payload.war_mode !== mode || loadingMode) {
    return <p className="text-base text-muted">Carregando…</p>
  }

  const own = findMemberAssignment(payload, session.member_id)
  const raids = payload.battlefields
  const activeRaid = raids.find((raid) => raid.raid_index === selectedRaid) ?? raids[0] ?? null
  const visible: BattlefieldLineup[] = stacked ? raids : activeRaid === null ? [] : [activeRaid]
  const modeMeta = WAR_MODE_META[payload.war_mode]
  const lastRaid = raids[raids.length - 1]
  const lastRaidFilled = lastRaid === undefined ? 0 : battlefieldFilledCount(lastRaid)
  const canRemoveRaid =
    payload.war_mode === 'emperium' && payload.raid_count > payload.min_raids && lastRaidFilled === 0
  const canAddRaid = payload.war_mode === 'emperium' && payload.raid_count < payload.max_raids

  return (
    <section aria-labelledby="lineup-title" className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 id="lineup-title" className="font-display text-2xl font-bold text-content">
          Escalação — {modeMeta.title}
        </h1>
        <p className="text-sm text-muted">{modeMeta.description}</p>

        <div role="tablist" aria-label="Modo de guerra" className="flex flex-wrap gap-2">
          {WAR_MODES.map((warMode) => {
            const active = mode === warMode
            return (
              <button
                key={warMode}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setStacked(false)
                  setMode(warMode)
                }}
                className={`h-11 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? 'border-accent text-content glow-accent-soft'
                    : 'border-line text-muted hover-control hover:text-content'
                }`}
              >
                {WAR_MODE_META[warMode].title}
              </button>
            )
          })}
        </div>

        {own !== null && (
          <p className="rounded-md border border-accent bg-surface px-3 py-2 text-sm text-content glow-accent-soft">
            <span className="font-semibold">Você está em:</span> {assignmentCallout(own)}
          </p>
        )}

        {payload.war_mode === 'emperium' && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2">
            <span className="text-sm font-semibold text-content">
              Raids: {payload.raid_count} / {payload.max_raids}
            </span>
            {isStaff && (
              <>
                <button
                  type="button"
                  aria-label="Remover raid"
                  disabled={saving || !canRemoveRaid}
                  title={
                    lastRaidFilled > 0
                      ? `Esvazie a ${lastRaid === undefined ? 'última raid' : raidMeta(payload.war_mode, lastRaid.raid_index).subtitle} antes de removê-la.`
                      : 'Remover a última raid'
                  }
                  onClick={() =>
                    void runMutation((s) => setLineupRaidCount(s, 'emperium', payload.raid_count - 1))
                  }
                  className="h-11 min-w-11 rounded-md border border-line px-3 text-lg font-bold text-content hover-control disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Adicionar raid"
                  disabled={saving || !canAddRaid}
                  onClick={() =>
                    void runMutation((s) => setLineupRaidCount(s, 'emperium', payload.raid_count + 1))
                  }
                  className="h-11 min-w-11 rounded-md border border-accent px-3 text-lg font-bold text-content hover-control disabled:opacity-40"
                >
                  +
                </button>
              </>
            )}
            {!isStaff && (
              <span className="text-sm text-muted">
                Mínimo {payload.min_raids}, máximo {payload.max_raids}.
              </span>
            )}
            {isStaff && !canRemoveRaid && payload.raid_count > payload.min_raids && lastRaidFilled > 0 && (
              <span className="text-xs text-muted">
                Esvazie a {lastRaid === undefined ? 'última raid' : raidMeta(payload.war_mode, lastRaid.raid_index).subtitle} para removê-la.
              </span>
            )}
          </div>
        )}

        <div role="group" aria-label="Baixar JPG" className="flex flex-wrap gap-2">
          {raids.map((raid) => {
            const meta = raidMeta(payload.war_mode, raid.raid_index)
            const busy = exporting === raid.battlefield
            return (
              <button
                key={raid.battlefield}
                type="button"
                disabled={exporting !== null}
                aria-busy={busy}
                onClick={() => void exportJpgs([raid])}
                className="h-11 rounded-md border border-line px-3 text-sm text-content hover-control disabled:opacity-60"
              >
                {busy
                  ? 'Gerando JPG…'
                  : payload.war_mode === 'emperium'
                    ? `Baixar JPG — ${meta.subtitle}`
                    : `Baixar JPG — ${meta.title} (${meta.subtitle})`}
              </button>
            )
          })}
          {raids.length > 1 && (
            <button
              type="button"
              disabled={exporting !== null}
              aria-busy={exporting === 'todas'}
              onClick={() => void exportJpgs(raids)}
              className="h-11 rounded-md border border-accent px-3 text-sm font-semibold text-content hover-control disabled:opacity-60"
            >
              {exporting === 'todas' ? 'Gerando JPG…' : 'Baixar todas (JPG)'}
            </button>
          )}
        </div>
        {exportError !== null && (
          <p role="alert" className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-content">
            {exportError}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Raids">
        {raids.map((raid) => {
          const meta = raidMeta(payload.war_mode, raid.raid_index)
          const filled = battlefieldFilledCount(raid)
          const active = !stacked && activeRaid?.raid_index === raid.raid_index
          return (
            <button
              key={raid.battlefield}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setStacked(false)
                setSelectedRaid(raid.raid_index)
              }}
              className={`h-11 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? 'border-accent text-content glow-accent-soft' : 'border-transparent text-muted hover:border-line hover:text-content'
              }`}
            >
              {payload.war_mode === 'emperium' ? meta.subtitle : `${meta.title} (${meta.subtitle})`}{' '}
              <span className="ml-1 text-muted">{filled}/{TOTAL_CAPACITY_PER_BATTLEFIELD}</span>
            </button>
          )
        })}
        {raids.length > 1 && (
          <button
            type="button"
            onClick={() => setStacked((value) => !value)}
            aria-pressed={stacked}
            className="hidden h-11 rounded-md border border-line px-3 text-sm text-content hover-control md:inline-flex md:items-center"
          >
            {stacked ? 'Ver uma raid' : 'Ver todas'}
          </button>
        )}
      </div>

      {actionError !== null && (
        <p role="alert" className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-content">
          {actionError}
        </p>
      )}

      {visible.map((raid) => (
        <BattlefieldGrid
          key={raid.battlefield}
          raid={raid}
          warMode={payload.war_mode}
          payload={payload}
          memberId={session.member_id}
          isStaff={isStaff}
          saving={saving}
          onAssign={(party, slot, memberId) =>
            void runMutation((s) =>
              setLineupSlot(s, payload.war_mode, raid.battlefield, party, slot, memberId),
            )
          }
          onLabel={(party, label) =>
            void runMutation((s) =>
              setLineupPartyLabel(s, payload.war_mode, raid.battlefield, party, label),
            )
          }
        />
      ))}
    </section>
  )
}

/** Pure grid for one raid: 8 party cards, responsive. Exported for tests. */
export function BattlefieldGrid({
  raid,
  warMode,
  payload,
  memberId,
  isStaff,
  saving,
  onAssign,
  onLabel,
}: {
  raid: BattlefieldLineup
  warMode: WarMode
  payload: LineupsPayload
  memberId: string
  isStaff: boolean
  saving: boolean
  onAssign: (partyIndex: number, slotIndex: number, memberId: string | null) => void
  onLabel: (partyIndex: number, label: string | null) => void
}) {
  const meta = raidMeta(warMode, raid.raid_index)
  const parties = raid.parties
  const filled = battlefieldFilledCount(raid)
  const assignments = buildAssignmentMap(payload)
  const ownRaid = parties.some((party) => party.slots.some((slot) => slot.member_id === memberId))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-xl font-bold text-content">
          {warMode === 'emperium' ? meta.subtitle : `${meta.title} — ${meta.subtitle}`}
        </h2>
        {ownRaid && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
            Sua Raid
          </span>
        )}
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
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-content hover-control disabled:opacity-60"
              >
                {/* Two-line label: the name keeps the remaining width and never
                    collapses to a single letter when the class + move badge are
                    long (owner report 2026-10-30: "Ahrya" rendered as "A…"). */}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{member.display_name}</span>
                  <span className="truncate text-xs text-muted">{classLabel(member.char_class)}</span>
                </span>
                {assignment !== null && (
                  <span className="shrink-0 whitespace-nowrap rounded border border-line px-1.5 text-xs text-amber-400">
                    {assignmentBadge(assignment)} → mover
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
