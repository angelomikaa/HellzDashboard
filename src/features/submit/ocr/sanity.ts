// Sanity-range gates for OCR reads (plan 05-01, D-03/D-20).
//
// Hardcoded, spike-informed bounds that reject absurd parses while accepting
// every spike-plausible value (05-RESEARCH §3.4). These are calibration-
// friendly constants, never admin-tweakable: they exist so garbage OCR
// output can never silently pre-fill implausible values — the per-step
// human verification and the create_submission re-validation remain the
// real gates. Recalibration = edit here + normal deploy.
//
// CALIBRATION (debug session d05-uat-ocr-defects, 2026-10-12): the 05-01 seed
// OCR_ACCEPT_CONFIDENCE=85 was measured against the real spike samples and
// REMOVED. The offline harness (scripts/ocr-browserport-harness.test.mjs)
// proved the engine's reads are 56/56 exact on the canonical samples, yet 5
// CORRECT reads carried confidences 0.0/63/70/79/82 (Tesseract's mean-word
// confidence is unreliable on 1-6 glyph reads; a correct single-"0" read
// scored 0.0) — no threshold > 0 preserves the spike's 222/222 bar. The
// accept gate is therefore spike-parity: parseStatValue ok + sanityAccepts.
// Confidence remains ONLY the pickBestRead tiebreak among polarity
// candidates (spike recognizeBest scoring, verbatim). Safety stays layered:
// sanity ranges (below), dual-polarity scoring, mandatory per-step human
// verification (D-08/D-22), server-side re-validation (INPT-03).

export interface SanityRange {
  min: number
  max: number
}

/** Default range for flat stats: big enough for every legit spike value. */
export const FLAT_DEFAULT: SanityRange = { min: -100_000, max: 100_000_000 }

/** Default range for percentual stats: generous for damage modifiers. */
export const PERCENTUAL_DEFAULT: SanityRange = { min: -1_000, max: 5_000 }

/**
 * Per-stat overrides (spike-informed, 05-RESEARCH §3.4). CT/CD stats display
 * as negative reductions in-game — spike data confirmed negative reads on
 * exactly these keys, so their ranges are negative-only.
 */
export const SANITY_OVERRIDES: Record<string, SanityRange> = {
  combat_power: { min: 0, max: 100_000_000 },
  aspd: { min: 0, max: 5_000 },
  mspd: { min: 0, max: 1_000 },
  hit: { min: 0, max: 10_000 },
  flee: { min: 0, max: 10_000 },
  crit: { min: 0, max: 1_000 },
  crit_res: { min: 0, max: 1_000 },
  variable_ct: { min: -100, max: 0 },
  fixed_ct: { min: -100, max: 0 },
  variable_ct_pct: { min: -100, max: 0 },
  fixed_ct_pct: { min: -100, max: 0 },
  global_cd_pct: { min: -100, max: 0 },
}

/**
 * Does a parsed OCR value fall inside its sanity range? A per-stat override
 * wins; unknown stat keys fall to the flat/percentual default by the parse's
 * percentual flag. Bounds are inclusive on both ends.
 */
export function sanityAccepts(value: number, isPercentual: boolean, statKey: string): boolean {
  const range = SANITY_OVERRIDES[statKey] ?? (isPercentual ? PERCENTUAL_DEFAULT : FLAT_DEFAULT)
  return value >= range.min && value <= range.max
}
