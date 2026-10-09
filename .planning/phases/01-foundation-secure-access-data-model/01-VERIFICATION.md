---
phase: 01-foundation-secure-access-data-model
verified: 2026-10-08T21:41:13Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Disposition of the 2 BLOCKER findings from 01-REVIEW.md (CR-01 lockout race condition, CR-02 session parse crash)"
    expected: "Human decides: accept as follow-up fixes (recommended: schedule via gsd-code-review-fix BEFORE real members are invited / before Phase 5) or reject and require fixes inside Phase 1"
    why_human: "Both findings sit outside the phase success criteria as literally stated (all 4 SCs are verified, including live and owner-browser evidence), but the code review classified them as critical/blocker. Accepting known-security-hardening debt vs. blocking the phase transition is a risk decision only the owner can make."
---

# Phase 1: Foundation — Secure Access & Data Model Verification Report

**Phase Goal:** Whitelisted guild members can securely access the panel on an RLS-ready schema, and OCR feasibility is decided with real data before anything is built on it.
**Verified:** 2026-10-08T21:41:13Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All four ROADMAP success criteria were verified against the actual codebase AND live infrastructure — not just SUMMARY claims. Automated checks were re-run independently during this verification: full test suite (35/35), `tsc --noEmit` + `vite build` (green), the OCR spike on the real screenshots (222/222, GO), and read-only live API probes against the deployed Supabase project.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A whitelisted member can log in with their personal 4-digit PIN (stored hashed), stay logged in across page reloads, and log out | ✓ VERIFIED | `LoginPage.tsx` POSTs `{discord_handle, pin}` to live `/functions/v1/verify-pin` (line 34-45); `session.ts` persists to localStorage key `nefoot_session`; `RequireAuth.tsx` restores on mount with silent expiry; `App.tsx` logout calls `clearSession()`+`invalidate()`. PINs bcrypt-hashed in DB (`whitelist.sql` `$2b$10$…`; `verify-pin` uses `bcrypt.compareSync`). Owner browser-verified the full loop (login, reload persistence, logout, lockout) on 2026-10-08 at localhost:5173 against the deployed function. Session helper tests 4/4 green. ⚠️ CR-02 edge case (see Warnings) |
| 2 | A player not on the whitelist cannot access any panel data — blocked at the server (RLS), not just UI; crafted API requests fail too | ✓ VERIFIED | Re-probed LIVE during this verification: anon-key GET `/rest/v1/members` → **200 `[]`** (no rows leak); no-auth GET → **401**; anon GET `/rest/v1/class_key_stats` → **200 `[]`** (deny-all holds). `0002_rls.sql`: RLS enabled on all 6 tables, members SELECT own row only via `auth.jwt()->>'member_id'`, no INSERT/UPDATE/DELETE on members, class_key_stats/pin_login_attempts have zero policies (deny-all). Plan 01-02 live smoke additionally proved Bearer JWT → own row only. ⚠️ WR-02: `active=false` not checked by RLS policies (see Warnings) |
| 3 | Repeated wrong PIN attempts trigger server-side rate limiting/lockout | ✓ VERIFIED | `lockout.ts` (MAX_ATTEMPTS=5, LOCKOUT_MINUTES=15) + `verify-pin/index.ts` DB-backed lockout gate (lines 70-94): lockout check → 429 with `retry_after_seconds`; failures upsert counter; success resets. Lockout unit tests 6/6 green. Plan 01-02 live smoke: 401 remaining 4,3,2,1,0 → 429 `locked` (retry_after 898s); correct PIN refused while locked. Owner browser-verified the lockout UX. ⚠️ CR-01: counter is non-atomic (see Warnings — human decision requested) |
| 4 | OCR feasibility spike completed: round-trip test on real guild screenshots with a documented go/no-go accuracy decision (~70% pivot threshold) | ✓ VERIFIED | **Independently re-ran `node scripts/ocr-spike.mjs` during this verification: 222/222 fields, 100.0% accuracy, VERDICT: GO** (basic 6/6, ideal 65/65, common 151/151). Real data confirmed on disk: 11 screenshots in gitignored `.secrets/ocr-samples/` (11th `sampbasic.png` owner-endorsed addition). `OCR-SPIKE-RESULTS.md` documents the GO decision, methodology, per-category and per-screenshot breakdowns, and Phase 5 caveats. 25 accuracy-math tests green. Region maps (`ocr-regions.json`) cover all 11 groups; spike is re-runnable (ran deterministically) |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0001_schema.sql` | 6 tables, unique discord_handle, RLS from day one | ✓ VERIFIED | 6 `create table` stmts, `discord_handle text not null unique`, RLS enabled on all 6 tables; live (anon GET 200 `[]` proves deployed) |
| `supabase/migrations/0002_rls.sql` | RLS enablement + per-table policies | ✓ VERIFIED | 6 enable stmts, own-row SELECT/INSERT policies, zero update/delete policies, class_key_stats/pin_login_attempts policy-free (deny-all) |
| `supabase/functions/verify-pin/index.ts` | Lockout → bcrypt compare → JWT mint | ✓ VERIFIED | 147 substantive lines; `SignJWT` HS256, 7-day exp, `role:'authenticated'`+`member_id`+`member_role` claims, kid header; deployed live (400 invalid_request probe reached the function) |
| `supabase/functions/_shared/lockout.ts` | Pure lockout functions | ✓ VERIFIED | Exports isLocked/retryAfterSeconds/nextFailureState/resetState; 6/6 tests green |
| `supabase/seeds/whitelist.sql` | Re-runnable upsert seed, bcrypt hashes | ✓ VERIFIED | 3 rows with `$2b$10$` hashes, `on conflict (discord_handle) do update` |
| `scripts/hash-pin.mjs` | bcrypt hash CLI helper | ✓ VERIFIED | bcryptjs, 4-digit validation |
| `.env.example` | VITE_* vars only, no server secrets | ✓ VERIFIED | Exactly 2 VITE_ lines; no service_role/JWT secret |
| `src/lib/supabase.ts` | Env-driven Supabase client | ⚠️ ORPHANED | Exists and substantive (`createClient(env, env)`), but nothing imports it yet (LoginPage uses raw fetch by design) — matches review IN-03. Env-driven credential truth holds via `import.meta.env` in LoginPage. Deliberate: no consumer until Phase 2 |
| `src/features/auth/session.ts` | save/load/clear/isExpired helpers | ✓ VERIFIED | All 4 exports present; 4/4 tests green |
| `src/features/auth/LoginPage.tsx` | Login form wired to verify-pin | ✓ VERIFIED | fetch POST with apikey+Bearer headers, 401/429 UX, masked 4-digit PIN input |
| `src/features/auth/RequireAuth.tsx` | Route guard with silent expiry | ✓ VERIFIED | isExpired → clearSession → LoginPage |
| `scripts/ocr-spike.mjs` | Re-runnable region-based OCR spike | ✓ VERIFIED | `tessedit_char_whitelist`, `user_defined_dpi`, exports parseValue/computeAccuracy/verdict, `.secrets/ocr-samples` guard, `--dump-candidates` mode; re-ran live during verification |
| `scripts/ocr-regions.json` | Region maps per screenshot group | ✓ VERIFIED | 11 groups matching the 11 real screenshots |
| `scripts/ocr-spike.accuracy.test.mjs` | Accuracy/verdict math tests | ✓ VERIFIED | 25/25 green (incl. 0.7 GO / 0.6 NO-GO boundary) |
| `OCR-SPIKE-RESULTS.md` | Documented go/no-go decision | ✓ VERIFIED | GO with 222/222 = 100.0% vs 70% threshold, per-category tables, decision record |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/lib/supabase.ts` | VITE_* env vars | createClient(env, env) | ✓ WIRED | Pattern correct; artifact itself not yet consumed (see ORPHANED note) |
| `0001_schema.sql` | live Supabase project | db push | ✓ WIRED | Live probes return 200 `[]`/401 — tables exist with RLS active |
| `verify-pin/index.ts` | jose SignJWT + signing key | HS256 + kid header | ✓ WIRED | Lines 123-136; live probe + owner login prove it |
| `0002_rls.sql` | `auth.jwt()` | member_id custom claim | ✓ WIRED | 5 policies read `auth.jwt()->>'member_id'` |
| LoginPage | `/functions/v1/verify-pin` | fetch POST both gateway headers | ✓ WIRED | Line 34-45; owner logged in live |
| LoginPage | `session.ts` | saveSession on 200 | ✓ WIRED | Line 48-50 |
| RequireAuth | isExpired/clearSession | silent expiry on mount | ✓ WIRED | Lines 15-22 |
| `ocr-spike.mjs` | `.secrets/ocr-samples/` | guarded real-data load | ✓ WIRED | Guard present; ran on the real 11 screenshots |
| `ocr-spike.mjs` | `scripts/ocr-regions.json` | region-based recognition | ✓ WIRED | 11 groups consumed; 222 regions read |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| LoginPage.tsx | `data.session` | live verify-pin response | Yes (deployed function, owner-verified login) | ✓ FLOWING |
| RequireAuth.tsx | `session` state | `loadSession()` ← localStorage ← verify-pin | Yes | ✓ FLOWING |
| App.tsx | `session.display_name` / `member_role` | RequireAuth render-prop | Yes | ✓ FLOWING |
| ocr-spike.mjs | OCR reads | 11 real PNGs + region maps | Yes (222/222 reproduced) | ✓ FLOWING |

### Behavioral Spot-Checks (run during this verification)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npx vitest run` | 35/35 pass (lockout 6, session 4, OCR math 25) | ✓ PASS |
| Type check + production build | `npx tsc --noEmit && npx vite build` | both exit 0, dist/ emitted | ✓ PASS |
| OCR spike on real data | `node scripts/ocr-spike.mjs` | 222/222, 100.0%, VERDICT: GO | ✓ PASS |
| Live RLS: anon read blocked | GET `/rest/v1/members` (anon key) | HTTP 200 `[]` — no rows | ✓ PASS |
| Live RLS: no-auth rejected | GET `/rest/v1/members` (no headers) | HTTP 401 | ✓ PASS |
| Live deny-all key stats | GET `/rest/v1/class_key_stats` (anon) | HTTP 200 `[]` | ✓ PASS |
| Live verify-pin deployed + validating | POST invalid body `{pin:"12"}` | HTTP 400 `{"error":"invalid_request"}` (pre-DB validation; no state written) | ✓ PASS |
| Secrets hygiene | `git check-ignore .secrets` / `.env.example` content | `.secrets` ignored; only VITE_* vars | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|---------------------|----------|
| AUTH-01 | 01-01, 01-02, 01-03 | Player can access the panel with their personal 4-digit PIN (stored hashed) | ✓ SATISFIED | bcrypt-hashed PINs, live verify-pin, login UI, owner browser verification 2026-10-08; marked Complete in REQUIREMENTS.md |
| AUTH-02 | 01-01, 01-02 | Only whitelisted guild members can access; non-members blocked | ✓ SATISFIED | RLS on all 6 tables, own-row-only policies, deny-all key stats; live probes this verification; marked Complete in REQUIREMENTS.md |

Orphaned requirements check: REQUIREMENTS.md maps no other REQ-IDs to Phase 1 (AUTH-03/04/05 → Phase 6; everything else → Phases 2-6). Plan 01-04 declares `requirements: []` with explicit justification — the OCR spike serves ROADMAP success criterion 4, and no REQ-ID is mapped to it in REQUIREMENTS.md. No orphans, no unclaimed Phase-1 requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/App.tsx` | 37-41 | "panel em construção" placeholder main view | ℹ️ Info | By design — Phase 1 scope is auth only; Phase 2+ replaces it |
| `supabase/functions/verify-pin/index.ts` | 17-21 | CORS `Allow-Origin: *` on auth endpoint | ℹ️ Info | Review IN-01 — limited impact (anon key public, lockout server-side) |
| — | — | No TODO/FIXME/empty-handler/console.log stubs found in src/, supabase/, scripts/ | — | Clean |

### Human Verification Required

### 1. Review BLOCKER disposition (decision, not a test)

**Test:** Decide the fate of the two BLOCKER findings in `01-REVIEW.md` (reviewed 2026-10-08, status: issues_found — 2 critical, 9 warnings).
**Expected:** Choose one: (a) accept both as follow-up fixes — recommended scheduling is a `/gsd-code-review-fix` pass BEFORE real members are invited and before Phase 5 builds on the OCR/session code; or (b) reject acceptance and require fixes inside Phase 1.
**Why human:** Both findings fall outside the phase success criteria as literally stated — every SC is verified including live probes and the owner's own browser evidence — but they are real weaknesses the adversarial code review classified as critical. Accepting known hardening debt vs. blocking transition is a risk decision only the owner can make.

Assessment of each against the success criteria (verifier judgment):

- **CR-01 — lockout race condition (non-atomic read-modify-write of `pin_login_attempts`).** Does NOT block SC-3 as stated: repeated wrong PIN attempts DO trigger the server-side lockout (proven live: 401 remaining 4→0, then 429; owner browser-verified). However it degrades the criterion's *intent* — a deliberate concurrent attacker can keep the effective counter near 1 and brute-force the 10,000-PIN keyspace, converting the rate limit into "a soft suggestion" (reviewer's words). With placeholder PIN 1234 still committed and no real members yet, this is exploitable only by someone who knows the deployed URL — but it must be fixed before real PINs are distributed. **Recommendation: fix via SECURITY DEFINER atomic upsert (review provides the SQL) before inviting real members.**
- **CR-02 — `loadSession()` bare `JSON.parse` + unvalidated `saveSession()` → unrecoverable white screen on malformed storage/200 body.** Does NOT block SC-1: the login/persist/logout loop works (owner-verified end-to-end). It is a robustness crash on a corrupted-storage/deploy-glitch edge case with no self-recovery (crash occurs inside `RequireAuth`'s render before `clearSession` can run). **Recommendation: apply the try/catch + shape-validation fix from the review; low effort, high robustness.**
- Secondary security warnings worth the owner's attention when scheduling fixes: **WR-02** (`active=false` does not revoke already-minted 7-day tokens — RLS never checks `active`; collides with AUTH-04 in Phase 6, cheap to fix now), **WR-06** (committed seed discloses placeholder PIN 1234 + handles — rotation before real members is mandatory and currently unenforced), **WR-01** (timing side-channel on handle enumeration), **WR-03** (supabase query errors ignored — transient DB failure burns user attempts / fails open).

### Gaps Summary

No success-criterion gaps. All 4 ROADMAP criteria are verified with independent evidence: re-run test suite (35/35), green build, independently reproduced OCR spike (222/222 GO on the real 11 screenshots), and fresh live RLS/auth probes against the deployed project. AUTH-01 and AUTH-02 are genuinely satisfied — server-side enforcement is real, not UI-only, and was confirmed both in code and over the wire.

The single open item is a risk disposition, not a verification failure: the phase's own adversarial code review (01-REVIEW.md) found 2 critical + 9 warning issues that do not contradict any success criterion but represent real hardening debt — most importantly the CR-01 lockout race (weakens brute-force protection, must fix before real members) and CR-02 (auth-gate crash edge case). The verifier judges these follow-up fixes rather than phase blockers; the owner's acceptance or rejection of that judgment is requested above.

Deferred items: none. No later milestone phase covers these review findings (Phase 2-6 SCs address new features; AUTH-04 in Phase 6 touches member removal but the RLS `active` check itself is not in any later SC), so they cannot be silently deferred — they need the owner's scheduling decision.

---

_Verified: 2026-10-08T21:41:13Z_
_Verifier: OpenCode (gsd-verifier)_
