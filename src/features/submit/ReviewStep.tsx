// ReviewStep — the mandatory fix-up gate (INPT-03, 02-UI-SPEC Screen 3 step 5).
// Every entered value is listed by group so the player checks them against
// their screenshots; Enviar stays disabled until all THREE group
// confirmations are checked. The gate is UX-only — the server re-validates
// the payload regardless (create_submission rejects unknown stat keys and
// derives member_id from the JWT).
import { useEffect, useState } from 'react'
import type { StatCatalogEntry } from '../../lib/api'
import { formatStatValue, parseStatValue } from '../../lib/parseStatValue'
import { WIZARD_GROUPS, type GroupInputs, type WizardGroup } from './wizard'

const GROUP_LABELS: Record<WizardGroup, string> = {
  general: 'Geral',
  quasi: 'Quasi',
  special: 'Especial',
}

const CONFIRMATION_COPY: Record<WizardGroup, string> = {
  general: 'Revisei os valores de Geral contra as capturas e estão corretos.',
  quasi: 'Revisei os valores de Quasi contra as capturas e estão corretos.',
  special: 'Revisei os valores de Especial contra as capturas e estão corretos.',
}

interface ReviewStepProps {
  /** full catalog (all groups; combat_power included) */
  entries: StatCatalogEntry[]
  inputs: GroupInputs
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
  submitting,
  missingRequired,
  submitError,
  onSubmit,
  onFixStat,
}: ReviewStepProps) {
  const [confirmed, setConfirmed] = useState<Record<WizardGroup, boolean>>({
    general: false,
    quasi: false,
    special: false,
  })

  // If anything was edited (jump-back-and-fix), the confirmations are stale:
  // the player must re-check the boxes against the corrected values.
  useEffect(() => {
    setConfirmed({ general: false, quasi: false, special: false })
  }, [inputs])

  const allChecked = WIZARD_GROUPS.every((g) => confirmed[g])

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
                    className="flex h-11 w-full items-center justify-between gap-4 rounded-md border border-line bg-surface px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
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

      {/* Mandatory review gate (INPT-03): Enviar cannot fire until all three
          group confirmations are checked. */}
      <div className="flex flex-col gap-1">
        {WIZARD_GROUPS.map((group) => (
          <label
            key={group}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-base text-content focus-within:focus-visible:ring-2 focus-within:focus-visible:ring-accent"
          >
            <input
              type="checkbox"
              checked={confirmed[group]}
              onChange={(e) => setConfirmed((c) => ({ ...c, [group]: e.target.checked }))}
              disabled={submitting}
              className="h-5 w-5 shrink-0 accent-[#E3B341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span>{CONFIRMATION_COPY[group]}</span>
          </label>
        ))}
      </div>

      {missingRequired !== null && missingRequired.length > 0 && (
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
          {`Faltam valores obrigatórios: ${missingRequired.join(', ')}.`}
        </p>
      )}
      {submitError !== null && (
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
          {submitError}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!allChecked || submitting}
        aria-busy={submitting}
        className="h-11 rounded-md bg-accent text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        Enviar
      </button>
    </div>
  )
}
