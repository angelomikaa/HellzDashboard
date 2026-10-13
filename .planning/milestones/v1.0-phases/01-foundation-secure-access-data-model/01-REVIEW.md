---
phase: 01-foundation-secure-access-data-model
reviewed: 2026-10-08T21:30:15Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - .env.example
  - .gitignore
  - index.html
  - package.json
  - scripts/hash-pin.mjs
  - scripts/ocr-regions.json
  - scripts/ocr-samples-expected.example.json
  - scripts/ocr-spike.accuracy.test.mjs
  - scripts/ocr-spike.mjs
  - src/App.tsx
  - src/features/auth/LoginPage.tsx
  - src/features/auth/RequireAuth.tsx
  - src/features/auth/session.test.ts
  - src/features/auth/session.ts
  - src/index.css
  - src/lib/supabase.ts
  - src/main.tsx
  - src/vite-env.d.ts
  - supabase/config.toml
  - supabase/functions/_shared/lockout.test.ts
  - supabase/functions/_shared/lockout.ts
  - supabase/functions/verify-pin/index.ts
  - supabase/migrations/0001_schema.sql
  - supabase/migrations/0002_rls.sql
  - supabase/seeds/whitelist.sql
  - vite.config.ts
findings:
  critical: 2
  warning: 9
  info: 6
  total: 17
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-08T21:30:15Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Phase 1 scope (PIN gate, session, RLS foundation, OCR spike) was reviewed file-by-file with cross-references between the Edge Function, the RLS migrations, and the frontend auth flow. The overall structure is sound: RLS is enabled on every table from day one, `class_key_stats` is deny-all (AGENTS.md key-stat rule respected), submissions have no UPDATE/DELETE policies (append-only respected), the lockout constants match D-07, and the shared-401 shape blocks response-body user enumeration.

However, the adversarial pass found **2 blockers** and **9 warnings**:

1. **The D-07 lockout is bypassable by concurrency.** The failed-count is a read-modify-write upsert, not an atomic increment — parallel requests all read the same counter and the effective attempt limit collapses. With a 4-digit PIN (10,000 keyspace) this converts the rate limit from a hard stop into a soft suggestion.
2. **The auth gate can crash the app unrecoverably.** `loadSession()` does a bare `JSON.parse` of localStorage, and `saveSession()` persists whatever the server returned with no shape validation. A malformed 200 response (or any corrupted storage value) writes/reads garbage, throws inside `RequireAuth`'s render, and leaves a permanent white screen until the user manually clears localStorage.

Additionally: the "no user enumeration" guarantee (T-01-07) is defeated by a timing side-channel (bcrypt only runs on the wrong-PIN path); `active=false` does not revoke an already-minted 7-day token because no RLS policy checks `active`; and several input-validation/error-handling gaps exist in `verify-pin`.

## Critical Issues

### CR-01: Lockout race condition — concurrent requests defeat the PIN rate limit

**File:** `supabase/functions/verify-pin/index.ts:70-94`
**Issue:** The lockout gate is read-then-write (TOCTOU): the state is read at line 70-74, and the failure is recorded at line 87-92 with a client-computed `failed_count` (`nextFailureState(lockState, now)`), i.e. a non-atomic read-modify-write upsert. Two concurrent requests both read `failed_count: 0`, both write `failed_count: 1`. An attacker firing N parallel requests keeps the effective counter near 1 and never reaches `MAX_ATTEMPTS`. With a 4-digit PIN (10,000 combinations), this breaks D-07's server-side rate limit: instead of 5 tries / 15 min, an attacker gets as many tries as the gateway allows per request, and brute-forces the PIN space in hours. This is exactly the class of bug the "rate-limit PIN attempts server-side" AGENTS.md rule exists to prevent.
**Fix:** Make count-and-lock a single atomic statement, e.g. a `SECURITY DEFINER` RPC:

```sql
create or replace function public.record_pin_failure(p_handle text)
returns table (failed_count int, locked_until timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  insert into pin_login_attempts (discord_handle) values (p_handle)
  on conflict (discord_handle) do update
    set failed_count = pin_login_attempts.failed_count + 1,
        locked_until = case
          when pin_login_attempts.failed_count + 1 >= 5
            then now() + interval '15 minutes'
          else null end,
        updated_at = now()
  returning pin_login_attempts.failed_count, pin_login_attempts.locked_until;
end $$;
```

Then in the function: call the RPC for every failure and read the *returned* count (never the pre-read state), and perform the lock check either inside the same transaction (`select ... for update`) or by re-checking `locked_until` returned by the RPC. Keep `MAX_ATTEMPTS`/`LOCKOUT_MINUTES` in `_shared/lockout.ts` as the single source the RPC is validated against.

### CR-02: `loadSession()` crashes on malformed storage; `saveSession()` accepts any shape — permanent unrecoverable white screen

**File:** `src/features/auth/session.ts:14-21` (with `src/features/auth/LoginPage.tsx:47-50`, `src/features/auth/RequireAuth.tsx:15-22`)
**Issue:** Two chained defects in the auth gate:

1. `LoginPage` line 48-50 does `const data: { session } = await res.json(); saveSession(data.session)` with no shape validation. If a 200 response lacks `session` (a deploy glitch, a proxy rewriting the body, any future server change), `JSON.stringify(undefined)` is `undefined`, and `localStorage.setItem` coerces it to the literal string `"undefined"` — poisoning the key.
2. `loadSession()` (line 20) does `JSON.parse(raw)` with no try/catch. `JSON.parse("undefined")` throws a `SyntaxError`. This throw happens inside `RequireAuth`'s `useState` initializer (line 16), i.e. during render — React unmounts the tree and the user gets a white screen. Because `clearSession()` is never reached, **the app is permanently broken for that browser profile until the user manually clears localStorage** — there is no self-recovery.

The same crash triggers on any pre-existing garbage under the `neofoot_session` key.
**Fix:**

```ts
export function loadSession(): NeoFootSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<NeoFootSession> | null
    const valid =
      s && typeof s.access_token === 'string' && s.access_token.length > 0 &&
      typeof s.member_id === 'string' &&
      typeof s.display_name === 'string' &&
      (s.member_role === 'member' || s.member_role === 'officer' || s.member_role === 'owner') &&
      typeof s.expires_at === 'number'
    if (!valid) {
      clearSession()
      return null
    }
    return s as NeoFootSession
  } catch {
    clearSession()
    return null
  }
}
```

And in `LoginPage`, validate `data.session` (same shape check) before calling `saveSession`/`onLogin`; treat an invalid 200 body as `NETWORK_ERROR`.

## Warnings

### WR-01: Timing side-channel defeats the T-01-07 "no user enumeration" guarantee

**File:** `supabase/functions/verify-pin/index.ts:105-107`
**Issue:** Missing/inactive handles return at line 105 immediately; wrong-PIN requests run `bcrypt.compareSync` (line 107, ~100ms at cost 10). The 401 bodies are identical, but the latency difference is a clean oracle for whether a Discord handle exists in the whitelist — exactly what T-01-07 claims to prevent. Remote timing over noisy networks is feasible with averaging.
**Fix:** Equalize the paths with a dummy compare:

```ts
const DUMMY_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO7VTZi5XnCzU1FJ0y0ZK9z5O1pZ2qAe' // any valid bcrypt hash
if (!member || member.active === false) {
  bcrypt.compareSync(pin, DUMMY_HASH) // burn equal time; discard result
  return await invalidCredentials()
}
```

### WR-02: `active=false` does not revoke already-minted 7-day tokens — RLS never checks `active`

**File:** `supabase/migrations/0002_rls.sql:11-13` (and `supabase/migrations/0001_schema.sql:8`)
**Issue:** `0001_schema.sql:8` documents "Phase 6 removal revokes access via active=false", and `verify-pin` correctly refuses login for inactive members. But every RLS policy (`member_select_own`, both submission policies) matches only on `member_id` — none checks the member's current `active` flag. A member deactivated the day after login keeps full data access for up to 7 days (the token lifetime), and nothing short of key rotation revokes the token. This is an authorization gap against the AGENTS.md rule that removal revokes access.
**Fix:** Add the active check to the policies now (cheap; prevents a Phase 6 surprise):

```sql
create policy member_select_own on members
  for select to authenticated
  using (id::text = auth.jwt()->>'member_id' and active);

create policy member_select_own_submissions on submissions
  for select to authenticated
  using (member_id::text = auth.jwt()->>'member_id'
    and exists (select 1 from members m
                where m.id = member_id and m.active));
```

(Repeat for the insert policies; members is read via RLS in the subquery so no privilege escalation.)

### WR-03: Supabase query errors are ignored — transient DB failures count as login failures or 500

**File:** `supabase/functions/verify-pin/index.ts:70-74, 87-92, 99-103, 111-116`
**Issue:** All `admin.from(...)` results destructure only `data` and ignore `error`. Consequences: (a) if the member lookup fails transiently, `member` is `undefined` and the user's wrong-credentials 401 is returned while `recordFailure()` still increments the lockout — a DB hiccup burns users' attempts and can lock out the whole guild; (b) if the success-path reset upsert (line 111-116) throws, the correct-PIN user gets a 500; (c) if the lockout read (line 70-74) fails, the lock state silently reads as zeroed (fail-open on the gate).
**Fix:** Check `error` on each query and fail loudly (500) *without* recording a failure when the failure was infra-side, e.g.:

```ts
const { data: attemptsRow, error: readErr } = await admin.from('pin_login_attempts')...
if (readErr) return json({ error: 'server_error' }, 500)
```

Distinguish "credentials wrong" (record failure) from "server broken" (do not record).

### WR-04: Unbounded `discord_handle` + attacker-writable `pin_login_attempts` rows (storage DoS and targeted victim lockout)

**File:** `supabase/functions/verify-pin/index.ts:54-59` (validation), `supabase/migrations/0001_schema.sql:40-45` (schema)
**Issue:** The handle is validated only as a non-empty string — no max length, no trimming. Every request (even for nonexistent handles) upserts a `pin_login_attempts` row keyed by the raw attacker-supplied string. Two abuse vectors: (a) unbounded-length handles and unlimited distinct junk handles let anyone fill the free-tier DB with garbage rows — there is no cleanup job; (b) lockout is keyed solely on the victim's handle, so anyone who knows a member's handle can lock them out for 15 minutes at a time (targeted DoS). Note also that `' owner-handle'` and `'owner-handle'` are different keys: a user typing trailing whitespace both fails login and creates junk rows.
**Fix:** Server-side: `const handle = discordHandle.trim(); if (handle.length === 0 || handle.length > 64) return json({ error: 'invalid_request' }, 400);` and consider adding `check (char_length(discord_handle) <= 64)` on both `members.discord_handle` and `pin_login_attempts.discord_handle`. To mitigate victim lockout, consider also keying (or augmenting) the limit by client IP in a later phase. Trim consistently at seed time and login time so the key is canonical.

### WR-05: Missing `NEFOOT_JWT_SECRET` fails open — JWTs get signed with the literal string "undefined"

**File:** `supabase/functions/verify-pin/index.ts:124-125`
**Issue:** `new TextEncoder().encode(Deno.env.get('NEFOOT_JWT_SECRET')!)` — if the secret is not configured, `encode(undefined)` encodes the string `"undefined"` and the function happily mints HS256 tokens signed with a 9-byte known constant instead of failing. Same for `NEFOOT_JWT_KEY_ID` (line 125). The result is a silent misconfiguration: 200 responses with tokens that don't authenticate, plus the theoretical foot-gun of a deployment whose platform secret literally equals `"undefined"`. (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are injected by the runtime so they are lower risk, but should get the same guard.)
**Fix:** Fail fast at the top of the handler (or module):

```ts
const jwtSecret = Deno.env.get('NEFOOT_JWT_SECRET')
const jwtKid = Deno.env.get('NEFOOT_JWT_KEY_ID')
if (!jwtSecret || !jwtKid) {
  return json({ error: 'server_misconfigured' }, 500)
}
```

### WR-06: Committed seed credentials with disclosed plaintext PIN

**File:** `supabase/seeds/whitelist.sql:5-10`
**Issue:** The seed commits bcrypt hashes together with a comment that discloses the plaintext ("all three use PIN 1234") and the exact handles (`owner-handle`, `officer-handle`, `member-handle`) and roles. Anyone with repo read access can log in as the owner if the project is deployed before rotation. The "rotate before launch" note mitigates intent, not practice — the credential triple (handle + plaintext + hash) sitting in git history is a standing deployment foot-gun, and nothing enforces rotation.
**Fix:** At minimum, move the comment's plaintext disclosure out of the repo (keep hashes only), and consider seeding zero rows with a documented bootstrap procedure instead. If the repo is or ever becomes public, rotate before launch is not optional — treat these hashes as compromised on push.

### WR-07: "undefined tentativas restantes" — gateway 401s render a nonsense error

**File:** `src/features/auth/LoginPage.tsx:63-70`
**Issue:** The 401 branch interpolates `body.attempts_remaining` without checking it exists. The file's own comment (line 38-41) documents that the `/functions/v1` gateway can 401 *before* the function runs (missing/rotated anon key) — in that case the response body has no `attempts_remaining`, and the user sees `Discord ou PIN incorreto — undefined tentativas restantes.` Same for `remaining === 0` ("0 tentativas restantes" right before a lockout that the UI doesn't announce).
**Fix:**

```ts
if (res.status === 401) {
  const remaining = body.attempts_remaining
  if (typeof remaining !== 'number' || remaining <= 0) {
    setStatus({ kind: 'error', message: 'Discord ou PIN incorreto.' })
  } else {
    setStatus({ kind: 'error', message: remaining === 1
      ? 'Discord ou PIN incorreto — 1 tentativa restante.'
      : `Discord ou PIN incorreto — ${remaining} tentativas restantes.` })
  }
  setPin('')
  pinInputRef.current?.focus()
  return
}
```

### WR-08: No `test` script — three test files exist but nothing runs them

**File:** `package.json:6-14`
**Issue:** `vitest` is a devDependency and there are three test suites (`session.test.ts`, `lockout.test.ts`, `ocr-spike.accuracy.test.mjs`), but `scripts` has no `test` entry. Tests must be invoked via `npx vitest`, which CI and contributors will not discover; the D-07 lockout invariants and session behavior are effectively unenforced.
**Fix:** Add `"test": "vitest run"` (and optionally `"test:watch": "vitest"`) to `scripts`.

### WR-09: `ocr-regions.json` carries dead config knobs that silently do nothing

**File:** `scripts/ocr-regions.json:3-4` (vs `scripts/ocr-spike.mjs:38, 152`)
**Issue:** The region map declares `"threshold": 0.7` and `"categories": [...]` at top level, but the spike never reads them — `ACCURACY_THRESHOLD` (line 38) and the per-group `category` fields are what actually drive behavior. Someone raising the JSON threshold to 0.8 would see no effect and might record a wrong GO verdict. Same class of trap as a commented-out constant.
**Fix:** Either read `regions.threshold ?? ACCURACY_THRESHOLD` in `runSpike`/`printReport`, or delete the `threshold` and `categories` keys from the JSON and keep them documented in the calibration note only.

## Info

### IN-01: CORS `Access-Control-Allow-Origin: *` on the auth endpoint

**File:** `supabase/functions/verify-pin/index.ts:17-21`
**Issue:** Any origin can invoke the login endpoint from a browser. Impact is limited (the anon key is public and the lockout is server-side — modulo CR-01), but a login endpoint has no reason to be callable from arbitrary sites.
**Fix:** Set `Access-Control-Allow-Origin` to the deployed panel origin (configurable via env), and keep the preflight for the Supabase domain used in local dev.

### IN-02: `enable_signup = true` leaves an unused auth surface open

**File:** `supabase/config.toml:177` (and `:222` for email)
**Issue:** The app authenticates exclusively via the custom PIN JWT; GoTrue signups are never used. Leaving signup enabled lets anyone create `authenticated`-role platform users. RLS denies them data (no `member_id` claim matches), but it is free attack surface and store filler.
**Fix:** Set `enable_signup = false` (local dev config too — nothing in Phase 1 needs it).

### IN-03: `src/lib/supabase.ts` is dead code that throws at import time

**File:** `src/lib/supabase.ts:1-10`
**Issue:** Nothing imports it (verified by grep: `LoginPage` uses raw `fetch`, `App`/`RequireAuth` use session helpers). Worse, it throws at module scope on missing env vars, so the first future import without a populated `.env` crashes the whole app at load rather than at call time.
**Fix:** Either delete it until a feature needs it, or lazily create the client inside an accessor function and have callers handle the missing-env error.

### IN-04: Lockout UX edges — 5th failure announces "0 tentativas restantes"; `locked` state never auto-clears

**File:** `supabase/functions/verify-pin/index.ts:93` + `src/features/auth/LoginPage.tsx:76-84`
**Issue:** The 5th failure returns 401 with `attempts_remaining: 0` — the client tells the user "0 tentativas restantes" instead of saying they're now locked. Conversely, once `status.kind === 'locked'`, inputs stay disabled forever (no timer, no re-enable), so after the server lock expires the user must refresh the page.
**Fix:** Server: return the 429 lock response (with `retry_after_seconds`) on the locking attempt itself. Client: schedule a timeout to flip `locked` back to `idle` when `retry_after_seconds` elapses.

### IN-05: Unknown `ocr-spike.mjs` flags silently run the real-data spike

**File:** `scripts/ocr-spike.mjs:589-597`
**Issue:** Any unrecognized argv token (typos like `--info2`) falls into the `else` branch and runs `runSpike()` against the real screenshots instead of reporting the bad flag.
**Fix:** Make the final `else` explicit: `else if (mode === '') await runSpike(); else { console.error('Unknown flag:', mode); print usage; exit 1 }`.

### IN-06: Seed `on conflict do update` silently reverts manual role/active changes

**File:** `supabase/seeds/whitelist.sql:11-15`
**Issue:** If an operator promotes a member via Studio/SQL (role/active/pin_hash) and later re-runs `supabase db reset` (or the seed re-runs for any reason), the upsert reverts those fields to the seed values for any handle that matches a seed row. No guard or warning exists.
**Fix:** Document the operational rule next to the seed ("member admin is seed-file-driven; edits made elsewhere are lost on re-seed"), or drop the `do update` and use `on conflict do nothing` once real members exist.

---

Positive security checks verified during this review (no findings): `class_key_stats` has no policies → deny-all for anon/authenticated (key-stat config never crosses the API boundary); `pin_login_attempts` has no policies → service-role-only; submissions have no UPDATE/DELETE policies (append-only); `stat_catalog` is read-only for authenticated; all tables have RLS enabled in both migrations; PINs are stored only as bcrypt hashes; the 401 body shape is identical for missing handle / inactive member / wrong PIN; the OCR spike correctly refuses to run without the gitignored real screenshots and never reads images from outside `.secrets/ocr-samples/`.

_Reviewed: 2026-10-08T21:30:15Z_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
