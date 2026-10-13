---
phase: 02-registry-catalog-manual-data-ingestion
plan: 01
subsystem: database
tags: [supabase, postgres, rls, column-level-security, custom-jwt, rpc, vitest, pt-BR, rest-client]

# Dependency graph
requires:
  - phase: 01-foundation-secure-access-data-model
    provides: live 6-table schema (0001) + RLS policies (0002) + verify-pin custom-claim JWT + proven deployment contract (link + db push + legacy /v1 Management API)
provides:
  - "Live classes table (staff-only insert) + members.char_class/char_function (REG-01 schema, REG-02 foundation)"
  - "Column-level security on members: pin_hash/role unreachable by ANY client credential (Phase 1 gap closed, live-proven)"
  - "Staff RLS policies (select all members, update characters) reading the member_role JWT claim"
  - "Atomic append-only create_submission RPC (INPT-04 server-side enforcement, live-proven)"
  - "Live 57-stat catalog (general/quasi/special, FLAT/PERCENTUAL) + 15 starter classes"
  - "Shared frontend data layer: src/lib/api.ts (raw-fetch REST client, both headers) + src/lib/parseStatValue.ts (pt-BR parse/format, spike-identical rules)"
  - "scripts/apply-seed.mjs (re-runnable seed applier) + scripts/smoke-rls.mjs (14-assertion live RLS matrix)"
affects: [02-02, 02-03, phase-3-rank-engine, phase-5-ocr]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Column-level grants + RLS compose: grants control columns, policies control rows; select=* on members is permission-denied BY DESIGN — every client query uses explicit projections"
    - "Role-based RLS reads auth.jwt()->>'member_role' (role claim is the PostgREST 'authenticated' role-switch, NOT the guild role)"
    - "Atomic multi-table writes via SECURITY INVOKER RPC (RLS insert policies still apply row-by-row)"
    - "Live verification matrix pattern: login via deployed function, assert permissions per credential, clean up via Management API"

key-files:
  created:
    - supabase/migrations/0005_registry_catalog.sql
    - supabase/migrations/0006_staff_claim_fix.sql
    - supabase/seeds/classes.sql
    - supabase/seeds/stat_catalog.sql
    - scripts/apply-seed.mjs
    - scripts/smoke-rls.mjs
    - src/lib/parseStatValue.ts
    - src/lib/parseStatValue.test.ts
    - src/lib/api.ts
    - src/lib/api.test.ts
    - .planning/phases/02-registry-catalog-manual-data-ingestion/deferred-items.md
  modified:
    - src/features/auth/session.test.ts

key-decisions:
  - "Registry/catalog migration shipped as 0005 (plan said 0003) — 0003/0004 already taken by unpushed Phase 1 review fixes; CLI rejects duplicate versions"
  - "Staff policies read auth.jwt()->>'member_role' (0006): the deployed verify-pin JWT carries the guild role in member_role; role is 'authenticated' (PostgREST role-switch). Plan SQL checked the wrong claim and silently matched nothing — caught live by the smoke matrix"
  - "PostgREST returns 204 for a PATCH matching 0 rows — officer PATCH assertions must re-read the row to prove effect (204 alone is a false positive)"
  - "REG-02 left Pending: server-side extensibility (staff-only insert) is live, but the requirement completes when the 02-02 admin UI lets a human add classes"
  - "anon GET /members now returns 401 (not 200 []) after the 0005 revoke — same security intent (no rows exposed); smoke accepts both shapes"

patterns-established:
  - "Explicit member projection everywhere: 'id,discord_handle,display_name,role,char_class,char_function' — never a star select (pin_hash ungranted)"
  - "REST client: raw fetch with BOTH apikey and Authorization: Bearer <session.access_token> headers on every call; ApiError with status + kind (network/unauthorized/server)"
  - "parseStatValue = verbatim spike rules; manual entry (Phase 2) and OCR output (Phase 5) normalize identically"

requirements-completed: [REG-03, INPT-04]  # REG-02 completes in 02-02 (admin UI)

# Metrics
duration: 33min
completed: 2026-10-09
---

# Phase 2 Plan 1: Registry, Catalog & Data Layer Summary

**Live-deployed character registry schema with column-level security making pin_hash unreachable by any client credential, the 57-stat pt-BR catalog, an atomic append-only submission RPC — plus the shared frontend data layer (raw-fetch REST client + spike-identical pt-BR parse/format) proven by a 14-assertion live RLS smoke matrix**

## Performance

- **Duration:** 33 min
- **Started:** 2026-10-09T14:30:11Z
- **Completed:** 2026-10-09T15:03:12Z
- **Tasks:** 3 of 3
- **Files modified:** 11 (10 created, 1 fixed)

## Accomplishments
- Migration 0005 live: classes table (staff-only insert RLS), members.char_class/char_function, column-level grants, staff policies, atomic `create_submission` RPC (INPT-04)
- **Phase 1 gap closed and live-proven:** `pin_hash` (and role writes) unreachable by any client credential — member `select=*` fails, safe projections contain no pin_hash, officer PATCH on role denied (all live-asserted)
- Live catalog: exactly 57 stats across general/quasi/special, labeled FLAT/PERCENTUAL (REG-03); 15 starter classes seeded
- The `db push` also applied the pending Phase 1 review-fix migrations 0003 (lockout RPC) + 0004 (RLS active checks), **clearing the standing owner action from STATE.md**
- Shared data layer: `src/lib/api.ts` (8 functions + ApiError, both gateway headers, explicit projections) and `src/lib/parseStatValue.ts` (spike-identical pt-BR rules) — 21 new tests, suite 62/62 green

## task Commits

Each task was committed atomically:

1. **task 1: Migration 0005 (classes, char columns, column security, staff RLS, create_submission) + seeds + apply-seed script** - `285231f` (feat)
2. **task 2 [BLOCKING]: Live deploy (0003+0004+0005 pushed, seeds applied) + RLS smoke matrix + claim fix 0006** - `0692f35` (feat)
3. **task 3 RED: failing tests for parse/format + REST client** - `5a811d1` (test)
4. **task 3 GREEN: pt-BR parse/format + REST data layer** - `64019ab` (feat)

**Plan metadata:** (final docs commit follows this summary)

## Files Created/Modified
- `supabase/migrations/0005_registry_catalog.sql` - classes table, char columns, column-level security, staff RLS, create_submission RPC (REG-01/REG-02/INPT-04)
- `supabase/migrations/0006_staff_claim_fix.sql` - Rule 1 fix: staff policies read the `member_role` JWT claim
- `supabase/seeds/stat_catalog.sql` - 57-stat catalog upsert (REG-03)
- `supabase/seeds/classes.sql` - 15-class starter list upsert
- `scripts/apply-seed.mjs` - re-runnable seed applier (legacy /v1 Management API, Node-only)
- `scripts/smoke-rls.mjs` - 14-assertion live RLS matrix (anon/member/officer/RPC + cleanup)
- `src/lib/parseStatValue.ts` / `.test.ts` - pt-BR parse/format, spike-identical rules (11 parse + 3 format tests)
- `src/lib/api.ts` / `.test.ts` - REST data layer (8 functions + ApiError) with both-headers contract (8 tests)
- `src/features/auth/session.test.ts` - pre-existing tsc type error fixed (badSessions: unknown[])
- `.planning/phases/02-registry-catalog-manual-data-ingestion/deferred-items.md` - out-of-scope discoveries

## Decisions Made
- **Migration numbered 0005 + corrective 0006** (not the plan's 0003): 0003_lockout_rpc.sql/0004_rls_active.sql already exist (unpushed Phase 1 fixes); the push applied all of 0003→0004→0005 cleanly in order, as pre-verified by `--dry-run`.
- **`member_role` claim contract discovered and enforced**: the deployed verify-pin JWT sets `role: 'authenticated'` (PostgREST role-switch) and `member_role: 'member'|'officer'|'owner'`. The plan's interface note (and therefore its SQL) assumed the guild role lived in `role` — every staff policy silently matched nothing until 0006 corrected them. All future role-based policies must read `auth.jwt()->>'member_role'`.
- **REG-02 not marked complete** (02-02 admin UI completes it); REG-03 and INPT-04 marked complete (live-proven by the smoke matrix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Planning defect, directed] Migration created as 0005_registry_catalog.sql**
- **Found during:** task 1 (pre-flight)
- **Issue:** Plan drafted `0003_registry_catalog.sql`, but 0003/0004 versions are taken by unpushed Phase 1 review fixes; the CLI rejects duplicate versions
- **Fix:** Created as `supabase/migrations/0005_registry_catalog.sql` (same SQL); orchestrator pre-authorized this deviation
- **Files modified:** supabase/migrations/0005_registry_catalog.sql
- **Verification:** `db push --dry-run` + real push applied 0003, 0004, 0005 cleanly in order
- **Committed in:** 285231f

**2. [Rule 1 - Bug] Staff RLS policies read the wrong JWT claim (fixed via 0006)**
- **Found during:** task 2 (live smoke: officer saw only their own row; officer class insert denied)
- **Issue:** Plan SQL checks `auth.jwt()->>'role' in ('officer','owner')`, but the deployed verify-pin JWT carries the guild role in `member_role` (`role` is always 'authenticated') — every staff policy silently matched nothing
- **Fix:** `supabase/migrations/0006_staff_claim_fix.sql` drops and recreates the 3 staff policies reading `member_role`; pushed live
- **Files modified:** supabase/migrations/0006_staff_claim_fix.sql
- **Verification:** smoke re-run: officer sees 3 members, officer POST /classes → 201, char PATCH re-read matches; `RLS SMOKE PASSED`
- **Committed in:** 0692f35

**3. [Rule 1 - Bug] Smoke PATCH assertion was a false positive**
- **Found during:** task 2 (the broken-policy run still "passed" the char PATCH at 204)
- **Issue:** PostgREST returns 204 even when a PATCH matches 0 rows — 2xx alone proves nothing
- **Fix:** smoke-rls.mjs re-reads the member row after the PATCH and asserts char_class='Assassin' and char_function='tank' actually applied
- **Files modified:** scripts/smoke-rls.mjs
- **Verification:** re-read assertion passes only with real values; recorded as a testing convention in deferred-items.md
- **Committed in:** 0692f35

**4. [Rule 3 - Blocking] Pre-existing `tsc -b` error blocked the task 1 acceptance gate**
- **Found during:** task 1 (acceptance criterion "`npx tsc -b` exits 0")
- **Issue:** `src/features/auth/session.test.ts` line 100 typed `badSessions` as `Record<string,unknown>[]` but includes `'just a string'` and `null` (Phase 1 review-fix commit; vitest doesn't typecheck so it went unnoticed)
- **Fix:** Widened the array type to `unknown[]` (isValidSession already accepts unknown)
- **Files modified:** src/features/auth/session.test.ts
- **Verification:** `npx tsc -b` exits 0; all 62 tests green
- **Committed in:** 285231f

**5. [Plan expectation drift, no code change] anon GET /members shape**
- **Found during:** task 2 (smoke)
- **Issue:** Plan expected 200 with `[]`; after 0005 revokes ALL privileges from anon, PostgREST answers 401 — same security intent (no rows exposed)
- **Fix:** smoke accepts both no-rows shapes and logs the actual status; documented in key-decisions
- **Committed in:** 0692f35

---

**Total deviations:** 5 (1 planning defect directed by orchestrator, 2 Rule 1 bugs, 1 Rule 3 blocking, 1 documented drift)
**Impact on plan:** All fixes required for correctness/security. No scope creep. The claim-contract fix (0006) is the significant one — without it, officer capabilities would have silently failed in every later plan.

## TDD Gate Compliance

- **task 3 (vitest feature):** RED `5a811d1` (failing tests, verified failing) → GREEN `64019ab` (62/62 passing). No refactor needed. ✓
- **task 1 (marked tdd="true"):** its `<behavior>` defines SQL review gates "checked by reading the file, pre-deploy" — no test framework applies to SQL migrations. Gate satisfied by the 9-string inspection matrix + 57-tuple count (all PASS) before commit, and superseded by the live smoke matrix in task 2. Advisory note only.

## Issues Encountered
- First smoke run failed on both officer assertions → root-caused to the `member_role` claim mismatch (deviation 2) by decoding the live JWT payload; fixed with migration 0006 and re-run to full pass. The deploy pipeline itself (push, seeds, logins) never errored.

## Authentication Gates
None raised. The owner-provided SUPABASE_ACCESS_TOKEN arrived with the session (per orchestrator); it was used ONLY as an inline session env var — never written to any file, never committed, never echoed in output. Verified: no token value in the working tree or anywhere in git history. **The owner should still rotate this token after the deploy as instructed.**

## User Setup Required
None new — the plan's `user_setup` (apply migration + seeds) was executed live by this plan itself. Pending owner actions from Phase 1 remain: rotate the deploy access token, rotate placeholder whitelist rows/PINs before inviting real members, and redeploy verify-pin — **now blocked on a latent bug** (see Next Phase Readiness).

## Next Phase Readiness
- Schema + seeds + RPC live; data layer tested — ready for 02-02 (admin Personagens page) which imports `api.ts` / `parseStatValue.ts` / `NeoFootSession` verbatim
- ⚠ **Standing owner action partially cleared:** migrations 0003/0004/0005/0006 are live (done in this plan). Still pending: **redeploy verify-pin — DO NOT redeploy before fixing the latent `discordHandle` ReferenceError in `supabase/functions/verify-pin/index.ts` line 58** (would 500 every login; logged in deferred-items.md), then confirm CR-01 atomicity live
- Placeholder member now has char_class='Assassin', char_function='tank' (set by the smoke); live catalog: 57 rows; classes: 15 rows

## Self-Check: PASSED

All 12 key files exist on disk; all 4 task commits (285231f, 0692f35, 5a811d1, 64019ab) present in git log; task acceptance criteria re-verified live (RLS SMOKE PASSED, 57 catalog rows, no pin_hash in any client-visible response) and locally (vitest 62/62, tsc -b, vite build).

---
*Phase: 02-registry-catalog-manual-data-ingestion*
*Completed: 2026-10-09*
