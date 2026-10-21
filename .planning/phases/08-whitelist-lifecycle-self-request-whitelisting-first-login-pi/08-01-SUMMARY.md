---
phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi
plan: 01
subsystem: database
tags: [postgres, rls, security-definer, supabase-storage, whitelist, pin, identity, smoke]

# Dependency graph
requires:
  - phase: 07.2
    provides: get_promotion rating unification + photo_path supersession (used as the byte-source for the 0014 copy)
  - phase: 06
    provides: officer tools, promotion RPCs, pin_login_attempts lockout primitives reused by reset_member_pin
  - phase: 05
    provides: stat_catalog / class_key_stats registry surfaces patched by the read-payload updates
provides:
  - members.pin_hash nullable (handle-only/unclaimed representation) + members.char_id/claimed_at
  - member_identity_history (append-only identity source of truth)
  - membership_requests + membership_request_stats (RLS on, zero policies, RPC-only)
  - identity_proofs + private identity-proofs storage bucket with staff-only policies
  - lifecycle RPCs add_member/reset_member_pin/claim_pin/create_membership_request/approve_request/reject_request/request_status
  - staff RPCs staff_members/staff_identity_queue/review_identity/staff_requests/correct_identity/staff_identity_history
  - identity-aware create_submission/set_submission_status/officer_queue/role_rank/get_promotion
  - scripts/smoke-identity.mjs (81 live probes, zero-residue census)
affects: [08-02 (verify-pin/setup-pin/request-access Edge Functions), 08-03 (first access + request UI), 08-04 (submit identity + prospect wizard), 08-05 (staff boards), 08-06 (legacy conversion)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Append-only identity: member_identity_history is insert-only; corrections append, newest row wins"
    - "Internal definer helper with no client EXECUTE (assert_char_id_available, identity_display_name/char_id) called from gated definer RPCs"
    - "Unnumbered storage seeds in supabase/seeds/live for storage-only changes; 0014 remains the only numbered Phase 8 migration"
    - "Smoke scripts run against the LIVE project with service-role key fetched in-memory and a zero-residue census in the finally block"

key-files:
  created:
    - supabase/migrations/0014_whitelist_requests_identity.sql
    - supabase/seeds/live/identity-proofs-storage.sql
    - scripts/smoke-identity.mjs
  modified: []

key-decisions:
  - "get_promotion was copied from the LIVE supersession seed (promotion-rating-unification.sql), not from migration 0013 — copying 0013 would regress photo_path and class+function rating parity"
  - "approve_request passes the request id to assert_char_id_available (plan said null, which would always raise duplicate_char_id against the request's own pending row)"
  - "The 1-arg create_submission overload is dropped so PostgREST never has to resolve between two candidates; the 2-arg default keeps old client calls working"
  - "create_submission became SECURITY DEFINER: the identity branch must call an internal-only guard, which an invoker-rights body cannot do (live 403)"
  - "create_submission's definer body enforces the caller active-member check explicitly and scopes the one-pending discard to the caller's own rows, replacing the 0004 insert policy semantics"

patterns-established:
  - "Cross-table unique char_id guard: one helper, called from every write path, single duplicate_char_id token"
  - "anon reads are limited to a whitelisted projection (stat_catalog labels) and a four-key request_status payload"

requirements-completed: [WHIT-01, WHIT-02, WHIT-03, WHIT-04, WHIT-05, WHIT-06, WHIT-07, WHIT-08, WHIT-09, WHIT-10, IDEN-01, IDEN-02, IDEN-03]

# Metrics
duration: 31min
completed: 2026-10-21
---

# Phase 8 Plan 1: Whitelist Lifecycle, Self-Request & Identity Capture Summary

**Migration 0014 live: nullable-PIN handles, staff/owner lifecycle RPCs, RPC-only membership requests, append-only identity history with a cross-table unique char_id, and a private staff-only proof bucket — 81 identity probes green twice with zero residue**

## Performance

- **Duration:** ~31 min
- **Started:** 2026-10-21T05:10:39Z (STATE flipping to executing)
- **Completed:** 2026-10-21T05:41:32Z
- **Tasks:** 3/3
- **Files modified:** 3 (all created)

## Accomplishments
- `members.pin_hash` is nullable, so whitelisted-but-unclaimed players are representable with no extra flag; `members.char_id/claimed_at` are RPC-only (0005 column grants untouched).
- `add_member` creates handle-only rows, rejects the `dummy-%` sentinel, and reactivates an inactive handle reusing the same id without touching submission history.
- `claim_pin` atomically flips `pin_hash` from NULL exactly once (second claim → `already_set`), appends identity history and queues a pending proof; `reset_member_pin` is owner-only, refuses owner targets and clears the handle's lockout rows.
- Membership requests are RPC-only (RLS on, zero policies), supersede only with the caller-supplied request id, retain superseded/rejected rows, and clear `proof_path` for client purge; `request_status` is anon-callable and returns exactly `{status,request_type,created_at,decided_at}`.
- Identity is captured per submission and promoted to `member_identity_history` only on validation; `members.char_function` is never auto-applied from a submission (D-20), while class/nickname/char_id are.
- `char_id` uniqueness spans members, open requests and pending submissions through one internal guard called by every write path.
- Read payloads (`role_rank`, `get_promotion`, `officer_queue`, `staff_*`) carry the newest identity while the rank math stays untouched.
- `identity-proofs` is a private 2 MB JPEG bucket with staff-only SELECT/DELETE and no client INSERT/UPDATE (Edge Functions upload with the service role).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 0014 (schema + RPCs)** - `7d46b06` (feat)
2. **Task 2: identity-proofs bucket policies + live identity smoke matrix** - `c4e528d` (feat)
3. **Task 3: live apply + create_submission definer fix** - `4b847a3` (fix)

**Plan metadata:** (docs: complete plan — see final commit)

## Files Created/Modified
- `supabase/migrations/0014_whitelist_requests_identity.sql` — 1,792 lines: members/submissions identity columns, 4 new tables, 22 functions (6 internal helpers/RPC groups), RLS + EXECUTE hygiene, anon catalog projection.
- `supabase/seeds/live/identity-proofs-storage.sql` — private bucket + staff-only storage policies; unnumbered live seed.
- `scripts/smoke-identity.mjs` — 81 probes across 15 groups: schema shape, add_member/reset/claim, request lifecycle (prospect/member/inactive/reject/supersede), identity promotion/correction, duplicate char_id, read payloads, storage RLS, anon catalog; `finally` cleanup + zero-residue census.

## Decisions Made
- **get_promotion source:** copied the live supersession (`promotion-rating-unification.sql`, includes `photo_path` and class+function rating parity) rather than migration 0013, which would have regressed 07.2 probes 7f/10b.
- **approve_request guard arguments:** `assert_char_id_available(v_req.char_id, v_existing.id, p_request)` — excluding the request's own pending row; the plan's literal `null` would always self-collide.
- **create_submission signature:** dropped the 1-arg overload, kept `p_identity jsonb default null`, so old clients keep working without PostgREST ambiguity.
- **create_submission rights:** SECURITY DEFINER (see deviation 4) with explicit caller/active/ownership scoping.
- **Identity display sourcing:** `identity_display_name`/`identity_char_id` internal helpers, never exposed to clients.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] get_promotion had to copy the live supersession, not 0013**
- **Found during:** Task 1 (migration authoring)
- **Issue:** The plan pointed at migration 0013 for the `get_promotion` body, but production was superseded twice by `supabase/seeds/live/promotion-*.sql`; a literal 0013 copy would drop `photo_path` and the round-8 rating unification.
- **Fix:** Copied the live body and added the newest-identity display swap on top.
- **Files modified:** `supabase/migrations/0014_whitelist_requests_identity.sql`
- **Verification:** `smoke-promotion.mjs` 21/21 and `smoke-card.mjs` 58/58, including the photo_path contract.
- **Committed in:** `7d46b06`

**2. [Rule 1 - Bug] approve_request would always self-collide on duplicate_char_id**
- **Found during:** Task 1 (plan review)
- **Issue:** The plan specified `assert_char_id_available(char_id, member_id, null)`; the request's own pending row (status `pending`, unique on `char_id`) makes that always raise `duplicate_char_id`.
- **Fix:** Pass `p_request` so the request's own row is excluded.
- **Files modified:** `supabase/migrations/0014_whitelist_requests_identity.sql`
- **Verification:** Smoke group 6 (prospect approve) and 8 (inactive re-request) green.
- **Committed in:** `7d46b06`

**3. [Rule 1 - Bug] PostgREST overload ambiguity on create_submission**
- **Found during:** Task 1
- **Issue:** Adding `(jsonb, jsonb)` next to the existing `(jsonb)` leaves two candidates for a single-argument call.
- **Fix:** `drop function if exists public.create_submission(jsonb)` before creating the 2-arg version with a default.
- **Files modified:** `supabase/migrations/0014_whitelist_requests_identity.sql`
- **Verification:** Old-shape 1-arg calls still work (card/lifecycle smokes) and identity calls pass.
- **Committed in:** `7d46b06`

**4. [Rule 3 - Blocking] create_submission 403 on live: invoker body could not call the internal guard**
- **Found during:** Task 3 (first live `smoke-identity.mjs` run: 10 failures clustered on 11a)
- **Issue:** `create_submission` was invoker-rights (as in 0010) but its identity branch calls `assert_char_id_available`, whose EXECUTE was revoked from `authenticated` — PostgREST returned 403 `permission denied`. Granting the guard would have exposed char_id probing to clients.
- **Fix:** Made `create_submission` SECURITY DEFINER with `search_path = public`, added an explicit active-member gate (the 0004 insert policy), and scoped the one-pending discard to the caller's own rows. The JWT `member_id` claim remains the only trusted identity.
- **Files modified:** `supabase/migrations/0014_whitelist_requests_identity.sql`
- **Verification:** Re-applied the migration live; `smoke-identity.mjs` 81/81 twice, plus rank/card/officer/lifecycle/promotion/rls regressions green.
- **Committed in:** `4b847a3`

**5. [Rule 1 - Bug] Smoke probe 13c asserted an unreachable Destaques card**
- **Found during:** Task 3 (second smoke run, single failure 13c)
- **Issue:** The probe expected the ident fixture ("Ident Corrected") in the promotion cards, but its staff-only correction moved it to `mdps`, whose fixture cohort is smaller than 3 — OVR is null, so it can never enter the top-5. Product behaviour was correct.
- **Fix:** The probe now corrects the OVR-eligible dps fixture (A → "A Ident Corrected") and asserts the card shows the new name and neither of the stale ones.
- **Files modified:** `scripts/smoke-identity.mjs`
- **Verification:** 13c passes with `cards=["Prospect Nick","SMOKE IDN C","SMOKE IDN B","A Ident Corrected"]`.
- **Committed in:** `4b847a3`

---

**Total deviations:** 5 auto-fixed (4 Rule 1, 1 Rule 3)
**Impact on plan:** All five were required for correctness or for the plan to be executable at all. No scope creep: no new tables, no new client surface, no changes to rank math.

## Issues Encountered
- **Task 2 runtime gate deferred:** `smoke-identity.mjs` cannot pass before 0014 is live, so task 2 shipped with syntax-check only; the runtime gate ran in task 3 (twice, 81/81) exactly as the plan's verification block intends.
- **Credentials:** no `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF` in the session env. Followed the 06-02 precedent: read `SUPABASE_ACESS_TOKEN` from `.env` in-process and derived the ref from `VITE_SUPABASE_URL`; nothing was echoed or committed.
- **No local Postgres rehearsal** (no embedded-postgres in `node_modules`), so the first apply was the first real parse — it succeeded, and the only runtime defect (deviation 4) surfaced through the smoke, not through apply.
- **Bookkeeping:** `supabase_migrations.schema_migrations` did not contain 0014 after the raw Management-API apply; inserted the `('0014','whitelist_requests_identity')` row and verified it reads back.

## User Setup Required
None beyond the owner access token already used (session-only, never committed).

## Known Stubs
None — every RPC in 0014 is fully implemented and exercised by the smoke matrix.

## Next Phase Readiness
- **Deploy order is load-bearing:** 0014 is live, but the deployed `verify-pin` Edge Function still assumes a non-null `pin_hash`. 08-02 must ship the NULL-`pin_hash` → 409 branch (plus `setup-pin`/`request-access`) before any client build that relies on unclaimed handles.
- `identity-proofs` bucket and policies are live; the Edge Functions need the service-role upload paths (`claims/<member_id>/<uuid>.jpg`, `requests/<request_id>/<uuid>.jpg`).
- Read payloads already carry identity, so 08-03/08-04 clients can render names/char_ids without further server work.
- `create_submission` is now SECURITY DEFINER: future plans must not add RLS-only expectations to that path — the function itself is the enforcement point (documented in the migration comment).

---
*Phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi*
*Completed: 2026-10-21*

## Self-Check: PASSED

- All three created files exist on disk (migration, storage seed, smoke script)
- All three task commits exist in git log (7d46b06, c4e528d, 4b847a3)
- Live verification re-run after the last commit: smoke-identity 81/81 twice, rank/card/officer/lifecycle/promotion/rls green, build green
