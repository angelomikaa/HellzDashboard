// OvrHero — the tier-styled OVR hero card (04-UI-SPEC § OvrHero, D-07/D-02).
// Pure function of its props: the OVR number arrives opaque from the RPC and
// is only ROUNDED for display (KeyStatsPage Math.round precedent); the tier
// comes from the rounded displayed number via the D-02 bands. Insufficient
// variants carry no tier color (border-line) and explain WHY with the locked
// pt-BR copy (cohort n < 3, or no class registered).
import type { MyReport } from '../../lib/api'
import { FUNCTION_LABELS } from '../../lib/groups'
import { tierForOvr } from './presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_GLOW } from './tierDisplay'

export function OvrHero({
  ovr,
  displayName,
  charClass,
  charFunction,
}: {
  ovr: MyReport['ovr']
  displayName: string
  charClass: string | null
  charFunction: 'dps' | 'mdps' | 'suporte'
}) {
  const sufficient = ovr.data_sufficient && ovr.value !== null
  // Tier from the ROUNDED displayed number (D-02 bands on the 51–99 scale).
  const rounded = sufficient && ovr.value !== null ? Math.round(ovr.value) : null
  const tier = rounded !== null ? tierForOvr(rounded) : null
  const display = rounded !== null ? rounded : '—'
  const classLine =
    charClass === null ? '—' : `${charClass} · ${FUNCTION_LABELS[charFunction]}`
  const explanation =
    rounded !== null
      ? null
      : charClass === null
        ? 'Sem classe definida — peça a um oficial para registrar sua classe e função.'
        : 'OVR indisponível — sua classe e função precisam de pelo menos 3 jogadores com status enviados.'

  return (
    <section
      className={`rounded-lg border-2 bg-surface p-6 hover-card ${tier !== null ? TIER_BORDER_DISPLAY[tier] : 'border-line'}`}
    >
      <p className="text-sm text-muted">OVR</p>
      <p
        className={`text-5xl font-semibold leading-none ${tier !== null ? `font-display ${TIER_TEXT_GLOW[tier]}` : 'text-muted'}`}
      >
        {display}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-content">{displayName}</h2>
      <p className="text-sm text-muted">{classLine}</p>
      {explanation !== null && <p className="mt-2 text-sm text-muted">{explanation}</p>}
    </section>
  )
}
