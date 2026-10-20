// OvrHero — the tier-styled OVR hero card (04-UI-SPEC § OvrHero, D-07/D-02).
// Pure function of its props: the OVR number arrives opaque from the RPC and
// is only ROUNDED for display (KeyStatsPage Math.round precedent); the tier
// comes from the rounded displayed number via the D-02 bands. Insufficient
// variants carry no tier color (border-line) and explain WHY with the locked
// pt-BR copy (cohort n < 3, or no class registered).
//
// `layout` (owner checkpoint round 4): 'card' is the standalone hero used
// before the strip existed; 'strip' renders the same anatomy WITHOUT its own
// border/padding so the Painel can merge it with the key-stat mini cards into
// one wide strip. The strip's border owns the tier color (ovrTierFor).
import type { MyReport } from '../../lib/api'
import { FUNCTION_LABELS } from '../../lib/groups'
import { tierForOvr, type Tier } from './presentation'
import { TIER_BORDER_DISPLAY, TIER_TEXT_GLOW } from './tierDisplay'

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
  layout = 'card',
}: {
  ovr: MyReport['ovr']
  displayName: string
  charClass: string | null
  charFunction: 'dps' | 'mdps' | 'suporte'
  layout?: 'card' | 'strip'
}) {
  const sufficient = ovr.data_sufficient && ovr.value !== null
  // Tier from the ROUNDED displayed number (D-02 bands on the 51–99 scale).
  const rounded = sufficient && ovr.value !== null ? Math.round(ovr.value) : null
  const tier = ovrTierFor(ovr)
  const display = rounded !== null ? rounded : '—'
  const classLine =
    charClass === null ? '—' : `${charClass} · ${FUNCTION_LABELS[charFunction]}`
  const explanation =
    rounded !== null
      ? null
      : charClass === null
        ? 'Sem classe definida — peça a um oficial para registrar sua classe e função.'
        : 'OVR indisponível — sua classe e função precisam de pelo menos 3 jogadores com status enviados.'

  const content = (
    <>
      <p className="text-sm text-muted">OVR</p>
      <p
        className={`text-5xl font-semibold leading-none ${tier !== null ? `font-display ${TIER_TEXT_GLOW[tier]}` : 'text-muted'}`}
      >
        {display}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-content">{displayName}</h2>
      <p className="text-sm text-muted">{classLine}</p>
      {explanation !== null && <p className="mt-2 text-sm text-muted">{explanation}</p>}
    </>
  )

  // Strip layout (owner checkpoint rounds 7-10): the OVR number and its tag
  // are GONE here — the card already carries the real OVR, so the text
  // beside it is the player's identity: nickname as the title, class · role
  // as the subtitle.
  if (layout === 'strip') {
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

  return (
    <section
      className={`rounded-lg border-2 bg-surface p-6 hover-card ${tier !== null ? TIER_BORDER_DISPLAY[tier] : 'border-line'}`}
    >
      {content}
    </section>
  )
}
