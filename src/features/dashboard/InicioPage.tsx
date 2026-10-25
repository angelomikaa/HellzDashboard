// InicioPage — the guild LANDING page (Phase 10, HOME-01/HOME-02; owner
// correction 2026-10-24: "Destaques and Inicio were supposed to be the same
// page - a page that can be seen when a visitor arrives and also visible to
// logged in users - this is why its called inicio, its a landing page").
//
// Owner correction 2026-10-25 (card/landing polish round 9): the personal
// blocks that used to sit above the showcase (own OVR card, top-3 best
// stats, stale/first CTAs) are REMOVED — "the inicio page when logged in
// show a few stats over the carousel, but they are redundant". The landing
// is now the Impecáveis showcase for EVERY audience; the member's own data
// lives in the Painel tab (one click away, now the default landing tab).
// The old PersonalHome fetch (my_report per Início mount) is gone with it.
//
// The showcase is not duplicated: the exact same PromotionShowcase tree
// renders for visitors (via PublicLanding's shell, anon-callable
// get_promotion_public RPC — 0029) and for members (this component inside
// the app shell). What a visitor previews is what a member sees. Points and
// OVR arrive opaque from the RPCs — never recomputed client-side
// (AGENTS.md).
import { PromotionShowcase } from '../highlights/PromotionShowcase'

export function InicioPage() {
  return <PromotionShowcase />
}
