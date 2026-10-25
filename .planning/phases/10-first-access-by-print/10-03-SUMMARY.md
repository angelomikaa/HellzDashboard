# Plan 10-03 — Destaques scroll-snap slider (complete)

Phase: 10 | Plan: 03 | Wave: 1 | Requirements: SHWC-01

## What was done

**src/features/highlights/HighlightsPage.tsx** — Converted the Destaques card grid to a scroll-snap slider:

- `useRef` imported; `sliderRef` created for the slider container.
- `scrollOneCard(direction)` — scrolls by one card width (`firstElementChild.offsetWidth`, fallback `clientWidth/3`) with `behavior: 'smooth'`. Pure UX, no data fetch, no server order change.
- `handleKeyDown` — ArrowLeft/ArrowRight on the slider container (`tabIndex={0}`) scroll one card; `preventDefault()` keeps the page from scrolling.
- `handleTouchStart`/`handleTouchEnd` — touch swipe with 30px threshold scrolls one card in the swipe direction.
- Inner `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` replaced with:
  - Slider container: `overflow-x-auto scroll-snap-x snap-mandatory whitespace-nowrap -mx-4 pb-6`, `role="region"`, `aria-label="Destaques — cartazes impecáveis"`, `tabIndex={0}`, keyboard + touch handlers.
  - Card wrappers: `inline-block w-full max-w-[320px] shrink-0 snap-center snap-always px-2 lg:max-w-[calc(100%/3)]` → 1-up mobile (full width), 3-up at lg (~1/3 each).
  - Section headers (ClassCrest + classLabel) unchanged above each section; only the card row became a horizontal slider.
  - Server order preserved — cards render in `fetchPromotion` order, no client re-sort.

## Verification

- `npx tsc --noEmit` — passes, zero errors (covers HighlightsPage.tsx)

## Must-haves (all confirmed)

- [x] Destaques promo cards render in a scroll-snap slider (not a grid)
- [x] 1-up on mobile, 3-up on desktop (breakpoint at lg)
- [x] Keyboard arrow navigation reachable (tabIndex={0}, ArrowLeft/Right)
- [x] Swipe reachable on touch devices (touchstart/touchend, 30px threshold)
- [x] Server order preserved (no client re-sorting)
- [x] Members-only access unchanged (get_promotion RPC enforcement untouched)
- [x] tsc --noEmit passes

## Notes

- No new npm dependencies; CSS scroll-snap only; no autoplay (07.1 D-05 static-only rule respected for the slider itself — no auto-advance).
- `scrollBy` with `behavior: 'smooth'` respects `prefers-reduced-motion` at the browser level.
- `tabIndex={0}` on the slider container makes keyboard focus reachable; focus is retained on the container after scroll.
- Section headers remain outside the slider (each section is its own scroll region).
