# Phase 10: Personalized Home Landing Tab - Context

**Gathered:** 2026-10-24T00:00:00.000Z
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 10 delivers the Personalized Home Landing Tab ("Início"): after login, members land on a new Início tab showing their own OVR card (reused OvrHero) and a top-3 best-stats strip (value + points + tier badge), sorted client-side from `my_report` stats. A stale-data CTA appears when data is strictly >7 days old (navigating to Enviar Status); members who never submitted see an evergreen first-submission variant; fresh data shows no banner. Destaques stays members-only (public visitor homepage explicitly deferred) but converts from a CSS grid to a premium scroll-snap slider (1-up mobile, 3-up desktop at `lg`, keyboard + swipe reachable, server order preserved).

Scope anchor from ROADMAP.md: requirements HOME-01, HOME-02, SHWC-01. Constraints: no router library — `'inicio'` joins the existing `Tab` union pattern; no date library — epoch-diff arithmetic on the ISO string; no client-side points recomputation (AGENTS.md non-negotiable); CSS scroll-snap only, no autoplay.
</domain>

<decisions>
## Implementation Decisions

### Animations & skeletons (overrides 07.1 D-05 for phase 10 only)
- **D-01:** Soft animations and skeleton loaders are ALLOWED in Phase 10, overruling the 07.1 static-only rule for this phase. Complexity must stay low/smooth.
- **D-02:** The existing `neon-ring` animation (rotating red conic-gradient frame, `prefers-reduced-motion` safe) is the accepted complexity/reference bar for what animation looks like in this project.
- **D-03:** Skeleton states use skeleton loaders instead of the static "Carregando…" pattern, but the existing error/session copy strings (NETWORK_ERROR/SESSION_ERROR pt-BR) are preserved.

### Default tab on login
- **D-04:** Login lands on `'inicio'` per roadmap HOME-01 ("members land on a new Início tab"). `'inicio'` joins the `Tab` union in `src/App.tsx` and gets a nav button.

### Início page layout
- **D-05:** Vertical stack per plan 10-02: `OvrHero` (layout='card') at top, then conditional stale-data CTA banner, then top-3 best-stats strip below. Mirrors `DashboardPage` mount-fetch pattern (useEffect + cancelled flag, `fetchMyReport`, `ApiError` kind mapping).

### Destaques slider
- **D-06:** Per plan 10-03 spec: replace CSS grid with scroll-snap-x slider; 1-up mobile, 3-up desktop at `lg`; server order preserved (no client re-sort); keyboard ArrowLeft/Right + touch swipe navigate one card at a time; members-only access unchanged (enforced by `get_promotion` RPC).

### OpenCode's Discretion
- Exact soft-animation implementation (framer-motion-free, CSS transitions/keyframes only — no new npm dependencies per 07.1 D-05/ROADMAP).
- Skeleton loader visual design within the low-complexity bar.
- Exact stale-data CTA pt-BR copy strings (must be enumeration-safe fixed strings).

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Requirements & roadmap
- `.planning/ROADMAP.md` — Phase 10 goal, HOME-01/HOME-02/SHWC-01, execution order (9 → 9.1 → 10), Destaques slider + deferred public homepage
- `.planning/REQUIREMENTS.md` — HOME-01, HOME-02, SHWC-01 requirement definitions

### Existing code to reuse / integrate
- `src/App.tsx` — `Tab` union type, nav button pattern, `show*` UX-only gating, default tab `'painel'`
- `src/features/dashboard/OvrHero.tsx` — `OvrHero` component with `layout='card' | 'strip'`, `ovrTierFor`, tier banding
- `src/features/dashboard/presentation.ts` — `tierForPoints`, `tierForOvr`, `Tier` type
- `src/features/dashboard/DashboardPage.tsx` — mount-fetch pattern, error copy strings, `useStatStrip`/key-stat strip conventions
- `src/features/dashboard/keyStatStrip.ts` / `src/features/dashboard/KeyStatCard.tsx` / `src/features/dashboard/MiniStatTile.tsx` — existing stat-tile anatomy for the top-3 strip
- `src/features/dashboard/StatCard.tsx` — tier badge rendering precedent
- `src/features/highlights/HighlightsPage.tsx` — current CSS-grid implementation to convert to scroll-snap slider
- `src/features/highlights/PromotionCard.tsx` — `PromotionCard` component rendered inside slider slots
- `src/lib/api.ts` — `MyReport` interface (missing `last_validated_at`), `fetchMyReport`, `PromotionSection`/`PromotionCardRow`, `fetchPromotion`, `ApiError`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OvrHero` (`src/features/dashboard/OvrHero.tsx`): tier-styled OVR hero card with `layout='card'` (standalone) and `layout='strip'` (no border/padding). Reused for the Início own-OVR card.
- `keyStatStrip` / `MiniStatTile` / `KeyStatCard`: existing stat-tile anatomy reusable for the top-3 best-stats strip.
- `tierForPoints`/`tierForOvr` (`presentation.ts`): unit-locked banding functions for tier badges.
- `fetchMyReport` + `fetchPromotion` (`src/lib/api.ts`): existing RPC wrappers; Início consumes `my_report`, Destaques slider consumes `get_promotion`.

### Established Patterns
- Mount-fetch pattern: `useEffect` + cancelled flag, `fetchMyReport(session)`, `ApiError` kind → NETWORK_ERROR/SESSION_ERROR pt-BR copy (DashboardPage, HighlightsPage).
- Tab gating: UX-only in `App.tsx` (`show*` flags), enforcement server-side via member-invocable RPCs (my_report / get_promotion). No role gate on Início — every logged-in member sees it.
- pt-BR enumeration-safe copy: fixed strings, never raw HTTP codes/gateway internals.
- 07.1 D-21 breakpoint system: shell widens for data views (max-w-6xl, xl:max-w-7xl).

### Integration Points
- `App.tsx`: add `'inicio'` to `Tab` union, add Início nav button (visible to all roles), add `showInicio` render branch before `DashboardPage` fallback.
- `src/lib/api.ts`: add `last_validated_at: string | null` to `MyReport` interface (Phase 9 migration 0018 shipped it server-side; TS type missing).
- `src/features/dashboard/InicioPage.tsx` (new): fetch `my_report`, render OvrHero + CTA + top-3 strip.
- `src/features/highlights/HighlightsPage.tsx`: replace `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with scroll-snap slider; add keyboard + swipe handlers.

</code_context>

<specifics>
## Specific Ideas

- rockhall.com reference: bold, premium aesthetic for the Início landing and Destaques slider (user direction).
- Skeleton loaders for loading states (replacing static "Carregando…").
- Soft CSS transitions/keyframes for reveal/entry, referenced against the existing `neon-ring` animation for acceptable complexity.
- Top-3 strip: value (`formatStatValue`), points (raw), tier badge (`tierForPoints`), sorted by points desc from `own_value !== null && points !== null` stats.
- Stale boundary strictly >7 days: exactly 7 days = no banner; null = evergreen first-submission variant.

</specifics>

<deferred>
## Deferred Ideas

- Public visitor homepage — explicitly deferred (owner decision 2026-10-20). Destaques stays members-only; slider conversion is members-only too.
- Animation/skeleton work outside Phase 10 (07.1 D-05 static-only remains in force for all other phases).

</deferred>

---

*Phase: 10-first-access-by-print*
*Context gathered: 2026-10-24*
