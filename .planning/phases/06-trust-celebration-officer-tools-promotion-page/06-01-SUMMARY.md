---
phase: 06-trust-celebration-officer-tools-promotion-page
plan: 01
subsystem: database
tags: [supabase, postgres, rls, security-definer, rpc, rank-engine, promotion, officer-tools]

# Dependency graph
requires:
  - phase: 05-ocr-auto-read-layer (05-02)
    provides: migration 0010 discard lifecycle + my_report/class_top5 v2 bodies (full-copied for v3), lifecycle smoke precedent, live-push protocol
  - phase: 03-rank-engine
    provides: 0009 rank engine (staff gate verbatim, EXECUTE hygiene, set_key_stat, OVR lateral), 0008 is_active_staff_member definer-helper pattern
provides:
  - officer_queue() — staff-only jsonb read of ALL 57 values on every pending submission (newest-first)
  - set_submission_status() — officer validate/reject transitions, UPDATE scoped to status='pending', not_pending on 0 rows
  - set_member_role() — owner-only role grant/revoke, target restricted to member/officer rows (D-08)
  - set_member_active() — role-differentiated deactivation/reactivation (officers→member rows, owner→member+officer, owner rows untouchable, self-deactivation blocked)
  - get_promotion() — member-invocable top-5-by-OVR cards with top-6-by-points highlights, serialized fields closed-list (RNK-02)
  - my_report v3 + class_top5 v3 — active-members-only cohorts (D-07 supersession of D-06)
  - owner-only staff_insert_classes policy (folded todo D-09)
affects: [06-02 frontend officer tools, 06-03+ promotion page UI, phase verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Imperative TARGET rules in SECURITY DEFINER RPCs where RLS permissive policies cannot express them (set_member_active role-differentiated matrix)"
    - "Zero-row-update raise pattern for race safety (get diagnostics row_count → not_pending)"
    - "Active-member cohort filter: `and m.active` in cohort/class_members CTEs only, never in latest"

key-files:
  created:
    - supabase/migrations/0011_officer_tools_promotion.sql
  modified: []

key-decisions:
  - "0011 is an append-only corrective (0008/0010 precedent): 0009 my_report/class_top5 superseded via create or replace with EXACTLY one change each (`and m.active` in the cohort/class_members CTE) — all prior migration files byte-untouched"
  - "D-06 supersession recorded in the migration header: 06-CONTEXT D-07 amends 03-CONTEXT D-06 — active members only in EVERY cohort (my_report cohort CTE, class_top5 class_members CTE, get_promotion); do not 'fix' back"
  - "Officer self-validation of their own pending submission ALLOWED (locked research open question: small guild, recoverable by resubmission)"
  - "set_member_role grants no path to 'owner' — role change effective at next login (D-10: verify-pin mints member_role at login); deactivation is the immediate kill-switch via 0004/0008 active checks"

patterns-established:
  - "Rank-regression proof on cohort supersession: 27/27 exact-value smoke re-run after any rank-RPC supersession (05-02 precedent re-applied to 0011)"
  - "Expected-red transients are documented, not fixed in-plan: smoke-rls check 7 (officer class insert) flips red with 0011's owner-only policy and goes green in 06-02"

requirements-completed: [AUTH-03, AUTH-04, AUTH-05, SHWC-02]

# Metrics
duration: 15min
completed: 2026-10-12
---

# Phase 6 Plan 01: Officer Tools + Promotion RPCs Summary

**Migration 0011 pushed live — every Phase 6 server enforcement surface (officer queue read, validate/reject transitions, owner-only role RPC, role-differentiated removal RPC, member-boundary promotion RPC, active-member cohorts, owner-only class creation) with rank behavior provably unchanged (27/27 exact-value smoke).**

## Performance

- **Duration:** 15min (continuation session: live push + smokes + docs; task 1 was the prior session's ~work, commit a0419d2)
- **Started:** 2026-10-12T19:20:00-03:00 (continuation session start)
- **Completed:** 2026-10-12T19:44:00-03:00
- **Tasks:** 2/2
- **Files modified:** 1 created (0011) + planning docs

## Accomplishments

- All 7 function definitions live in one append-only migration: officer_queue, set_submission_status, set_member_role, set_member_active, get_promotion, my_report v3, class_top5 v3 — plus the recreated owner-only staff_insert_classes policy
- Staff gate verbatim (0009:62–68) inside every staff RPC; member gate (0010:135–141 shape) inside get_promotion; EXECUTE hygiene revoked from public/anon, granted to authenticated, on all 5 new functions
- RNK-02 closed-list serialization in get_promotion (stat_key/label/value_type/value/points only; comment contract verbatim; zero is_key/contributes_to_ovr identifiers in the file)
- D-07 cohort supersession live and proven behavior-neutral: `supabase db push --dry-run` listed 0011 as the only pending migration, real push finished cleanly, RANK SMOKE PASSED 27/27 (full exact-value matrix incl. 74.25/49.5/99/0 ties, OVR 61/77/87, D-02/D-11/D-13 semantics, RNK-02 leak-probes)
- RLS smoke re-run: 18/19 green with ONLY check 7 (officer POST /classes) red — the documented expected transient that flips green with 06-02's owner-gated UI (plan step 6: do not halt)

## Task Commits

Each task was committed atomically:

1. **task 1: Write migration 0011_officer_tools_promotion.sql** - `a0419d2` (feat) — all 9 acceptance gates verified in the prior session
2. **task 2: [BLOCKING] Live push of 0011 + rank regression smoke** - (no code commit; push-only task, migration file unmodified as required) — dry-run → push → 27/27 rank smoke; blocking checkpoint resolved by the owner supplying SUPABASE_ACCESS_TOKEN as a session env var

**Plan metadata:** *(this commit)* (docs: complete plan)

## Files Created/Modified

- `supabase/migrations/0011_officer_tools_promotion.sql` (new, 703 lines, pushed live) — all Phase 6 server surfaces: is_active_owner() helper, officer_queue(), set_submission_status(), set_member_role(), set_member_active(), get_promotion(), my_report v3, class_top5 v3, owner-only staff_insert_classes policy, EXECUTE hygiene + comment contracts
- `.planning/STATE.md` — position/decisions updated (docs commit)

## Live Deploy Evidence

- `supabase db push --dry-run`: `{"upToDate":false,"dryRun":true,"migrations":["0011_officer_tools_promotion.sql"],...}` — 0011 the ONLY pending migration
- `supabase db push`: "Applying migration 0011_officer_tools_promotion.sql... Finished" — no SQL errors, no corrective needed
- `node scripts/smoke-rank.mjs`: **RANK SMOKE PASSED** — all 27 exact-value checks green (cohort supersession behavior-neutral for active members), cleanup removed all fixture rows
- `node scripts/smoke-rls.mjs`: 18/19 — sole FAIL is check 7 (officer POST /classes → expected 403 now), the documented transient shipping with 06-02

## Deviations from Plan

None — plan executed exactly as written. (The blocking checkpoint on task 2 was resolved by the owner supplying the access token; per standing action the owner should rotate the deploy token now that the push is done — 03-02/05-02 precedent.)

## Known Stubs

None — every RPC is fully implemented and live; no placeholder/TODO patterns in the migration.

## Verification Chain

- AUTH-03 (owner-only role management), AUTH-04 (role-differentiated removal), AUTH-05 (officer queue + transitions), SHWC-02 (promotion payload) — server enforcement now live; requirement completion marked via traceability in phase verification (REG-02/RNK precedent: UI surfaces in 06-02/06-03 complete the end-to-end walks)

## Self-Check: PASSED

- `supabase/migrations/0011_officer_tools_promotion.sql` exists on disk — FOUND
- `.planning/phases/06-trust-celebration-officer-tools-promotion-page/06-01-SUMMARY.md` exists — FOUND
- Commit `a0419d2` (task 1) present in git log — FOUND
- SUPABASE_ACCESS_TOKEN absent from every tracked/created file (grep: 0 matches) — VERIFIED
