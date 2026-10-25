---
status: testing
phase: 10-first-access-by-print
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md]
started: 2026-10-24T04:00:00Z
updated: 2026-10-24T22:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 9
name: Slider swipe navigation
expected: |
  On a touch device (or touch emulation), swiping left/right on the slider
  scrolls one card in the swipe direction.
awaiting: user response

## Tests

### 1. Início tab in navigation
expected: After logging in, the nav bar shows "Painel | Início | Enviar Status" (no standalone Destaques tab), with Início active by default. Clicking Painel opens the detailed dashboard.
result: pass
note: 2026-10-24 owner correction — Início is the landing page and the default tab; Destaques was absorbed into it.

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

### 7. Início scroll-snap slider
expected: Início renders each class's Impecável cards in a horizontal sideways-scrolling slider — one card per view at mobile width, three visible per view on desktop (lg). The slider renders for visitors and members alike.
result: pass
note: First attempt blanked the whole UI (G-1). After the hook-order fix + page error boundary, re-tested clean. Re-verified on the public landing after the Início/Destaques merge, and again after the loop rework (G-3).

### 8. Slider keyboard navigation
expected: Clicking/tabbing into the slider and pressing ArrowLeft/ArrowRight scrolls exactly one card per keypress (page itself does not scroll).
result: pass
report: "nope, it looks static - shoud look like a carousel, with the middle card being in the spotlight"
note: Root cause fixed (G-2). Live re-test: next-arrow centers card 2 (scrollLeft 336 → 672, spotlight follows), ArrowRight centers the last card with the page not scrolling. The carousel component is unchanged by the Início merge. G-3 made the row loop, so the arrows no longer disable at the ends and ArrowRight past the last card wraps to the first (verified live: scrollLeft stays inside the middle copy, 1008..1680).

### 9. Slider swipe navigation
expected: On a touch device (or touch emulation), swiping left/right on the slider scrolls one card in the swipe direction.
result: [pending]

### 10. Server order + public showcase
expected: The slider shows cards in the same server order as before (no re-sorting). The showcase is now PUBLIC: a logged-out visitor sees the Impecáveis cards (name, class, OVR, 6 key stats, photo) on Início, and the anon RPC never returns key-stat config.
result: pass
note: anon `get_promotion_public` → 200, 1 section / 3 cards, field census exactly {display_name, char_function, ovr, photo_path, highlights{stat_key,label,label_short,value_type,value,points}}; no weight/selection_order/is_key strings in the payload. Anon `get_promotion` still 401.

### 11. Public landing (visitor)
expected: Opening the site without a session lands on Início with the Hellz header (Solicitar acesso + Entrar) and the Impecáveis showcase; no personal OVR/top-3/CTA blocks.
result: pass
note: Verified in a cleared-storage browser tab.

### 12. Member landing (after login)
expected: After login the default tab is Início, showing the personal OVR card + top-3 strip above the same showcase; the Destaques tab is gone.
result: pass
note: Verified live as the Smoke Sumo Um fixture (OVR 97, top-3 FLEE/Recuperação de SP/Refino MDEF).

### 13. Logout returns to the landing
expected: Clicking Sair (or an expired session) returns to the public Início, not the login card; Entrar reopens the login.
result: pass

### 14. Showcase photos
expected: Cards show the member's submitted screenshot where one exists and fall back to the class portrait otherwise (no broken image); the photo loads without a session.
result: pass
note: `photo_path` restored on both RPCs (0026 regression). Anon storage GET → 200 for an active member's object, 404/400 for missing objects → portrait fallback.

## Summary

total: 14
passed: 13
issues: 0
pending: 1
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
status: fixed — re-tested PASS (test 8)

### G-3 (test 8, round 2): the carousel was a straight line

report: "lets make it round - the current carousel is like a straight line, if
  im in the first card, i can see empty space to the left. the behavior should
  look like a loop, currently it has a beggining and an end"

root_cause: |
  The row was a single copy of the list with edge padding: the first card
  could be centered but had nothing to its left (only padding), the last had
  nothing to its right, and the arrows disabled at both ends. There was no
  wrap-around, so the "loop" the owner expected never existed.

fix: |
  - Render the server-ordered list THREE times when there is more than one
    card, start on the middle copy (layout effect, before paint), and silently
    jump by whole copies back onto the middle copy once the scroll settles
    (`loopIndex`, new pure helper + 5 unit tests). The outer copies are
    `inert` + `aria-hidden` duplicates; they exist only so a centered card
    always has a real neighbour on both sides.
  - The spotlight is keyed by LOGICAL index (slot % card count), shared by all
    three copies, so the invisible jump changes no class and fires no
    transition (no scale/opacity pop at the seam).
  - Arrows/← →/Home/End always navigate from the middle copy and never disable
    (except a single-card section); held keys and rapid presses cannot walk
    into a physical end, and a manual fling to either end normalises back.
  - `fetchCardPhotoByPathPublic` now shares one promise per storage path, so
    the three copies still download each photo once (measured: 3 requests for
    9 rendered cards).

verification: live on the public landing — 9 slots / 6 clones, initial
  scrollLeft 1008 (middle copy, "1 de 3" centered) with the last card visible
  to its left; prev wraps to the middle last card (scrollLeft 1680, spotlight
  logical 2); next past the last wraps to the first; 7 rapid ArrowRight presses
  and manual scrolls to 0 / max both settle inside the middle copy; Home/End
  land on the middle first/last. tsc clean; oxlint 0 errors; 675/675 vitest
  (44 files); vite build green.
status: fixed — live-verified; test 9 (touch swipe) still pending

## Scope correction (owner, 2026-10-24)

report: "the original planning messed up things. Destaques and Inicio were
  supposed to be the same page - a page that can be seen when a visitor
  arrives and also visible to logged in users - this is why its called inicio,
  its a landing page. the tab destaques is follow the right direction, the
  current tab inicio is pointless"

decision: full public showcase (name, class, OVR, 6 key stats, photo) + ONE
  Início tab (owner answers to the two boundary questions).

shipped: |
  - Migration 0029 (scripts/gen-0029.mjs, generated from the live prosrc):
    get_promotion_public() (anon grant, member gate removed) +
    is_public_card_photo() storage predicate + anon SELECT policy on
    card-photos for ACTIVE members; photo_path restored on BOTH showcase RPCs
    (0026 regression: the hand-written hotfix had dropped it).
  - InicioPage is the landing: PersonalHome (session only) + PromotionShowcase
    (everyone). HighlightsPage deleted; PromotionCard/HighlightsCarousel are
    session-free and fetch photos with the anon key.
  - App: 'destaques' removed from Tab/nav, default tab 'inicio'.
  - RequireAuth: new 'landing' default view (PublicLanding shell); logout and
    expired sessions return there; LoginPage gained "← Voltar para o início".

verification: anon RPC 200 with the closed field census; anon storage 200 for
  an active member photo; member get_promotion still gated; live browser:
  visitor landing + member landing + logout-to-landing + photo render.
  tsc clean; oxlint 0 errors; 670/670 vitest; vite build green.
