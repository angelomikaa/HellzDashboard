// Destaques — the promotion page (06-UI-SPEC Surface 2, SHWC-02). Every
// logged-in member sees it (D-12): there is NO role gate here — enforcement
// is the member-invocable get_promotion RPC, which refuses anon callers
// server-side (smoke-proven in 06-02). One fetch on mount returns ALL class
// sections at once; classes with insufficient data are OMITTED server-side
// (D-13 — hidden, never shown empty), so an empty array is the page-level
// empty state. Sections and cards render in SERVER order — no client
// reordering anywhere.
//
// Owner gate round 2 (07.1-02): the page now shows ONLY Impecável-tier
// players ("the best" showcase) — a DISPLAY-layer tier filter over the
// fetched sections (cards whose OVR band is the top tier), dropping
// sections left empty. No redesign: the bolder premium showcase is
// explicitly deferred to phase 07.2.
//
// The payload is rendered verbatim: no rank computation in TS (T-06-13) —
// tier banding happens only via the unit-locked tierForOvr/tierForPoints
// presentation functions.
import { useEffect, useState } from 'react'
import { ApiError, fetchPromotion, type PromotionSection } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { tierForOvr } from '../dashboard/presentation'
import { PromotionCard } from './PromotionCard'

// Enumeration-safe pt-BR copy (shared UI contract, copied verbatim from
// CharactersPage): never expose HTTP codes, gateway internals, or which
// check failed.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'

export function HighlightsPage({ session }: { session: NeoFootSession }) {
  const [sections, setSections] = useState<PromotionSection[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPromotion(session)
      .then((data) => {
        if (!cancelled) setSections(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      })
    return () => {
      cancelled = true
    }
  }, [session])

  if (error !== null) {
    return (
      <section className="rounded-lg border border-line bg-surface p-6">
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      </section>
    )
  }

  if (sections === null) {
    return (
      <section className="rounded-lg border border-line bg-surface p-6">
        <p className="text-base text-muted">Carregando…</p>
      </section>
    )
  }

  // Owner gate round 2 (07.1-02): Destaques is the premium showcase — only
  // Impecável (top-band) cards appear. Display-layer filter over the fetched
  // payload: same server order preserved (filter, never sort), sections with
  // no Impecável player are dropped entirely. tierForOvr is the unit-locked
  // banding function (65/75/85 OVR bands) — same one PromotionCard uses.
  const impecavelSections =
    sections?.flatMap((section) => {
      const cards = section.cards.filter(
        (card) => tierForOvr(Math.round(card.ovr)) === 'platinum',
      )
      return cards.length > 0 ? [{ ...section, cards }] : []
    }) ?? []

  if (impecavelSections.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-surface p-6">
        <p className="text-sm text-muted">
          Ainda não há jogadores Impecáveis — o topo do ranking de cada classe aparecerá aqui
          assim que alguém alcançar a faixa máxima.
        </p>
      </section>
    )
  }

  return (
    <div className="backdrop-neon-grid flex flex-col gap-6">
      {impecavelSections.map((section) => (
        <section key={section.class_name} className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-xl font-semibold text-content">{section.class_name}</h2>
          {/* Owner gate fix (07.1-02): promotion cards cap at 2 columns —
              3-up squished the cards on desktop (07.2 owns any rework). */}
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {section.cards.map((card) => (
              <PromotionCard
                key={card.display_name}
                card={card}
                charClass={section.class_name}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
