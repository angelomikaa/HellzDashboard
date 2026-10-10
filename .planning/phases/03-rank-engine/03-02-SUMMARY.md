---
phase: 03-rank-engine
plan: 02
subsystem: database
tags: [rls, security, postgres, corrective-migration, edge-function, smoke-matrix, security-definer, supabase]

# Dependency graph
requires:
  - phase: 02-registry-catalog-manual-data-ingestion
    provides: staff policies 0005/0006 live (member_role claim contract), deployed verify-pin, 02-REVIEW CR-01/CR-02 findings
  - phase: 01-foundation-secure-access-data-model
    provides: 0003 SECURITY DEFINER RPC pattern, 0004 active-check invariant for member policies
provides:
  - Staff active-check invariant LIVE (D-14): a deactivated officer/owner loses staff reads/writes immediately — proven by the live deactivated-staff probe
  - Repo-vs-live reconciled (D-15): fixed verify-pin redeployed and proven logging in real sessions (CR-02 closed)
  - SECURITY DEFINER policy primitive `public.is_active_staff_member()` for staff policies (0008)
  - Extended live smoke matrix (scripts/smoke-rls.mjs) with the deactivated-staff probe as a permanent check
affects: [03-rank-engine (03-03 rank RPC smoke depends on the reconciled login path + hardened staff policies), 04-dashboards]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER helper function for same-table RLS policy lookups (is_active_staff_member) — the canonical fix for Postgres 42P17 infinite recursion; mirrors 0003's definer-RPC pattern and AGENTS.md's definer-RPC stance"
    - "Live smoke probe pattern: Management-API deactivation of the smoke officer + guaranteed try/finally reactivation (WR-06) — the D-14 invariant is now continuously re-provable"

key-files:
  created:
    - supabase/migrations/0007_staff_active_check.sql
    - supabase/migrations/0008_staff_active_check_fix.sql
  modified:
    - supabase/functions/verify-pin/index.ts
    - scripts/smoke-rls.mjs

key-decisions:
  - "0007's exists-subquery-on-members policies (copied verbatim from 02-REVIEW CR-01) hit Postgres 42P17 infinite recursion LIVE — fixed by 0008 with the SECURITY DEFINER helper; migrations stay append-only (0007 untouched in repo/history)"
  - "RNK-02 stays Pending: this plan is D-14/D-15 precondition hardening; RNK-02 completes in 03-03 (server) + 03-04 (UI) — same traceability stance as 03-01 keeping RNK-03/04/05 Pending"
  - "verify-pin redeployed from the fixed repo source and live-proven by every smoke login (D-15 closed); deploy used an owner-supplied session-token (never on disk) — owner should rotate it (standing action)"

patterns-established:
  - "Policy-time caller lookups on the SAME table the policy guards MUST go through a SECURITY DEFINER function — never an inline exists-subquery (42P17)"
  - "Every live staff-policy change ships with a probe in scripts/smoke-rls.mjs that proves the invariant against LIVE, with try/finally state restoration"

requirements-completed: []  # RNK-02 intentionally NOT marked — completes in 03-03/03-04 (see key-decisions)

# Metrics
duration: 55min
completed: 2026-10-10
---

# Phase 03 Plan 02: Hardening-debt clear (0007 + verify-pin + live reconciliation) Summary

**Staff RLS active-check migration (0007+0008 recursion fix via SECURITY DEFINER helper) deployed live, verify-pin line-58 fix redeployed and proven logging in, and the extended 15-check smoke matrix — including the deactivated-staff probe — passes against LIVE.**

## Performance

- **Duration:** 55min wall (≈25min active execution; remainder was the deliberate auth-gate wait for the owner-supplied deploy token — 02-03 checkpoint-wait precedent)
- **Started:** 2026-10-10T03:19:30Z
- **Completed:** 2026-10-10T04:14:19Z
- **Tasks:** 2
- **Files modified:** 4 (2 created migrations, verify-pin fix, smoke matrix)

## Accomplishments

- **D-14 delivered live:** migration 0007 + corrective 0008 extend the 0004 deactivate-revokes-tokens invariant to all three staff policies — the live probe proves a deactivated officer with a valid 7-day JWT gets 0 member rows and a denied class insert
- **D-15 delivered live:** the fixed verify-pin source (line 58 `body.discord_handle`) is deployed and every smoke login runs against it — repo == live, CR-02 closed, the "next deploy bricks all logins" landmine is gone
- **Live reconciliation complete:** 0007 pushed (dry-run confirmed it was the only pending migration), then 0008 after the recursion discovery; `RLS SMOKE PASSED` with all 15 checks including the new deactivated-staff probe and guaranteed reactivation cleanup
- **Phase 1 review residue cleared:** the standing STATE blocker "redeploy verify-pin — BLOCKED by line 58" is resolved (redeployed + logins proven)

## task Commits

Each task was committed atomically:

1. **task 1: Migration 0007 (staff active checks) + verify-pin line-58 fix** - `159ff2c` (fix)
2. **task 2 Step A: deactivated-staff probe added to live smoke matrix** - `2fa227d` (feat)
3. **task 2 Step A bookkeeping (auth-gate checkpoint)** - `8a68ed8` (docs)
4. **task 2 Step B: 0008 recursion fix (Rule 1 deviation)** - `af0010f` (fix)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `supabase/migrations/0007_staff_active_check.sql` - staff policies gain the caller-active check (verbatim from 02-REVIEW CR-01; superseded live by 0008, kept for history)
- `supabase/migrations/0008_staff_active_check_fix.sql` - SECURITY DEFINER `is_active_staff_member()` helper + the same three policies rebuilt on it — fixes the 42P17 recursion 0007 introduced
- `supabase/functions/verify-pin/index.ts` - line 58 `discordHandle` → `body.discord_handle` (CR-02), redeployed live
- `scripts/smoke-rls.mjs` - check 13 deactivated-staff probe (mgmt deactivation → staff read/write denial assertions → try/finally reactivation) + cleanup of ZZSmokeDeactivated

## Decisions Made

- **0008 over editing 0007:** 0007 was already recorded in live migration history when the recursion surfaced, and migrations are append-only — editing it would recreate exactly the repo-vs-live drift this plan exists to eliminate. 0008 drops/recreates the same three policy names against a SECURITY DEFINER helper.
- **Helper does the full staff check** (member_id match + active + member_role in officer/owner), `stable`, `security definer`, `set search_path = ''` with fully-qualified names, execute revoked from public/anon — mirrors the 0003 `record_pin_failure` pattern and Supabase's canonical 42P17 guidance.
- **RNK-02 not marked complete** — traceability requires it to complete in 03-03 (server-side leak probes) + 03-04 (UI side), per 03-03's own success criteria.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 0007 policies caused live HTTP 500s via Postgres 42P17 infinite recursion**
- **Found during:** task 2 Step B (first live smoke run after pushing 0007)
- **Issue:** 02-REVIEW CR-01's proposed SQL — copied verbatim into 0007 per the plan — put `exists (select 1 from members ...)` inside policies ON members. Any members query re-evaluates members RLS to run the subquery, including the policy itself → `infinite recursion detected in policy for relation "members"`. Live symptoms: HTTP 500 on member self-read, officer reads, staff class insert, and `create_submission` (its submissions-policy subquery on members triggered the same recursion). 6 of 15 smoke checks failed.
- **Fix:** corrective migration `0008_staff_active_check_fix.sql` — new `public.is_active_staff_member()` SECURITY DEFINER function (runs as owner, bypasses RLS, no recursion) and the same three policies (`staff_select_all_members`, `staff_update_characters`, `staff_insert_classes`) recreated against it. Invariant unchanged: the caller's live `active` flag is still checked on every staff policy evaluation.
- **Files modified:** `supabase/migrations/0008_staff_active_check_fix.sql` (created)
- **Verification:** dry-run confirmed only 0008 pending → pushed → full matrix re-run: `RLS SMOKE PASSED`, 15/15 checks including the deactivated-staff probe (deactivated officer → 0 rows / denied insert); `npx tsc -b` exit 0
- **Committed in:** `af0010f`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The must-have truths are delivered exactly as specified — D-14's invariant holds (the probe proves it), only the SQL mechanism changed (definer helper instead of inline subquery). The review's CR-01 "Fix" block itself was defective; the plan's instruction to copy it verbatim propagated the bug. Follow-up noted for 03-02-REVIEW/next code review: review-proposed SQL needs a live-recursion gate.

## Issues Encountered

- The deploy required an owner-supplied Supabase access token passed as a session env var (auth-gate checkpoint after task 2 Step A). It was used only in-process, never written to any file, never committed, never echoed — **the owner should rotate the token now that the deploy is done (standing action, per 01-USER-SETUP)**.
- First live smoke run failed (6/15) — diagnosed as the 42P17 recursion above, fixed via 0008, matrix re-run green. No other issues.

## User Setup Required

None new. Standing owner actions unchanged: rotate the Supabase deploy token used for this session; rotate placeholder whitelist rows/PINs before inviting real members (WR-06); replace public/examples/*.svg placeholder shots pre-launch.

## Next Phase Readiness

- D-15 satisfied: 03-03's rank RPC smoke can now rely on a reconciled login path (repo == live) and on staff policies with the active-check invariant in place.
- The smoke helper pattern (`login`/`rest`/`mgmtQuery`/`check`) is proven against the redeployed function; 03-03's `smoke-rank.mjs` can reuse it.
- RNK-02 remains Pending by design (completes 03-03 server-side + 03-04 UI-side).
- No open blockers for 03-03.

---
*Phase: 03-rank-engine*
*Completed: 2026-10-10*

## Self-Check: PASSED

- All 4 task files + this SUMMARY exist on disk
- Commits verified in history: 159ff2c, 2fa227d, 8a68ed8, af0010f
- Live proof: `RLS SMOKE PASSED` (15/15 checks) run 2026-10-10T04:0xZ against project thdxyxsjafimxgxpmpqs
- Token-leak scan of working tree and all diffs: clean (no deploy-token value in any file or commit)
