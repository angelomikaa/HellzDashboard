// StatGroupStep — one stat group of the submit wizard (02-UI-SPEC Screen 3,
// steps 2-4, INPT-01). Labeled input rows with the group's example shot
// beside them; parse feedback via the shared pt-BR parser so manual entry and
// Phase 5 OCR normalize identically. Pure presentational: state lives in the
// parent (SubmitPage owns the inputs), this component only tracks which
// fields have been blurred so hints appear only after the player leaves the
// field.
//
// 05-04 OCR field states: while a read runs the step's inputs are disabled
// with a shimmer and the reading placeholder (D-17 — no typing/OCR race);
// fields the read could not fill render the locked failure message below
// (D-04/D-14/D-16 — blank + manual-fill instruction, never a machine guess).
// The parent (SubmitPage) owns the flag set and clears a flag when the
// player types; the failure message and the parse hint never coexist.
//
// D-05-UAT-9 (owner-ratified 2026-10-12): the parse feedback runs for OCR
// pre-fills exactly as for typed values — the parent passes the step's
// ocrFilledFields set and the shared rule (fieldValidation.ts) engages the
// display for blurred OR OCR-filled fields. Same rule, same display.
import { useState, type ReactNode } from 'react'
import type { StatCatalogEntry } from '../../lib/api'
import type { GroupInputs, WizardGroup } from './wizard'
import { INVALID_HINT, isFieldEngaged, statFieldFeedback } from './fieldValidation'

// Locked UI-SPEC copy (definition site, exported for the step-1 combat_power
// field in SubmitPage — the single definition site codebase-wide; comments
// describe it, never quote it).
export const OCR_FIELD_FAILURE =
  'O valor não foi detectado na print - Por favor preencha o campo manualmente'

// Reading placeholder doubles as the running skeleton hint (D-17).
const READING_PLACEHOLDER = 'Lendo captura…'

const GROUP_LABELS: Record<WizardGroup, string> = {
  general: 'Geral',
  quasi: 'Quasi',
  special: 'Especial',
}

interface StatGroupStepProps {
  group: WizardGroup
  /** catalog entries of ONE group, in catalog order */
  entries: StatCatalogEntry[]
  inputs: GroupInputs
  onChange: (statKey: string, raw: string) => void
  /** true while this step's OCR read is in flight (D-17 skeleton state) */
  ocrRunning: boolean
  /** stat_keys of this step's fields the read could not fill (D-14) */
  failedFields: ReadonlySet<string>
  /** stat_keys of this step's fields the LATEST read pre-filled — they are
   *  validation-engaged exactly like blurred fields (D-05-UAT-9) */
  ocrFilledFields: ReadonlySet<string>
  /** Owner feedback (07.2-06 checkpoint): the upload/OCR entry renders in the
   *  RIGHT rail under the example shot — the wizard reads
   *  example + upload | fields, never upload above fields. */
  capture?: ReactNode
}

export function StatGroupStep({ group, entries, inputs, onChange, ocrRunning, failedFields, ocrFilledFields, capture }: StatGroupStepProps) {
  // Hints appear after the first blur of a field; from then on the feedback
  // updates live so fixing a bad value immediately clears the error.
  const [blurred, setBlurred] = useState<Record<string, boolean>>({})
  const groupLabel = GROUP_LABELS[group]

  function fieldId(statKey: string): string {
    return `stat-${group}-${statKey}`
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Capture strip (owner feedback, 07.2-06 checkpoint round 2): the
          example shot + the OCR upload box share ONE full-width strip at the
          top; the fields are ONLY below it (never beside the upload UI).
          Tapping the example opens the full-size asset in a new tab — it is a
          static panel-provided reference image, never member screenshot
          data. */}
      <div className="flex w-full flex-col gap-4 rounded-lg border border-line bg-surface p-4 lg:flex-row lg:items-stretch">
        <a
          href={`/examples/${group}.png`}
          target="_blank"
          rel="noreferrer"
          className="mx-auto block w-full max-w-xs shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:mx-0 lg:w-80"
        >
          <img
            src={`/examples/${group}.png`}
            alt={`Exemplo da captura de ${groupLabel}`}
            className="h-auto w-full rounded-md border border-line object-contain"
          />
        </a>
        <div className="min-w-0 flex-1">{capture}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => {
          const raw = inputs[entry.stat_key] ?? ''
          const engaged = isFieldEngaged(entry.stat_key, blurred, ocrFilledFields)
          const feedback = statFieldFeedback(raw, entry.value_type, engaged)
          const percentual = entry.value_type === 'percentual'
          return (
            <div key={entry.stat_key} className="flex flex-col gap-1">
              <label htmlFor={fieldId(entry.stat_key)} className="text-sm font-semibold text-content">
                {entry.label}
              </label>
              <div className="relative">
                <input
                  id={fieldId(entry.stat_key)}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={raw}
                  onChange={(e) => onChange(entry.stat_key, e.target.value)}
                  onBlur={() => setBlurred((b) => ({ ...b, [entry.stat_key]: true }))}
                  aria-invalid={feedback.invalid || undefined}
                  disabled={ocrRunning}
                  placeholder={ocrRunning ? READING_PLACEHOLDER : undefined}
                  className={`h-11 w-full rounded-md border bg-surface text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    // `!` keeps the hover border-brighten from masking the
                    // validation border while an invalid value is hovered.
                    feedback.invalid ? 'border-error!' : 'border-line'
                  } ${percentual ? 'pr-8' : 'px-3'} ${ocrRunning ? 'animate-pulse' : ''}`}
                />
                {percentual && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-muted"
                  >
                    %
                  </span>
                )}
              </div>
              {feedback.ok && (
                <p className="text-sm font-semibold text-success">
                  {feedback.checkText}
                </p>
              )}
              {feedback.invalid && (
                <p role="alert" aria-live="polite" className="text-sm font-semibold text-error">
                  {INVALID_HINT}
                </p>
              )}
              {!feedback.invalid && failedFields.has(entry.stat_key) && (
                <p role="alert" aria-live="polite" className="text-sm font-semibold text-error">
                  {OCR_FIELD_FAILURE}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
