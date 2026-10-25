// PromotionShowcase — the Impecáveis showcase that now lives INSIDE Início
// (Phase 10, owner decision 2026-10-24: "Destaques and Inicio were supposed to
// be the same page - a page that can be seen when a visitor arrives and also
// visible to logged in users - this is why its called inicio, its a landing
// page"). The old standalone Destaques tab is gone; this component is the
// single showcase surface, rendered for visitors and members alike.
//
// UAT round 3 (owner): "removing the box and let the cards float in space" +
// "the plan was supposed to include light animations, like the neon ring".
// The per-class panels are gone — the crest/name header and the carousel now
// sit directly on the neon-grid backdrop, separated only by space and a fading
// rule. The Phase 10 soft-motion layer (10-CONTEXT D-01/D-02/D-03) is applied:
//   - the "Os Impecáveis da Hellz" title wears the existing rotating neon ring;
//   - cards rise/fade in once, staggered (HighlightsCarousel/showcase-reveal);
//   - the centered card's halo breathes (carousel-spotlight);
//   - the loading state is a skeleton row instead of "Carregando…".
// Every one of these is CSS-only and dies under prefers-reduced-motion.
//
// UAT round 4 (owner): the landing now OPENS on "Os Impecáveis da Hellz" —
// the "Destaques" h2 is gone and the pill is the page h1. At lg the carousel
// is exactly 3-up: --carousel-card is derived from the showcase container
// (see .showcase-root/.showcase-inner in index.css), so three cards fill the
// row and no fourth card peeks in. Mobile keeps the 1-up spotlight.
//
// Data path (0029): get_promotion_public is the anon-callable twin of
// get_promotion — same body, member gate removed. No session is threaded
// through here, so the exact same tree renders before and after login. The
// payload is rendered verbatim: no rank computation in TS (T-06-13).
//
// Owner gate round 2 (07.1-02): the showcase is the premium register — only
// Impecável (top-band) cards appear. Display-layer tier filter over the
// fetched payload, server order preserved (filter, never sort), sections left
// empty are dropped. tierForOvr is the unit-locked banding function.
import { useEffect, useState, type ReactNode } from 'react'
import { ApiError, fetchPromotionPublic, type PromotionSection } from '../../lib/api'
import { tierForOvr } from '../dashboard/presentation'
import { ClassCrest } from '../assets/ClassCrest'
import { classLabel } from '../../lib/classLabels'
import { HighlightsCarousel } from './HighlightsCarousel'

// Enumeration-safe pt-BR copy: never expose HTTP codes or gateway internals.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SHOWCASE_ERROR = 'Não foi possível carregar os destaques. Tente novamente.'

const HEADING_ID = 'showcase-heading'

/** The landing title — rendered in every state so the page never jumps when
 *  the payload lands. "Os Impecáveis da Hellz" IS the page title now (owner,
 *  UAT round 4); the pill keeps the project's neon ring (D-02). */
function ShowcaseHeader() {
  return (
    <header className="showcase-reveal flex flex-col items-center pt-4 text-center sm:pt-8">
      <h1
        id={HEADING_ID}
        className="neon-ring glow-accent max-w-full rounded-full border border-line bg-surface px-5 py-2 font-display text-xl font-semibold tracking-wide text-accent-bright sm:px-8 sm:py-3 sm:text-3xl lg:text-4xl"
      >
        Os Impecáveis da Hellz
      </h1>
    </header>
  )
}

/** One shell for every state: the container-query root, the shared title, and
 *  the state's body. Keeping the header mounted across the loading → loaded
 *  swap means the reveal never replays and the layout never jumps. */
function ShowcaseShell({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <section
      aria-labelledby={HEADING_ID}
      aria-busy={busy ? true : undefined}
      className="showcase-root flex flex-col"
    >
      <div className="showcase-inner flex flex-col gap-10">
        <ShowcaseHeader />
        {children}
      </div>
    </section>
  )
}

/** Card-shaped placeholders (D-03) that mirror the real carousel geometry:
 *  three slots, the center one in the spotlight position. They read the same
 *  --carousel-card as the slots, so the skeleton and the cards match at every
 *  width. Pure pulse — no layout shift when the cards arrive. */
function ShowcaseSkeleton() {
  return (
    <>
      <div aria-hidden="true" className="flex justify-center gap-4 overflow-hidden">
        {[0, 1, 2].map((index) => (
          <div key={index} className="w-[var(--carousel-card)] shrink-0 animate-pulse">
            <div className="aspect-[27/40] rounded-xl border border-line bg-surface" />
            <div className="mt-2 h-10 rounded-md border border-line bg-surface" />
          </div>
        ))}
      </div>
      <p role="status" className="sr-only">
        Carregando…
      </p>
    </>
  )
}

export function PromotionShowcase() {
  const [sections, setSections] = useState<PromotionSection[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPromotionPublic()
      .then((data) => {
        if (!cancelled) setSections(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError && err.kind === 'network' ? NETWORK_ERROR : SHOWCASE_ERROR)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error !== null) {
    return (
      <ShowcaseShell>
        <p
          role="alert"
          aria-live="polite"
          className="text-center text-sm font-semibold text-error"
        >
          {error}
        </p>
      </ShowcaseShell>
    )
  }

  if (sections === null) {
    return (
      <ShowcaseShell busy>
        <ShowcaseSkeleton />
      </ShowcaseShell>
    )
  }

  const impecavelSections = sections.flatMap((section) => {
    const cards = section.cards.filter(
      (card) => tierForOvr(Math.round(card.ovr)) === 'platinum',
    )
    return cards.length > 0 ? [{ ...section, cards }] : []
  })

  if (impecavelSections.length === 0) {
    return (
      <ShowcaseShell>
        <p className="text-center text-sm text-muted">
          Ainda não há jogadores Impecáveis — o topo do ranking de cada classe aparecerá aqui
          assim que alguém alcançar a faixa máxima.
        </p>
      </ShowcaseShell>
    )
  }

  return (
    <ShowcaseShell>
      {/* No panels: the class header and the cards float directly on the
          page's neon grid. Sections are separated by air, not borders. */}
      <div className="flex w-full flex-col gap-16 pb-8 sm:gap-20 sm:pb-12">
        {impecavelSections.map((section) => (
          <section key={section.class_name} className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              {/* D-17: class imagery grounds the section in the game; D-16:
                  classes without official art render the monogram tile —
                  never a broken image. */}
              <ClassCrest charClass={section.class_name} size="md" />
              <h2 className="font-display text-2xl font-semibold text-content">
                {classLabel(section.class_name)}
              </h2>
              {/* Fading rule: ties the floating header to the row without
                  drawing a box around either. */}
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-accent/40 via-line to-transparent"
              />
            </div>
            {/* SHWC-01 rework (UAT rounds 1/4): centered spotlight carousel —
                one card on mobile, exactly three at lg. Server order preserved
                (no client re-sort). */}
            <HighlightsCarousel
              cards={section.cards}
              charClass={section.class_name}
              label={`${classLabel(section.class_name)} — cartazes impecáveis`}
            />
          </section>
        ))}
      </div>
    </ShowcaseShell>
  )
}
