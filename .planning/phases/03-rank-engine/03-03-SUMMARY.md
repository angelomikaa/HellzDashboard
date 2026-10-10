---
phase: 03-rank-engine
plan: 03
subsystem: database
tags: [postgres, rpc, security-definer, percentile, ovr, compute-on-read, smoke-matrix, anti-gaming, supabase, rls]

# Dependency graph
requires:
  - phase: 03-rank-engine (03-01)
    provides: rankMath.ts executable formula spec + locked worked-example test vectors (74.25/49.5/0/99, OVR 51+mean×48/99, MIN_COHORT_SIZE=3)
  - phase: 03-rank-engine (03-02)
    provides: reconciled verify-pin login path, staff policies on the SECURITY DEFINER helper (D-14 invariant), migrations 0001-0008 live
provides:
  - "LIVE rank engine (migration 0009): set_key_stat (staff-only toggle, advisory-lock block-at-7), my_report (member contract: 57 stats with own/avg/best/points + OVR), class_top5 (staff-only OVR preview, Phase 6 promotion reuse)"
  - "First-ever read path on class_key_stats: staff_select_key_stats policy — members still denied (RNK-02 preserved)"
  - "Exact-value live proof: percentile points 74.25/49.5/99/0, OVR 61/77/87, MIN_COHORT_SIZE=3 insufficiency semantics, D-02 incomplete-config OVR, compute-on-read toggle instantaneity"
  - "scripts/smoke-rank.mjs — re-runnable live rank matrix (27 checks, finally-style cleanup, no-residue second-run proof)"
affects: [03-rank-engine (03-04 consumes the three RPCs), 04-dashboards (my_report is the render contract), phase-6-promotion (class_top5 reuse)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER RPC with internal member_role + live-active gate as the only gate (D-14) — PostgREST exposes to authenticated, membership enforced inside"
    - "Race-proof constraint via pg_advisory_xact_lock(hashtext(key)) before count-check (CR-01 atomicity lesson applied to block-at-7)"
    - "Latest-value-per-(member,stat) via select distinct on ... order by submitted_at desc over status <> 'rejected' submissions (D-06/D-07)"
    - "Ties-including-self count with (ties-1)::numeric/2 to match the others-based 03-01 formula exactly"
    - "Cross-table staff policy exists-subquery is recursion-safe when the TARGET table's own policies never subquery themselves (0008 helper) — 42P17 lesson"

key-files:
  created:
    - supabase/migrations/0009_rank_engine.sql
    - scripts/smoke-rank.mjs
  modified: []

key-decisions:
  - "Migration numbered 0009 (plan said 0008): 0008 was taken by 03-02's 42P17 recursion fix — CLI rejects duplicate versions (orchestrator pre-authorized, 0005 precedent)"
  - "Rule 1 fixture fix: the plan's sp fixture {a:50,b:50,c:80} (tie at BOTTOM) contradicted its own expected values — 74.25 is the locked tie-at-TOP value, and the plan's OVR cross-checks (a=61 via [0,74.25,0,49.5,0,0], b=77 via mean 53.625) require a/b to tie at TOP; sp is {a:80,b:80,c:50} and c's OVR is 87 (mean 74.25 → 51+36), not 95. Joint realizability of {74.25, 74.25, 99} on one 3-player stat is mathematically impossible — the locked 03-01 spec vectors were preserved over the plan's inconsistent expected numbers"
  - "class_top5 lists every class member (rank math ignores active-ness per D-06: status-only cohort definition, one definition forever); Phase 6 may filter the displayed list"
  - "Per-stat points serialize rounded to 2 decimals; OVR computes from unrounded points (03-01 spec semantics — fixtures are decimal-exact either way)"
  - "Cleanup extended with pin_login_attempts rows: verify-pin upserts a reset row even on SUCCESS-path logins, so fixture logins leave residue without it (found during task 2 review)"
  - "RNK-01/RNK-02 stay Pending by traceability (REG-02 precedent): server-side enforcement is live-proven here, but RNK-01 completes when 03-04's admin toggle UI ships and RNK-02 when the UI-side leak-proof passes; RNK-03/04/05 complete now (live-proven exact-value matrix)"

patterns-established:
  - "Exact-value live smoke: fixtures chosen to reproduce the locked unit-test vectors to the decimal, so SQL and TS spec can never drift silently"
  - "Second-consecutive-run requirement: cleanup must leave zero residue (pre-clean + finally) — cleanup correctness is itself an acceptance criterion"

requirements-completed: [RNK-03, RNK-04, RNK-05]  # RNK-01/RNK-02 complete in 03-04 (UI side) — see key-decisions

# Metrics
duration: 37min
completed: 2026-10-10
---

# Phase 03 Plan 03: Rank Engine Summary

**Live-deployed rank engine (0009): staff-only set_key_stat with race-proof block-at-7, member-facing my_report computing rank-based percentile points (74.25/49.5/99/0 exact) and floor-51 OVR (61/77/87 exact), and staff-only class_top5 preview — proven by a 27-check exact-value live smoke matrix with member/anon leak probes.**

## Performance

- **Duration:** 37 min
- **Started:** 2026-10-10T02:10:00Z
- **Completed:** 2026-10-10T02:47:34Z
- **Tasks:** 3 of 3
- **Files modified:** 2 (2 created)

## Accomplishments
- **Migration 0009 live** (first `db push` attempt, zero SQL errors): three SECURITY DEFINER RPCs — `set_key_stat(text,text,boolean)` (staff gate + advisory-lock block-at-7 + class count return), `my_report()` (57-stat member contract), `class_top5(text)` (staff-only preview) — plus the `staff_select_key_stats` policy (first read path on class_key_stats; members still denied) and EXECUTE hygiene (revoked from public/anon on all three)
- **RANK SMOKE PASSED — 27/27 checks, first live run, AND a second consecutive run** (cleanup leaves zero residue): every formula assertion matched to the decimal — 74.25 (tie at top), 49.5 (middle + all-tied), 99/0 (best/worst), OVR 61/77/87; block-at-7 (`key_stat_limit`), member `forbidden` on set_key_stat + class_top5, member sees 0 class_key_stats rows, anon my_report denied (401)
- **RNK-02 provably holds at the server**: raw my_report payload contains no `key_stat`/`is_key` marker; per-stat objects carry exactly the 9 documented fields; key stats influence OVR internally only
- **D-13/D-02/D-11 live-verified**: hit stat (n=2) returns own 20 / avg 15 / best 20 with points null + data_sufficient false; disabling mdef (count 5) instantly nulls OVR while per-stat points stay; re-enabling (count 6) instantly restores OVR 61 — compute-on-read with no backfill
- **RLS SMOKE PASSED (regression)** — 19/19 checks green after 0009 touched class_key_stats privileges; local suite green (vitest 93/93, tsc -b, vite build)

## task Commits

Each task was committed atomically:

1. **task 1: Migration 0009 — set_key_stat, my_report, class_top5, staff policy, grants** - `060e348` (feat)
2. **task 2: scripts/smoke-rank.mjs — exact-value rank smoke matrix** - `75263c2` (test)
3. **task 3 [BLOCKING]: Deploy 0009 live + run RANK SMOKE** - no commit (pure deploy + verification; no files changed; both task-1/2 artifacts proven live)

**Plan metadata:** (final docs commit follows this summary)

## Files Created/Modified
- `supabase/migrations/0009_rank_engine.sql` - the rank engine: staff policy on class_key_stats, submissions(member_id, submitted_at desc) index, set_key_stat/my_report/class_top5 SECURITY DEFINER RPCs, EXECUTE hygiene
- `scripts/smoke-rank.mjs` - live rank smoke matrix (27 checks): throwaway ZZRankSquad class + 3 members, real verify-pin logins + create_submission submissions, key-stat config via the RPC under test, exact-value percentile/OVR assertions, leak probes, block-at-7, insufficiency, finally-style cleanup + pre-clean

## Decisions Made
- **0009 over the plan's 0008** — 0008_staff_active_check_fix.sql (03-02) took the number; migrations are append-only and the CLI rejects duplicate versions (0005 precedent)
- **Fixture contradiction resolved in favor of the locked spec** — see Deviation 2 below; the smoke matrix now reproduces the rankMath.test.ts vectors exactly: a's OVR-61 vector is literally the locked `[0, 74.25, 0, 49.5, 0, 0]`
- **class_top5 semantics = my_report semantics per member** (function-partitioned cohort within the class, exactly-6 key stats, n≥3) so officer preview and member report can never disagree; members with insufficient data get `ovr: null`, sorted last
- **OVR from unrounded points; per-stat display points rounded to 2 decimals** — matches the 03-01 spec (OVR output unrounded for Phase 4 display)

## Deviations from Plan

### Auto-fixed Issues

**1. [Planning defect, directed] Migration created as 0009_rank_engine.sql**
- **Found during:** task 1 (pre-flight)
- **Issue:** Plan drafted `0008_rank_engine.sql`, but 0008 is taken by 03-02's recursion fix; the CLI rejects duplicate version numbers
- **Fix:** Created as `supabase/migrations/0009_rank_engine.sql` (same content); orchestrator pre-authorized this deviation
- **Files modified:** supabase/migrations/0009_rank_engine.sql
- **Verification:** `db push --dry-run` showed exactly 0009 pending; push applied cleanly
- **Committed in:** 060e348

**2. [Rule 1 - Bug] Plan's sp fixture and expected values were internally contradictory**
- **Found during:** task 2 (fixture design, before writing assertions)
- **Issue:** With sp = {a:50, b:50, c:80} the tie is at the BOTTOM: countBelow=0, so a/b get (0+0.5)/2×99 = **24.75**, not 74.25. But the plan's OVR cross-checks require sp=74.25 for both a (OVR 61 = locked vector [0,74.25,0,49.5,0,0] → 51+10) and b (OVR 77 = mean 53.625 → 51+26), while c's claimed OVR 95 requires c's sp to be a strict max (99). No 3-player arrangement satisfies {a:74.25, b:74.25, c:99} on one stat: a/b tie-at-top forces c to 0 (joint realizability impossible). 74.25 is the locked tie-at-TOP value (`percentilePoints(10, [10, 5])`).
- **Fix:** sp fixture is {a:80, b:80, c:50} (a/b tie at TOP → 74.25 each, reproducing the locked value; c → 0). Expected values updated: b's sp block asserts own 80 / avg 70 / best 80 / points 74.25; c asserts sp points 0 and **OVR 87** (mean 74.25 → 51+36) instead of 95. All other plan values (49.5×3, 99, 0, OVR 61, OVR 77, all D-13/D-02 assertions, top-5 ordering c > b > a) preserved unchanged.
- **Files modified:** scripts/smoke-rank.mjs (fixture + assertion block)
- **Verification:** LIVE — `RANK SMOKE PASSED` with exact values 74.25 / 49.5 / 49.5 / 99 / 0 and OVR 61 / 77 / 87; a's live point vector equals the locked test vector exactly
- **Committed in:** 75263c2

**3. [Rule 2 - Missing correctness] Cleanup must also remove pin_login_attempts rows**
- **Found during:** task 2 (cleanup design)
- **Issue:** verify-pin upserts a reset row into pin_login_attempts on the SUCCESS path too, so the 3 fixture logins leave residue rows the plan's cleanup list doesn't cover
- **Fix:** cleanup() additionally deletes pin_login_attempts for the three zz handles (runs in both pre-clean and finally)
- **Files modified:** scripts/smoke-rank.mjs
- **Verification:** second consecutive smoke run passed (no unique/PK collisions) and post-run mgmt check shows no zz-rank residue
- **Committed in:** 75263c2

---

**Total deviations:** 3 (1 planning defect directed by orchestrator, 1 Rule 1 plan-math bug, 1 Rule 2 cleanup gap)
**Impact on plan:** The deviation-2 fix is the significant one — the plan's expected numbers were mutually unsatisfiable, and executing them verbatim would have produced a permanently failing (or worse, silently weakened) smoke matrix. All must-have truths still delivered; the locked 03-01 spec is now the provable single source of truth end-to-end.

## TDD Gate Compliance

Not a `type: tdd` plan. Task 1's SQL review gates (the grep matrix) all passed pre-deploy; task 3's live matrix supersedes as the execution proof.

## Issues Encountered
None — the deploy (dry-run → push) and both smoke runs passed on the first attempt. The only surprise (pin_login_attempts residue) was caught by review before it could bite (deviation 3).

## Authentication Gates
None raised. The owner-supplied SUPABASE_ACCESS_TOKEN arrived with the session (per orchestrator) and was used ONLY as an inline per-command process env var — never written to any file, never committed, never echoed. Post-run `git grep` scan of the working tree: clean. **Standing owner action remains: rotate the deploy token now the deploy is done.**

## User Setup Required
None new. Standing owner actions unchanged: rotate the Supabase deploy token; rotate placeholder whitelist rows/PINs before inviting real members (WR-06); replace public/examples/*.svg placeholder shots pre-launch.

## Threat Model Compliance (T-03-08…T-03-15)

| Threat | Disposition | Live evidence |
|--------|-------------|---------------|
| T-03-08 set_key_stat elevation | mitigate | member call → `forbidden` (assertion 2) |
| T-03-09 key-stat disclosure | mitigate | member 0 rows on /class_key_stats; zero key_stat/is_key markers in raw my_report (assertions 3, 11) |
| T-03-10 aggregate leak | accept | documented in `comment on function my_report()` (Pitfall 4 tradeoff) |
| T-03-11 spoofing | mitigate | identity from JWT member_id only; anon → 401 (assertion 7) |
| T-03-12 toggle race | mitigate | pg_advisory_xact_lock before count check (CR-01 lesson) |
| T-03-13 input tampering | mitigate | cohort = status<>rejected append-only submissions (no update path — Phase 2 proof) |
| T-03-14 toggle audit log | accept | single-guild trust model (unchanged) |
| T-03-15 compute DoS | accept | compute-on-read over tens-to-hundreds of rows (unchanged) |

## Next Phase Readiness
- All three RPCs are the stable contract 03-04 consumes: `set_key_stat` (toggle + n/6 counter + block-at-7 error surface), `class_top5` (preview list), `my_report` (Phase 4 dashboards render it directly)
- RNK-01/RNK-02 complete in 03-04 (admin UI + UI-side leak-proof); RNK-03/04/05 marked complete now
- No open blockers for 03-04; the smoke helper pattern (login/rest/mgmtQuery/check + finally cleanup) is proven twice over

## Self-Check: PASSED

- Both key files exist on disk (supabase/migrations/0009_rank_engine.sql, scripts/smoke-rank.mjs)
- Commits verified in history: 060e348 (feat), 75263c2 (test)
- Task acceptance criteria re-verified: task 1 grep matrix ALL PASS (pre-deploy), task 2 `node --check` + literal/cleanup gates PASS, task 3 live gates PASS (`RANK SMOKE PASSED` ×2 consecutive runs, `RLS SMOKE PASSED`, vitest 93/93, tsc -b exit 0, vite build OK)
- Token-leak scan: clean (no deploy-token value in any file or commit)

---
*Phase: 03-rank-engine*
*Completed: 2026-10-10*
