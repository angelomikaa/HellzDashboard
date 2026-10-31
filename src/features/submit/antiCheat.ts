// Anti-cheat guardrails for stat submissions (Phase 10.5, owner 2026-10-30).
//
// TWO responsibilities, both PURE (no React, no network):
//
// 1. Pre-submit defense warning. Angelus (~+95% Base PDEF) and Assumptio
//    (~+95% Equipment PDEF/MDEF) can nearly double the four watched values.
//    The server flags anything >= 1.5x the same class+build-role cohort average
//    (migration 0046); this module mirrors that threshold client-side so the
//    player is warned BEFORE sending. The server value is authoritative — the
//    UI warning is advisory, exactly like the rest of the wizard's gates.
//
// 2. OCR provenance. The wizard records, per input key, the raw value the OCR
//    read printed. At submit time this module turns that trace into the
//    p_provenance payload: source 'ocr' when the submitted number is unchanged,
//    'ocr_edited' when the player changed it, and the printed value for the
//    officer's evidence panel. Inputs never read by OCR are omitted (the
//    server stores them as manual by absence).
//
// The equipment tooltip inputs (equip_pdef_raw / equip_mdef_raw) are transient
// (never submitted as stats) but MUST be tracked: RPDEF/RMDEF derive from
// them, so a hand-typed Equipment PDEF after the read is exactly the cheat the
// officer needs to see.

import type {
  AntiCheatFlags,
  DefenseBaseline,
  SubmissionProvenanceEntry,
} from '../../lib/api'
import { parseStatValue } from '../../lib/parseStatValue'
import { EQUIPMENT_RAW_KEYS, RAW_DEFENSE_STAT_KEYS } from './rawDefense'
import type { GroupInputs } from './wizard'

/** Server threshold (migration 0046, submission_anti_cheat). Keep in sync. */
export const DEFENSE_SPIKE_RATIO = 1.5

/** Owner threshold for an OVR swing without a class/role change (0046). */
export const OVR_SWING_POINTS = 8

/** The four stats Angelus/Assumptio inflate, in display order. */
export const ANTI_CHEAT_DEFENSE_KEYS = [
  ...RAW_DEFENSE_STAT_KEYS,
  'equip_pdef_pct',
  'equip_mdef_pct',
] as const

export interface DefenseWarning {
  stat_key: string
  label: string
  value_type: 'flat' | 'percentual'
  value: number
  baseline: number
  ratio: number
  sample_size: number
}

interface CatalogLike {
  stat_key: string
  label: string
  value_type: 'flat' | 'percentual'
}

/**
 * Defense values at or above 1.5x the cohort average. `inputs` must be the
 * EFFECTIVE inputs (withDerivedDefenses) so rpdef/rmdef are present. Missing
 * or unparseable values, unknown baselines and non-positive averages are
 * skipped (the server applies the same n>=3 / avg>0 guards).
 */
export function defenseSpikeWarnings(
  catalog: readonly CatalogLike[],
  inputs: GroupInputs,
  baselines: readonly DefenseBaseline[],
): DefenseWarning[] {
  const byKey = new Map(baselines.map((b) => [b.stat_key, b]))
  const labels = new Map(catalog.map((e) => [e.stat_key, e]))
  const warnings: DefenseWarning[] = []

  for (const statKey of ANTI_CHEAT_DEFENSE_KEYS) {
    const baseline = byKey.get(statKey)
    if (baseline === undefined || baseline.average <= 0) continue
    const parsed = parseStatValue(inputs[statKey] ?? '')
    if (!parsed.ok || parsed.value === null) continue
    const ratio = parsed.value / baseline.average
    if (ratio < DEFENSE_SPIKE_RATIO) continue
    const entry = labels.get(statKey)
    warnings.push({
      stat_key: statKey,
      label: entry?.label ?? statKey,
      value_type: entry?.value_type ?? 'flat',
      value: parsed.value,
      baseline: baseline.average,
      ratio,
      sample_size: baseline.sample_size,
    })
  }

  return warnings
}

/**
 * Build the p_provenance payload from the wizard's OCR trace.
 *
 * `ocrTrace` maps an input key to the raw string the LAST read filled. A key
 * absent from the trace was never OCR-filled and is omitted (manual). A key
 * whose final number equals the printed number is 'ocr' even if the player
 * retyped it in another pt-BR shape; a numerically different value is
 * 'ocr_edited'. Entries that no longer parse are dropped (they are not in the
 * submission payload either).
 */
export function buildProvenance(
  ocrTrace: Readonly<Record<string, string>>,
  finalInputs: GroupInputs,
  inputKeys: readonly string[],
): SubmissionProvenanceEntry[] {
  const out: SubmissionProvenanceEntry[] = []
  for (const key of inputKeys) {
    const printedRaw = ocrTrace[key]
    if (printedRaw === undefined) continue
    const printed = parseStatValue(printedRaw)
    const final = parseStatValue(finalInputs[key] ?? '')
    if (!printed.ok || printed.value === null) continue
    if (!final.ok || final.value === null) continue
    out.push({
      input_key: key,
      source: final.value === printed.value ? 'ocr' : 'ocr_edited',
      ocr_value: printed.value,
      final_value: final.value,
    })
  }
  return out
}

/**
 * True when the server-reported OVR swing crosses the owner threshold AND the
 * submission does not change class/build-role (the owner's condition). The
 * server sets `flagged` for the same rule; this mirror keeps the panel
 * styling honest if the payload shape is ever partial.
 */
export function ovrSwingFlagged(flags: AntiCheatFlags): boolean {
  const swing = flags.ovr_swing
  return (
    !swing.class_changed &&
    !swing.function_changed &&
    swing.delta !== null &&
    Math.abs(swing.delta) >= OVR_SWING_POINTS
  )
}

/**
 * Every input key the submit payload can carry provenance for: the catalog
 * stats (submitted numbers) plus the two transient equipment tooltip inputs
 * (evidence for the derived RPDEF/RMDEF).
 */
export function provenanceInputKeys(catalog: readonly { stat_key: string }[]): string[] {
  return [...catalog.map((e) => e.stat_key), ...EQUIPMENT_RAW_KEYS]
}
