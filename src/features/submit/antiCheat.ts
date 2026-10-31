// Anti-cheat guardrails for stat submissions (Phase 10.5, owner 2026-10-30).
//
// TWO responsibilities, both PURE (no React, no network):
//
// 1. Pre-submit curve warning. Angelus (~+95% Base PDEF) and Assumptio
//    (~+95% Equipment PDEF/MDEF) can nearly double the four watched values.
//    The server reference is the robust COHORT CURVE only (median + MAD,
//    n >= 5); a value at >= 3.5 sigma above the median is flagged (migration
//    0050). This module mirrors that rule client-side so the player is warned
//    BEFORE sending. No fixed 1.5x margin is used. The server value is
//    authoritative — the UI warning is advisory, like the wizard's gates.
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

/** Robust curve gate (migration 0050, submission_anti_cheat). Keep in sync. */
export const DEFENSE_SIGMA_THRESHOLD = 3.5

/** Minimum cohort size for the robust median/MAD curve. */
export const DEFENSE_MIN_SAMPLE = 5

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
  median: number
  mad: number
  z: number
  sample_size: number
}

interface CatalogLike {
  stat_key: string
  label: string
  value_type: 'flat' | 'percentual'
}

/**
 * Defense values at or above 3.5 sigma from the cohort MEDIAN (robust
 * median/MAD curve). `inputs` must be the EFFECTIVE inputs
 * (withDerivedDefenses) so rpdef/rmdef are present. Missing baselines, n < 5,
 * non-positive medians/MADs and unparseable values are skipped — exactly the
 * server guards; no fixed 1.5x margin is involved.
 */
export function defenseCurveWarnings(
  catalog: readonly CatalogLike[],
  inputs: GroupInputs,
  baselines: readonly DefenseBaseline[],
): DefenseWarning[] {
  const byKey = new Map(baselines.map((b) => [b.stat_key, b]))
  const labels = new Map(catalog.map((e) => [e.stat_key, e]))
  const warnings: DefenseWarning[] = []

  for (const statKey of ANTI_CHEAT_DEFENSE_KEYS) {
    const baseline = byKey.get(statKey)
    if (baseline === undefined || baseline.sample_size < DEFENSE_MIN_SAMPLE) continue
    if (baseline.median === null || baseline.mad === null) continue
    if (baseline.median <= 0 || baseline.mad <= 0) continue
    const parsed = parseStatValue(inputs[statKey] ?? '')
    if (!parsed.ok || parsed.value === null) continue
    const scale = Math.max(1.4826 * baseline.mad, 0.05 * Math.abs(baseline.median), 1)
    const z = (parsed.value - baseline.median) / scale
    if (z < DEFENSE_SIGMA_THRESHOLD) continue
    const entry = labels.get(statKey)
    warnings.push({
      stat_key: statKey,
      label: entry?.label ?? statKey,
      value_type: entry?.value_type ?? 'flat',
      value: parsed.value,
      median: baseline.median,
      mad: baseline.mad,
      z,
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
