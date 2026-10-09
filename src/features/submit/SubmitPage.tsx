// SubmitPage — the guided 5-step submit wizard (02-UI-SPEC Screen 3,
// INPT-01). Manual entry is the designed backbone: the example shot beside
// the input boxes is a static panel-provided reference image.
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
import { ReviewStep } from './ReviewStep'
import { StatGroupStep } from './StatGroupStep'
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

interface SubmitPageProps {
  session: NeoFootSession
}

export function SubmitPage({ session }: SubmitPageProps) {
  const [data, setData] = useState<{ me: MemberRow; catalog: StatCatalogEntry[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [phase, setPhase] = useState<'wizard' | 'submitted'>('wizard')
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [inputs, setInputs] = useState<GroupInputs>({})

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

  function handleChange(statKey: string, raw: string) {
    setInputs((prev) => ({ ...prev, [statKey]: raw }))
  }

  /** Restart as a NEW submission: fresh inputs, nothing prefilled or
   *  overwritten (append-only, INPT-04). */
  function restartWizard() {
    setInputs({})
    setCombatPowerBlurred(false)
    setMissingRequired(null)
    setSubmitError(null)
    setStep(1)
    setPhase('wizard')
  }

  /** Tap a value on the review screen to jump back and fix it. */
  function handleFixStat(statKey: string) {
    if (statKey === 'combat_power') setStep(1)
    else {
      const entry = data?.catalog.find((e) => e.stat_key === statKey)
      if (entry) {
        const stepForGroup = WIZARD_GROUPS.indexOf(entry.group_name)
        if (stepForGroup >= 0) setStep((stepForGroup + 2) as 2 | 3 | 4)
      }
    }
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
                    className={`h-11 w-full rounded-md border bg-surface px-3 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      combatPowerInvalid ? 'border-destructive' : 'border-line'
                    }`}
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
                </div>
              </div>
            </div>
          )}

          {(step === 2 || step === 3 || step === 4) && (
            <div className="mt-6">
              <StatGroupStep
                group={STEP_GROUP[step]}
                entries={groupEntries(STEP_GROUP[step])}
                inputs={inputs}
                onChange={handleChange}
              />
            </div>
          )}

          {step === 5 && (
            <div className="mt-6">
              <ReviewStep
                entries={catalog}
                inputs={inputs}
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
                  className="h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Continuar
                </button>
              )}
              {(step === 2 || step === 3 || step === 4) && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s + 1) as 2 | 3 | 4 | 5)}
                  disabled={
                    STEP_GROUP[step] !== 'special' &&
                    !groupComplete(catalog, STEP_GROUP[step], inputs)
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
