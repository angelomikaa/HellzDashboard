---
status: testing
phase: 10-first-access-by-print
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md]
started: 2026-10-24T04:00:00Z
updated: 2026-10-24T04:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 8
name: Slider keyboard navigation
expected: |
  Clicking/tabbing into the slider and pressing ArrowLeft/ArrowRight scrolls
  exactly one card per keypress (page itself does not scroll).
awaiting: user response

## Tests

### 1. Início tab in navigation
expected: After logging in, the nav bar shows an "Início" tab between "Painel" and "Enviar Status". Clicking it opens the personalized home page.
result: pass

### 2. Own OVR card on Início
expected: The Início page shows your own OVR card (the same OvrHero style as Painel): OVR number with tier color (or the insufficient-data explanation), your name, and your class · function line.
result: pass

### 3. Top-3 best-stats strip
expected: Below the OVR card, up to 3 of your best stats appear as tiles — stat label, formatted value (pt-BR, % where percentual), raw points number in the tier color — highest points first.
result: pass

### 4. Stale-data CTA (>7 days)
expected: When your last validated submission is more than 7 days old, a banner appears: "Seus dados estão desatualizados — envie um novo status para manter seu ranking em dia." with an "Enviar Status" button that opens the submit wizard.
result: pass

### 5. First-submission variant (never submitted)
expected: An account that never submitted sees the evergreen banner: "Envie seus status para ver seu OVR e seus melhores stats." with the same "Enviar Status" button.
result: pass

### 6. Fresh data shows no banner
expected: With data validated 7 days ago or less, no banner appears between the OVR card and the best-stats strip.
result: pass

### 7. Destaques scroll-snap slider
expected: Destaques renders each class's Impecável cards in a horizontal sideways-scrolling slider — one card per view at mobile width, three visible per view on desktop (lg).
result: pass
note: First attempt blanked the whole UI (G-1). After the hook-order fix + page error boundary, re-tested clean.

### 8. Slider keyboard navigation
expected: Clicking/tabbing into the slider and pressing ArrowLeft/ArrowRight scrolls exactly one card per keypress (page itself does not scroll).
result: issue
report: "nope, it looks static - shoud look like a carousel, with the middle card being in the spotlight"
note: Root cause fixed (G-2) — re-test pending.

### 9. Slider swipe navigation
expected: On a touch device (or touch emulation), swiping left/right on the slider scrolls one card in the swipe direction.
result: [pending]

### 10. Server order + members-only unchanged
expected: The slider shows cards in the same server order as before (no re-sorting), and Destaques still requires login — a logged-out visitor sees nothing.
result: [pending]

## Summary

total: 10
passed: 7
issues: 1
pending: 2
skipped: 0
blocked: 0

## Gaps

### G-1 (test 7, critical): Destaques blanked the entire UI

report: "clicking on the tab distaques makes the whole UI vanish"

root_cause: |
  HighlightsPage declared `useRef` AFTER the loading/empty early returns. The
  first paint (sections === null) ran 2 hooks; the post-fetch paint ran 4.
  React aborts that render with "Rendered more hooks than during the previous
  render" — and because the shell had no error boundary, the throw unmounted
  the whole tree, leaving a blank screen with no nav. oxlint already flags it
  as `react-hooks(rules-of-hooks)` ERROR, but `npm run lint` was not part of
  the phase gate list (tsc + vitest + build were), so it shipped.

fix: |
  - HighlightsPage: `sliderRef` and the touch origin moved above the first
    early return. Touch origin is now a `useRef` (was a render-scoped `let`,
    which also lost the value between renders).
  - New `src/features/shell/PageErrorBoundary.tsx` wraps the page switch in
    App.tsx, keyed by tab: any future page render crash stays inside the
    content region with a "Tentar novamente" action instead of blanking the
    shell.

verification: npx tsc --noEmit clean; npx oxlint src -> 0 errors; vitest 664/664
  in 43 files; npx vite build green.
status: fixed — re-tested PASS (test 7)

### G-2 (test 8, major): Destaques "looks static" — not a carousel

report: "nope, it looks static - shoud look like a carousel, with the middle
  card being in the spotlight"

root_cause: |
  Three defects in the 10-03 slider, all in HighlightsPage.tsx:
  1. `scroll-snap-x` is not a Tailwind class (the real one is `snap-x`), so
     snapping never applied.
  2. Slots were `max-w-[320px]`; on a wide section the row never overflowed, so
     there was literally nothing to scroll — arrows/keys/swipe were dead
     (the "static" report).
  3. One `sliderRef` was shared by every class section, so navigation always
     targeted the LAST section's scroller.
  Presentation had no carousel affordance at all: no visible controls, no
  peeking neighbours, no focal card.

fix: |
  - New `src/features/highlights/HighlightsCarousel.tsx` — per-section
    component (own ref + own active index). Edge-padding centering
    (`.carousel-scroller` in index.css pads by half the leftover space) so the
    first AND last card can sit dead center under `snap-center`.
  - Real carousel: card nearest the viewport center is the SPOTLIGHT (full
    scale, full opacity, static red drop-shadow); neighbours recede
    (scale 0.92, 55% opacity) and peek in from the edges. Prev/next buttons
    with disabled bounds; ← → Home End on the focused scroller; native swipe.
    No autoplay (07.1 D-05); reduced-motion kills the transitions.
  - New pure module `carousel.ts` (`nearestCardIndex`, `clampIndex`) + 6 unit
    tests — the spotlight rule is testable without a DOM.

verification: live in the browser as a smoke fixture — scrollWidth 1756 >
  clientWidth 1084 (scrollable), next-arrow centers card 2 (scrollLeft 336 →
  672, spotlight follows), ArrowRight centers the last card with the page not
  scrolling, next disabled at the end. tsc clean; oxlint 0 errors; 670/670
  vitest; vite build green.
status: fixed — awaiting re-test of test 8
