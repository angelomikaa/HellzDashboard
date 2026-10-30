// OvrHero — the identity block of the Painel OVR strip (04-UI-SPEC § OvrHero,
// D-07/D-02). Pure function of its props: the OVR number is NOT shown here —
// the own-card preview beside it already carries the real OVR, so this block
// is the player's identity: nickname as the title, class · role as the
// subtitle. Insufficient data explains WHY with the locked pt-BR copy (no class
// registered, or cohort n < 3). The tier comes from the rounded displayed
// number via the D-02 bands; ovrTierFor is shared with DashboardPage so the
// strip frame and this block can never diverge.
import type { MyReport } from '../../lib/api'
import { classLabel } from '../../lib/classLabels'
import { FUNCTION_LABELS } from '../../lib/groups'
import { tierForOvr, type Tier } from './presentation'

/** The displayed OVR tier (D-02 bands on the rounded 51–99 number). */
export function ovrTierFor(ovr: MyReport['ovr']): Tier | null {
  if (!ovr.data_sufficient || ovr.value === null) return null
  return tierForOvr(Math.round(ovr.value))
}

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
  const hasOvr = ovr.data_sufficient && ovr.value !== null
  const classLine = `${classLabel(charClass)} · ${FUNCTION_LABELS[charFunction]}`
  const explanation = hasOvr
    ? null
    : charClass === null
      ? 'Sem classe definida — peça a um oficial para registrar sua classe e função.'
      : 'OVR indisponível — sua classe e função precisam de pelo menos 3 jogadores com status enviados.'

  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-display text-2xl font-semibold tracking-wide text-content sm:text-3xl">
        {displayName}
      </h2>
      <p className="text-base text-muted sm:text-lg">{classLine}</p>
      {explanation !== null && <p className="mt-1 text-sm text-muted">{explanation}</p>}
    </div>
  )
}
