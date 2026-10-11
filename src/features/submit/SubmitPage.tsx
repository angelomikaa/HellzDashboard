// SubmitPage — the guided 5-step submit wizard (02-UI-SPEC Screen 3,
// INPT-01). Manual entry is the designed backbone: the example shot beside
// the input boxes is a static panel-provided reference image.
//
// 05-03 realignment (D-07/D-08): Especial is required exactly like
// Geral/Quasi (combat_power stays the only optional stat), and every capture
// step (1-4) carries its own verification checkbox — the review gate lives
// per step now; step 5 is the shrunk tap-to-fix summary whose Enviar is
// gated on all four verifications. The checkbox gate is UX-only — the server
// re-validates regardless (INPT-03).
//
// Screenshots never leave the player's device (D-10) — example images only:
// this feature sends only parsed stat numbers; the player's own screenshots
// stay physical/on-device and no image bytes ever reach the network.
//
// The blocked state (no char_class) is UX-only gating: the server allows
// classless inserts, but Phase 3 rank RPCs compute per class, so there is
// nothing meaningful to ingest for an unregistered character (P2D in
// 02-RESEARCH; T-02-17 accepted with the Phase 3 guard).
import { useEffect, useState } from 'react'
import {
  ApiError,
  createSubmission,
  fetchCatalog,
  fetchMe,
  type MemberRow,
  type StatCatalogEntry,
} from '../../lib/api'
import { formatStatValue, parseStatValue } from '../../lib/parseStatValue'
import type { NeoFootSession } from '../auth/session'
import { HistoryList } from './HistoryList'
import { OcrCapture } from './OcrCapture'
import { ReviewStep } from './ReviewStep'
import { OCR_FIELD_FAILURE, StatGroupStep } from './StatGroupStep'
import type { OcrFieldOutcome } from './ocr'
import {
  WIZARD_GROUPS,
  buildStatsPayload,
  groupComplete,
  type GroupInputs,
  type WizardGroup,
} from './wizard'

// Enumeration-safe copy (UI contract): never expose HTTP codes or internals.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const SUBMIT_ERROR = 'Não foi possível enviar. Verifique sua conexão e tente novamente.'
const INVALID_HINT = 'Valor inválido — use números (ex.: 1.234.567 ou 12,5%).'
// Running skeleton placeholder for the step-1 combat_power input (D-17 —
// same copy StatGroupStep uses for its rows).
const OCR_READING_PLACEHOLDER = 'Lendo captura…'

const BLOCKED_MEMBER_COPY =
  'Seu personagem ainda não foi registrado. Peça a um oficial para registrá-lo na aba Personagens.'
const BLOCKED_STAFF_COPY =
  'Seu personagem ainda não foi registrado. Registre-o na aba Personagens.'

const FUNCTION_LABELS: Record<'dps' | 'tank', string> = {
  dps: 'DPS',
  tank: 'Tank',
}

// Step 1 = Personagem, 2-4 = Geral/Quasi/Especial, 5 = Revisão.
const STEP_GROUP: Record<2 | 3 | 4, WizardGroup> = { 2: 'general', 3: 'quasi', 4: 'special' }

const STEP_NAMES = ['Personagem', 'Geral', 'Quasi', 'Especial', 'Revisão'] as const

// Per-step verification copy (D-08): the review gate moved from the
// end-of-flow screen onto each capture step. Steps 2-4 reuse the locked
// group strings verbatim (moved from the former ReviewStep checkboxes);
// step 1 gets its own Personagem line.
const VERIFY_COPY: Record<1 | 2 | 3 | 4, string> = {
  1: 'Revisei os valores do personagem e estão corretos.',
  2: 'Revisei os valores de Geral contra as capturas e estão corretos.',
  3: 'Revisei os valores de Quasi contra as capturas e estão corretos.',
  4: 'Revisei os valores de Especial contra as capturas e estão corretos.',
}

/** Per-step verification checkbox (D-08) — identical markup to the former
 *  ReviewStep confirmation rows: native checkbox in a <label> with a 44px
 *  row. Editing any value on the step unchecks it (handleChange), so a
 *  checked box always attests to the CURRENT values the player saw. */
function StepVerifyCheckbox({
  stepNo,
  checked,
  onChange,
}: {
  stepNo: 1 | 2 | 3 | 4
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-base text-content focus-within:focus-visible:ring-2 focus-within:focus-visible:ring-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[#E3B341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <span>{VERIFY_COPY[stepNo]}</span>
    </label>
  )
}

interface SubmitPageProps {
  session: NeoFootSession
}

export function SubmitPage({ session }: SubmitPageProps) {
  const [data, setData] = useState<{ me: MemberRow; catalog: StatCatalogEntry[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [phase, setPhase] = useState<'wizard' | 'submitted'>('wizard')
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [inputs, setInputs] = useState<GroupInputs>({})

  // Per-step verification gate (D-08): Continuar on each capture step (and
  // Enviar on Revisão, via allStepsVerified) requires the step's checkbox.
  const [stepVerified, setStepVerified] = useState<Record<1 | 2 | 3 | 4, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
  })

  // OCR wiring (05-04): which step's read is in flight (inputs skeletonize,
  // D-17), and which of each step's displayed fields the LATEST read could
  // not fill (D-14/D-15 — a fresh read replaces the step's failure set
  // wholesale).
  const [ocrRunningStep, setOcrRunningStep] = useState<1 | 2 | 3 | 4 | null>(null)
  const [failedFields, setFailedFields] = useState<Record<1 | 2 | 3 | 4, ReadonlySet<string>>>({
    1: new Set(),
    2: new Set(),
    3: new Set(),
    4: new Set(),
  })

  // Intro-step parse feedback (Poder de Combate).
  const [combatPowerBlurred, setCombatPowerBlurred] = useState(false)

  // Submission state (SubmitPage owns the createSubmission call — INPT-04:
  // every submit is a NEW append-only record).
  const [submitting, setSubmitting] = useState(false)
  const [missingRequired, setMissingRequired] = useState<string[] | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const isStaff = session.member_role === 'officer' || session.member_role === 'owner'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [me, catalog] = await Promise.all([fetchMe(session), fetchCatalog(session)])
        if (!cancelled) setData({ me, catalog })
      } catch (err) {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  /** Owning capture step for a stat (the single group→step mapping):
   *  combat_power → step 1; otherwise the catalog group maps
   *  general→2, quasi→3, special→4. Unknown keys own no step. */
  function stepForStat(statKey: string): 1 | 2 | 3 | 4 | null {
    if (statKey === 'combat_power') return 1
    const entry = data?.catalog.find((e) => e.stat_key === statKey)
    if (!entry) return null
    const groupStep = WIZARD_GROUPS.indexOf(entry.group_name)
    return groupStep >= 0 ? ((groupStep + 2) as 2 | 3 | 4) : null
  }

  /** THE single edit path (D-08): every value write — manual typing, OCR
   *  pre-fill via applyOcrOutcomes — updates the input AND unchecks the
   *  owning step's verification, so a stale confirmation never survives an
   *  edit (T-05-10). Typing in a failed-OCR field also clears its failure
   *  flag: from then on the regular parse feedback governs (D-14). */
  function handleChange(statKey: string, raw: string) {
    setInputs((prev) => ({ ...prev, [statKey]: raw }))
    const owner = stepForStat(statKey)
    if (owner !== null) {
      setStepVerified((v) => ({ ...v, [owner]: false }))
      setFailedFields((prev) => {
        const set = prev[owner]
        if (!set.has(statKey)) return prev
        const next = new Set(set)
        next.delete(statKey)
        return { ...prev, [owner]: next }
      })
    }
  }

  /** Restart as a NEW submission: fresh inputs, nothing prefilled or
   *  overwritten (append-only, INPT-04). */
  function restartWizard() {
    setInputs({})
    setStepVerified({ 1: false, 2: false, 3: false, 4: false })
    setOcrRunningStep(null)
    setFailedFields({ 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() })
    setCombatPowerBlurred(false)
    setMissingRequired(null)
    setSubmitError(null)
    setStep(1)
    setPhase('wizard')
  }

  /** Tap a value on the review screen to jump back and fix it. */
  function handleFixStat(statKey: string) {
    const owner = stepForStat(statKey)
    if (owner !== null) setStep(owner)
  }

  async function handleSubmit() {
    if (submitting || data === null) return
    setMissingRequired(null)
    setSubmitError(null)
    const result = buildStatsPayload(data.catalog, inputs)
    if (!result.ok) {
      // Defense in depth: the step gates should have prevented this — the
      // server re-validates regardless.
      setMissingRequired(result.missingRequired)
      return
    }
    setSubmitting(true)
    try {
      await createSubmission(session, result.stats)
      setPhase('submitted')
    } catch {
      // The wizard state is KEPT — nothing the player typed is lost.
      setSubmitError(SUBMIT_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError !== null) {
    return (
      <section className="rounded-lg border border-line bg-surface p-6">
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
          {loadError}
        </p>
      </section>
    )
  }

  if (data === null) {
    return (
      <section className="rounded-lg border border-line bg-surface p-6">
        <p className="text-base text-muted">Carregando…</p>
      </section>
    )
  }

  const { me, catalog } = data

  // Blocked state: no registered character (no char_class) — UX gate only.
  if (me.char_class === null) {
    return (
      <section className="rounded-lg border border-line bg-surface p-6">
        <h2 className="text-xl font-semibold text-content">Enviar Status</h2>
        <p className="mt-4 text-base text-content">
          {isStaff ? BLOCKED_STAFF_COPY : BLOCKED_MEMBER_COPY}
        </p>
      </section>
    )
  }

  // combat_power is entered on the intro step, not on the Geral step.
  const groupEntries = (group: WizardGroup): StatCatalogEntry[] =>
    catalog.filter(
      (e) => e.group_name === group && !(group === 'general' && e.stat_key === 'combat_power'),
    )

  /** D-15 replace-all-displayed: a read replaces EXACTLY this step's
   *  displayed fields — detected values overwrite, undetected or unmapped
   *  fields (e.g. dmg_vs_demi_human on special) go blank + failure flag —
   *  and the step's failure set is replaced wholesale (a fresh read resets
   *  prior failures). Every write flows through the central handleChange
   *  wrapper, so pre-fill unchecks the step's verification exactly like a
   *  manual edit (05-03 engine, T-05-12). Reads are step-scoped: fields of
   *  other steps are never touched. */
  function applyOcrOutcomes(step: 1 | 2 | 3 | 4, outcomes: OcrFieldOutcome[]) {
    const displayed: string[] =
      step === 1 ? ['combat_power'] : groupEntries(STEP_GROUP[step]).map((e) => e.stat_key)
    const byKey = new Map(outcomes.map((o) => [o.stat_key, o]))
    const newFailed = new Set<string>()
    for (const statKey of displayed) {
      const outcome = byKey.get(statKey)
      if (outcome !== undefined && outcome.status === 'filled') {
        handleChange(statKey, outcome.raw)
      } else {
        handleChange(statKey, '')
        newFailed.add(statKey)
      }
    }
    setFailedFields((prev) => ({ ...prev, [step]: newFailed }))
  }

  /** D-18: nothing was read — the step's failure claims are cleared (no
   *  per-field claims without a read); inputs stay untouched for manual
   *  entry. */
  function handleOcrReadFailed(step: 1 | 2 | 3 | 4) {
    setFailedFields((prev) => ({ ...prev, [step]: new Set() }))
  }

  function handleOcrRunState(step: 1 | 2 | 3 | 4, running: boolean) {
    setOcrRunningStep(running ? step : null)
  }

  const combatPowerRaw = inputs['combat_power'] ?? ''
  const combatPowerParsed = parseStatValue(combatPowerRaw)
  const combatPowerTouched = combatPowerBlurred && combatPowerRaw.trim() !== ''
  const combatPowerInvalid = combatPowerTouched && !combatPowerParsed.ok

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      {phase === 'submitted' ? (
        <>
          <div role="status">
            <h2 className="text-xl font-semibold text-success">Envio registrado!</h2>
            <p className="mt-1 text-base text-muted">
              Seu envio foi salvo e aguarda validação de um oficial.
            </p>
          </div>
          <HistoryList session={session} onNewSubmission={restartWizard} />
        </>
      ) : (
        <>
          {/* Step indicator (Label size): current=content, done=success, todo=muted */}
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            {STEP_NAMES.map((name, index) => {
              const stepNumber = index + 1
              const state =
                stepNumber === step ? 'current' : stepNumber < step ? 'done' : 'todo'
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
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start">
              {/* Example "basic" header shot beside the intro (INPT-01). */}
              <a
                href="/examples/basic.svg"
                target="_blank"
                rel="noreferrer"
                className="block w-full shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:order-2 sm:w-32"
              >
                <img
                  src="/examples/basic.svg"
                  alt="Exemplo da tela básica do personagem"
                  width={691}
                  height={416}
                  className="h-32 w-full rounded-md border border-line object-cover sm:h-auto"
                />
              </a>
              <div className="flex flex-1 flex-col gap-4">
                <h2 className="text-xl font-semibold text-content">
                  {`${me.display_name} — ${me.char_class} (${FUNCTION_LABELS[me.char_function]})`}
                </h2>
                {/* OCR entry for the basic header capture (D-06: the basic
                    capture reads ONLY combat_power; nickname/job are admin
                    data, never inputs). */}
                <OcrCapture
                  capture="basic"
                  onOutcomes={(outcomes) => applyOcrOutcomes(1, outcomes)}
                  onReadFailed={() => handleOcrReadFailed(1)}
                  onRunStateChange={(running) => handleOcrRunState(1, running)}
                />
                <div className="flex flex-col gap-1">
                  <label htmlFor="combat-power" className="text-sm font-semibold text-content">
                    Poder de Combate
                  </label>
                  <input
                    id="combat-power"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={combatPowerRaw}
                    onChange={(e) => handleChange('combat_power', e.target.value)}
                    onBlur={() => setCombatPowerBlurred(true)}
                    aria-invalid={combatPowerInvalid || undefined}
                    disabled={ocrRunningStep === 1}
                    placeholder={ocrRunningStep === 1 ? OCR_READING_PLACEHOLDER : undefined}
                    className={`h-11 w-full rounded-md border bg-surface px-3 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      combatPowerInvalid ? 'border-destructive' : 'border-line'
                    } ${ocrRunningStep === 1 ? 'animate-pulse' : ''}`}
                  />
                  {combatPowerTouched && combatPowerParsed.ok && combatPowerParsed.value !== null && (
                    <p className="text-sm font-semibold text-success">
                      {`✓ ${formatStatValue(combatPowerParsed.value, 'flat')}`}
                    </p>
                  )}
                  {combatPowerInvalid && (
                    <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
                      {INVALID_HINT}
                    </p>
                  )}
                  {!combatPowerInvalid && failedFields[1].has('combat_power') && (
                    <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
                      {OCR_FIELD_FAILURE}
                    </p>
                  )}
                </div>
                <StepVerifyCheckbox
                  stepNo={1}
                  checked={stepVerified[1]}
                  onChange={(checked) => setStepVerified((v) => ({ ...v, 1: checked }))}
                />
              </div>
            </div>
          )}

          {(step === 2 || step === 3 || step === 4) && (
            <div className="mt-6">
              {/* OCR entry above the example-shot list: the capture key
                  mirrors the step's group (general/quasi/special). */}
              <div className="mb-4">
                <OcrCapture
                  capture={STEP_GROUP[step]}
                  onOutcomes={(outcomes) => applyOcrOutcomes(step, outcomes)}
                  onReadFailed={() => handleOcrReadFailed(step)}
                  onRunStateChange={(running) => handleOcrRunState(step, running)}
                />
              </div>
              <StatGroupStep
                group={STEP_GROUP[step]}
                entries={groupEntries(STEP_GROUP[step])}
                inputs={inputs}
                onChange={handleChange}
                ocrRunning={ocrRunningStep === step}
                failedFields={failedFields[step]}
              />
              <div className="mt-4">
                <StepVerifyCheckbox
                  stepNo={step}
                  checked={stepVerified[step]}
                  onChange={(checked) => setStepVerified((v) => ({ ...v, [step]: checked }))}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="mt-6">
              <ReviewStep
                entries={catalog}
                inputs={inputs}
                allStepsVerified={
                  stepVerified[1] && stepVerified[2] && stepVerified[3] && stepVerified[4]
                }
                submitting={submitting}
                missingRequired={missingRequired}
                submitError={submitError}
                onSubmit={() => void handleSubmit()}
                onFixStat={handleFixStat}
              />
            </div>
          )}

          {/* Step navigation */}
          {step < 5 && (
            <div className="mt-6 flex items-center justify-between gap-2">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
                  className="h-11 rounded-md border border-line px-4 text-base font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Voltar
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
              {step === 1 && (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!stepVerified[1]}
                  className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continuar
                </button>
              )}
              {(step === 2 || step === 3 || step === 4) && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s + 1) as 2 | 3 | 4 | 5)}
                  disabled={
                    !groupComplete(catalog, STEP_GROUP[step], inputs) || !stepVerified[step]
                  }
                  className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continuar
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
