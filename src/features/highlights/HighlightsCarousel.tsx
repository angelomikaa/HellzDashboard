// HighlightsCarousel — the Início showcase slider (SHWC-01, reworked after
// UAT round 1 test 8: "it looks static — should look like a carousel, with the
// middle card being in the spotlight"; Phase 10: Início is the public landing
// page, so this renders for visitors too).
//
// What the previous implementation got wrong:
//   - `scroll-snap-x` is not a Tailwind class (the real one is `snap-x`), so
//     snapping never applied;
//   - slots were `max-w-[320px]`, so on a wide section the row never
//     overflowed and there was literally nothing to scroll — the arrows and
//     swipe were dead;
//   - one `sliderRef` was shared by every class section, so navigation always
//     targeted the LAST section's scroller.
// This component is per-section (own ref + own active index) and uses the
// edge-padding centering technique: the scroller pads by half the leftover
// space, so the first and last card can both sit dead center and every card
// gets a `snap-center` position.
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
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PromotionCardRow } from '../../lib/api'
import { PromotionCard } from './PromotionCard'
import { clampIndex, nearestCardIndex } from './carousel'

const SLOT_SELECTOR = '[data-carousel-slot]'

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
  const [active, setActive] = useState(0)

  // Spotlight tracking: on scroll (rAF-coalesced) and on resize, pick the card
  // nearest the scroller's visible center. Measuring client rects keeps this
  // correct regardless of the offset parent and of the edge padding.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let frame = 0

    const measure = () => {
      const scrollerRect = scroller.getBoundingClientRect()
      const viewportCenter = scrollerRect.left + scrollerRect.width / 2
      const centers = Array.from(scroller.querySelectorAll<HTMLElement>(SLOT_SELECTOR)).map(
        (slot) => {
          const rect = slot.getBoundingClientRect()
          return rect.left + rect.width / 2
        },
      )
      setActive(nearestCardIndex(centers, viewportCenter))
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
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
    }
  }, [cards.length])

  // Center a card: scroll BY the distance between its center and the
  // viewport's center, so the active card always lands in the spotlight.
  const centerCard = useCallback(
    (index: number) => {
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
      scroller.scrollBy({ left: delta, behavior: 'smooth' })
    },
    [],
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const last = cards.length - 1
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      centerCard(active - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      centerCard(active + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      centerCard(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      centerCard(last)
    }
  }

  const atStart = active <= 0
  const atEnd = active >= cards.length - 1
  const navigable = cards.length > 1

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => centerCard(active - 1)}
          disabled={!navigable || atStart}
          aria-label={`Anterior — ${label}`}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface text-lg text-content hover-control disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          onClick={() => centerCard(active + 1)}
          disabled={!navigable || atEnd}
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
          {cards.map((card, index) => {
            const spotlight = index === active
            return (
              <li
                key={card.display_name}
                data-carousel-slot={index}
                aria-roledescription="cartaz"
                aria-label={`${index + 1} de ${cards.length}`}
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
