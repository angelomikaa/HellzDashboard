---
phase: 01-foundation-secure-access-data-model
plan: 02
subsystem: auth
tags: [supabase, rls, edge-functions, jwt, jose, bcrypt, pin-auth, lockout, postgrest, hs256, signing-keys]

# Dependency graph
requires:
  - phase: 01-01
    provides: "6-table live schema (RLS-enabled deny-all) + placeholder whitelist (handles with bcrypt PIN 1234) + linked project thdxyxsjafimxgxpmpqs"
provides:
  - "RLS policies live on all 6 tables: members/submissions/submission_stats own-row select (+insert for submissions), stat_catalog read-all, class_key_stats + pin_login_attempts deny-all"
  - "Deployed verify-pin Edge Function: bcrypt PIN compare, DB-backed 5-attempts->15-min lockout (D-07), 7-day custom-claim JWT (D-06)"
  - "PROVEN spike: custom-claim JWT (role=authenticated, member_id, member_role, kid) accepted by PostgREST; RLS reads the claims; members see only their own row"
  - "Lockout pure functions (unit-tested) importable by future functions"
affects: [01-03, 01-04, phase-2-registration, phase-3-rank-engine, phase-6-officer-tools]

# Tech tracking
tech-stack:
  added: [jose@4 (Deno npm:), bcryptjs@3 (Deno npm:), supabase-edge-functions, supabase-management-signing-keys API]
  patterns:
    - "Custom-claim JWT minting: SignJWT HS256 with a registered project signing key (kid header) — the platform no longer exposes the legacy JWT secret"
    - "Edge Function secrets must NOT use the SUPABASE_ prefix (reserved/rejected by the secrets API) — NEFOOT_* namespace"
    - "Function gateway requires BOTH apikey AND Authorization: Bearer <anon> headers on /functions/v1 calls — the 01-03 login client must send both"
    - "JWTs ride a standby signing key: PostgREST accepts standby-key signatures (rotation staging); revoking the key kills all sessions instantly"
    - "supabase-js v2 maybeSingle()/upsert() return { data, error } — always destructure data, errors are returned not thrown"

key-files:
  created:
    - supabase/migrations/0002_rls.sql
    - supabase/functions/_shared/lockout.ts
    - supabase/functions/_shared/lockout.test.ts
    - supabase/functions/verify-pin/index.ts
  modified: []

key-decisions:
  - "JWT signing uses an HS256 project signing key registered via the Management API (id 6f7657c3-ec31-493e-a09f-f22dd7ea7cfc, standby) instead of the legacy project JWT secret — the platform redacts the legacy secret everywhere and forbids SUPABASE_-prefixed function secrets; the function reads NEFOOT_JWT_SECRET + NEFOOT_JWT_KEY_ID"
  - "JWT carries a kid header so PostgREST selects the correct key among in_use/previously_used/standby keys"
  - "5th wrong PIN returns 401 with attempts_remaining 0; the lock engages for the NEXT attempt (429) — matches the plan's per-failure-401 design"
  - "AUTH-01/AUTH-02 left Pending in REQUIREMENTS.md — server-side enforcement is complete and proven; the member-facing login flow completes in 01-03"
  - "Anti-enumeration: missing handle, inactive member, and wrong PIN share one 401 shape and ALL count toward the lockout"

patterns-established:
  - "Lockout gate: read pin_login_attempts (service role) -> isLocked -> 429; failure paths upsert nextFailureState; success resets"
  - "Response contract from <interfaces>: 200 {session}, 401 {error, attempts_remaining}, 429 {error, retry_after_seconds}"

requirements-completed: []  # AUTH-01/AUTH-02: server-side enforcement shipped+proven here; member-facing access completes in 01-03 (same rationale as 01-01)

# Metrics
duration: 47min
completed: 2026-10-08
---

# Phase 1 Plan 2: RLS Lockdown & PIN Auth Backend Summary

**RLS policies live on all 6 tables (append-only member access, deny-all key stats) plus a deployed `verify-pin` Edge Function with DB-backed 5→15-min lockout and 7-day custom-claim JWTs — the MEDIUM-confidence JWT→PostgREST→RLS spike is proven end-to-end on the live project**

## Performance

- **Duration:** 47 min
- **Started:** 2026-10-08T16:04:55Z
- **Completed:** 2026-10-08T16:52:04Z
- **Tasks:** 3 of 3
- **Files modified:** 4 (created)

## Accomplishments
- `0002_rls.sql` applied live: 6 tables RLS-enabled (idempotent over 01-01 deny-all), members read their own row only, submissions/submission_stats select+insert own only with **no update/delete policies** (append-only at the policy level), stat_catalog readable by authenticated, `class_key_stats` and `pin_login_attempts` have **no policies** (deny-all / service-role only)
- `verify-pin` Edge Function deployed: input validation (4-digit PIN), bcrypt compare against the stored hash, DB-backed per-handle lockout, identical 401s for missing handle/inactive/wrong PIN (no enumeration), success mints a 7-day HS256 JWT with `role: 'authenticated'` + `member_id` + `member_role`
- Lockout math unit-tested TDD-style (RED `13fc3dd` → GREEN `d63b1dd`): 6 Vitest tests covering the 5 specified behaviors
- **Day-one auth spike closed with live evidence** — the research's MEDIUM-confidence wiring works: PostgREST accepts the custom-signed JWT, switches to `authenticated`, and RLS returns only the caller's own member row; `class_key_stats` stays unreachable

## End-to-End Smoke Test Evidence (live, task 3)

| Scenario | Expected | Actual |
|----------|----------|--------|
| (a) wrong PIN | 401 `invalid_credentials`, attempts_remaining 4 | **401** `{"error":"invalid_credentials","attempts_remaining":4}` |
| (b) attempts 2–5 | 401, remaining 3,2,1,0 | **401** remaining 3,2,1,0 (5th failure: 401 rem=0) |
| (b) attempt after 5 failures | 429 `locked` | **429** `{"error":"locked","retry_after_seconds":898}` |
| (b) correct PIN while locked | refused | **429** (server-side lock, D-07) |
| (c) correct PIN after reset | 200 + session | **200**, 3-part JWT, member_id/display_name/member_role/expires_at present |
| (d) decoded JWT claims | role/member_id/member_role, 7d | `role=authenticated member_role=member sub==member_id alg=HS256 exp-iat=604800s` |
| (e) GET members w/ Bearer | own row only | **200** `[{"discord_handle":"member-handle","role":"member"}]` — RLS claims proven |
| (f) GET class_key_stats w/ Bearer | denied/empty | **200** `[]` — deny-all proven |
| verify | nonexistent handle → 401 | **401** same shape (anti-enumeration) |

Attempt rows for the smoke handles were removed afterwards (DB left tidy). Plan's automated `<verify>` command (401 on nonexistent handle) exits 0.

## task Commits

Each task was committed atomically:

1. **task 1: RLS policies on every table** - `fe3d7c6` (feat) — applied live via `supabase db push`
2. **task 2 RED: failing lockout tests** - `13fc3dd` (test)
3. **task 2 GREEN: lockout pure functions + verify-pin Edge Function** - `d63b1dd` (feat)
4. **task 3: deploy + smoke test (function fixes found during it)** - `30c2ab8` (fix)

**Plan metadata:** (final docs commit follows this summary)

## Files Created/Modified
- `supabase/migrations/0002_rls.sql` — RLS enable on 6 tables + per-table policies (no update/delete anywhere; deny-all on class_key_stats/pin_login_attempts)
- `supabase/functions/_shared/lockout.ts` — pure lockout state machine (isLocked, retryAfterSeconds, nextFailureState, resetState; MAX_ATTEMPTS=5, LOCKOUT_MINUTES=15)
- `supabase/functions/_shared/lockout.test.ts` — 6 Vitest tests for the 5 specified behaviors
- `supabase/functions/verify-pin/index.ts` — the PIN gate: lockout → bcrypt compare → 7-day custom-claim JWT (live: https://thdxyxsjafimxgxpmpqs.supabase.co/functions/v1/verify-pin)

## Decisions Made
- **JWT signing mechanism (platform-forced):** the plan's `SUPABASE_JWT_SECRET` (legacy project secret) is unobtainable — redacted in the Management API (`/v1/projects/{ref}`, config endpoints), never auto-injected into Edge Functions, and function-secrets names starting with `SUPABASE_` are **rejected by the API**. Fix: registered a dedicated HS256 signing key via `POST /v1/projects/{ref}/config/auth/signing-keys` (id `6f7657c3-ec31-493e-a09f-f22dd7ea7cfc`, standby) with a generated secret, stored as function env `NEFOOT_JWT_SECRET` (+ `NEFOOT_JWT_KEY_ID` for the kid header PostgREST uses for key selection). Same HS256 algorithm, same claims, same 7-day expiry — only the key source changed.
- **Standby key status kept:** PostgREST accepts standby-key signatures by design (rotation staging) — proven live on the first attempt. The platform's in_use ES256 key and the previously_used legacy HS256 key (which still verifies the anon/service keys) are untouched.
- **401-then-429 semantics:** the 5th failure itself returns 401 with `attempts_remaining: 0` (per the plan's per-failure-401 spec); the lock returns 429 on the following attempt — including for the correct PIN.
- **Requirements traceability:** AUTH-01/AUTH-02 remain Pending — enforcement is server-side complete and proven, but "player can access the panel" needs the 01-03 login UI; mark both complete at phase close.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `maybeSingle()` response treated as the row**
- **Found during:** task 3 (smoke test — every valid-shape request returned HTTP 500)
- **Issue:** `await query.maybeSingle()` returns the supabase-js response object `{ data, error, ... }`, not the row. `member.pin_hash` was `undefined` → `bcrypt.compareSync` threw → 500 on every PIN check; the attempts row had the same latent bug
- **Fix:** destructure `{ data }` for both the `pin_login_attempts` and `members` lookups
- **Files modified:** supabase/functions/verify-pin/index.ts
- **Verification:** full smoke test passes (401/429/200 paths all correct)
- **Committed in:** 30c2ab8

**2. [Rule 3 - Blocking] JWT secret unobtainable — signing-key registration instead**
- **Found during:** task 3 (deploy + spike)
- **Issue:** plan assumes `SUPABASE_JWT_SECRET` is available. Empirically: not injected into Edge Functions, redacted platform-wide (Management API project details, auth config, api-keys endpoints), and `SUPABASE_*` names are rejected by the function-secrets API (`pattern: ^(?!SUPABASE_).*`). HS256 minting as written was impossible
- **Fix:** registered a dedicated HS256 signing key via the Management API with a generated 64-char secret (kept only in the platform key store + function env as `NEFOOT_JWT_SECRET`); added `kid` header (`NEFOOT_JWT_KEY_ID`) — PostgREST key selection requires it; smoke test scenario (e)/(f) prove acceptance
- **Files modified:** supabase/functions/verify-pin/index.ts
- **Verification:** JWT decoded with correct claims; PostgREST returns only the caller's own row; key stats denied
- **Committed in:** 30c2ab8
- **Note:** two experimental HS256 keys created during debugging lost their (in-memory-only) secrets and were revoked: `47885d21…`, `10b88605…`. Key inventory now: legacy HS256 (previously_used, still verifies anon/service keys), platform ES256 (in_use), our HS256 `6f7657c3` (standby). Creation is rate-limited to 1 key / 5 min

**3. [Rule 1 - Bug] function gateway requires `Authorization` header**
- **Found during:** task 3 (smoke test round 1 — 401 `UNAUTHORIZED_NO_AUTH_HEADER` before the function ran)
- **Issue:** the `/functions/v1` gateway rejects requests carrying only `apikey`; without `Authorization: Bearer <anon>` the function is never invoked
- **Fix:** test client sends both headers; **01-03's login client must do the same** (supabase-js `functions.invoke` sends both automatically when initialized with the anon key)
- **Files modified:** temp smoke script only (not repo code)
- **Verification:** all scenarios then reached the function

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking/platform)
**Impact on plan:** Task-3 objective unchanged — the spike is proven with the same JWT shape, algorithm, and claims. The signing-key mechanism is the platform-supported equivalent of the retired legacy secret and is more operationally secure (revocable, no shared secret in the control plane). No scope creep.

## Issues Encountered
- No CLI `supabase functions logs` subcommand in this CLI version and the Management API logs endpoints 404 — diagnosed the 500s by temporarily deploying an instrumented build (never committed; removed before the final deploy)
- Signing-key platform rules discovered empirically: 1 standby key max, 3 previously_used max, 5-min creation rate limit, PATCH status transitions (`in_use`/`previously_used`/`standby`/`revoked`), DELETE only works on revoked keys
- The project was provisioned (2026-10-08T15:44Z) with an ES256 in_use key + legacy HS256 recorded as previously_used — i.e., this project was already on the new signing-keys model, which is why the legacy secret is unrecoverable

## Authentication Gates
- None raised: the owner-provided `SUPABASE_ACCESS_TOKEN` (session env var only — never written, committed, or echoed; rotate it after reviewing this plan) authorized `db push`, `functions deploy`, and all Management API calls, exactly as pre-authorized in the plan prompt.

## User Setup Required
No NEW setup items. Existing items in [01-USER-SETUP.md](./01-USER-SETUP.md) still apply (rotate placeholder whitelist rows/PINs before inviting real members; rotate the pasted access token). Plan-02 additions recorded there: verify-pin is deployed and its env secrets (`NEFOOT_JWT_SECRET`, `NEFOOT_JWT_KEY_ID`) live only in the Supabase function secret store.

## Next Phase Readiness
- **01-03 (LoginPage) contract:** `POST /functions/v1/verify-pin` with `{ discord_handle, pin }`, headers `apikey` + `Authorization: Bearer <anon>` (supabase-js sends both via `functions.invoke`); responses exactly as the plan `<interfaces>` block. Store `session.access_token`, send it as `Authorization: Bearer` on PostgREST calls
- **Operational caution:** JWTs are signed with signing key `6f7657c3…` (standby). If anyone revokes it, all sessions die instantly; if the owner later creates another standby key via the dashboard, our key must first be moved to in_use/previously_used (choose **in_use** so verify-pin tokens keep working) — this is a dashboard-level action to remember during any future key rotation
- Blockers: none. Lockout module, RLS, and the JWT contract are proven live with placeholder handle `member-handle` / PIN `1234`

---
*Phase: 01-foundation-secure-access-data-model*
*Completed: 2026-10-08*

## Self-Check: PASSED

All 4 key files exist on disk; all 4 task commits (fe3d7c6, 13fc3dd, d63b1dd, 30c2ab8) present in git log; lockout tests green (6/6); RLS acceptance checks pass (6 enable statements, no update/delete policies, deny-all tables policy-free); live smoke test re-run passed all scenarios (a)-(f) plus the plan's automated verify (exit 0).
