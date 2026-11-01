// Battlefield lineup domain model (phase 10.4, LNUP-01..03). PURE: no React,
// no fetch, no DOM. The grid, the officer editor and the JPG export (10.4-03)
// all read these helpers so the counts and labels can never drift apart.
import {
  ApiError,
  type BattlefieldId,
  type LineupParty,
  type LineupRosterMember,
  type LineupSlot,
  type LineupsPayload,
  type WarMode,
} from '../../lib/api'

/** War modes in display order (owner 2026-11-01). */
export const WAR_MODES: readonly WarMode[] = ['vigrid', 'emperium']

export const WAR_MODE_META: Readonly<
  Record<WarMode, { title: string; shortTitle: string; description: string }>
> = {
  vigrid: {
    title: 'Vingança de Vigrid',
    shortTitle: 'Vigrid',
    description: 'Dois campos fixos de 8 parties.',
  },
  emperium: {
    title: 'Guerra do Emperium',
    shortTitle: 'Emperium',
    description: 'De 2 a 8 raids, cada uma com 8 parties.',
  },
}

/** Raid bounds: the Emperium mode requires at least two and allows up to eight. */
export const MIN_RAIDS = 2
export const MAX_RAIDS = 8
export const VIGRID_RAIDS = 2
export const DEFAULT_EMPERIUM_RAIDS = 3

/**
 * The Emperium invariant (owner 2026-11-01): the mode always has exactly 16
 * parties, no matter how many raids they are split into. A raid may hold 1..8
 * parties, so any raid count from 2 to 8 can produce a valid distribution.
 */
export const TOTAL_PARTIES = 16
export const MAX_PARTIES_PER_RAID = 8
export const MIN_PARTIES_PER_RAID = 1

export const BATTLEFIELD_IDS: readonly BattlefieldId[] = ['vigrid_field', 'ruinscape']

/** Titles are the owner's words (CONTEXT D-03/D-05). `fileSlug` names the JPG. */
export const BATTLEFIELD_META: Readonly<
  Record<'vigrid_field' | 'ruinscape', { title: string; subtitle: string; fileSlug: string }>
> = {
  vigrid_field: { title: 'Vigrid Field', subtitle: 'Raid 1', fileSlug: 'vigrid-field' },
  ruinscape: { title: 'Ruinscape', subtitle: 'Raid 2', fileSlug: 'ruinscape' },
}

export interface RaidMeta {
  title: string
  subtitle: string
  fileSlug: string
}

/** Owner-facing title/subtitle/file slug for one raid of a war mode. */
export function raidMeta(warMode: WarMode, raidIndex: number): RaidMeta {
  if (warMode === 'emperium') {
    return {
      title: 'Guerra do Emperium',
      subtitle: `Raid ${raidIndex}`,
      fileSlug: `emperium-raid-${raidIndex}`,
    }
  }
  if (raidIndex === 1) return BATTLEFIELD_META.vigrid_field
  return BATTLEFIELD_META.ruinscape
}

/** Server battlefield id for a raid position in a war mode. */
export function battlefieldForRaid(warMode: WarMode, raidIndex: number): BattlefieldId {
  if (warMode === 'emperium') return `emperium_raid_${raidIndex}` as BattlefieldId
  return raidIndex === 1 ? 'vigrid_field' : 'ruinscape'
}

/** Full slot capacity: 8 parties x 5 slots per raid (CONTEXT D-03). */
export const PARTIES_PER_BATTLEFIELD = 8
export const SLOTS_PER_PARTY = 5
export const TOTAL_CAPACITY_PER_BATTLEFIELD = PARTIES_PER_BATTLEFIELD * SLOTS_PER_PARTY

/** Seated-slot capacity of one raid, derived from its actual party count. */
export function raidCapacity(raid: { parties: readonly LineupParty[] }): number {
  return raid.parties.length * SLOTS_PER_PARTY
}

/** Total parties across a war mode; must equal TOTAL_PARTIES for Emperium. */
export function totalPartyCount(raids: readonly { parties: readonly LineupParty[] }[]): number {
  return raids.reduce((sum, raid) => sum + raid.parties.length, 0)
}

/**
 * Deterministic default distribution used when the officer changes the raid
 * count. Mirrors the server's _default_emperium_party_counts():
 * 3 raids -> 6/6/4 (the current guild layout), 2 -> 8/8, otherwise balanced.
 */
export function defaultEmperiumPartyCounts(raidCount: number): number[] {
  if (raidCount === 2) return [8, 8]
  if (raidCount === 3) return [6, 6, 4]
  const base = Math.floor(TOTAL_PARTIES / raidCount)
  const remainder = TOTAL_PARTIES % raidCount
  return Array.from({ length: raidCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

/** True when a distribution respects the Emperium invariant. */
export function isValidPartyCounts(counts: readonly number[]): boolean {
  return (
    counts.length >= MIN_RAIDS &&
    counts.length <= MAX_RAIDS &&
    counts.every(
      (count) =>
        Number.isInteger(count) &&
        count >= MIN_PARTIES_PER_RAID &&
        count <= MAX_PARTIES_PER_RAID,
    ) &&
    counts.reduce((sum, count) => sum + count, 0) === TOTAL_PARTIES
  )
}

/** Role-label presets offered to officers (CONTEXT D-03). */
export const ROLE_LABEL_PRESETS: readonly string[] = ['MOBS CIMA/BAIXO', 'MOBS DIREITA/ESQUERDA']
export const ROLE_LABEL_MAX = 40

/**
 * Class colour accents for the dark UI and the JPG export. Each hue is a
 * distinct, mid-to-light tone so the 4px bar stays visible on #1E1E1E. They are
 * decorative only: no text is ever set in these colours, so text AA contrast
 * comes from the neutral foreground tokens.
 */
export const CLASS_ACCENT_HEX: Readonly<Record<string, string>> = {
  'High Priest': '#F2D16B',
  Bard: '#8FD3F4',
  Gypsy: '#F28BC0',
  Biochemist: '#9BE15D',
  Mastersmith: '#C9A46A',
  Summoner: '#B583F0',
  'High Wizard': '#5AA9F5',
  Professor: '#7FD8C4',
  Sniper: '#9CC46E',
  Rebellion: '#E0786A',
  Paladin: '#FFE28A',
  'Lord Knight': '#6F9CFF',
  'Assassin Cross': '#D5607F',
  Stalker: '#6DBE8B',
  Champion: '#FF8A4C',
}

/** Neutral accent for an empty / unknown class (monogram fallback). */
export const NULL_CLASS_ACCENT_HEX = '#6B6B6B'

/** Accent hex for a catalog class key; null or unknown keys get the neutral. */
export function classAccentHex(charClass: string | null | undefined): string {
  if (charClass === null || charClass === undefined) return NULL_CLASS_ACCENT_HEX
  return CLASS_ACCENT_HEX[charClass] ?? NULL_CLASS_ACCENT_HEX
}

/** Where a roster member currently sits (null = unassigned). */
export interface LineupAssignment {
  war_mode: WarMode
  battlefield: BattlefieldId
  raid_index: number
  party_index: number
  slot_index: number
}

/** Number of seated (non-null) slots in one party, 0..5. */
export function partyFilledCount(party: LineupParty): number {
  return party.slots.filter((slot) => slot.member_id !== null).length
}

/** Total seated slots across one battlefield, 0..40. */
export function battlefieldFilledCount(bf: { parties: LineupParty[] }): number {
  return bf.parties.reduce((sum, party) => sum + partyFilledCount(party), 0)
}

/** True when a party has all five slots seated (footer turns green). */
export function isPartyFull(party: LineupParty): boolean {
  return partyFilledCount(party) === SLOTS_PER_PARTY
}

/** Lookup: member id -> where they sit. Built once per payload. */
export function buildAssignmentMap(payload: LineupsPayload): ReadonlyMap<string, LineupAssignment> {
  const map = new Map<string, LineupAssignment>()
  for (const bf of payload.battlefields) {
    for (const party of bf.parties) {
      for (const slot of party.slots) {
        if (slot.member_id !== null) {
          map.set(slot.member_id, {
            war_mode: payload.war_mode,
            battlefield: bf.battlefield,
            raid_index: bf.raid_index,
            party_index: party.party_index,
            slot_index: slot.slot_index,
          })
        }
      }
    }
  }
  return map
}

/** Where a member sits in the payload, or null when unassigned. */
export function findMemberAssignment(
  payload: LineupsPayload,
  memberId: string,
): LineupAssignment | null {
  return buildAssignmentMap(payload).get(memberId) ?? null
}

/** `Raid 1 · G3` badge text for an assignment (the swap/move indicator). */
export function assignmentBadge(assignment: LineupAssignment): string {
  const meta = raidMeta(assignment.war_mode, assignment.raid_index)
  return `${meta.subtitle} · G${assignment.party_index}`
}

/** Full callout text: `Guerra do Emperium (Raid 3) — G7 (Slot 5)`. */
export function assignmentCallout(assignment: LineupAssignment): string {
  const meta = raidMeta(assignment.war_mode, assignment.raid_index)
  return `${meta.title} (${meta.subtitle}) — G${assignment.party_index} (Slot ${assignment.slot_index})`
}

export interface AssignableEntry {
  member: LineupRosterMember
  assignment: LineupAssignment | null
}

/**
 * Officer picker list: roster members filtered by a case-insensitive name
 * query, unassigned members FIRST (alphabetical), then the already-assigned
 * ones with their current assignment so a move/swap is visible before choosing.
 */
export function filterAssignableRoster(
  roster: readonly LineupRosterMember[],
  assignments: ReadonlyMap<string, LineupAssignment>,
  query: string,
): AssignableEntry[] {
  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const entries = roster
    .filter((member) => needle === '' || member.display_name.toLocaleLowerCase('pt-BR').includes(needle))
    .map((member) => ({ member, assignment: assignments.get(member.member_id) ?? null }))

  return entries.sort((a, b) => {
    const aAssigned = a.assignment !== null ? 1 : 0
    const bAssigned = b.assignment !== null ? 1 : 0
    if (aAssigned !== bAssigned) return aAssigned - bAssigned
    return a.member.display_name.localeCompare(b.member.display_name, 'pt-BR')
  })
}

/** The slot a member sits in inside a payload (for highlight lookups). */
export function slotAt(
  payload: LineupsPayload,
  battlefield: BattlefieldId,
  partyIndex: number,
  slotIndex: number,
): LineupSlot | null {
  const bf = payload.battlefields.find((b) => b.battlefield === battlefield)
  const party = bf?.parties.find((p) => p.party_index === partyIndex)
  return party?.slots.find((s) => s.slot_index === slotIndex) ?? null
}

// Enumeration-safe pt-BR copy (house pattern): no HTTP codes or gateway internals.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SAVE_ERROR = 'Não foi possível salvar a alteração. Tente novamente.'
const LOAD_ERROR = 'Não foi possível carregar a escalação. Tente novamente.'

/**
 * pt-BR copy for a failed escalação read/write (maps server tokens, never raw
 * text). `mode` distinguishes a failed LOAD from a failed SAVE so a read error
 * never claims it could not save (10.4 code review WR-07).
 */
export function lineupErrorCopy(err: unknown, mode: 'read' | 'write' = 'write'): string {
  const message = err instanceof Error ? err.message : ''
  if (message.includes('device_mismatch')) return SESSION_ERROR
  if (message.includes('forbidden')) {
    return mode === 'read'
      ? 'Você não tem permissão para ver a escalação.'
      : 'Você não tem permissão para alterar a escalação.'
  }
  if (message.includes('invalid_lineup_member')) {
    return 'Este jogador não pode ser escalado (inativo ou fora da lista).'
  }
  if (message.includes('invalid_lineup_label')) {
    return `A função deve ter no máximo ${ROLE_LABEL_MAX} caracteres.`
  }
  if (message.includes('invalid_lineup_raid_count') || message.includes('invalid_war_mode')) {
    return `A guerra deve ter entre ${MIN_RAIDS} e ${MAX_RAIDS} raids.`
  }
  if (
    message.includes('invalid_lineup_party_counts') ||
    message.includes('invalid_lineup_party_count')
  ) {
    return `A distribuição deve somar ${TOTAL_PARTIES} parties, com ${MIN_PARTIES_PER_RAID} a ${MAX_PARTIES_PER_RAID} por raid.`
  }
  if (message.includes('lineup_raid_not_empty')) {
    return 'Esvazie a raid antes de removê-la.'
  }
  if (message.includes('invalid_lineup_party') || message.includes('invalid_lineup_slot')) {
    return 'Essa posição não existe mais. Recarregue a escalação.'
  }
  if (err instanceof ApiError && err.kind === 'network') return NETWORK_ERROR
  if (err instanceof ApiError && err.kind === 'unauthorized') return SESSION_ERROR
  return mode === 'read' ? LOAD_ERROR : SAVE_ERROR
}

/** Officer role-label validation: trimmed, 1..40 chars, or null to clear. */
export function normalizeRoleLabel(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  return trimmed.slice(0, ROLE_LABEL_MAX)
}
