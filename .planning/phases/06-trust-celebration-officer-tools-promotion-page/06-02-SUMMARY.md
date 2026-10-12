---
phase: 06-trust-celebration-officer-tools-promotion-page
plan: 02
subsystem: testing
tags: [supabase, smoke-tests, rls, security-definer, rpc, promotion, live-verification]

# Dependency graph
requires:
  - phase: 06-trust-celebration-officer-tools-promotion-page (06-01)
    provides: migration 0011 pushed live (officer_queue, set_submission_status, set_member_role, set_member_active, get_promotion, owner-only classes policy) + lifecycle/rank smoke skeleton precedent
  - phase: 05-ocr-auto-read-layer (05-02)
    provides: smoke-lifecycle.mjs skeleton (env gate, check(), login via verify-pin, rest()/mgmtQuery(), finally-cleanup) and the zero-row-update probe lesson
provides:
  - scripts/smoke-officer.mjs — live probe matrix for officer_queue / set_submission_status / set_member_role / set_member_active (39 checks, twice-green)
  - scripts/smoke-promotion.mjs — live member-boundary + key-stat leak-diff + D-13 hiding + D-07 cohort probes for get_promotion (21 checks, twice-green)
  - scripts/smoke-rls.mjs check 7 flipped to owner-only classes (officer DENIED + owner 201) — the 06-01 documented expected-red now green
  - Phase 6 server-surface evidence: full 5-script matrix green twice consecutively with zero fixture residue
affects: [phase verification (/gsd-verify-work AUTH-03/04/05, SHWC-02 evidence), 06-05 officer UI, promotion page UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic leak-diff fixture design: all-tied tiny key values (points <= 49.5) vs 1e9-scale rotated booster values (points >= 74.25) so top-6-by-points highlights can only be non-key stats — zero key/stat overlap provable regardless of live cohort interference"
    - "JWT claim assertion without verification: decode the verify-pin payload to pin the D-10 next-login member_role claim"
    - "check 7 flip pattern: expected-red documented in a prior plan is flipped in the SAME deploy window by the follow-up plan (06-01 -> 06-02)"

key-files:
  created:
    - scripts/smoke-officer.mjs
    - scripts/smoke-promotion.mjs
  modified:
    - scripts/smoke-rls.mjs

key-decisions:
  - "Smoke credentials resolved without a human-action gate: SUPABASE_ACCESS_TOKEN was present in the gitignored .env under the owner-placed misspelled name SUPABASE_ACESS_TOKEN and SUPABASE_PROJECT_REF was derived from the VITE_SUPABASE_URL subdomain — both mapped into session env at invocation time only (never written to any file, never echoed, never committed); scripts keep the strict process.env-only gate"
  - "smoke-officer fixtures: member_c also receives a pending 57-stat submission and a/b/c share function dps (staff rows tank) — probe 6's cohort n>=3 requirement is unsatisfiable with the plan's two-submission fixture list; mixed functions realized across the staff/member split"
  - "Leak-diff (probe 4) scoped to the fixture class's section per the plan's wording ('for that class') plus a payload-wide marker grep (is_key/key_stat/contributes_to_ovr) — other classes' legitimate highlights may contain any stat without implying a leak of THIS class's key set"

patterns-established:
  - "Assertion-shape fix precedent re-applied (05-02): set_submission_status p_role/p_status whitelists raise their OWN tokens (invalid_status/invalid_role) BEFORE target checks — pin the actual contract token, not a generic forbidden"
  - "Twice-consecutive-run discipline (WR-06) extended with an explicit SQL residue census after pass 2 (fixture members/classes/keys/attempts all 0)"

requirements-completed: [AUTH-03, AUTH-04, AUTH-05, SHWC-02]

# Metrics
duration: 18min
completed: 2026-10-12
---

# Phase 6 Plan 02: Live Smoke Matrices (Officer Tools + Promotion) Summary

**Two new live smoke matrices (officer 39/39, promotion 21/21) plus the flipped RLS check 7 prove every Phase 6 server enforcement surface — staff-only queue, gated transitions with not_pending race safety, owner-only roles with next-login effect, instant deactivation kill-switch, member-boundary promotion with ZERO key-stat leakage, hidden insufficient-data classes, owner-only class creation — green twice consecutively with zero fixture residue.**

## Performance

- **Duration:** 18min
- **Started:** 2026-10-12T20:15:30-03:00
- **Completed:** 2026-10-12T20:33:00-03:00
- **Tasks:** 3/3
- **Files modified:** 2 created + 1 modified

## Accomplishments

- `scripts/smoke-officer.mjs` (39 checks): anon/member denied on officer_queue; officer queue returns the full 57-stat payload newest-first; member self-validation denied; invalid_status / not_pending exception tokens pinned live; validate feeds and reject empties the compute-on-read cohort (D-05); owner-only role grant/revoke with the D-10 next-login JWT member_role claim asserted both directions; owner rows immutable and no path grants 'owner' (D-08); deactivation instantly kills the minted 7-day token (own-row select 0 rows, my_report forbidden, verify-pin refused) and reactivation restores login; target rules proven (officer→member only, owner→officer, self-deactivation blocked); D-07 cohort shift live on class_top5. Probe 9 re-proves smoke-lifecycle green inline (11/11).
- `scripts/smoke-promotion.mjs` (21 checks): anon denied (T-06-06); member-invocable jsonb array with a 3-card section; closed card/highlight shape (exactly {stat_key,label,value_type,value,points}); THE LEAK-DIFF: staff key set vs member-visible stat_keys = zero intersection, plus a payload-wide marker grep; insufficient-data class absent (D-13); class_top5 boundary intact (D-14); deactivated member's card drops and returns on reactivation (D-07).
- `scripts/smoke-rls.mjs` check 7 flipped: officer POST /classes DENIED (403) + owner POST /classes 201, annotated "(Phase 6: owner-only per 06-CONTEXT D-09, migration 0011)" — the 06-01 documented expected-red is now green; no other check touched.
- Full 5-script matrix green twice consecutively; post-pass SQL census: 0 fixture members/classes/key-stats/login-attempts (live DB back to its 3 placeholder members).

## Task Commits

Each task was committed atomically:

1. **task 1: Write scripts/smoke-officer.mjs (queue, transitions, roles, removal)** - `fd5de73` (test) — 39/39 green on runs 2–3 (run 1 exposed one assertion-shape fix, see Deviations)
2. **task 2: Write scripts/smoke-promotion.mjs + flip smoke-rls check 7** - `e01ee73` (test) — promotion 21/21 twice; RLS fully green with the flip
3. **task 3: Run the full smoke matrix twice consecutively** - (no code commit — verification run; tallies below)

**Plan metadata:** *(this commit)* (docs: complete plan)

## Full-Matrix Tallies (task 3, both passes)

| Script | Pass 1 | Pass 2 |
|--------|--------|--------|
| smoke-officer.mjs | 39/39 | 39/39 |
| smoke-promotion.mjs | 21/21 | 21/21 |
| smoke-rls.mjs | PASSED (16 checks + 4 cleanup passes) | PASSED (16 checks + 4 cleanup passes) |
| smoke-rank.mjs | PASSED (27-point exact-value matrix) | PASSED |
| smoke-lifecycle.mjs | 11/11 | 11/11 |

Residue census after pass 2: fixture members 0, classes 0, class_key_stats 0, pin_login_attempts 0.

## Files Created/Modified

- `scripts/smoke-officer.mjs` (new, 724 lines) — queue/transition/role/removal/cohort live probe matrix with try/finally cleanup
- `scripts/smoke-promotion.mjs` (new, 512 lines) — member-boundary + key-stat leak-diff + D-13/D-07 probes with deterministic booster fixture design
- `scripts/smoke-rls.mjs` (modified, check 7 only) — flipped to owner-only classes with owner login + defensive pre-delete

## Decisions Made

- Credentials handling: no human-action gate — the owner had already stored the access token in the gitignored `.env` (misspelled `SUPABASE_ACESS_TOKEN`); the project ref was derived from the Supabase URL. Both were injected as session env vars per invocation only. The scripts' documented contract (process.env-only, never written/echoed) is unchanged.
- Leak-diff scoping: the zero-intersection assertion runs against the fixture class's section (the plan's "for that class") — a member of class X seeing a stat that class Y highlights is not a leak of X's key set; the payload-wide grep for is_key/key_stat/contributes_to_ovr covers the structural leak surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 10g assertion pinned the wrong exception token**
- **Found during:** task 1 (first smoke-officer run)
- **Issue:** check 10g (no path grants 'owner') asserted body contains 'forbidden', but 0011's set_member_role checks the p_role whitelist BEFORE the target check and raises 'invalid_role' for p_role='owner' — the run failed on assertion shape, not behavior (non-2xx denial held)
- **Fix:** assertion now requires non-2xx + 'invalid_role' (the actual whitelist contract; 05-02 assertion-shape precedent)
- **Files modified:** scripts/smoke-officer.mjs
- **Verification:** runs 2 and 3 green (39/39 twice)
- **Committed in:** fd5de73

**2. [Rule 3 - Blocking] Plan's fixture list could not satisfy probe 6's cohort n≥3**
- **Found during:** task 1 (fixture design)
- **Issue:** only member_a and member_b were slated for submissions; member_a's my_report points need 3 same-class+same-function holders, and "mixed functions" among the member trio would have reduced the cohort below 3
- **Fix:** member_c also receives a pending 57-stat submission; a/b/c share function 'dps' while staff fixtures are 'tank' (mixed functions realized across the staff/member split)
- **Files modified:** scripts/smoke-officer.mjs
- **Verification:** 6b green (all 57 stats data_sufficient with non-null points at n=3); 8c proves the drop to n=2 after member_b's rejection
- **Committed in:** fd5de73

**3. [Rule 3 - Blocking] Session env missing the smoke credentials the plan flagged**
- **Found during:** task 1 (env gate)
- **Issue:** SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF absent from the session environment; smoke scripts hard-require them for Management API fixture seeding
- **Fix:** token found in gitignored .env as SUPABASE_ACESS_TOKEN (owner-placed); project ref derived from VITE_SUPABASE_URL; mapped into session env at invocation only — no script changes, nothing written/echoed/committed
- **Files modified:** none (invocation-side only)
- **Verification:** Management API query returned HTTP 201 before any script run
- **Committed in:** n/a (no repo change)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes necessary to run the matrix as specified. No scope creep; no probe weakened.

## Issues Encountered

- Live DB carries 2 placeholder pending submissions and 4 discarded rows (UAT history) — officer_queue probes therefore match fixture rows by discord_handle rather than assuming exact array shape; relative ordering of fixture rows is still asserted.

## Known Stubs

None — both scripts are complete probe matrices; no placeholder/TODO patterns.

## Verification Chain

- AUTH-03 (owner-only role management), AUTH-04 (role-differentiated removal + instant revocation), AUTH-05 (officer queue + gated transitions), SHWC-02 (promotion payload + RNK-02 leak-proof) — all four now have LIVE automated evidence per the plan's probe matrix. Requirement checkboxes stay for the phase verification chain (06-01 precedent: marked via traceability at /gsd-verify-work once the UI walks complete).

## Next Phase Readiness

- Every Phase 6 server claim is now proven live — the remaining phase work (officer UI, promotion page UI) can build against behavior-proven RPCs with the smoke scripts as a permanent regression gate.
- Standing action (03-02/05-02/06-01 precedent): owner should rotate the Supabase access token now that this live session is done.

## Self-Check: PASSED

- `scripts/smoke-officer.mjs` exists on disk — FOUND
- `scripts/smoke-promotion.mjs` exists on disk — FOUND
- `scripts/smoke-rls.mjs` check 7 flip present (grep: officer DENIED + owner 201) — FOUND
- Commit `fd5de73` (task 1) present in git log — FOUND
- Commit `e01ee73` (task 2) present in git log — FOUND
- Full 5-script matrix green twice consecutively; residue census all zeros — VERIFIED
- SUPABASE_ACCESS_TOKEN absent from every tracked/created file — VERIFIED (token only read from gitignored .env at invocation)

---
*Phase: 06-trust-celebration-officer-tools-promotion-page*
*Completed: 2026-10-12*
