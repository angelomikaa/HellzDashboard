// HighlightsCarousel — the Início showcase slider (SHWC-01, reworked after
// UAT round 1 test 8: "it looks static — should look like a carousel, with the
// middle card being in the spotlight"; Phase 10: Início is the public landing
// page, so this renders for visitors too).
//
// UAT round 2 ("lets make it round"): the row used to be a straight line — on
// the first card there was empty space to its left and on the last one to its
// right, because the scroller simply ran out of content. It now renders the
// server-ordered list THREE times when there is more than one card, starts on
// the middle copy, and silently re-centres onto the middle copy after the
// scroll settles (`loopIndex`). Both outer copies are inert/aria-hidden
// duplicates that exist only so every visible card always has a real
// neighbour: the first card shows the last one peeking in from the left, the
// last shows the first on the right. Navigation (arrows, ← →, Home/End, swipe)
// therefore never hits a physical end.
//
// The spotlight is keyed by LOGICAL index (physical slot % card count), not by
// physical slot. All three copies of the active card share the class, so the
// instant jump from an outer copy to the middle copy changes nothing visually
// — no scale/opacity pop at the seam. Only one copy is ever on screen anyway.
//
// What the original implementation got wrong:
//   - `scroll-snap-x` is not a Tailwind class (the real one is `snap-x`), so
//     snapping never applied;
//   - slots were `max-w-[320px]`, so on a wide section the row never
//     overflowed and there was literally nothing to scroll — the arrows and
//     swipe were dead;
//   - one `sliderRef` was shared by every class section, so navigation always
//     targeted the LAST section's scroller.
// This component is per-section (own ref + own spotlight index) and uses the
// edge-padding centering technique: the scroller pads by half the leftover
// space, so any card can sit dead center and every card gets a `snap-center`
// position.
//
// Presentation: the card nearest the viewport center is the SPOTLIGHT (full
// scale, full opacity, static red drop-shadow); neighbours recede (slightly
// smaller, dimmed) and peek in from the edges. Navigation is user-driven only
// — arrows, keyboard (← → Home End) and native swipe — never autoplay
// (07.1 D-05). The global prefers-reduced-motion rule in index.css kills the
// transitions; the layout still works with them off.
//
// Data contract unchanged: cards render in SERVER order (highest OVR first),
// never re-sorted here. Pure presentation — no points math in TS.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PromotionCardRow } from '../../lib/api'
import { PromotionCard } from './PromotionCard'
import { clampIndex, loopIndex, nearestCardIndex } from './carousel'

const SLOT_SELECTOR = '[data-carousel-slot]'
// Three copies is the minimum that gives the middle copy a real neighbour on
// BOTH sides for every card, including the first/last logical ones.
const COPIES = 3
// A scroll is considered settled (safe to jump copies) this long after the
// last scroll event; smooth scrolling emits events until it stops.
const SETTLE_MS = 140

export function HighlightsCarousel({
  cards,
  charClass,
  label,
}: {
  cards: PromotionCardRow[]
  charClass: string
  label: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const looping = cards.length > 1
  const copies = looping ? COPIES : 1
  const slotCount = cards.length * copies
  // Spotlight by logical card (0..n-1), shared by that card's three copies.
  const [active, setActive] = useState(0)

  // Center a card: scroll BY the distance between its center and the
  // viewport's center, so the target card always lands in the spotlight.
  const centerCard = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const scroller = scrollerRef.current
      if (!scroller) return
      const slots = scroller.querySelectorAll<HTMLElement>(SLOT_SELECTOR)
      const slot = slots[clampIndex(index, slots.length)]
      if (!slot) return
      const scrollerRect = scroller.getBoundingClientRect()
      const slotRect = slot.getBoundingClientRect()
      const delta =
        slotRect.left + slotRect.width / 2 - (scrollerRect.left + scrollerRect.width / 2)
      if (Math.abs(delta) < 1) return
      scroller.scrollBy({ left: delta, behavior })
    },
    [],
  )

  // Mount / list change: start on the middle copy so the loop exists before
  // the first paint (a layout effect, so no frame shows the straight line).
  useLayoutEffect(() => {
    if (!looping) return
    centerCard(cards.length, 'auto')
  }, [looping, cards.length, centerCard])

  // Nearest physical slot from live geometry.
  const nearestSlot = useCallback((): number => {
    const scroller = scrollerRef.current
    if (!scroller) return 0
    const scrollerRect = scroller.getBoundingClientRect()
    const viewportCenter = scrollerRect.left + scrollerRect.width / 2
    const centers = Array.from(scroller.querySelectorAll<HTMLElement>(SLOT_SELECTOR)).map(
      (slot) => {
        const rect = slot.getBoundingClientRect()
        return rect.left + rect.width / 2
      },
    )
    return nearestCardIndex(centers, viewportCenter)
  }, [])

  // Instantly land on the middle copy's equivalent of `nearest` (no-op when it
  // already is). The jump is pixel-identical — all copies are identical and
  // the layout is uniform — so it is invisible, and because the spotlight is
  // logical no transition fires. Returns the slot we ended up on.
  const jumpToMiddle = useCallback(
    (nearest: number): number => {
      const scroller = scrollerRef.current
      if (!scroller || !looping) return nearest
      const target = loopIndex(nearest, cards.length)
      if (target === nearest) return nearest
      const slots = scroller.querySelectorAll<HTMLElement>(SLOT_SELECTOR)
      const from = slots[nearest]
      const to = slots[target]
      if (!from || !to) return nearest
      const fromRect = from.getBoundingClientRect()
      const toRect = to.getBoundingClientRect()
      scroller.scrollLeft +=
        toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2)
      return target
    },
    [cards.length, looping],
  )

  // After the scroll settles, if the centered slot is in an outer copy, jump
  // by whole copies onto the middle copy. Navigation always starts from there,
  // so held keys can never walk into a physical end (and no empty space shows).
  const normalize = useCallback(() => {
    if (!looping) return
    jumpToMiddle(nearestSlot())
  }, [jumpToMiddle, looping, nearestSlot])

  // Spotlight tracking: on scroll (rAF-coalesced) and on resize, pick the card
  // nearest the scroller's visible center; when the scroll settles, normalise
  // onto the middle copy. Measuring client rects keeps this correct regardless
  // of the offset parent and of the edge padding.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let frame = 0
    let settle = 0

    const measure = () => {
      if (cards.length === 0) return
      setActive(nearestSlot() % cards.length)
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
      window.clearTimeout(settle)
      settle = window.setTimeout(normalize, SETTLE_MS)
    }

    // First paint: measure on the next frame so the initial centered card is
    // picked up after layout, without a synchronous setState inside the effect.
    frame = requestAnimationFrame(measure)
    scroller.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      scroller.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [cards.length, nearestSlot, normalize])

  // One step: if we are on an outer duplicate (e.g. a rapid second press before
  // the settle jump), first snap onto the middle equivalent, THEN step one
  // card. Jump and smooth step happen in the same task, so the user only sees
  // a one-card move — never a fling across copies, never a physical end.
  const step = useCallback(
    (direction: -1 | 1) => {
      const middle = jumpToMiddle(nearestSlot())
      centerCard(middle + direction)
    },
    [centerCard, jumpToMiddle, nearestSlot],
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!looping) return
    const first = cards.length
    const last = cards.length * 2 - 1
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      step(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      step(1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      centerCard(first)
    } else if (event.key === 'End') {
      event.preventDefault()
      centerCard(last)
    }
  }

  if (cards.length === 0) return null

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!looping}
          aria-label={`Anterior — ${label}`}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface text-lg text-content hover-control disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!looping}
          aria-label={`Próximo — ${label}`}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface text-lg text-content hover-control disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div
        ref={scrollerRef}
        className="carousel-scroller overflow-x-auto snap-x snap-mandatory pb-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
        role="region"
        aria-roledescription="carrossel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <ul className="flex w-max items-center gap-4">
          {Array.from({ length: slotCount }, (_, physical) => {
            const logical = physical % cards.length
            const card = cards[logical]
            const clone = looping && (physical < cards.length || physical >= cards.length * 2)
            const spotlight = logical === active
            return (
              <li
                key={physical}
                data-carousel-slot={physical}
                aria-roledescription={clone ? undefined : 'cartaz'}
                aria-label={clone ? undefined : `${logical + 1} de ${cards.length}`}
                aria-hidden={clone || undefined}
                inert={clone || undefined}
                className={`w-[var(--carousel-card)] shrink-0 snap-center transition-[scale,opacity] duration-300 ease-out ${
                  spotlight
                    ? 'carousel-spotlight scale-100 opacity-100'
                    : 'scale-[0.92] opacity-55'
                }`}
              >
                <PromotionCard card={card} charClass={charClass} />
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
