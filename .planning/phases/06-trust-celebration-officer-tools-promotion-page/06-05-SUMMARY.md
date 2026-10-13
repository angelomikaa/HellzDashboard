---
phase: 06-trust-celebration-officer-tools-promotion-page
plan: 05
subsystem: ui
tags: [react, tailwind, tier-palette, eafc-card, promotion, rpc-render, pt-br]

# Dependency graph
requires:
  - phase: 06-03
    provides: typed fetchPromotion wrapper + closed PromotionHighlight/PromotionCardRow/PromotionSection contract in api.ts
  - phase: 06-04
    provides: Destaques tab wiring in App.tsx + the placeholder HighlightsPage stub this plan replaces
  - phase: 04-01/04-02
    provides: TIER_BORDER/TIER_TEXT maps, tierForOvr/tierForPoints banding, StatCard badge anatomy, OvrHero composition
provides:
  - PromotionCard — EAFC-style celebration card (tiered OVR hero, function badge, 6 server-ordered tier-styled facets)
  - HighlightsPage — member Destaques page fed by a single fetchPromotion call, one section per class, 1→2→3 grid
  - SHWC-02 member-visible promotion surface (D-12 role-free, D-13 server-side class hiding)
affects: [06-06, 06-07, gsd-verify-work, phase-06-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Payload-verbatim rendering of a closed-list RPC contract (no client rank math, no field invention)"
    - "Non-null tier assertions pinned to the RPC's OVR-always-present card invariant"
    - "Render-unique doc comments: rules described, locked copy strings never quoted"

key-files:
  created:
    - src/features/highlights/PromotionCard.tsx
  modified:
    - src/features/highlights/HighlightsPage.tsx (placeholder stub replaced with the real page)

key-decisions:
  - "Non-null assertions on tierForOvr/tierForPoints results in PromotionCard — the RPC contract guarantees ovr non-null on every card and points non-null on every highlight; the dashboard's nullable inputs don't apply to this closed payload"

patterns-established:
  - "PromotionCard consumes ONLY the literal TIER_* maps (zero interpolated tier classes outside presentation.ts)"
  - "HighlightsPage renders sections/cards in SERVER order — no client sort anywhere (RNK-02/D-13 discipline)"

requirements-completed: [SHWC-02]

# Metrics
duration: 9min
completed: 2026-10-12
---

# Phase 06 Plan 05: Promotion Page (Destaques) Summary

**Member Destaques page live: per-class top-5 EAFC cards (tier-colored OVR hero, function badge, 6 server-ordered tier-styled facets) fed by one fetchPromotion call, with zero key-stat identity and insufficient-data classes silently absent.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-12T21:06:26-03:00
- **Completed:** 2026-10-12T21:15-03:00 (approx.)
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- PromotionCard: the EAFC payoff card — `article` with the locked `aria-label` pattern, OvrHero composition (border-2 + text-5xl tier-colored OVR via tierForOvr), FUNCTION_LABELS badge, divider, and 6 highlight facets in a `grid-cols-1 sm:grid-cols-2` grid, each with a tierForPoints points chip carrying the locked `{n} pontos em {label}` aria-label
- HighlightsPage: replaces the 06-04 placeholder — one `useEffect` fetchPromotion with cancelled guard + enumeration-safe ApiError mapping (CharactersPage pattern verbatim), server-ordered per-class sections with the 04-03 grid precedent, locked empty-state copy, `role="alert" aria-live="polite"` error block, NO role gate (D-12 — enforcement is the member-gated get_promotion RPC)
- Security posture held: payload rendered verbatim from the closed PromotionHighlight contract (T-06-05/T-06-06/T-06-13 mitigations), no rank math in TS, tier styling only via the literal TIER_* maps

## Task Commits

1. **task 1: Build PromotionCard (EAFC card)** - `c435d6f` (feat)
2. **task 2: Build HighlightsPage (Destaques page)** - `6811cc0` (feat)

## Files Created/Modified
- `src/features/highlights/PromotionCard.tsx` - EAFC celebration card (pure presentational, prop-driven)
- `src/features/highlights/HighlightsPage.tsx` - member promotion page (placeholder stub body replaced)

## Decisions Made
- Non-null assertions on tier function results in PromotionCard: tierForOvr/tierForPoints are typed `Tier | null` for the dashboard's nullable inputs, but this plan's payload contract guarantees `ovr` non-null on every card and `points` non-null on every highlight — assertions pin that invariant instead of adding unreachable fallback branches (tsc gate).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial tsc run flagged the `Tier | null` index-type errors above; resolved within task 1 with the documented non-null assertions (not a plan deviation — the plan's code sketch assumed the non-null contract directly).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four Phase 6 UI surfaces are now built (Validações 06-04, Destaques 06-05; Personagens + HistoryList per 06-06 if planned) — the promotion page consumes the live 0011 get_promotion RPC proven by the 06-02 smoke matrices
- RNK-02 closure is now demonstrable end-to-end: server leak-proof (06-02) + UI renders the closed contract with zero key-stat identity (this plan)
- Remaining plan position: Plan 5 of 7 in Phase 06

---
*Phase: 06-trust-celebration-officer-tools-promotion-page*
*Completed: 2026-10-12*

## Self-Check: PASSED

- Files exist: PromotionCard.tsx, HighlightsPage.tsx, 06-05-SUMMARY.md — all FOUND
- Commits exist: c435d6f (task 1), 6811cc0 (task 2) — both FOUND in git log
