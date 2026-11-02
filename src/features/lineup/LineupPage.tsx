// Escalação — war modes + drag-and-drop roster (phase 10.4 / 0056 / 0058).
//
// Vingança de Vigrid keeps the two fixed battlefields (8 parties x 5 slots
// each). Guerra do Emperium uses 2..8 raids and always exactly 16 parties,
// except that every 5 active absences frees one full party (16 -> 15 -> ...,
// minimum 2). Officers drag players between the "Disponíveis" list, the
// "Ausências" list and the party slots; assigning to an occupied slot moves
// the previous occupant to "Disponíveis" (no swaps). Members see the same
// read-only grid with their own party/slot/raid highlighted.
//
// Every write goes through a device-bound SECURITY DEFINER RPC (migrations
// 0040/0044/0056/0057/0058); isStaff only decides which controls render. It is
// UX-only, never the security boundary.
import { useEffect, useRef, useState } from 'react'
import {
  fetchLineups,
  setLineupAbsence,
  setLineupPartyCounts,
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
  absentRoster,
  assignmentCallout,
  availableRoster,
  battlefieldFilledCount,
  buildAssignmentMap,
  classAccentHex,
  defaultEmperiumPartyCounts,
  filledInDroppedParties,
  findMemberAssignment,
  isPartyFull,
  isValidPartyCounts,
  lineupErrorCopy,
  lineupWarnings,
  MAX_PARTIES_PER_RAID,
  MIN_PARTIES_PER_RAID,
  minPartyCount,
  normalizeRoleLabel,
  partyFilledCount,
  raidCapacity,
  raidMeta,
  ROLE_LABEL_MAX,
  ROLE_LABEL_PRESETS,
  SLOTS_PER_PARTY,
  TOTAL_PARTIES,
  totalPartyCount,
  WAR_MODES,
  WAR_MODE_META,
} from './lineupModel'

type Mutation = (session: NeoFootSession) => Promise<LineupsPayload>

/** Which JPG button is busy: one raid id, or all raids ("todas"). */
type ExportScope = string

type PlayerSource = 'available' | 'slot' | 'absent'

interface PlayerSelection {
  memberId: string
  source: PlayerSource
}

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
  const [selected, setSelected] = useState<PlayerSelection | null>(null)
  const [drag, setDrag] = useState<PlayerSelection | null>(null)
  const [picker, setPicker] = useState<{
    battlefield: BattlefieldLineup['battlefield']
    partyIndex: number
    slotIndex: number
  } | null>(null)
  const [availableQuery, setAvailableQuery] = useState('')
  const [distOpen, setDistOpen] = useState(false)
  const [distCounts, setDistCounts] = useState<number[]>([])
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

  const currentMode = payload.war_mode
  const currentRaidCount = payload.raid_count
  const own = findMemberAssignment(payload, session.member_id)
  const ownAbsent = payload.absences.includes(session.member_id)
  const raids = payload.battlefields
  const assignments = buildAssignmentMap(payload)
  const warnings = lineupWarnings(payload)
  const absentIds = new Set(payload.absences)
  const absentMembers = absentRoster(payload.roster, absentIds)
  const availableMembers = availableRoster(payload.roster, assignments, absentIds)
  const absentCount = absentMembers.length
  const minParties =
    payload.war_mode === 'emperium' ? minPartyCount(absentCount) : TOTAL_PARTIES
  const releasedParties = TOTAL_PARTIES - minParties
  const partiesTotal = totalPartyCount(raids)
  const activeRaid = raids.find((raid) => raid.raid_index === selectedRaid) ?? raids[0] ?? null
  const visible: BattlefieldLineup[] = stacked ? raids : activeRaid === null ? [] : [activeRaid]
  const pickerRaid =
    picker === null ? null : (raids.find((raid) => raid.battlefield === picker.battlefield) ?? null)
  const pickerMeta =
    pickerRaid === null ? null : raidMeta(payload.war_mode, pickerRaid.raid_index)
  const modeMeta = WAR_MODE_META[payload.war_mode]
  const canRemoveRaid = payload.war_mode === 'emperium' && payload.raid_count > payload.min_raids
  const maxRaidCount = Math.min(payload.max_raids, partiesTotal)
  const canAddRaid = payload.war_mode === 'emperium' && payload.raid_count < maxRaidCount
  const distTotal = distCounts.reduce((sum, count) => sum + count, 0)
  const distTotalValid = distTotal >= minParties && distTotal <= TOTAL_PARTIES
  const canDropParties = distTotal >= partiesTotal || filledInDroppedParties(raids, distTotal) === 0
  const distValid =
    isValidPartyCounts(distCounts, minParties, TOTAL_PARTIES) && canDropParties
  const query = availableQuery.trim().toLocaleLowerCase('pt-BR')
  const filteredAvailable =
    query === ''
      ? availableMembers
      : availableMembers.filter((member) =>
          member.display_name.toLocaleLowerCase('pt-BR').includes(query),
        )

  function resetSelection() {
    setSelected(null)
    setDrag(null)
  }

  function assignMember(
    memberId: string,
    battlefield: BattlefieldLineup['battlefield'],
    party: number,
    slot: number,
  ) {
    if (saving) return
    if (absentIds.has(memberId)) {
      setActionError('Este jogador está marcado como ausente. Torne-o disponível antes de escalá-lo.')
      return
    }
    resetSelection()
    void runMutation((s) =>
      setLineupSlot(s, currentMode, battlefield, party, slot, memberId),
    )
  }

  function moveToAvailable(selection: PlayerSelection) {
    if (saving) return
    const assignment = assignments.get(selection.memberId)
    resetSelection()
    if (assignment) {
      void runMutation((s) =>
        setLineupSlot(
          s,
          currentMode,
          assignment.battlefield,
          assignment.party_index,
          assignment.slot_index,
          null,
        ),
      )
    } else if (absentIds.has(selection.memberId)) {
      setDistOpen(false)
      void runMutation((s) =>
        setLineupAbsence(s, currentMode, selection.memberId, false),
      )
    }
  }

  function markAbsent(memberId: string) {
    if (saving || absentIds.has(memberId)) return
    resetSelection()
    setDistOpen(false)
    void runMutation((s) => setLineupAbsence(s, currentMode, memberId, true))
  }

  function selectPlayer(memberId: string, source: PlayerSource) {
    setSelected((current) =>
      current !== null && current.memberId === memberId && current.source === source
        ? null
        : { memberId, source },
    )
  }

  function startDrag(memberId: string, source: PlayerSource) {
    setDrag({ memberId, source })
  }

  function handleSlotClick(
    battlefield: BattlefieldLineup['battlefield'],
    partyIndex: number,
    slotIndex: number,
    seatedMemberId: string | null,
  ) {
    if (!isStaff) return
    if (seatedMemberId !== null) {
      // Clicking a SEATED card selects that member (so the officer can then
      // drag them or drop them on another card). A seated click never moves
      // anyone by itself.
      selectPlayer(seatedMemberId, 'slot')
      return
    }
    // Empty slot: ALWAYS open the available-player picker. A leftover
    // selection from a previous click must never turn this into a silent
    // move — that made the list unreachable and shuffled one player around.
    setPicker({ battlefield, partyIndex, slotIndex })
  }

  function pickForSlot(memberId: string) {
    if (picker === null) return
    const target = picker
    setPicker(null)
    assignMember(memberId, target.battlefield, target.partyIndex, target.slotIndex)
  }

  /** Place the member that was selected before opening the picker. */
  function placeSelectedInPicker() {
    if (picker === null || selected === null) return
    if (selected.source === 'absent') {
      setActionError(
        'Este jogador está marcado como ausente. Torne-o disponível antes de escalá-lo.',
      )
      return
    }
    const target = picker
    setPicker(null)
    assignMember(selected.memberId, target.battlefield, target.partyIndex, target.slotIndex)
  }

  function handleSlotDrop(
    battlefield: BattlefieldLineup['battlefield'],
    partyIndex: number,
    slotIndex: number,
  ) {
    const current = drag ?? selected
    if (current === null) return
    if (current.source === 'absent') {
      setActionError(
        'Este jogador está marcado como ausente. Torne-o disponível antes de escalá-lo.',
      )
      return
    }
    assignMember(current.memberId, battlefield, partyIndex, slotIndex)
  }

  function handleAvailableDrop() {
    const current = drag ?? selected
    if (current === null || current.source === 'available') return
    moveToAvailable(current)
  }

  function handleAbsencesDrop() {
    const current = drag ?? selected
    if (current === null || current.source === 'absent') return
    markAbsent(current.memberId)
  }

  function openDistribution() {
    setDistCounts(raids.map((raid) => raid.parties.length))
    setDistOpen(true)
  }

  function addRaid() {
    setDistOpen(false)
    void runMutation((s) => setLineupRaidCount(s, 'emperium', currentRaidCount + 1))
  }

  function updateDistCount(index: number, raw: string) {
    const parsed = Number.parseInt(raw, 10)
    const value = Number.isNaN(parsed)
      ? MIN_PARTIES_PER_RAID
      : Math.min(MAX_PARTIES_PER_RAID, Math.max(MIN_PARTIES_PER_RAID, parsed))
    setDistCounts((counts) => counts.map((count, i) => (i === index ? value : count)))
  }

  function saveDistribution() {
    if (!distValid) return
    setDistOpen(false)
    void runMutation((s) => setLineupPartyCounts(s, 'emperium', distCounts))
  }

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
                  setDistOpen(false)
                  setPicker(null)
                  resetSelection()
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
        {own === null && ownAbsent && (
          <p className="rounded-md border border-amber-400 bg-surface px-3 py-2 text-sm text-amber-400">
            <span className="font-semibold">Você está marcado como ausente nesta guerra.</span>
          </p>
        )}

        {payload.war_mode === 'emperium' && (
          <div className="flex flex-col gap-2 rounded-md border border-line bg-surface px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-content">
                Raids: {payload.raid_count} / {payload.max_raids}
              </span>
              <span
                className={`text-sm font-semibold ${partiesTotal >= minParties && partiesTotal <= TOTAL_PARTIES ? 'text-success' : 'text-error'}`}
              >
                Parties: {partiesTotal} / {TOTAL_PARTIES}
              </span>
              {minParties < TOTAL_PARTIES && (
                <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-muted">
                  mín. {minParties}
                </span>
              )}
              {releasedParties > 0 && (
                <span className="rounded-full border border-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-400">
                  {absentCount} ausência(s) • {releasedParties} party(s) podem ser liberadas
                </span>
              )}
              {isStaff && (
                <>
                  <button
                    type="button"
                    aria-label="Remover raid"
                    disabled={saving || !canRemoveRaid}
                    onClick={() => {
                      setDistOpen(false)
                      void runMutation((s) =>
                        setLineupRaidCount(s, 'emperium', payload.raid_count - 1),
                      )
                    }}
                    className="h-11 min-w-11 rounded-md border border-line px-3 text-lg font-bold text-content hover-control disabled:opacity-40"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => (distOpen ? setDistOpen(false) : openDistribution())}
                    className="h-11 rounded-md border border-line px-3 text-sm text-content hover-control disabled:opacity-50"
                  >
                    {distOpen ? 'Fechar distribuição' : 'Distribuir parties'}
                  </button>
                </>
              )}
              {!isStaff && (
                <span className="text-sm text-muted">
                  {payload.min_raids} a {maxRaidCount} raids, até {MAX_PARTIES_PER_RAID} parties
                  por raid.
                </span>
              )}
            </div>

            {distOpen && isStaff && (
              <div className="flex flex-col gap-2 rounded-md border border-line bg-dominant p-2">
                <p className="text-xs text-muted">
                  Cada raid aceita de {MIN_PARTIES_PER_RAID} a {MAX_PARTIES_PER_RAID} parties. O
                  total pode ficar entre {minParties} e {TOTAL_PARTIES}. Para reduzir, esvazie as
                  últimas parties.
                </p>
                <div className="flex flex-wrap gap-3">
                  {raids.map((raid, index) => (
                    <label
                      key={raid.battlefield}
                      className="flex items-center gap-2 text-sm text-content"
                    >
                      <span>{raidMeta(payload.war_mode, raid.raid_index).subtitle}</span>
                      <input
                        type="number"
                        min={MIN_PARTIES_PER_RAID}
                        max={MAX_PARTIES_PER_RAID}
                        value={distCounts[index] ?? MIN_PARTIES_PER_RAID}
                        onChange={(event) => updateDistCount(index, event.target.value)}
                        aria-label={`Parties da ${raidMeta(payload.war_mode, raid.raid_index).subtitle}`}
                        className="h-11 w-20 rounded-md border border-line bg-surface px-2 text-sm text-content"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${distTotalValid ? 'text-success' : 'text-error'}`}
                  >
                    Total: {distTotal} / {TOTAL_PARTIES}
                  </span>
                  {!canDropParties && (
                    <span className="text-xs text-error">
                      Esvazie as últimas parties para reduzir o total.
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={saving || !distValid}
                    onClick={saveDistribution}
                    className="h-11 rounded-md border border-accent px-3 text-sm font-semibold text-content hover-control disabled:opacity-50"
                  >
                    Salvar distribuição
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setDistCounts(
                        defaultEmperiumPartyCounts(
                          payload.raid_count,
                          Math.max(minParties, Math.min(TOTAL_PARTIES, partiesTotal)),
                        ),
                      )
                    }
                    className="h-11 rounded-md border border-line px-3 text-sm text-content hover-control disabled:opacity-50"
                  >
                    Padrão
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistOpen(false)}
                    className="h-11 rounded-md border border-line px-3 text-sm text-muted hover-control"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
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
        {actionError !== null && (
          <p role="alert" className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-content">
            {actionError}
          </p>
        )}
      </header>

      {warnings.length > 0 && (
        <ul aria-label="Avisos da escalação" className="flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <li
              key={warning.id}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                warning.tone === 'warn'
                  ? 'border-error/40 bg-error/10 text-error'
                  : 'border-line bg-surface text-muted'
              }`}
            >
              {warning.message}
            </li>
          ))}
        </ul>
      )}

      {isStaff && (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <RosterPanel
              title="Disponíveis"
              count={availableMembers.length}
              members={filteredAvailable}
              source="available"
              selected={selected}
              disabled={saving}
              search={availableQuery}
              onSearch={setAvailableQuery}
              emptyText="Nenhum jogador disponível."
              actionLabel="Ausente"
              onAction={markAbsent}
              onSelect={(memberId) => selectPlayer(memberId, 'available')}
              onDragStart={(memberId) => startDrag(memberId, 'available')}
              onDragEnd={() => setDrag(null)}
              onHeaderClick={() => {
                if (selected !== null && selected.source !== 'available') {
                  moveToAvailable(selected)
                }
              }}
              onDrop={handleAvailableDrop}
            />
            <RosterPanel
              title="Ausências"
              count={absentMembers.length}
              members={absentMembers}
              source="absent"
              selected={selected}
              disabled={saving}
              emptyText="Nenhuma ausência marcada."
              subtitle={
                payload.war_mode === 'emperium'
                  ? `Cada ${SLOTS_PER_PARTY} ausências permite liberar 1 party (opcional).`
                  : undefined
              }
              actionLabel="Disponível"
              onAction={(memberId) => moveToAvailable({ memberId, source: 'absent' })}
              onSelect={(memberId) => selectPlayer(memberId, 'absent')}
              onDragStart={(memberId) => startDrag(memberId, 'absent')}
              onDragEnd={() => setDrag(null)}
              onHeaderClick={() => {
                if (selected !== null && selected.source !== 'absent') {
                  markAbsent(selected.memberId)
                }
              }}
              onDrop={handleAbsencesDrop}
            />
          </div>
          <p className="text-xs text-muted">
            Arraste um jogador para uma PT, para “Disponíveis” ou para “Ausências”. Também é
            possível selecionar um jogador e clicar no destino. Clique em um slot vazio para
            escolher um jogador dos disponíveis.
          </p>
        </>
      )}

      <div className="flex flex-col gap-4">
        <RaidTabs
          raids={raids}
          warMode={payload.war_mode}
          stacked={stacked}
          activeRaid={activeRaid}
          onSelect={(raidIndex) => {
            setStacked(false)
            setSelectedRaid(raidIndex)
          }}
          onToggleStacked={() => setStacked((value) => !value)}
          onAddRaid={isStaff && payload.war_mode === 'emperium' ? addRaid : undefined}
          canAddRaid={canAddRaid && !saving}
        />
        {visible.map((raid) => (
          <BattlefieldGrid
            key={raid.battlefield}
            raid={raid}
            warMode={payload.war_mode}
            memberId={session.member_id}
            isStaff={isStaff}
            saving={saving}
            selectedMemberId={isStaff ? (selected?.memberId ?? null) : null}
            onSlotClick={handleSlotClick}
            onSlotDrop={handleSlotDrop}
            onSlotDragStart={isStaff ? (memberId) => startDrag(memberId, 'slot') : () => {}}
            onSlotDragEnd={isStaff ? () => setDrag(null) : () => {}}
            onLabel={
              isStaff
                ? (party, label) =>
                    void runMutation((s) =>
                      setLineupPartyLabel(s, currentMode, raid.battlefield, party, label),
                    )
                : () => {}
            }
          />
        ))}
      </div>

      {picker !== null && isStaff && (
        <SlotOfferDialog
          title={
            pickerMeta === null
              ? 'Escolher jogador'
              : `Escolher jogador — ${pickerMeta.subtitle} G${picker.partyIndex} · Slot ${picker.slotIndex}`
          }
          members={availableMembers}
          disabled={saving}
          selectedName={
            selected !== null && selected.source !== 'absent'
              ? (payload.roster.find((m) => m.member_id === selected.memberId)?.display_name ??
                'jogador selecionado')
              : null
          }
          onPlaceSelected={placeSelectedInPicker}
          onPick={pickForSlot}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  )
}

/** Raid tab strip shared by staff and member layouts. */
function RaidTabs({
  raids,
  warMode,
  stacked,
  activeRaid,
  onSelect,
  onToggleStacked,
  onAddRaid,
  canAddRaid = false,
}: {
  raids: BattlefieldLineup[]
  warMode: WarMode
  stacked: boolean
  activeRaid: BattlefieldLineup | null
  onSelect: (raidIndex: number) => void
  onToggleStacked: () => void
  onAddRaid?: () => void
  canAddRaid?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Raids">
      {raids.map((raid) => {
        const meta = raidMeta(warMode, raid.raid_index)
        const filled = battlefieldFilledCount(raid)
        const capacity = raidCapacity(raid)
        const active = !stacked && activeRaid?.raid_index === raid.raid_index
        return (
          <button
            key={raid.battlefield}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(raid.raid_index)}
            className={`h-11 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? 'border-accent text-content glow-accent-soft'
                : 'border-transparent text-muted hover:border-line hover:text-content'
            }`}
          >
            {warMode === 'emperium' ? meta.subtitle : `${meta.title} (${meta.subtitle})`}{' '}
            <span className="ml-1 text-muted">
              {filled}/{capacity}
            </span>
          </button>
        )
      })}
      {onAddRaid !== undefined && (
        <button
          type="button"
          disabled={!canAddRaid}
          onClick={onAddRaid}
          aria-label="Criar raid"
          className="h-11 rounded-md border border-accent px-3 text-sm font-semibold text-content hover-control disabled:opacity-40"
        >
          + Criar raid
        </button>
      )}
      {raids.length > 1 && (
        <button
          type="button"
          onClick={onToggleStacked}
          aria-pressed={stacked}
          className="hidden h-11 rounded-md border border-line px-3 text-sm text-content hover-control md:inline-flex md:items-center"
        >
          {stacked ? 'Ver uma raid' : 'Ver todas'}
        </button>
      )}
    </div>
  )
}

/** The left "Disponíveis" / "Ausências" list. Draggable items + click target. */
function RosterPanel({
  title,
  count,
  members,
  source,
  selected,
  disabled,
  search,
  onSearch,
  emptyText,
  subtitle,
  actionLabel,
  onAction,
  onSelect,
  onDragStart,
  onDragEnd,
  onHeaderClick,
  onDrop,
}: {
  title: string
  count: number
  members: LineupRosterMember[]
  source: 'available' | 'absent'
  selected: PlayerSelection | null
  disabled: boolean
  search?: string
  onSearch?: (value: string) => void
  emptyText: string
  subtitle?: string
  actionLabel: string
  onAction: (memberId: string) => void
  onSelect: (memberId: string) => void
  onDragStart: (memberId: string) => void
  onDragEnd: () => void
  onHeaderClick: () => void
  onDrop: () => void
}) {
  return (
    <section
      aria-label={title}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-3"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <button
          type="button"
          onClick={onHeaderClick}
          title="Clique para mover o jogador selecionado para cá"
          className="text-left font-display text-lg font-bold text-content hover:text-accent"
        >
          {title} ({count})
        </button>
        {subtitle !== undefined && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {onSearch !== undefined && (
        <input
          type="search"
          aria-label={`Buscar em ${title}`}
          placeholder="Buscar jogador…"
          value={search ?? ''}
          onChange={(event) => onSearch(event.target.value)}
          className="h-11 w-full max-w-sm rounded-md border border-line bg-dominant px-3 text-sm text-content"
        />
      )}
      <ul className="flex min-w-0 gap-1 overflow-x-auto pb-1">
        {members.map((member) => {
          const active = selected?.memberId === member.member_id && selected.source === source
          return (
            <li key={member.member_id} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                draggable={!disabled}
                disabled={disabled}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', member.member_id)
                  onDragStart(member.member_id)
                }}
                onDragEnd={onDragEnd}
                onClick={() => onSelect(member.member_id)}
                aria-pressed={active}
                className={`flex min-h-11 w-48 items-center gap-2 rounded-md border px-2 py-1 text-left text-content hover-control disabled:opacity-60 ${
                  active ? 'border-accent glow-accent-soft' : 'border-line'
                }`}
              >
                <ClassCrest charClass={member.char_class} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{member.display_name}</span>
                  <span className="truncate text-xs text-muted">{classLabel(member.char_class)}</span>
                </span>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAction(member.member_id)}
                className="h-11 shrink-0 rounded-md border border-line px-2 text-xs text-content hover-control disabled:opacity-50"
              >
                {actionLabel}
              </button>
            </li>
          )
        })}
        {members.length === 0 && (
          <li className="shrink-0 px-2 py-2 text-sm text-muted">{emptyText}</li>
        )}
      </ul>
    </section>
  )
}

/**
 * Quick picker opened by clicking an empty slot. Lists the available roster
 * (already excludes seated and absent members) with a local search.
 */
export function SlotOfferDialog({
  title,
  members,
  disabled,
  selectedName = null,
  onPlaceSelected,
  onPick,
  onClose,
}: {
  title: string
  members: LineupRosterMember[]
  disabled: boolean
  /** Name of a member the officer selected before opening the picker — offered
   *  as a one-click placement so select-then-place still works. */
  selectedName?: string | null
  onPlaceSelected?: () => void
  onPick: (memberId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const filtered =
    needle === ''
      ? members
      : members.filter((member) =>
          member.display_name.toLocaleLowerCase('pt-BR').includes(needle),
        )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-offer-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="slot-offer-title" className="font-display text-lg font-bold text-content">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-11 shrink-0 rounded-md border border-line px-3 text-sm text-content hover-control"
          >
            Fechar
          </button>
        </div>
        <input
          autoFocus
          type="search"
          aria-label="Buscar jogador disponível"
          placeholder="Buscar jogador disponível…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 rounded-md border border-line bg-dominant px-3 text-sm text-content"
        />
        {selectedName !== null && onPlaceSelected !== undefined && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-accent/60 bg-accent/10 px-3 py-2">
            <p className="min-w-0 text-sm text-content">
              <span className="font-semibold">{selectedName}</span>
              <span className="text-muted"> está selecionado.</span>
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onPlaceSelected()
              }}
              className="h-9 shrink-0 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            >
              Colocar aqui
            </button>
          </div>
        )}
        <ul
          aria-label="Jogadores disponíveis"
          className="flex max-h-80 flex-col gap-1 overflow-y-auto"
        >
          {filtered.map((member) => (
            <li key={member.member_id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(member.member_id)}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-content hover-control disabled:opacity-60"
              >
                <ClassCrest charClass={member.char_class} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{member.display_name}</span>
                  <span className="truncate text-xs text-muted">{classLabel(member.char_class)}</span>
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2 py-2 text-sm text-muted">Nenhum jogador disponível.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

/** Pure grid for one raid: party cards, responsive. Exported for tests. */
export function BattlefieldGrid({
  raid,
  warMode,
  memberId,
  isStaff,
  saving,
  selectedMemberId,
  onSlotClick,
  onSlotDrop,
  onSlotDragStart,
  onSlotDragEnd,
  onLabel,
}: {
  raid: BattlefieldLineup
  warMode: WarMode
  memberId: string
  isStaff: boolean
  saving: boolean
  selectedMemberId: string | null
  onSlotClick: (
    battlefield: BattlefieldLineup['battlefield'],
    partyIndex: number,
    slotIndex: number,
    seatedMemberId: string | null,
  ) => void
  onSlotDrop: (
    battlefield: BattlefieldLineup['battlefield'],
    partyIndex: number,
    slotIndex: number,
  ) => void
  onSlotDragStart: (memberId: string) => void
  onSlotDragEnd: () => void
  onLabel: (partyIndex: number, label: string | null) => void
}) {
  const meta = raidMeta(warMode, raid.raid_index)
  const parties = raid.parties
  const filled = battlefieldFilledCount(raid)
  const capacity = raidCapacity(raid)
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
          {filled}/{capacity} escalados
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {parties.map((party) => (
          <PartyCard
            key={party.party_index}
            party={party}
            memberId={memberId}
            isStaff={isStaff}
            saving={saving}
            selectedMemberId={selectedMemberId}
            onSlotClick={(slotIndex, seatedMemberId) =>
              onSlotClick(raid.battlefield, party.party_index, slotIndex, seatedMemberId)
            }
            onSlotDrop={(slotIndex) =>
              onSlotDrop(raid.battlefield, party.party_index, slotIndex)
            }
            onSlotDragStart={onSlotDragStart}
            onSlotDragEnd={onSlotDragEnd}
            onLabel={(label) => onLabel(party.party_index, label)}
          />
        ))}
      </div>
    </div>
  )
}

function PartyCard({
  party,
  memberId,
  isStaff,
  saving,
  selectedMemberId,
  onSlotClick,
  onSlotDrop,
  onSlotDragStart,
  onSlotDragEnd,
  onLabel,
}: {
  party: LineupParty
  memberId: string
  isStaff: boolean
  saving: boolean
  selectedMemberId: string | null
  onSlotClick: (slotIndex: number, seatedMemberId: string | null) => void
  onSlotDrop: (slotIndex: number) => void
  onSlotDragStart: (memberId: string) => void
  onSlotDragEnd: () => void
  onLabel: (label: string | null) => void
}) {
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
              selected={slot.member_id !== null && slot.member_id === selectedMemberId}
              saving={saving}
              onClick={() => onSlotClick(slot.slot_index, slot.member_id)}
              onDrop={() => onSlotDrop(slot.slot_index)}
              onDragStart={() => {
                if (slot.member_id !== null) onSlotDragStart(slot.member_id)
              }}
              onDragEnd={onSlotDragEnd}
            />
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
  selected,
  saving,
  onClick,
  onDrop,
  onDragStart,
  onDragEnd,
}: {
  slot: LineupSlot
  partyIndex: number
  own: boolean
  isStaff: boolean
  selected: boolean
  saving: boolean
  onClick: () => void
  onDrop: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const leader = slot.slot_index === 1
  const vacant = slot.member_id === null
  const accent = classAccentHex(slot.char_class)
  const body = (
    <>
      {/* Filled: a solid 3px class-colour bar anchors the card. Empty: no bar
          at all — the row is a dashed hole, so the two states never read as
          "same card, slightly different tint". */}
      {!vacant && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: accent }} />
      )}
      <ClassCrest charClass={slot.char_class} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className={`flex items-center gap-1.5 truncate text-sm ${leader ? 'font-bold' : 'font-semibold'} ${vacant ? 'text-muted' : 'text-content'}`}>
          {vacant ? '— Vago —' : slot.display_name}
          {leader && !vacant && <span className="rounded bg-amber-400 px-1 text-[10px] font-bold uppercase text-black">Líder</span>}
          {own && <span className="rounded bg-accent px-1 text-[10px] font-bold text-accent-foreground">Você</span>}
        </span>
        {!vacant && <span className="truncate text-xs text-muted">{classLabel(slot.char_class)}</span>}
      </span>
    </>
  )
  const base = `relative flex items-center gap-2 overflow-hidden rounded-md border py-1.5 pr-2 ${
    vacant ? 'border-dashed border-line/60 pl-2.5' : 'pl-3'
  } ${
    selected
      ? 'border-accent glow-accent-soft'
      : own
        ? 'border-accent glow-accent-soft'
        : vacant
          ? 'border-line/60'
          : 'border-line'
  } ${vacant ? 'bg-dominant/50' : 'bg-surface'}`
  // The class colour FILLS the whole row (26% → 7%), not just a corner fade:
  // a seated slot is a coloured card, an empty one is an outline.
  const tint = vacant
    ? undefined
    : { backgroundImage: `linear-gradient(95deg, ${accent}42 0%, ${accent}1F 55%, ${accent}12 100%)` }

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
      disabled={saving}
      draggable={!saving && !vacant}
      onClick={onClick}
      onDragStart={(event) => {
        if (vacant) return
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', slot.member_id ?? '')
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
      aria-label={`Editar slot ${slot.slot_index} da G${partyIndex}`}
      className={`${base} w-full text-left hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70`}
      style={tint}
    >
      {body}
    </button>
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
