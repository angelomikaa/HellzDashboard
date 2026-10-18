// Destaques — the promotion page (06-UI-SPEC Surface 2, SHWC-02; 07.2-05
// DSTQ-01 rework). Every logged-in member sees it (D-12): there is NO role
// gate here — enforcement is the member-invocable get_promotion RPC, which
// refuses anon callers server-side (smoke-proven in 06-02). One fetch on
// mount returns ALL class sections at once; classes with insufficient data
// are OMITTED server-side (D-13 — hidden, never shown empty), so an empty
// array is the page-level empty state. Sections and cards render in SERVER
// order — no client reordering anywhere.
//
// Owner gate round 2 (07.1-02): the page shows ONLY Impecável-tier players
// ("the best" showcase) — a DISPLAY-layer tier filter over the fetched
// sections (cards whose OVR band is the top tier), dropping sections left
// empty. The DATA LAYER is byte-preserved from 07.1-02: same fetch, same
// filter, same empty state.
//
// 07.2-05 presentation rework (D-14 full-bleed immersive register): the page
// root becomes a full-bleed dark hero — backdrop-neon-grid spanning the full
// content width with a centered content column inside (max-w-6xl, the D-21
// pre-pass for this surface), an oversized 'Destaques' hero with the 'Os
// Impecáveis da Hellz' subline in a static glow-accent pill (static only,
// 07.1 D-05 — nothing animates), and per-class sections as dramatic bordered
// panels headed by the class crest (D-17 game grounding, D-16 monogram
// fallback for art-less classes like Rebellion). Cards are the crest showcase
// cards (PromotionCard → the shared CardSvg, round-5 single card.svg design) —
// 1 → sm:2 → lg:3 (D-21 pre-pass; the 07.1-02 2-column cap applied to the
// old horizontal anatomy).
//
// The payload is rendered verbatim: no rank computation in TS (T-06-13).
import { useEffect, useState } from 'react'
import { ApiError, fetchPromotion, type PromotionSection } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { tierForOvr } from '../dashboard/presentation'
import { ClassCrest } from '../assets/ClassCrest'
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
    // D-14: full-bleed immersive register — the grid backdrop spans the full
    // content width; the content itself sits in a centered column (max-w-6xl,
    // D-21 pre-pass for this surface — plan 06 widens the app container).
    //
    // Checkpoint round 2 spacing normalization: ONE rhythm scale across the
    // page — gap-8 between major page blocks (hero ↔ sections, section ↔
    // section), gap-6 inside a section (header ↔ grid, grid gutters),
    // p-6/sm:p-8 section padding, symmetric pt-8/pb-8 page framing. No more
    // mixed mt-4/gap-5/p-5/pb-6 steps.
    <div className="backdrop-neon-grid flex flex-col gap-8">
      <header className="flex flex-col items-center gap-4 pt-8 text-center sm:pt-12">
        <h1 className="font-display text-5xl font-semibold tracking-wide text-content sm:text-6xl">
          Destaques
        </h1>
        {/* Static glow-accent treatment (07.1 D-04/D-05): a box-shadow, never
            an animation. */}
        <p className="glow-accent rounded-full border border-line bg-surface px-4 py-1.5 font-display text-sm font-semibold text-accent-bright">
          Os Impecáveis da Hellz
        </p>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-8 sm:pb-12">
        {impecavelSections.map((section) => (
          <section
            key={section.class_name}
            className="rounded-xl border-2 border-line bg-surface p-6 sm:p-8"
          >
            <div className="flex items-center gap-4">
              {/* D-17: class imagery grounds the section in the game; D-16:
                  classes without official art render the monogram tile —
                  never a broken image. */}
              <ClassCrest charClass={section.class_name} size="md" />
              <h2 className="font-display text-2xl font-semibold text-content">
                {section.class_name}
              </h2>
            </div>
            {/* 07.2-05 (D-14/D-21 pre-pass): the round-3 crest cards are
                square (the owner's crest SVGs are 1:1) — grid stays
                1 → sm:2 → lg:3. Same gap-6 rhythm as the section's internal
                spacing (round-2 spacing normalization kept). */}
            <div className="mt-6 grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  )
}
