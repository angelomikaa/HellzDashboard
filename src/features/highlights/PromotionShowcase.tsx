// PromotionShowcase — the Impecáveis showcase that now lives INSIDE Início
// (Phase 10, owner decision 2026-10-24: "Destaques and Inicio were supposed to
// be the same page - a page that can be seen when a visitor arrives and also
// visible to logged in users - this is why its called inicio, its a landing
// page"). The old standalone Destaques tab is gone; this component is the
// single showcase surface, rendered for visitors and members alike.
//
// UAT round 3 (owner): "removing the box and let the cards float in space" +
// "the plan was supposed to include light animations, like the neon ring".
// The per-class panels are gone — the cards sit directly on the neon-grid
// backdrop, separated only by space. The Phase 10 soft-motion layer
// (10-CONTEXT D-01/D-02/D-03) is applied:
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
// UAT round 5 (owner): "move the icon, the name and the carousel controls to
// inside the carousel box" — the crest/name header and the arrows are now one
// bar inside HighlightsCarousel, not a separate header row out here.
//
// UAT round 6 (owner, rebuilt from a failed draft): ONE Impecável class holds
// the showcase at a time, rotating to the next every AUTO_ADVANCE_MS. The
// rotation state machine lives HERE, above the per-class carousel remount:
//   - pause reasons stack (pointer hover on web + keyboard/touch focus on
//     mobile) — WCAG 2.2.2, auto-updating content must be pausable, and a
//     carousel must never rotate away from someone mid-interaction. The
//     explicit ‖/▶ control was REMOVED (owner 2026-10-26: "the pause control
//     in the home status must be removed and replaced by pause on hover (web)
//     and pause on focus (mobile)") — the hover/focus reasons are the only
//     pause surface now;
//   - the remaining wall-clock time is captured at the pause instant, so
//     resume continues the window instead of restarting it (the CSS drain bar
//     freezes via animation-play-state and stays in sync);
//   - card navigation inside a class re-arms the window (browsing this class
//     defers the rotation);
//   - an sr-only live region announces "Classe n de N: <classe>" on change —
//     the visible h2 swap alone is silent for screen readers.
//
// Data path (0029): get_promotion_public is the anon-callable twin of
// get_promotion — same body, member gate removed. No session is threaded
// through here, so the exact same tree renders before and after login. The
// payload is rendered verbatim: no rank computation in TS (T-06-13).
//
// 0037 (owner decision 2026-10-28): the server now ranks the TOP 3 by OVR of
// each META (class, function) cohort only — the meta / non-viable split lives
// in public.class_cohorts, so non-viable builds (and classes without enough
// data) never reach this component. A class with several meta cohorts keeps ONE
// section with up to 3 cards per cohort, ordered by OVR desc.
//
// 10.2 client half (owner request 2026-10-29): instead of mixing that class's
// builds into a single scroller, the showcase splits them by function —
// ONE CAROUSEL PER META BUILD (Summoner has 3, High Priest has 1). Non-viable
// builds are already gone from the payload, and a build with no cards
// produces no scroller, so the number of scrollers under a class is exactly
// the number of its meta builds that currently have Impecáveis.
//
// Owner gate round 2 (07.1-02): the showcase is the premium register — only
// Impecável (top-band) cards appear. Display-layer tier filter over the
// fetched payload, server order preserved (filter, never sort), sections left
// empty are dropped. tierForOvr is the unit-locked banding function. Because
// the server takes the top 3 by OVR first, this filter yields exactly the top 3
// platinum cards of each meta cohort (a cohort with fewer than 3 platinum shows
// what it has).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, fetchPromotionPublic, type PromotionSection } from '../../lib/api'
import { groupCardsByBuild, mergeCohortSections } from './buildGroups'
import { tierForOvr } from '../dashboard/presentation'
import { classLabel } from '../../lib/classLabels'
import { HighlightsCarousel } from './HighlightsCarousel'
import { AUTO_ADVANCE_MS, clampClassIndex, wrapClassIndex } from './carousel'

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

  // 10.2: normalise the payload into ONE section per CLASS before anything
  // else. The live RPC ranks each meta cohort separately, so a multi-build
  // class (Summoner) arrives as TWO sections sharing one class_name — without
  // this merge the rotation would treat each build as its own class index
  // (the owner's "10th index just for the magic damage role of the summoner
  // class"). Merging first means the class stays ONE rotation slot and its
  // builds become the rows INSIDE it (groupCardsByBuild, below). With a body
  // that already answers one section per class this is a pass-through.
  const classSections = mergeCohortSections(sections)

  const impecavelSections = classSections.flatMap((section) => {
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
      {/* No panels: each carousel owns its class header (crest + name +
          arrows) and the cards float directly on the page's neon grid.
          Round 6: one class holds the showcase at a time, rotating
          (ClassRotation below). Server order preserved (no client re-sort). */}
      <ClassRotation sections={impecavelSections} />
    </ShowcaseShell>
  )
}

/** Round 6: the rotating one-class view. Mounted only with at least one
 *  Impecável section, so `sections` is never empty and the hooks below never
 *  sit behind a conditional. Owns the whole rotation state machine — it must
 *  live ABOVE the per-class carousel remount, or a pause would reset on every
 *  class switch.
 *
 * 10.2: one class at a time, but each class shows one scroller PER BUILD.
 * A build row carries its own label chip and its own card arrows, and any
 * interaction in ANY row re-arms the window (browsing this class defers the
 * rotation). Class rotation controls only live on the FIRST row — the class
 * is the rotation unit, so a three-build class must not carry three
 * steppers/drain bars. */
function ClassRotation({ sections }: { sections: PromotionSection[] }) {
  const total = sections.length
  const [activeIndex, setActiveIndex] = useState(0)
  const [pauseReasons, setPauseReasons] = useState({
    pointer: false,
    focus: false,
  })
  const rotationPaused = pauseReasons.pointer || pauseReasons.focus

  // The armed window. remainingRef carries the wall-clock left in the
  // current class's slot across pause/resume; windowRef lets the pause
  // handlers read the armed window's start/delay at the instant of pausing
  // (the effect owns the values, the handler owns the capture — the cleanup
  // NEVER writes remainingRef, so re-arms and advances can't clobber it).
  const remainingRef = useRef(AUTO_ADVANCE_MS)
  const windowRef = useRef<{ startedAt: number; delay: number } | null>(null)
  // Bumped by card navigation (onUserInteraction) to re-arm the window.
  const [windowKey, setWindowKey] = useState(0)

  /** Pause/resume one reason. Reasons stack; the first one ON captures the
   *  remaining time (windowRef is nulled while paused, so a second reason
   *  arriving can't re-capture), and the last one OFF re-arms the timer. */
  const setPause = useCallback((reason: 'pointer' | 'focus', paused: boolean) => {
    if (paused) {
      const armed = windowRef.current
      if (armed) {
        remainingRef.current = Math.max(0, armed.startedAt + armed.delay - Date.now())
        windowRef.current = null
      }
    }
    setPauseReasons((prev) => (prev[reason] === paused ? prev : { ...prev, [reason]: paused }))
  }, [])

  /** Manual class step (‹ › buttons): wraps at the ends, fresh window. */
  const stepClass = useCallback(
    (delta: 1 | -1) => {
      remainingRef.current = AUTO_ADVANCE_MS
      setActiveIndex((index) => wrapClassIndex(index, delta, total))
    },
    [total],
  )

  /** Card navigation inside the current class: the member is browsing, so
   *  defer the rotation by re-arming the window. */
  const restartWindow = useCallback(() => {
    remainingRef.current = AUTO_ADVANCE_MS
    setWindowKey((key) => key + 1)
  }, [])

  // The rotation timer itself. One timeout per window; every dep change is a
  // deliberate re-arm (class switch, pause/resume, card interaction) that
  // starts from remainingRef. Single-class showcases never rotate.
  useEffect(() => {
    if (total <= 1 || rotationPaused) {
      windowRef.current = null
      return
    }
    const delay = remainingRef.current
    const startedAt = Date.now()
    windowRef.current = { startedAt, delay }
    const id = window.setTimeout(() => {
      remainingRef.current = AUTO_ADVANCE_MS
      setActiveIndex((index) => wrapClassIndex(index, 1, total))
    }, delay)
    return () => {
      window.clearTimeout(id)
      windowRef.current = null
    }
  }, [activeIndex, rotationPaused, total, windowKey])

  // Sections can shrink after a refetch (a player went inactive) — snap the
  // index back into range instead of rendering a blank showcase.
  useEffect(() => {
    setActiveIndex((index) => clampClassIndex(index, total))
  }, [total])

  const clampedIndex = clampClassIndex(activeIndex, total)
  const section = sections[clampedIndex]
  if (section === undefined) return null
  // 10.2: the class's Impecável cards, split by build (function). Summoner →
  // 3 groups (3 scrollers), High Priest → 1, and a build with no Impecáveis
  // produces no group at all — never an empty scroller. groupCardsByBuild is
  // pure grouping of an already-ranked payload: every card keeps its exact
  // server position inside its own build.
  const builds = groupCardsByBuild(section.cards)

  return (
    <div
      className="flex w-full flex-col gap-16 pb-8 sm:gap-20 sm:pb-12"
      onMouseEnter={() => setPause('pointer', true)}
      onMouseLeave={() => setPause('pointer', false)}
      onFocus={(event) => {
        const from = event.relatedTarget
        if (!(from instanceof Node && event.currentTarget.contains(from))) {
          setPause('focus', true)
        }
      }}
      onBlur={(event) => {
        const to = event.relatedTarget
        if (!(to instanceof Node && event.currentTarget.contains(to))) {
          setPause('focus', false)
        }
      }}
    >
      {/* Screen-reader announcement of the rotation. It must be a PERSISTENT
          node — the keyed carousel remounts per class and a remounting node
          never announces. The visible count in the carousel bar is
          aria-hidden; this region is the accessible channel. */}
      {total > 1 && (
        <span role="status" aria-live="polite" className="sr-only">
          {`Classe ${clampedIndex + 1} de ${total}: ${classLabel(section.class_name)}`}
        </span>
      )}
      {/* One class, one or more build rows — each is a fully independent
          carousel (own ref/spotlight). `key` on the row set is the class: a
          class switch remounts every row, which restarts the reveal stagger
          and the drain window exactly as before. The intra-class gap is
          deliberately tighter than the outer one (the scrollers' own padding
          already separates the cards): rows of ONE class read as a group,
          while classes stay far apart. */}
      <div key={section.class_name} className="flex flex-col gap-6 sm:gap-8">
        {builds.map((build, row) => (
          <HighlightsCarousel
            key={build.fn}
            cards={build.cards}
            charClass={section.class_name}
            label={`${classLabel(section.class_name)} — ${build.label} — cartazes impecáveis`}
            buildLabel={build.label}
            classIndex={row === 0 ? clampedIndex : undefined}
            totalClasses={row === 0 ? total : undefined}
            rotationPaused={rotationPaused}
            onClassStep={row === 0 ? stepClass : undefined}
            onUserInteraction={restartWindow}
            autoAdvanceMs={AUTO_ADVANCE_MS}
          />
        ))}
      </div>
    </div>
  )
}
