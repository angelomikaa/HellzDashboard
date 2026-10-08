---
phase: 01-foundation-secure-access-data-model
plan: 03
subsystem: auth
tags: [pin-auth, react, vite, tailwind, localstorage, jwt, supabase-edge-functions, vitest]

# Dependency graph
requires:
  - phase: 01-01
    provides: Supabase env client (src/lib/supabase.ts), schema with deny-all RLS, seeded whitelist
  - phase: 01-02
    provides: Live verify-pin Edge Function (POST /functions/v1/verify-pin), HS256 custom JWT sessions, server-side lockout, RLS policies proving own-row-only access
provides:
  - localStorage-backed session helpers (save/load/clear/isExpired, key `nefoot_session`, 7-day expiry)
  - PIN Gate UI: Discord handle + 4-digit PIN login page wired to the live verify-pin function
  - RequireAuth route guard (UX layer) with silent expiry clearing (no banner, D-06)
  - Logout button (one click, no confirmation) returning to the login screen
  - Owner-approved end-to-end browser verification of the full auth loop
affects: [02-registry-ingestion, 03-rank-engine, 04-dashboard, phase-2-plus-ui]

# Tech tracking
tech-stack:
  added: [] # no new libraries — plain fetch + React state
  patterns:
    - "Guards are UX only; RLS is the enforcement layer (never trust client session state)"
    - "fetch to /functions/v1 carries BOTH apikey and Authorization: Bearer <anon> headers (gateway requirement discovered in 01-02)"
    - "Enumeration-safe 401 error copy in pt-BR (never reveals whether handle or PIN was wrong)"
    - "PIN never stored/logged — transient form state + HTTPS request body only, masked input"

key-files:
  created:
    - src/features/auth/session.ts
    - src/features/auth/session.test.ts
    - src/features/auth/LoginPage.tsx
    - src/features/auth/RequireAuth.tsx
  modified:
    - src/App.tsx
    - index.html

key-decisions:
  - "Login fetch sends both apikey and Authorization: Bearer <anon> — the /functions/v1 gateway requires both or the function is never invoked"
  - "Enumeration-safe pt-BR 401 copy: 'Discord ou PIN incorreto — N tentativas restantes' per UI-SPEC (plan's example copy named only the PIN)"
  - "UI rebranded to 'Hellz' with subtitle 'Painel Geral' per owner request; internal identifiers (nefoot_session storage key, NEFOOT_JWT_SECRET, JWT issuer) deliberately NOT renamed to avoid breaking live deployed auth"
  - "index.html lang set to pt-BR to match the UI language conventions"
  - "AUTH-01 verified end-to-end by the owner in a real browser; AUTH-02 (server-side blocking) marked complete retrospectively — it was proven live in 01-02 (anon -> [], no-auth -> 401, own-row-only via JWT)"

patterns-established:
  - "Session shape NeoFootSession { access_token, member_id, display_name, member_role, expires_at } is the client-side auth contract for all future phases"
  - "invalidate() render-prop pattern on RequireAuth for forcing re-render back to LoginPage after logout"

requirements-completed: [AUTH-01, AUTH-02]

# Metrics
duration: 38min
completed: 2026-10-08
---

# Phase 1 Plan 3: PIN Gate UI Summary

**PIN login (Discord handle + 4-digit PIN) wired to the live verify-pin Edge Function, with a 7-day localStorage session, silent expiry, logout, and lockout UX — rebranded to "Hellz / Painel Geral" and owner-approved in a real browser**

## Performance

- **Duration:** 38 min (across two sessions — task 1 + checkpoint pause + continuation)
- **Started:** 2026-10-08T23:14:00Z
- **Completed:** 2026-10-08T23:52:30Z
- **Tasks:** 2 (1 auto TDD + 1 checkpoint:human-verify)
- **Files modified:** 6

## Accomplishments
- Session helpers built TDD-first: 4/4 Vitest tests green (save/load round-trip, expiry, clear, empty-storage)
- Complete PIN auth loop live against the deployed Supabase project: login → 7-day session → reload persists → logout clears
- Lockout UX per D-07: attempts countdown on 401, static lockout hint on 429 (lockout itself server-enforced)
- Owner verified the full flow in a real browser at http://localhost:5173 and approved: "All Approved, working as intended" (2026-10-08)
- UI rebranded to **Hellz — Painel Geral** per owner's correction at the checkpoint

## Task Commits

Each task was committed atomically:

1. **task 1: Session helpers (TDD) + LoginPage + RequireAuth guard + logout wiring**
   - `2bd1ac1` (test) — failing session helper tests (RED)
   - `30d7505` (feat) — localStorage session helpers (GREEN)
   - `5befbe4` (feat) — PIN login page, route guard, logout wiring + design tokens
2. **task 2: Verify login flow end-to-end in a real browser** — checkpoint approved by owner (no code in this task itself); the owner-requested rebrand landed as
   - `6d17bc0` (fix) — rebrand UI to Hellz (Painel Geral)
3. **Checkpoint record:** `c3cc27b` (docs) — STATE.md stop record from prior session

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `src/features/auth/session.ts` — NeoFootSession type + save/load/clear/isExpired (localStorage key `nefoot_session`)
- `src/features/auth/session.test.ts` — 4 Vitest behaviors with an in-memory localStorage shim
- `src/features/auth/LoginPage.tsx` — handle + PIN form, fetch to verify-pin, 401/429/network error UX, Hellz branding
- `src/features/auth/RequireAuth.tsx` — route guard: LoginPage when no/expired session, silent expiry clear
- `src/App.tsx` — RequireAuth-wrapped home showing display_name + role, logout via clearSession + invalidate()
- `index.html` — title "Hellz — Painel Geral", lang="pt-BR"

## Decisions Made
- **Dual headers on the login fetch:** the plan's key_link specified only `apikey`; 01-02 proved the /functions/v1 gateway also requires `Authorization: Bearer <anon>` — the LoginPage sends both.
- **Rebrand scope (owner-directed):** all user-visible strings became "Hellz" / "Painel Geral"; internal identifiers (`nefoot_session` localStorage key, `NEFOOT_JWT_SECRET`/`NEFOOT_JWT_KEY_ID` function secrets, `nefoot-verify-pin` JWT issuer, Supabase project refs, schema) were deliberately kept — renaming them would break the live deployed auth for zero user value. Follow-up suggestion for the owner: if a full internal rename is ever desired, do it in one dedicated maintenance pass (rotate secrets + migrate stored sessions together).
- **AUTH-02 closed retrospectively:** its criteria (whitelist-only access, server-side blocking, RLS) were proven live in 01-02 (anon → [], no-auth → 401, own-row-only via JWT); marking complete now that the client end of the loop is verified end-to-end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Authorization header added to the verify-pin fetch**
- **Found during:** task 1 (LoginPage implementation, prior session)
- **Issue:** Plan's key_link specified only the `apikey` header; the live /functions/v1 gateway returns 401 before the function runs without an `Authorization: Bearer <anon>` header (discovered in 01-02)
- **Fix:** LoginPage sends both `apikey` and `Authorization: Bearer <VITE_SUPABASE_ANON_KEY>`
- **Files modified:** src/features/auth/LoginPage.tsx
- **Verification:** Owner logged in successfully in a real browser against the live function
- **Committed in:** 5befbe4

**2. [Rule 1 - Bug] Enumeration-safe 401 copy differs from the plan's example**
- **Found during:** task 1 (LoginPage error UX, prior session)
- **Issue:** Plan example copy was "PIN incorreto — N tentativas restantes", which reveals that the handle exists (user enumeration); 01-UI-SPEC mandates enumeration-safe copy
- **Fix:** pt-BR copy "Discord ou PIN incorreto — N tentativas restante(s)." — never reveals whether the handle or the PIN was wrong
- **Files modified:** src/features/auth/LoginPage.tsx
- **Verification:** UI-SPEC conformance; owner browser-tested wrong-PIN countdown
- **Committed in:** 5befbe4

**3. [User-directed] Rebrand to Hellz / Painel Geral**
- **Found during:** task 2 checkpoint (owner feedback, this session)
- **Issue:** Owner corrected the product name — "NeoFoot" is an abandoned project whose folder was reused; the panel is called "Hellz" with subtitle "Painel Geral"
- **Fix:** LoginPage card title + index.html title rebranded; `lang="pt-BR"` added to match UI language. Internal identifiers intentionally unchanged (see Decisions)
- **Files modified:** src/features/auth/LoginPage.tsx, index.html
- **Verification:** grep confirms no user-visible "NeoFoot" remains in src/ or index.html; vitest 4/4 + tsc + vite build all green
- **Committed in:** 6d17bc0

---

**Total deviations:** 3 (1 blocking auto-fix, 1 security-copy bug fix, 1 user-directed rebrand)
**Impact on plan:** All necessary for correctness (gateway contract, anti-enumeration) or owner-directed (branding). No scope creep.

## Issues Encountered
None beyond the deviations above. Checkpoint passed on first owner review.

## User Verification Evidence (task 2)

- **Approved by owner on 2026-10-08** at http://localhost:5173 (dev server against the live Supabase project): login with seeded handle + PIN, session persists across reload, logout clears and stays logged out, wrong-PIN attempts countdown, lockout message after 5 wrong PINs. Owner quote: "All Approved, working as intended".

## User Setup Required
None new — see [01-USER-SETUP.md](./01-USER-SETUP.md) for the standing pre-launch items (rotate deploy token, replace placeholder whitelist rows/PINs before inviting real members).

## Next Phase Readiness
- Phase 1 (Foundation) is functionally complete: schema + RLS (01-01), live auth backend (01-02), OCR spike GO (01-04), PIN Gate UI (01-03)
- AUTH-01 and AUTH-02 satisfied; ready for `/gsd-verify-work` on Phase 1 and then `/gsd-transition` / Phase 2 planning (registry & ingestion)
- Standing cautions: do NOT revoke signing key 6f7657c3 (kills all member sessions); rotate placeholder seeds before real members join

---
*Phase: 01-foundation-secure-access-data-model*
*Completed: 2026-10-08*

## Self-Check: PASSED

All 6 key files exist on disk; all 4 task commits (2bd1ac1, 30d7505, 5befbe4, 6d17bc0) verified in git log; vitest 4/4 + tsc + vite build green after rebrand; grep confirms no user-visible "NeoFoot" remains in src/ or index.html.
