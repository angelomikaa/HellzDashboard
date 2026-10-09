// StatGroupStep — one stat group of the submit wizard (02-UI-SPEC Screen 3,
// steps 2-4, INPT-01). Labeled input rows with the group's example shot
// beside them; parse feedback via the shared pt-BR parser so manual entry and
// Phase 5 OCR normalize identically. Pure presentational: state lives in the
// parent (SubmitPage owns the inputs), this component only tracks which
// fields have been blurred so hints appear only after the player leaves the
// field.
import { useState } from 'react'
import type { StatCatalogEntry } from '../../lib/api'
import { formatStatValue, parseStatValue } from '../../lib/parseStatValue'
import type { GroupInputs, WizardGroup } from './wizard'

const INVALID_HINT = 'Valor inválido — use números (ex.: 1.234.567 ou 12,5%).'

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
}

export function StatGroupStep({ group, entries, inputs, onChange }: StatGroupStepProps) {
  // Hints appear after the first blur of a field; from then on the feedback
  // updates live so fixing a bad value immediately clears the error.
  const [blurred, setBlurred] = useState<Record<string, boolean>>({})
  const groupLabel = GROUP_LABELS[group]

  function fieldId(statKey: string): string {
    return `stat-${group}-${statKey}`
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* Example shot: tappable thumbnail above the list on mobile, side
          panel (>=128px) on sm: and up. Tapping opens the full-size asset in
          a new tab — it is a static panel-provided reference image, never a
          member upload. */}
      <a
        href={`/examples/${group}.svg`}
        target="_blank"
        rel="noreferrer"
        className="block w-full shrink-0 sm:order-2 sm:w-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        <img
          src={`/examples/${group}.svg`}
          alt={`Exemplo da captura de ${groupLabel}`}
          width={691}
          height={416}
          className="h-32 w-full rounded-md border border-line object-cover sm:h-auto"
        />
      </a>

      <div className="flex flex-1 flex-col gap-4">
        {entries.map((entry) => {
          const raw = inputs[entry.stat_key] ?? ''
          const parsed = parseStatValue(raw)
          const touched = blurred[entry.stat_key] === true && raw.trim() !== ''
          const invalid = touched && !parsed.ok
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
                  aria-invalid={invalid || undefined}
                  className={`h-11 w-full rounded-md border bg-surface text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    invalid ? 'border-destructive' : 'border-line'
                  } ${percentual ? 'pr-8' : 'px-3'}`}
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
              {touched && parsed.ok && parsed.value !== null && (
                <p className="text-sm font-semibold text-success">
                  {`✓ ${formatStatValue(parsed.value, entry.value_type)}`}
                </p>
              )}
              {invalid && (
                <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
                  {INVALID_HINT}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
