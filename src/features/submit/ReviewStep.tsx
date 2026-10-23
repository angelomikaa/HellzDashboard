// ReviewStep — the shrunk last-chance summary of the submit wizard
// (02-UI-SPEC Screen 3 step 5; restructured by 05-03 per D-08). The
// mandatory fix-up gate (INPT-03) moved onto the capture steps: each of the
// four steps (Personagem/Geral/Quasi/Especial) owns its verification
// checkbox in SubmitPage, and editing any value unchecks the owning step.
// This screen keeps the tap-to-fix value rows so the player gives everything
// one final look, and Enviar is gated on ALL FOUR step verifications being
// currently checked (defense in depth — the step gating should already
// guarantee it). The gate is UX-only — the server re-validates the payload
// regardless (create_submission rejects unknown stat keys and derives
// member_id from the JWT).
import type { StatCatalogEntry } from '../../lib/api'
import { formatStatValue, parseStatValue } from '../../lib/parseStatValue'
import { WIZARD_GROUPS, type GroupInputs, type WizardGroup } from './wizard'

const GROUP_LABELS: Record<WizardGroup, string> = {
  general: 'Geral',
  quasi: 'Quasi',
  special: 'Especial',
}

interface ReviewStepProps {
  /** full catalog (all groups; combat_power included) */
  entries: StatCatalogEntry[]
  inputs: GroupInputs
  /** all four capture-step verifications currently checked (SubmitPage
   *  owns the checkboxes — see the D-08 note above) */
  allStepsVerified: boolean
  /** submit in flight (SubmitPage owns the createSubmission call) */
  submitting: boolean
  /** required-stat labels that failed the payload build (defense — the step
   *  gates should have prevented reaching here with blanks) */
  missingRequired: string[] | null
  submitError: string | null
  onSubmit: () => void
  /** tap a value row to jump back and fix it (UI-SPEC step 5) */
  onFixStat: (statKey: string) => void
}

export function ReviewStep({
  entries,
  inputs,
  allStepsVerified,
  submitting,
  missingRequired,
  submitError,
  onSubmit,
  onFixStat,
}: ReviewStepProps) {
  return (
    <div className="flex flex-col gap-6">
      {WIZARD_GROUPS.map((group) => (
        <section key={group} aria-label={GROUP_LABELS[group]}>
          <h3 className="text-sm font-semibold text-muted">{GROUP_LABELS[group]}</h3>
          <div className="mt-2 flex flex-col gap-1">
            {entries
              .filter((e) => e.group_name === group)
              .map((entry) => {
                const parsed = parseStatValue(inputs[entry.stat_key] ?? '')
                const hasValue = parsed.ok && parsed.value !== null
                return (
                  <button
                    key={entry.stat_key}
                    type="button"
                    onClick={() => onFixStat(entry.stat_key)}
                    disabled={submitting}
                    className="flex h-11 w-full items-center justify-between gap-4 rounded-md border border-line bg-surface px-3 text-left hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="text-sm font-semibold text-content">{entry.label}</span>
                    <span className={hasValue ? 'text-base text-content' : 'text-base text-muted'}>
                      {hasValue && parsed.value !== null
                        ? formatStatValue(parsed.value, entry.value_type)
                        : '—'}
                    </span>
                  </button>
                )
              })}
          </div>
        </section>
      ))}

      {missingRequired !== null && missingRequired.length > 0 && (
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-error">
          {`Faltam valores obrigatórios: ${missingRequired.join(', ')}.`}
        </p>
      )}
      {submitError !== null && (
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-error">
          {submitError}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!allStepsVerified || submitting}
        aria-busy={submitting}
        className="h-11 rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        Enviar
      </button>
    </div>
  )
}
