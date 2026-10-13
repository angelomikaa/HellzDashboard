---
phase: 04-member-dashboard-improvement-screen
plan: 02
subsystem: ui
tags: [react-19, tailwind-v4, tier-cards, ovr-hero, collapsible-groups, pt-BR, mobile-first]

# Dependency graph
requires:
  - phase: 04-member-dashboard-improvement-screen (plan 01)
    provides: fetchMyReport + MyReport/MyReportStat types, src/lib/groups.ts labels, tested presentation pure functions (tierForPoints/tierForOvr/percentilePhrase/focusCandidates) and the TIER_* literal class maps
provides:
  - StatCard — the one-glance stat card with all three locked variants (Sem registro grayed, Dados insuficientes chip, tier badge) + percentile phrase + Média/Melhor line + stat-<key> focus anchor
  - OvrHero — tier-styled 48px OVR hero with both insufficient variants (no class / cohort < 3)
  - TierLegend — always-visible Bronze · Prata · Ouro · Platina color decoder (D-04)
  - CollapsibleGroup — controlled 44px collapsible section (className-swap collapse, aria-expanded/aria-controls, rotating chevron)
  - FocusStrip — Foco de melhoria self-hiding improvement strip (3 weakest stats, whole item is the jump affordance)
affects: [04-03 (page composition + UAT — consumes all five components verbatim), promotion page (Phase 6)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leaf components are pure functions of props — zero fetch calls, type-only imports from lib/api (T-04-09)"
    - "Tier styling flows exclusively through the literal TIER_* maps; the four legend dot classes are the only literal tier utilities in components (Tailwind v4 JIT)"
    - "Collapse via whole-className swap (open grid vs 'hidden') — never the hidden attribute next to display:grid (checker finding 4260f4b honored in code)"
    - "Locked UI-SPEC copy strings appear exactly once per owning component — comments describe, never quote the literal"

key-files:
  created:
    - src/features/dashboard/StatCard.tsx
    - src/features/dashboard/OvrHero.tsx
    - src/features/dashboard/TierLegend.tsx
    - src/features/dashboard/CollapsibleGroup.tsx
    - src/features/dashboard/FocusStrip.tsx
  modified: []

key-decisions:
  - "Comments were reworded so every UI-SPEC locked copy string greps exactly once per owning component (rendered copy only) — same literal-gate discipline as 04-01's rankMath comment fix"
  - "SHWC-01/CMP-02 stay Pending by traceability (04-01/03-04 precedent): all five components exist and are verified, but nothing is member-visible until 04-03 mounts DashboardPage and the owner UAT approves"
  - "OvrHero tier derives from the ROUNDED displayed OVR (Math.round before tierForOvr) per the KeyStatsPage Math.round precedent"

patterns-established:
  - "Dashboard leaf components render RPC output verbatim — the only math is display rounding (Math.round of a given number) and the tested phrase/banding functions"
  - "Programmatic-focus targets carry tabIndex={-1} + focus:ring-2 accent ring; interactive elements are h-11 with focus-visible accent ring"

requirements-completed: []  # SHWC-01/CMP-02 intentionally NOT marked - components exist but are member-invisible until 04-03 composition + owner UAT (04-01 traceability precedent)

# Metrics
duration: 14min
completed: 2026-10-11
---

# Phase 4 Plan 2: Dashboard Leaf Components Summary

**Five pure presentational components — StatCard (3 locked variants), tier-styled OvrHero (2 insufficient variants), TierLegend, controlled CollapsibleGroup, self-hiding FocusStrip — implemented class-for-class to the approved 04-UI-SPEC, with tier styling only via the literal TIER_* maps and zero key-stat surface.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-11T01:34:41Z
- **Completed:** 2026-10-11T01:48:04Z
- **Tasks:** 2
- **Files modified:** 5 (all created)

## Accomplishments
- StatCard renders everything in one glance (D-08/D-09/D-12) with the locked state matrix: `Sem registro` grayed variant (opacity-60, Média/Melhor still render), `Dados insuficientes` muted chip when the cohort is < 3, and the tier variant (tier border + tier-colored integer points badge + percentile phrase). The wrapper carries `id={"stat-" + stat_key}` + `tabIndex={-1}` + accent focus ring for the 04-03 jump interaction.
- OvrHero shows the rounded OVR in tier color from the D-02 bands, with both insufficient variants carrying no tier color and the exact locked pt-BR explanation lines (no class / cohort needs 3+ players).
- CollapsibleGroup is CONTROLLED (page owns open state so focus-jumps can expand groups), collapses by swapping the whole className (never the `hidden` attribute next to `grid` — the checker's display-override landmine), and mounts the D-06 grid: 1 col → `sm:2` → `lg:3`.
- FocusStrip selects its 3 items via the 04-01 tested `focusCandidates`, colors the points via `tierForPoints`, uses accent gold for the heading (reserved accent use) and hides itself entirely when nothing is eligible.
- All interactive elements are 44px (`h-11`) with the accent `focus-visible` ring; tier names never appear on cards (D-03) — color + legend + numeric badge + phrase are the four redundancies.

## task Commits

Each task was committed atomically:

1. **task 1: StatCard + OvrHero + TierLegend (tier trio)** - `ac1a7ca` (feat)
2. **task 2: CollapsibleGroup + FocusStrip** - `3b2ab21` (feat)
3. **plan-level gate fix: render-unique locked copy in comments** - `b4b16cf` (style)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `src/features/dashboard/StatCard.tsx` — pure stat card: tier/Sem registro/Dados insuficientes variants, phrase, Média/Melhor comparison, focus anchor (66 lines)
- `src/features/dashboard/OvrHero.tsx` — tier-styled OVR hero with insufficient + no-class variants (51 lines)
- `src/features/dashboard/TierLegend.tsx` — one-line always-visible color legend (34 lines)
- `src/features/dashboard/CollapsibleGroup.tsx` — controlled collapsible group: h-11 header, chevron, aria, grid body (62 lines)
- `src/features/dashboard/FocusStrip.tsx` — improvement strip: 3 weakest stats, jump affordance, self-hiding (47 lines)

## Decisions Made
- **Render-unique locked copy (style commit `b4b16cf`):** the plan's verification gate ("every locked copy string present exactly once in the component that owns it") was initially violated by doc comments quoting `Foco de melhoria`, `Dados insuficientes`, and the legend labels. Comments were reworded to describe rather than quote — the 04-01 rankMath-comment precedent applied to UI copy.
- **Requirements traceability:** SHWC-01/CMP-02 stay Pending — the components are built and verified, but a member cannot see anything until 04-03 wires DashboardPage into the Painel tab and the owner UAT approves (AUTH-01/01-01, RNK-01/03-04, CMP-02/04-01 precedent chain).
- **OvrHero rounding order:** tier comes from `Math.round(ovr.value)` before `tierForOvr` — the tier always matches the number actually displayed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Acceptance-gate defect] Doc comments duplicated locked copy strings**
- **Found during:** plan-level verification (after task 2)
- **Issue:** The plan requires every locked UI-SPEC string to appear exactly once in its owning component, but implementation comments quoted `Foco de melhoria` (FocusStrip), `Dados insuficientes` (StatCard), and `Bronze · Prata · Ouro · Platina` (TierLegend), making each grep twice.
- **Fix:** Reworded the three comments to describe the copy without quoting the literal — identical discipline to 04-01's rankMath comment fix.
- **Files modified:** src/features/dashboard/FocusStrip.tsx, src/features/dashboard/StatCard.tsx, src/features/dashboard/TierLegend.tsx
- **Verification:** locked-copy grep now returns exactly one rendered match per string per owner; build/lint/test all green after the edit
- **Committed in:** `b4b16cf` (FocusStrip fix landed uncommitted before the task 2 commit; StatCard/TierLegend in the style commit)

---

**Total deviations:** 1 auto-fixed (1 acceptance-gate defect — plan-internal consistency, no scope creep)
**Impact on plan:** Zero functional impact; the fix is comment-only and makes the plan's own copy-uniqueness gate pass as specified.

## Issues Encountered
- PowerShell 5.1's console codepage mangled the em-dash in inline acceptance checks, producing two false FAILs for OvrHero's locked strings; re-verified with UTF-8-safe grep — both strings present exactly once. Harness artifact only, no code change needed.

## User Setup Required
None - client-side only plan; no external service configuration.

## Known Stubs
None - every component renders entirely from its props (MyReportStat / ovr / stats arrays); no empty values flow to the UI beyond the locked null-variant states, which are intentional per the state matrix.

## Next Phase Readiness
- All five leaf components are ready for 04-03 composition: DashboardPage owns `fetchMyReport` + `openGroups` state and wires `onJump` (expand group → `requestAnimationFrame` → `scrollIntoView` + `focus()` on `#stat-<key>`, anchors already in place via StatCard's `tabIndex={-1}` focus ring)
- OvrHero consumes `session.display_name` + report `char_class`/`char_function`; CollapsibleGroup expects GROUP_ORDER-driven sections with Geral open by default
- No blockers; build/lint/test green (128/128; the 4 lint warnings are pre-existing in untouched files)

## Self-Check: PASSED

- `src/features/dashboard/StatCard.tsx` FOUND
- `src/features/dashboard/OvrHero.tsx` FOUND
- `src/features/dashboard/TierLegend.tsx` FOUND
- `src/features/dashboard/CollapsibleGroup.tsx` FOUND
- `src/features/dashboard/FocusStrip.tsx` FOUND
- Commit `ac1a7ca` FOUND (git log)
- Commit `3b2ab21` FOUND (git log)
- Commit `b4b16cf` FOUND (git log)
- `npm run build` green; `npm run lint` 0 errors (4 pre-existing warnings in untouched files); `npm test` 128/128 green
- Grep gates across src/features/dashboard/*.tsx: `is_key` = 0, `key_stats` = 0, `rankMath` = 0, `tier-${` = 0
- Every locked copy string greps exactly once in its owning component

---
*Phase: 04-member-dashboard-improvement-screen*
*Completed: 2026-10-11*
