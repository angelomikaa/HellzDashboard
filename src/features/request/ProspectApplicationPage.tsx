// ProspectApplicationPage — the session-less full application wizard
// (08-04, WHIT-08/09, IDEN-03).
//
// The applicant already passed the identity/PIN/proof step on
// RequestAccessPage; this wizard adds the stats and posts the SAME
// request-access endpoint with request_type 'prospect'. It never calls
// create_submission and never mints a session — a request stays staff-gated
// (T-08-28).
//
// Reuse, not fork: StatGroupStep / ReviewStep / OcrCapture and the shared
// applyOcrOutcomes + wizard rules are the exact member-wizard components.
// Only the shell differs: read-only identity summary (no second proof), the
// anonymous catalog, and the prospect submit path.
import { useEffect, useState } from 'react'
import {
  fetchPublicCatalog,
  requestAccess,
  type StatCatalogEntry,
} from '../../lib/api'
import {
  PROSPECT_STEP_GROUP,
  prospectCanContinue,
  prospectGroupEntries,
  prospectStepForMissing,
  submitProspectApplication,
  type ProspectDraft,
  type ProspectStep,
} from './requestFlow'
import { OcrCapture } from '../submit/OcrCapture'
import { ReviewStep } from '../submit/ReviewStep'
import { OCR_FIELD_FAILURE, StatGroupStep } from '../submit/StatGroupStep'
import { DefenseStep } from '../submit/DefenseStep'
import { INVALID_HINT, statFieldFeedback } from '../submit/fieldValidation'
import { applyOcrOutcomes } from '../submit/ocr/apply'
import type { OcrFieldOutcome } from '../submit/ocr'
import { WIZARD_GROUPS, type GroupInputs } from '../submit/wizard'
import { withDerivedDefenses, RAW_DEFENSE_STAT_KEYS } from '../submit/rawDefense'
import { FUNCTION_LABELS } from '../../lib/groups'

export const PROSPECT_LOAD_ERROR = 'Não foi possível carregar o formulário.'

const STEP_GROUP = PROSPECT_STEP_GROUP
const STEP_NAMES = ['Personagem', 'Geral', 'Quasi', 'Especial', 'Revisão'] as const

// Same copy as SubmitPage's step-1 combat field (D-17 parity).
const OCR_READING_PLACEHOLDER = 'Lendo captura…'

function emptyClaims(): Record<1 | 2 | 3 | 4, ReadonlySet<string>> {
  return { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() }
}

export interface ProspectApplicationPageProps {
  draft: ProspectDraft
  onBack: () => void
  onSubmitted: (requestId: string) => void
  /** Test seam: SSR renders the wizard without running the anon fetch (the
   *  node test environment has no effects). Production never passes it. */
  initialCatalog?: StatCatalogEntry[]
}

export function ProspectApplicationPage({
  draft,
  onBack,
  onSubmitted,
  initialCatalog,
}: ProspectApplicationPageProps) {
  const [catalog, setCatalog] = useState<StatCatalogEntry[] | null>(initialCatalog ?? null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadToken, setLoadToken] = useState(0)

  const [step, setStep] = useState<ProspectStep>(1)
  const [inputs, setInputs] = useState<GroupInputs>({})

  // Effective inputs = manual inputs + computed read-only raw defenses
  // (Phase 9.1 DEF-03).
  const effectiveInputs = withDerivedDefenses(inputs)
  const [ocrRunningStep, setOcrRunningStep] = useState<1 | 2 | 3 | 4 | null>(null)
  const [failedFields, setFailedFields] = useState(emptyClaims)
  const [ocrFilledFields, setOcrFilledFields] = useState(emptyClaims)
  const [combatPowerBlurred, setCombatPowerBlurred] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [missingRequired, setMissingRequired] = useState<string[] | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [identityError, setIdentityError] = useState<string | null>(null)

  useEffect(() => {
    // The test seam provides the catalog synchronously; skip the anon read.
    if (initialCatalog !== undefined) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await fetchPublicCatalog()
        if (!cancelled) setCatalog(rows)
      } catch {
        if (!cancelled) setLoadError(PROSPECT_LOAD_ERROR)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadToken, initialCatalog])

  function retryLoad(): void {
    setLoadError(null)
    setCatalog(null)
    setLoadToken((token) => token + 1)
  }

  /** Same single edit path as SubmitPage minus the attestation (prospects do
   *  not have per-step verification): typing clears that field's OCR failure. */
  function handleChange(statKey: string, raw: string): void {
    setInputs((prev) => ({ ...prev, [statKey]: raw }))
    const owner = ownerStep(statKey)
    setFailedFields((prev) => {
      const set = prev[owner]
      if (!set.has(statKey)) return prev
      const next = new Set(set)
      next.delete(statKey)
      return { ...prev, [owner]: next }
    })
  }

  function ownerStep(statKey: string): 1 | 2 | 3 | 4 {
    if (statKey === 'combat_power') return 1
    const entry = catalog?.find((candidate) => candidate.stat_key === statKey)
    if (entry === undefined) return 1
    const index = WIZARD_GROUPS.indexOf(entry.group_name)
    return index >= 0 ? ((index + 2) as 2 | 3 | 4) : 1
  }

  /** Shared applier (D-14/D-15): one read replaces exactly this step's
   *  displayed fields — manual entry stays the backbone. */
  function applyStepOcrOutcomes(stepNo: 1 | 2 | 3 | 4, outcomes: OcrFieldOutcome[]): void {
    if (catalog === null) return
    const displayed =
      stepNo === 1
        ? ['combat_power']
        : prospectGroupEntries(catalog, STEP_GROUP[stepNo]).map((entry) => entry.stat_key)
    const { filled, failed } = applyOcrOutcomes(displayed, outcomes, handleChange)
    setFailedFields((prev) => ({ ...prev, [stepNo]: failed }))
    setOcrFilledFields((prev) => ({ ...prev, [stepNo]: filled }))
  }

  function handleOcrReadFailed(stepNo: 1 | 2 | 3 | 4): void {
    setFailedFields((prev) => ({ ...prev, [stepNo]: new Set() }))
  }

  function handleOcrRunState(stepNo: 1 | 2 | 3 | 4, running: boolean): void {
    setOcrRunningStep(running ? stepNo : null)
  }

  async function handleSubmit(): Promise<void> {
    if (submitting || catalog === null) return
    setMissingRequired(null)
    setSubmitError(null)
    setIdentityError(null)
    setSubmitting(true)
    try {
      // The one write path: POST request-access with
      // { request_type: 'prospect', ...draft identity, stats } — never
      // create_submission, and never a session (T-08-28).
      const outcome = await submitProspectApplication(draft, catalog, effectiveInputs, {
        requestAccess,
      })
      if (outcome.ok) {
        onSubmitted(outcome.requestId)
        return
      }
      if (outcome.kind === 'missing') {
        setMissingRequired(outcome.missingRequired)
        setStep(prospectStepForMissing(catalog, outcome.missingRequired))
        return
      }
      if (outcome.field !== undefined) {
        setIdentityError(outcome.message)
        setStep(1)
      } else {
        setSubmitError(outcome.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (catalog === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dominant backdrop-neon-grid px-4 py-16">
        <div className="w-full max-w-2xl rounded-lg border border-line bg-surface p-6">
          {loadError === null ? (
            <p className="text-base text-muted">Carregando…</p>
          ) : (
            <div className="flex flex-col gap-4">
              <p role="alert" className="text-sm font-semibold text-destructive">
                {loadError}
              </p>
              <button
                type="button"
                onClick={retryLoad}
                className="h-11 w-full rounded-md bg-accent text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={onBack}
                className="text-sm font-semibold text-muted hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Voltar
              </button>
            </div>
          )}
        </div>
      </main>
    )
  }

  const combatPowerRaw = inputs['combat_power'] ?? ''
  const combatPowerFeedback = statFieldFeedback(
    combatPowerRaw,
    'flat',
    combatPowerBlurred || ocrFilledFields[1].has('combat_power'),
  )

  return (
    <main className="flex min-h-screen items-start justify-center bg-dominant backdrop-neon-grid px-4 py-16">
      <section className="w-full max-w-2xl rounded-lg border border-line bg-surface p-6">
        {/* Persistent identity summary: the applicant sanity-checks what came
            from the request form; identity is never re-captured here. */}
        <div className="rounded-md border border-line bg-dominant px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Aplicação</p>
          <p className="mt-1 text-sm font-semibold text-content">
            {`${draft.nickname} · ID ${draft.char_id} · ${draft.char_class} · ${FUNCTION_LABELS[draft.char_function]}`}
          </p>
          {identityError !== null && (
            <div className="mt-2 flex flex-col gap-2">
              <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
                {identityError}
              </p>
              <button
                type="button"
                onClick={onBack}
                className="self-start text-sm font-semibold text-accent hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Corrigir identidade
              </button>
            </div>
          )}
        </div>

        <h1 className="mt-5 text-center text-2xl font-bold leading-[1.2] text-content">
          Quero entrar na guilda
        </h1>

        <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          {STEP_NAMES.map((name, index) => {
            const stepNumber = index + 1
            const state = stepNumber === step ? 'current' : stepNumber < step ? 'done' : 'todo'
            return (
              <li key={name} className="flex items-center gap-x-2">
                <span
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={
                    state === 'current'
                      ? 'text-content'
                      : state === 'done'
                        ? 'text-success'
                        : 'text-muted'
                  }
                >
                  {`${stepNumber} ${name}`}
                </span>
                {index < STEP_NAMES.length - 1 && (
                  <span aria-hidden="true" className="text-muted">
                    →
                  </span>
                )}
              </li>
            )
          })}
        </ol>

        {step === 1 && (
          <div className="mt-6 flex flex-col gap-5">
            <div className="flex w-full flex-col gap-4 rounded-lg border border-line bg-surface p-4 lg:flex-row lg:items-stretch">
              <a
                href="/examples/basic.png"
                target="_blank"
                rel="noreferrer"
                className="mx-auto block w-full max-w-xs shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:mx-0 lg:w-80"
              >
                <img
                  src="/examples/basic.png"
                  alt="Exemplo da tela básica do personagem"
                  className="h-auto w-full rounded-md border border-line object-contain"
                />
              </a>
              <div className="min-w-0 flex-1">
                <OcrCapture
                  capture="basic"
                  disabled={submitting}
                  onOutcomes={(outcomes) => applyStepOcrOutcomes(1, outcomes)}
                  onReadFailed={() => handleOcrReadFailed(1)}
                  onRunStateChange={(running) => handleOcrRunState(1, running)}
                />
              </div>
            </div>

            <div className="flex max-w-md flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="prospect-combat-power"
                  className="text-sm font-semibold text-content"
                >
                  Poder de Combate
                </label>
                <input
                  id="prospect-combat-power"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={combatPowerRaw}
                  onChange={(event) => handleChange('combat_power', event.target.value)}
                  onBlur={() => setCombatPowerBlurred(true)}
                  aria-invalid={combatPowerFeedback.invalid || undefined}
                  disabled={ocrRunningStep === 1}
                  placeholder={ocrRunningStep === 1 ? OCR_READING_PLACEHOLDER : undefined}
                  className={`h-11 w-full rounded-md border bg-surface px-3 text-base text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    combatPowerFeedback.invalid ? 'border-destructive!' : 'border-line'
                  } ${ocrRunningStep === 1 ? 'animate-pulse' : ''}`}
                />
                {combatPowerFeedback.ok && (
                  <p className="text-sm font-semibold text-success">
                    {combatPowerFeedback.checkText}
                  </p>
                )}
                {combatPowerFeedback.invalid && (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="text-sm font-semibold text-destructive"
                  >
                    {INVALID_HINT}
                  </p>
                )}
                {!combatPowerFeedback.invalid && failedFields[1].has('combat_power') && (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="text-sm font-semibold text-destructive"
                  >
                    {OCR_FIELD_FAILURE}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {(step === 2 || step === 3 || step === 4) && (
          <div className="mt-6">
            <StatGroupStep
              group={STEP_GROUP[step]}
              entries={prospectGroupEntries(catalog, STEP_GROUP[step])}
              inputs={effectiveInputs}
              onChange={handleChange}
              ocrRunning={ocrRunningStep === step}
              failedFields={failedFields[step]}
              ocrFilledFields={ocrFilledFields[step]}
              capture={
                <OcrCapture
                  capture={STEP_GROUP[step]}
                  disabled={submitting}
                  onOutcomes={(outcomes) => applyStepOcrOutcomes(step, outcomes)}
                  onReadFailed={() => handleOcrReadFailed(step)}
                  onRunStateChange={(running) => handleOcrRunState(step, running)}
                />
              }
            />
            {step === 4 && catalog !== null && RAW_DEFENSE_STAT_KEYS.every((k) =>
              catalog.some((e) => e.stat_key === k),
            ) && (
              <DefenseStep
                inputs={inputs}
                onEquipmentChange={(key, raw) => {
                  setInputs((prev) => ({ ...prev, [key]: raw }))
                }}
                disabled={submitting || ocrRunningStep === 4}
              />
            )}
          </div>
        )}

        {step === 5 && (
          <div className="mt-6">
            <ReviewStep
              entries={catalog}
              inputs={inputs}
              // The prospect flow has no per-step attestations (08-04 scope):
              // Enviar builds the payload and jumps to the owning step on
              // a missing required value, so the gate is still real.
              allStepsVerified={true}
              submitting={submitting}
              missingRequired={missingRequired}
              submitError={submitError}
              onSubmit={() => void handleSubmit()}
              onFixStat={(statKey) => setStep(ownerStep(statKey))}
            />
          </div>
        )}

        {step < 5 && (
          <div className="mt-6 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => (step === 1 ? onBack() : setStep((current) => (current - 1) as ProspectStep))}
              className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content hover-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep((current) => (current + 1) as ProspectStep)}
              disabled={!prospectCanContinue(catalog, step, effectiveInputs)}
              className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continuar
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
