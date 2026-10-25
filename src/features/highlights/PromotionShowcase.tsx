// PromotionShowcase — the Impecáveis showcase that now lives INSIDE Início
// (Phase 10, owner decision 2026-10-24: "Destaques and Inicio were supposed to
// be the same page - a page that can be seen when a visitor arrives and also
// visible to logged in users - this is why its called inicio, its a landing
// page"). The old standalone Destaques tab is gone; this component is the
// single showcase surface, rendered for visitors and members alike.
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
import { useEffect, useState } from 'react'
import { ApiError, fetchPromotionPublic, type PromotionSection } from '../../lib/api'
import { tierForOvr } from '../dashboard/presentation'
import { ClassCrest } from '../assets/ClassCrest'
import { classLabel } from '../../lib/classLabels'
import { HighlightsCarousel } from './HighlightsCarousel'

// Enumeration-safe pt-BR copy: never expose HTTP codes or gateway internals.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SHOWCASE_ERROR = 'Não foi possível carregar os destaques. Tente novamente.'

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
      <section className="rounded-lg border border-line bg-surface p-6">
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-error">
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

  const impecavelSections = sections.flatMap((section) => {
    const cards = section.cards.filter(
      (card) => tierForOvr(Math.round(card.ovr)) === 'platinum',
    )
    return cards.length > 0 ? [{ ...section, cards }] : []
  })

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
    <section aria-labelledby="destaques-heading" className="flex flex-col gap-8">
      <header className="flex flex-col items-center gap-4 pt-4 text-center sm:pt-8">
        <h2
          id="destaques-heading"
          className="font-display text-5xl font-semibold tracking-wide text-content sm:text-6xl"
        >
          Destaques
        </h2>
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
              <h3 className="font-display text-2xl font-semibold text-content">
                {classLabel(section.class_name)}
              </h3>
            </div>
            {/* SHWC-01 rework (UAT round 1): centered spotlight carousel —
                one card on mobile, center card + peeking neighbours on
                desktop. Server order preserved (no client re-sort). */}
            <HighlightsCarousel
              cards={section.cards}
              charClass={section.class_name}
              label={`${classLabel(section.class_name)} — cartazes impecáveis`}
            />
          </section>
        ))}
      </div>
    </section>
  )
}
