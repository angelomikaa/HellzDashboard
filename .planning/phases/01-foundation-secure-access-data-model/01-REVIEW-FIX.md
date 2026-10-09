---
phase: 01-foundation-secure-access-data-model
fixed: 2026-10-09T02:30:00Z
fix_scope: critical_warning
findings_in_scope: 11
fixed: 11
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-10-09T02:30:00Z
**Source review:** .planning/phases/01-foundation-secure-access-data-model/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (2 critical, 9 warning)
- Fixed: 11
- Skipped: 0

**Verification:** Full test suite green (41 tests: session 10, lockout 6, OCR math 25 — 5 new session-hardening tests added for CR-02), `npx tsc --noEmit` clean, `npx vite build` succeeds.

**Process note:** The isolated-worktree step could not run as specified — `git worktree add` to the current branch (`master`) fails because `master` is already checked out at the main working tree, and a separate-branch worktree would have put the fix commits on a branch the orchestrator never sees. Fixes were therefore applied directly on the main working tree with narrow, targeted edits and one atomic commit per finding. No concurrent-session conflicts were observed.

## Fixed Issues

### CR-01: Lockout race condition — concurrent requests defeat the PIN rate limit

**Files modified:** `supabase/migrations/0003_lockout_rpc.sql` (new), `supabase/functions/verify-pin/index.ts`
**Commit:** d926dfd
**Applied fix:** New migration 0003 adds a `SECURITY DEFINER` RPC `public.record_pin_failure(p_handle text)` that performs count-and-lock in a single atomic statement (`INSERT ... ON CONFLICT DO UPDATE` with a server-computed `failed_count + 1`; lock at ≥5 for 15 minutes — D-07 semantics identical). The function now calls the RPC for every failure and trusts only the RPC's **returned** count, never the pre-read state. Frontend contract preserved: 5th failure still returns 401 with `attempts_remaining: 0`; 429 with `retry_after_seconds` unchanged (gate read on the next request sees the RPC-set `locked_until`). `MAX_ATTEMPTS`/`LOCKOUT_MINUTES` remain the single source in `_shared/lockout.ts`, cross-referenced in the RPC comment and a `COMMENT ON FUNCTION` note.
**Tests added:** none (requires a live DB; existing lockout tests still pass — D-07 constants pinned).
**⚠ Requires human verification:** the RPC's atomicity and lock semantics should be confirmed against the live DB after migration 0003 is pushed (e.g. fire parallel wrong-PIN requests and confirm the counter increments monotonically and locks at 5).

### CR-02: `loadSession()` crashes on malformed storage; `saveSession()` accepts any shape

**Files modified:** `src/features/auth/session.ts`, `src/features/auth/LoginPage.tsx`, `src/features/auth/session.test.ts`
**Commit:** cba08b4
**Applied fix:** Added exported `isValidSession()` type guard (checks all 5 fields incl. non-empty token/name, valid role enum, finite numeric `expires_at`). `loadSession()` now wraps `JSON.parse` in try/catch, validates the parsed shape, and self-heals by calling `clearSession()` on any invalid/corrupted value — no more render crash or permanent white screen. `saveSession()` no-ops on invalid input (defense in depth, signature unchanged). `LoginPage` validates the 200 body's `session` field before `saveSession`/`onLogin`; an invalid body is treated as `NETWORK_ERROR`. Session API (saveSession/loadSession/clearSession/isExpired) unchanged — existing tests and `RequireAuth` keep working.
**Tests added:** 6 new tests (corrupted JSON `"undefined"`, unparseable JSON, missing fields, wrong role/empty token/non-number expires_at, saveSession no-op, self-heal round-trip).

### WR-01: Timing side-channel defeats the "no user enumeration" guarantee

**Files modified:** `supabase/functions/verify-pin/index.ts`
**Commit:** 7f2874e
**Applied fix:** Missing/inactive handles now run a dummy `bcrypt.compareSync(pin, DUMMY_HASH)` (a real bcryptjs-generated hash, cost 10) before returning the identical 401 — both paths burn ~equal time, closing the latency oracle.
**Tests added:** none (timing property not unit-testable meaningfully).

### WR-02: `active=false` does not revoke already-minted tokens — RLS never checks `active`

**Files modified:** `supabase/migrations/0004_rls_active.sql` (new)
**Commit:** da6aecd
**Applied fix:** New migration drops and recreates `member_select_own`, `member_select_own_submissions`, and `member_insert_own_submissions` with an `active` check (members subquery read via RLS, so no privilege escalation; submission_stats revoked transitively via its `exists` subquery on submissions). Uses `drop policy if exists` so it applies cleanly to both fresh and already-migrated databases.
**Tests added:** none (requires a live DB).

### WR-03: Supabase query errors ignored — transient DB failures count as login failures or 500

**Files modified:** `supabase/functions/verify-pin/index.ts`
**Commit:** 488e41b
**Applied fix:** All query results now check `error` and return 500 (`server_error`) on infra failures: lockout read (previously fail-open on the gate), member lookup (previously burned the user's attempt), and the success-path reset upsert. RPC failures inside `recordFailure` are caught and return 500 without recording a failure. "Credentials wrong" (record failure) is now distinguished from "server broken" (do not record).
**Tests added:** none (Edge Function requires live infra).

### WR-04: Unbounded `discord_handle` + attacker-writable rows

**Files modified:** `supabase/functions/verify-pin/index.ts`, `supabase/migrations/0003_lockout_rpc.sql`
**Commit:** bd7b7ac
**Applied fix:** Server-side `trim()` + max-64 validation (400 `invalid_request` otherwise); the canonical trimmed handle is used for the lockout key, member lookup, and reset upsert (whitespace variants no longer create junk keys). DB-level `char_length(discord_handle) <= 64` check constraints added to `members` and `pin_login_attempts` in migration 0003 (defense in depth for any other writer).
**Tests added:** none (validation is I/O-adjacent; pure-logic surface unchanged).

### WR-05: Missing `NEFOOT_JWT_SECRET` fails open

**Files modified:** `supabase/functions/verify-pin/index.ts`
**Commit:** bd3d790
**Applied fix:** Fail-fast guard at the top of the handler for all four env secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEFOOT_JWT_SECRET`, `NEFOOT_JWT_KEY_ID`) returning 500 `server_misconfigured`. The JWT wiring itself (HS256 + kid header from those env names) is unchanged per the project's operational constraints.
**Tests added:** none (env-dependent).

### WR-06: Committed seed credentials with disclosed plaintext PIN

**Files modified:** `supabase/seeds/whitelist.sql`
**Commit:** 237f697
**Applied fix:** Removed the plaintext disclosure ("all three use PIN 1234") from the seed comment; hashes only, with an explicit note that the hashes must be treated as compromised once the repo is shared/made public.
**Tests added:** none.
**⚠ Owner action required:** the hashes (and the removed plaintext, in git history) remain recoverable from prior commits — rotation before sharing access with real members is mandatory, not optional. See owner actions below.

### WR-07: "undefined tentativas restantes" — gateway 401s render a nonsense error

**Files modified:** `src/features/auth/LoginPage.tsx`
**Commit:** fb122e9
**Applied fix:** The 401 branch now checks `typeof remaining !== 'number' || remaining <= 0` and falls back to `Discord ou PIN incorreto.` (no count interpolated); the singular/plural wording is kept when a valid count is present. Gateway-401 bodies (no `attempts_remaining`) no longer render "undefined tentativas restantes".
**Tests added:** none (UI copy; component has no test harness — logic is a simple guard).

### WR-08: No `test` script — three test files exist but nothing runs them

**Files modified:** `package.json`
**Commit:** 3cbabc2
**Applied fix:** Added `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`. `npm test` now runs all 41 tests.
**Tests added:** n/a.

### WR-09: `ocr-regions.json` carries dead config knobs

**Files modified:** `scripts/ocr-regions.json`
**Commit:** a9782cd
**Applied fix:** Deleted the dead top-level `threshold` and `categories` keys (the spike never read them; `ACCURACY_THRESHOLD` in `ocr-spike.mjs` drives behavior) and documented the hardcoded threshold in the calibration note so a JSON edit can never silently do nothing. Verified the JSON still parses with all 11 groups intact and `node scripts/ocr-spike.mjs --self-test` runs end-to-end with the same GO verdict.
**Tests added:** none (self-test verified manually).

## Skipped Issues

None — all in-scope findings were fixed.

## Owner-Action Items (external infra / manual steps)

1. **Push migration 0003 (`0003_lockout_rpc.sql`) to the live Supabase project** via the Management API database/query endpoint. Until pushed, the live `verify-pin` will return 500 `server_error` on failed logins (RPC missing) — **push before the next deploy of the function**. Do the same for **migration 0004 (`0004_rls_active.sql`)** (no urgency dependency, but required for the active-check revocation to take effect live).
2. **Deploy the updated `verify-pin` function** to the live project (the function code changes must be pushed for CR-01/WR-01/WR-03/WR-04/WR-05 to take effect).
3. **Rotate the seeded credentials before launch** (WR-06): the placeholder hashes — and the disclosed plaintext in git history — must be treated as compromised on any repo share; replace handles/PINs/hashes with real members per the seed's documented procedure.
4. **Confirm CR-01's atomicity against the live DB** after migration 0003 is pushed (parallel wrong-PIN requests → monotonic counter, lock at 5).
5. *(Deferred by design, per review IN-04)*: victim-lockout mitigation via client-IP keying remains a later-phase item.

---

_Fixed: 2026-10-09T02:30:00Z_
_Fixer: OpenCode (gsd-code-fixer)_
_Iteration: 1_
