// Raw defense calculation (Phase 9.1, DEF-03).
//
// RPDEF / RMDEF are derived read-only stats: floor(Equipment DEF / (1 + DEF%)).
// Equipment values are TRANSIENT (never stored, never submitted) and live under
// non-catalog keys equip_pdef_raw / equip_mdef_raw. The computed raw values are
// merged into effective inputs (via withDerivedDefenses) so groupComplete,
// ReviewStep, buildStatsPayload, and the prospect gate always see consistent
// raw values without polluting the raw input record.
//
// PURE: no React, no DOM. Testable in isolation.

import { parseStatValue } from '../../lib/parseStatValue'
import type { GroupInputs } from './wizard'

export const RAW_DEFENSE_STAT_KEYS = ['rpdef', 'rmdef'] as const
export const EQUIPMENT_RAW_KEYS = ['equip_pdef_raw', 'equip_mdef_raw'] as const
export const EQUIPMENT_PCT_KEYS = ['equip_pdef_pct', 'equip_mdef_pct'] as const

/** Map equipment raw key -> matching pct key. */
const EQUIP_TO_PCT: Record<string, string> = {
  equip_pdef_raw: 'equip_pdef_pct',
  equip_mdef_raw: 'equip_mdef_pct',
}

/** Map pct key -> matching raw stat key (catalog stat written by withDerivedDefenses). */
const PCT_TO_RAW: Record<string, string> = {
  equip_pdef_pct: 'rpdef',
  equip_mdef_pct: 'rmdef',
}

/**
 * One tooltip card's static config (DefenseStep). The capture key, the
 * transient equipment/pct input keys, and the derived catalog stat key.
 */
export interface RawDefenseCard {
  capture: 'pdef_tooltip' | 'mdef_tooltip'
  equipmentKey: 'equip_pdef_raw' | 'equip_mdef_raw'
  pctKey: 'equip_pdef_pct' | 'equip_mdef_pct'
  rawKey: 'rpdef' | 'rmdef'
  label: string
  title: string
  example: string
}

/**
 * Compute one raw defense: floor(equipment / (1 + pct / 100)).
 *
 * Guards:
 *  - equipment must parse as a non-percentual, non-negative number
 *  - pct must parse; denominator 1 + pct/100 must be > 0 (pct > -100)
 *  - result must be finite
 *
 * Returns null when any guard fails or either input is blank/invalid — the
 * caller treats null as "raw value not computable yet" (blank in effective
 * inputs, which blocks the Especial gate).
 */
export function computeRawDefense(
  equipmentRaw: string | undefined,
  pctRaw: string | undefined,
): number | null {
  const equip = parseStatValue(equipmentRaw ?? '')
  if (!equip.ok || equip.isPercentual || !Number.isFinite(equip.value) || equip.value < 0) {
    return null
  }

  const pct = parseStatValue(pctRaw ?? '')
  if (!pct.ok || !Number.isFinite(pct.value)) return null

  const denominator = 1 + pct.value / 100
  if (!Number.isFinite(denominator) || denominator <= 0) return null

  const raw = Math.floor(equip.value / denominator)
  return Number.isFinite(raw) ? raw : null
}

/**
 * Merge computed raw defenses into a copy of `inputs`. Raw stat keys are set to
 * their canonical string when computable, '' otherwise — so required-group
 * gates treat missing raw values as incomplete.
 */
export function withDerivedDefenses(inputs: GroupInputs): GroupInputs {
  const out: GroupInputs = { ...inputs }

  for (const equipKey of EQUIPMENT_RAW_KEYS) {
    const pctKey = EQUIP_TO_PCT[equipKey]
    const rawStatKey = PCT_TO_RAW[pctKey]
    const raw = computeRawDefense(inputs[equipKey], inputs[pctKey])
    out[rawStatKey] = raw === null ? '' : String(raw)
  }

  return out
}

/** True when every raw defense is computable from the current inputs. */
export function rawDefensesComplete(inputs: GroupInputs): boolean {
  return RAW_DEFENSE_STAT_KEYS.every((key) => {
    const raw = inputs[key]
    return raw !== undefined && raw.trim() !== '' && parseStatValue(raw).ok
  })
}
