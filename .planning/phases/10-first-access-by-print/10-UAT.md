---
status: testing
phase: 10-first-access-by-print
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md]
started: 2026-10-24T04:00:00Z
updated: 2026-10-24T04:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 7
name: Destaques scroll-snap slider
expected: |
  Destaques renders each class's Impecável cards in a horizontal
  sideways-scrolling slider — one card per view at mobile width, three
  visible per view on desktop (lg).
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
result: issue
report: "clicking on the tab distaques makes the whole UI vanish"
note: Root cause fixed (G-1) — re-test pending.

### 8. Slider keyboard navigation
expected: Clicking/tabbing into the slider and pressing ArrowLeft/ArrowRight scrolls exactly one card per keypress (page itself does not scroll).
result: [pending]

### 9. Slider swipe navigation
expected: On a touch device (or touch emulation), swiping left/right on the slider scrolls one card in the swipe direction.
result: [pending]

### 10. Server order + members-only unchanged
expected: The slider shows cards in the same server order as before (no re-sorting), and Destaques still requires login — a logged-out visitor sees nothing.
result: [pending]

## Summary

total: 10
passed: 6
issues: 1
pending: 3
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
status: fixed — awaiting re-test of test 7
