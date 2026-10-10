---
phase: 03-rank-engine
plan: 04
subsystem: ui
tags: [react-19, tailwind-v4, admin-ui, key-stats, top5-preview, pt-BR, rls-gated, rpc-wrappers]

# Dependency graph
requires:
  - phase: 03-rank-engine (03-03)
    provides: live RPCs set_key_stat / class_top5, staff_select_key_stats RLS read path, 0009 migration
  - phase: 02-guild-ops (02-02)
    provides: App tab shell pattern with content-level role re-check (App-stays-mounted lesson), CharactersPage staff-page skeleton
provides:
  - Staff-only 'Stats-Chave' admin page (class selector, grouped 57-stat chip picker with n/6 counter, top-5-by-OVR preview)
  - api.ts client wrappers fetchKeyStats / setKeyStat / fetchClassTop5 for the three 03-03 endpoints
  - RNK-01 human-verifiable admin path (owner UAT approved) and RNK-02 UI-side closure
affects: [04-dashboards, 05-ocr-capture, 06-promotion, owner-only-class-management todo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Refresh-after-save for RPC-backed toggles (setKeyStat returns count → re-fetch key stats + top-5)"
    - "Grouped chip picker mirroring the wizard's catalog grouping (D-04: Geral/Quasi/Especial fixed order)"
    - "Client block-at-6 + server key_stat_limit backstop, error mapped to enumeration-safe pt-BR copy"

key-files:
  created:
    - src/features/admin/KeyStatsPage.tsx
  modified:
    - src/lib/api.ts
    - src/lib/api.test.ts
    - src/App.tsx

key-decisions:
  - "KeyStatsPage group headings use the wizard's real labels (Geral/Quasi/Especial) — plan's parenthetical labels contradicted its own binding instruction to match the wizard; wizard consistency wins (D-04)"
  - "Owner UAT APPROVED all 5 browser steps for the Stats-Chave page (RNK-01 end-to-end TRUE)"
  - "Stray class 'Ahrya' (accidentally created by the owner while exploring the Personagens tab) deleted from the live DB via direct SQL through the Management API database/query endpoint — data hygiene, not a feature; no UI delete path added"
  - "Owner directive recorded as future work: adding classes must be owner-only (officer must not add classes — structural change); tracked in .planning/todos/pending/owner-only-class-management.md"

patterns-established:
  - "RPC wrapper style in api.ts: comment per function naming the enforcing server-side mechanism, exact p_* param names, encodeURIComponent on interpolated query values"

requirements-completed: [RNK-01, RNK-02]

# Metrics
duration: 1h20min wall — active execution ~25min (remainder was the owner UAT checkpoint wait)
completed: 2026-10-10
---

# Phase 3 Plan 04: Key-Stat Admin Page Summary

**Staff-only key-stat configuration page (class selector → grouped 57-stat chips with n/6 counter → instant top-5-by-OVR preview) plus the api.ts RPC wrappers — owner-browser-approved, with live-DB cleanup of an accidentally created class**

## Performance

- **Duration:** 1h20min wall — active execution ~25min; remainder was the owner UAT checkpoint wait (02-03 precedent)
- **Started:** 2026-10-10T05:54:00Z
- **Completed:** 2026-10-10T07:18:00Z
- **Tasks:** 3 (2 auto + 1 owner checkpoint, approved)
- **Files modified:** 4

## Accomplishments
- `fetchKeyStats`, `setKeyStat`, `fetchClassTop5` client wrappers (TDD: 8 new tests, exact `p_class`/`p_stat_key`/`p_enabled` bodies, ApiError propagation incl. `key_stat_limit`)
- `Stats-Chave` staff tab with content-level `isStaff` re-check (App-stays-mounted lesson from 02-02) — members never see the tab and cannot render the page
- KeyStatsPage: class selector, catalog grouped Geral/Quasi/Especial (D-04 mirrors the wizard), toggle chips with n/6 counter, client block-at-6 (`disabled` + `cursor-not-allowed`) with the server `key_stat_limit` backstop, and a `Top 5 por OVR` preview refreshed after every toggle (D-05)
- Owner walked all 5 checkpoint steps in a real browser against the live project and **approved**
- Live-DB hygiene: non-existent class "Ahrya" (created accidentally by the owner via the Personagens tab) deleted and verified gone; zero orphaned `class_key_stats` rows (03-03 smoke left no residue)

## task Commits

Each task was committed atomically:

1. **task 1: api.ts client functions for the three RPC endpoints (TDD)** - `d6936d6` (test, RED) → `81c47f3` (feat, GREEN)
2. **task 2: KeyStatsPage + App 'Stats-Chave' tab** - `0e818c2` (feat)
3. **task 3: Owner browser verification (checkpoint)** - approved by owner; bookkeeping `255e077` (docs)

**Plan metadata:** (this commit — docs)

## Files Created/Modified
- `src/features/admin/KeyStatsPage.tsx` - Staff-only key-stat admin page (305 lines): class selector, grouped chips, n/6 counter, top-5 preview, enumeration-safe pt-BR error states
- `src/lib/api.ts` - Added `fetchKeyStats` (staff REST read), `setKeyStat` (POST /rpc/set_key_stat), `fetchClassTop5` (POST /rpc/class_top5)
- `src/lib/api.test.ts` - +8 tests: paths, body keys, both gateway headers, response parsing, ApiError on error status
- `src/App.tsx` - `type Tab` extended with 'keystats'; staff-only button + `showKeyStats = tab === 'keystats' && isStaff` content re-check

## Decisions Made
- Group headings use the wizard's real labels (`Geral`/`Quasi`/`Especial`) — the plan's parenthetical ("General/Quasi-Stats/Especial") contradicted its own binding instruction to match the wizard's group headings; wizard consistency wins (D-04 mirrors the wizard). Recorded in STATE.md during task 2.
- "Ahrya" cleanup done via direct SQL through the Management API `database/query` endpoint (legacy /v1, per the 01-01 decision) — NOT via new UI code. Inspection first showed 0 members, 0 `class_key_stats` rows referencing it; only the `classes` row existed, so a single-row delete was safe (no FK dependents).
- Owner-only class management recorded as a pending future todo, not implemented here (owner directive: this is structural and belongs to a future phase).

## Deviations from Plan

None - plan executed exactly as written. (The two owner directives at the checkpoint — Ahrya cleanup and the owner-only-class insight — are post-checkpoint bookkeeping, not deviations from planned work; both are documented under Issues/Decisions.)

## Issues Encountered
- **Owner accidentally created a non-existent class "Ahrya"** while exploring the Personagens tab during UAT (officers can insert into `classes` via the 0005 `staff_insert_classes` policy). Resolved as data hygiene: inspected references (none), deleted the row, verified with a follow-up query (0 rows; catalog back to the 15 legitimate classes). Also probed `class_key_stats` for orphaned rows: none (03-03 smoke cleanup confirmed twice).
- **Owner directive (future work):** the Personagens tab must not allow officers to add new classes — owner handle only, since adding a class is a structural change. Recorded as a pending todo (`.planning/todos/pending/owner-only-class-management.md`) and as a STATE.md decision attributed to the 03-04 owner UAT. NOT implemented in this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RNK-01..RNK-05 all complete: rank formula (03-01), enforcement hardening (03-02), server engine (03-03), human-verifiable admin path (03-04)
- Key-stat config is now tweakable per class by staff with instant top-5 feedback — Phase 4 dashboards render pure RPC presentations on top
- Pending future todo: owner-only class management (server-side policy change + UI gating) — planner should place it in a later phase
- Standing pre-launch actions remain: rotate the Supabase deploy token, rotate placeholder whitelist PINs, replace example-shot SVGs

## Self-Check: PASSED

All 4 plan files + SUMMARY + pending todo exist on disk; all 4 task/bookkeeping commits (d6936d6, 81c47f3, 0e818c2, 255e077) verified in git log. Live-DB "Ahrya" deletion verified by follow-up query (0 rows).

---
*Phase: 03-rank-engine*
*Completed: 2026-10-10*
