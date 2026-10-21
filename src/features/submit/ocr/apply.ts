// Shared OCR outcome applier (08-04, extracted from SubmitPage 05-04).
//
// ONE rule for every capture step of BOTH wizard surfaces (member SubmitPage
// and the session-less prospect application): a fresh read replaces EXACTLY
// the displayed fields of that step — detected values overwrite, undetected
// or unmapped fields go blank + failure flag — and the returned filled/failed
// sets replace that step's previous claims wholesale. Fields of other steps
// are never touched (D-14/D-15).
//
// The parent owns the write path (SubmitPage's handleChange also unchecks the
// step's verification), so this helper only calls setValue for the displayed
// keys and reports what happened. Pure: no React, no DOM.
import type { OcrFieldOutcome } from './recognize'

export interface AppliedOcrOutcomes {
  /** displayed stat_keys the read filled (raw value written) */
  filled: Set<string>
  /** displayed stat_keys the read could not fill (written blank) */
  failed: Set<string>
}

/**
 * Apply one step's read outcomes to its displayed keys. Every displayed key
 * is WRITTEN (raw value or ''), so a value from a previous read can never
 * linger after a failed detection.
 */
export function applyOcrOutcomes(
  displayedKeys: readonly string[],
  outcomes: readonly OcrFieldOutcome[],
  setValue: (statKey: string, raw: string) => void,
): AppliedOcrOutcomes {
  const byKey = new Map(outcomes.map((outcome) => [outcome.stat_key, outcome]))
  const filled = new Set<string>()
  const failed = new Set<string>()

  for (const statKey of displayedKeys) {
    const outcome = byKey.get(statKey)
    if (outcome !== undefined && outcome.status === 'filled') {
      setValue(statKey, outcome.raw)
      filled.add(statKey)
    } else {
      setValue(statKey, '')
      failed.add(statKey)
    }
  }

  return { filled, failed }
}
