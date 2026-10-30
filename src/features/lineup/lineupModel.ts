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
} from '../../lib/api'

export const BATTLEFIELD_IDS: readonly BattlefieldId[] = ['vigrid_field', 'ruinscape']

/** Titles are the owner's words (CONTEXT D-03/D-05). `fileSlug` names the JPG. */
export const BATTLEFIELD_META: Readonly<
  Record<BattlefieldId, { title: string; subtitle: string; fileSlug: string }>
> = {
  vigrid_field: { title: 'Vigrid Field', subtitle: 'Raid 1', fileSlug: 'vigrid-field' },
  ruinscape: { title: 'Ruinscape', subtitle: 'Raid 2', fileSlug: 'ruinscape' },
}

/** Full slot capacity: 8 parties x 5 slots per battlefield (CONTEXT D-03). */
export const PARTIES_PER_BATTLEFIELD = 8
export const SLOTS_PER_PARTY = 5
export const TOTAL_CAPACITY_PER_BATTLEFIELD = PARTIES_PER_BATTLEFIELD * SLOTS_PER_PARTY

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
  battlefield: BattlefieldId
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
            battlefield: bf.battlefield,
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
  const meta = BATTLEFIELD_META[assignment.battlefield]
  return `${meta.subtitle} · G${assignment.party_index}`
}

/** Full callout text: `Vigrid Field (Raid 1) — G7 (Slot 5)`. */
export function assignmentCallout(assignment: LineupAssignment): string {
  const meta = BATTLEFIELD_META[assignment.battlefield]
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
const GENERIC_ERROR = 'Não foi possível salvar a alteração. Tente novamente.'

/** pt-BR copy for a failed lineup read/write (maps server tokens, never raw text). */
export function lineupErrorCopy(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  if (message.includes('device_mismatch')) return SESSION_ERROR
  if (message.includes('forbidden')) return 'Você não tem permissão para alterar a lineup.'
  if (message.includes('invalid_lineup_member')) {
    return 'Este jogador não pode ser escalado (inativo ou fora da lista).'
  }
  if (message.includes('invalid_lineup_label')) {
    return `A função deve ter no máximo ${ROLE_LABEL_MAX} caracteres.`
  }
  if (err instanceof ApiError && err.kind === 'network') return NETWORK_ERROR
  return GENERIC_ERROR
}

/** Officer role-label validation: trimmed, 1..40 chars, or null to clear. */
export function normalizeRoleLabel(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  return trimmed.slice(0, ROLE_LABEL_MAX)
}
