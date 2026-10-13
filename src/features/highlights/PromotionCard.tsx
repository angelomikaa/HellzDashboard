// PromotionCard — the EAFC-style celebration card (06-UI-SPEC Surface 2,
// D-01/D-02). Pure presentational: the payload arrives opaque from the
// member-invocable get_promotion RPC and is rendered verbatim — nothing is
// recomputed here (the 03-01 spec module is never imported anywhere in this
// feature; rank math lives only in Postgres).
//
// The 6 highlight facets are the payload's top entries in SERVER order
// (points desc) — never re-sorted client-side. Per RNK-02 the facets carry NO
// identity markers of any kind: no special wording, no icon, no ordering
// explanation, no affordance asking why these six — the tier color of each
// points chip IS the entire celebration. The typed closed-list
// PromotionHighlight contract (06-03) blocks unknown payload fields at
// compile time (T-06-05).
//
// All tier styling flows through the literal TIER_* maps from the Phase 4
// presentation module (Tailwind v4 JIT never sees interpolated class names).
// No interactive elements inside the card (SHAR-01 deferred) — flat-border
// language only: no icons, shadows, gradients, avatars.
import type { PromotionCardRow } from '../../lib/api'
import { TIER_BORDER, TIER_TEXT, tierForOvr, tierForPoints } from '../dashboard/presentation'
import { FUNCTION_LABELS } from '../../lib/groups'
import { formatStatValue } from '../../lib/parseStatValue'

export function PromotionCard({ card, charClass }: { card: PromotionCardRow; charClass: string }) {
  // ovr is ALWAYS non-null on a card (the RPC omits OVR-incapable members),
  // so the tier always exists — no insufficient-data variant here. The
  // non-null assertions below pin that contract (tierForOvr/tierForPoints
  // return Tier | null for the dashboard's nullable inputs).
  const ovrTier = tierForOvr(Math.round(card.ovr)) as NonNullable<ReturnType<typeof tierForOvr>>

  return (
    <article aria-label={`${card.display_name} — ${charClass}`} className={`rounded-lg border-2 bg-surface p-6 ${TIER_BORDER[ovrTier]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted">OVR</p>
          <p className={`text-5xl font-semibold leading-none ${TIER_TEXT[ovrTier]}`}>
            {Math.round(card.ovr)}
          </p>
        </div>
        <span className="rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-muted">
          {FUNCTION_LABELS[card.char_function]}
        </span>
      </div>
      <h3 className="mt-2 text-xl font-semibold text-content">{card.display_name}</h3>
      <p className="text-sm text-muted">{charClass}</p>
      <div className="my-4 border-t border-line" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {card.highlights.map((h) => {
          const facetTier = tierForPoints(h.points) as NonNullable<ReturnType<typeof tierForPoints>>
          return (
            <div key={h.stat_key} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-content">{h.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-sm text-content">{formatStatValue(h.value, h.value_type)}</span>
                <span
                  aria-label={`${Math.round(h.points)} pontos em ${h.label}`}
                  className={`rounded-full border px-2 py-1 text-sm font-semibold ${TIER_BORDER[facetTier]} ${TIER_TEXT[facetTier]}`}
                >
                  {Math.round(h.points)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </article>
  )
}
