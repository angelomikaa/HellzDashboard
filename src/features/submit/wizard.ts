// Wizard core logic (plan 02-03) — PURE functions, no React imports.
// Required/optional rules per 02-RESEARCH §6 P2D-C: General + Quasi fields
// are required; Special fields are optional (blank = not captured — a blank is
// never stored as 0); combat_power lives in group 'general' in the catalog
// but is optional here (special-cased by stat_key — entered on the intro
// step, OCR-filled in Phase 5).
import type { StatCatalogEntry } from '../../lib/api'
import { parseStatValue } from '../../lib/parseStatValue'

export const REQUIRED_GROUPS: ReadonlyArray<'general' | 'quasi'> = ['general', 'quasi']

export const WIZARD_GROUPS = ['general', 'quasi', 'special'] as const

export type WizardGroup = (typeof WIZARD_GROUPS)[number]

/** stat_key -> raw user input (exactly what the player typed, pt-BR forms). */
export type GroupInputs = Record<string, string>

export interface StatPayloadItem {
  stat_key: string
  value: number
}

export type StatsPayloadResult =
  | { ok: true; stats: StatPayloadItem[] }
  | { ok: false; missingRequired: string[] } // stat LABELS of required fields failing

/** combat_power is optional even though it sits in the 'general' catalog group. */
function isOptionalEntry(entry: StatCatalogEntry): boolean {
  return entry.group_name === 'special' || entry.stat_key === 'combat_power'
}

function isRequiredGroup(group: WizardGroup): group is 'general' | 'quasi' {
  return (REQUIRED_GROUPS as readonly string[]).includes(group)
}

/**
 * A group is complete when every required field parses via parseStatValue.
 * Optional fields (special group, combat_power) may stay blank — but if the
 * player typed something, it must parse.
 */
export function groupComplete(
  entries: StatCatalogEntry[],
  group: WizardGroup,
  inputs: GroupInputs,
): boolean {
  return entries
    .filter((e) => e.group_name === group)
    .every((e) => {
      const raw = inputs[e.stat_key] ?? ''
      const blank = raw.trim() === ''
      if (isOptionalEntry(e)) return blank || parseStatValue(raw).ok
      return parseStatValue(raw).ok
    })
}

/**
 * Build the create_submission payload: canonical numbers for exactly the
 * stats with a parseable value. Rejects (ok:false) with the offending stat
 * LABELS when any REQUIRED_GROUPS field is missing or unparseable — the UI
 * should have prevented that, but the server re-validates regardless (the
 * gate is UX-only, INPT-03).
 */
export function buildStatsPayload(
  entries: StatCatalogEntry[],
  inputs: GroupInputs,
): StatsPayloadResult {
  const stats: StatPayloadItem[] = []
  const missingRequired: string[] = []

  for (const entry of entries) {
    const raw = inputs[entry.stat_key] ?? ''
    const parsed = parseStatValue(raw)

    if (isOptionalEntry(entry)) {
      // Blank = not captured; an unparseable optional value is dropped, never
      // stored (never silently coerced to 0 either).
      if (parsed.ok && parsed.value !== null) {
        stats.push({ stat_key: entry.stat_key, value: parsed.value })
      }
      continue
    }

    if (isRequiredGroup(entry.group_name)) {
      if (parsed.ok && parsed.value !== null) {
        stats.push({ stat_key: entry.stat_key, value: parsed.value })
      } else {
        missingRequired.push(entry.label)
      }
    }
  }

  if (missingRequired.length > 0) return { ok: false, missingRequired }
  return { ok: true, stats }
}
