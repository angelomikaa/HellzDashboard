---
phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi
plan: 03
subsystem: auth
tags: [react, typescript, supabase-edge-functions, ocr, tesseract, vitest, rls]

# Dependency graph
requires:
  - phase: 08-02
    provides: live verify-pin 409 pin_setup_required, setup-pin and request-access Edge contracts
  - phase: 08-01
    provides: 0014 whitelist/request schema + request_status RPC
provides:
  - Unauthenticated login -> first-access -> claim routing
  - Shared 4-box PIN control and JPEG proof picker
  - Basic-screen identity OCR (ID/nickname/class) with no role inference
  - Typed anon Edge/RPC wrappers (FunctionError, setupPin, requestAccess, fetchRequestStatus)
  - Member request flow with supersede (previous PIN) and identity-free status lookup
  - Prospect handoff draft for the 08-04 application wizard
affects: [08-04, 08-05, 08-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure logic modules (pin/proof/firstAccess/requestFlow) keep components thin and testable in the node-env Vitest setup"
    - "Anon surface: apikey + Bearer anon, never a session; FunctionError carries machine tokens/counters"
    - "OCR identity is evidence, never input: unreadable fields block submission instead of guessing"
    - "React components asserted via react-dom/server renderToStaticMarkup (no DOM test dependency)"

key-files:
  created:
    - src/features/submit/identity.ts
    - src/features/submit/ocr/recognize.profile.test.ts
    - src/features/auth/pin.ts
    - src/features/auth/PinBoxes.tsx
    - src/features/auth/firstAccess.ts
    - src/features/auth/FirstAccessPage.tsx
    - src/features/identity/proof.ts
    - src/features/identity/ProofField.tsx
    - src/features/request/requestFlow.ts
    - src/features/request/RequestAccessPage.tsx
    - src/features/request/RequestStatusPage.tsx
    - src/lib/api.functions.test.ts
  modified:
    - src/lib/api.ts
    - src/features/submit/ocr/recognize.ts
    - src/features/submit/ocr/index.ts
    - src/features/auth/LoginPage.tsx
    - src/features/auth/RequireAuth.tsx

key-decisions:
  - "No new npm dependencies: pure helpers + renderToStaticMarkup replace a DOM testing library (08-CONTEXT no-new-deps rule)"
  - "Interim RequestAccessPage shell in task 3 so RequireAuth builds; fully replaced in task 4 (Rule 3)"
  - "Prospect draft held in RequireAuth memory with an interim handoff panel; 08-04 replaces it with ProspectApplicationPage"
  - "Class select is restricted to the 15 seeded official names; OCR prefill never overwrites an edited identity field"
  - "Status lookup renders a closed four-key object built client-side, dropping any extra columns"

patterns-established:
  - "Component + pure module pairs: every rule that matters is unit-tested without a browser"
  - "Server machine token -> pt-BR copy mapping lives in one pure function per flow"
  - "Lazy OCR import from pages so Tesseract stays out of the login bundle"

requirements-completed: [WHIT-01, WHIT-02, WHIT-03, WHIT-04, WHIT-06, WHIT-07, WHIT-08, WHIT-10, IDEN-01]

# Metrics
duration: ~30min
completed: 2026-10-21
---

# Phase 08 Plan 03: Unauthenticated Client Surface Summary

**Unclaimed logins now route to a proof-backed first-access claim, members can request a re-link with a supersede retry, prospects hand off to the 08-04 wizard, and every PIN input is the shared 4-box control**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-21T03:38:00Z (approx.)
- **Completed:** 2026-10-21T04:07:29Z
- **Tasks:** 4
- **Files modified:** 22

## Accomplishments
- Login maps `409 pin_setup_required` to "Criar meu PIN" (plus explicit first-access/request entries) instead of a wrong-PIN dead end.
- First access collects only handle + PIN + confirmation + one basic screenshot; ID/nickname/class come from OCR, are read-only, and an incomplete read blocks submit with a retake.
- Shared `PinBoxes` (4 masked boxes, paste/backspace/arrows, no auto-submit) and `ProofField` (JPEG-only, 1600 px/0.85 re-encode, 8 MB input cap, 2 MB post-encode budget, OCR canvas handoff).
- Request flow offers member (identity only, no stats) and prospect (handoff, no direct submit) entrances; `409 request_pending` reveals the previous-PIN step and retries with `previous_pin`; status lookup renders only status/type/dates.
- Typed anon API layer: `FunctionError`, `edgeFetch`, `setupPin`, `requestAccess`, `fetchRequestStatus` with 401/409/429 counter mapping.

## Task Commits

Each task was committed atomically:

1. **task 1: identity parser + Basic-profile OCR + PinBoxes/ProofField** - `5d5c2a9` (feat)
2. **task 2: Edge function wrappers + FunctionError** - `c5fe87c` (feat)
3. **task 3: route unclaimed logins into first-access** - `8e39f80` (feat)
4. **task 4: member request flow + status lookup + prospect handoff** - `416fdb7` (feat)

**Plan metadata:** pending docs commit (this SUMMARY + STATE/ROADMAP)

## Files Created/Modified
- `src/features/submit/identity.ts` — 15 official classes, tolerant class matching, Basic-screen text parsing, shared identity validation.
- `src/features/submit/ocr/recognize.ts` / `index.ts` — `readBasicProfile` one-pass SPARSE_TEXT read (restores SINGLE_BLOCK), `profileFromRawText` test seam.
- `src/features/auth/pin.ts` / `PinBoxes.tsx` — pure PIN transitions and the accessible 4-box control.
- `src/features/identity/proof.ts` / `ProofField.tsx` — JPEG/resize/size guards, preview/remove, OCR canvas handoff.
- `src/features/auth/firstAccess.ts` / `FirstAccessPage.tsx` — claim validation, setup orchestration, one save, error copy.
- `src/features/auth/LoginPage.tsx` / `RequireAuth.tsx` — PinBoxes login, 409 routing, login/first-access/request view machine.
- `src/lib/api.ts` / `api.functions.test.ts` — anon Edge/RPC wrappers + FunctionError.
- `src/features/request/requestFlow.ts` / `RequestAccessPage.tsx` / `RequestStatusPage.tsx` — chooser, shared form, supersede retry, prospect handoff, identity-free status.

## Decisions Made
- **Pure modules over DOM tests:** node-env Vitest only, no new deps; interactions are proven through `pin.ts`/`proof.ts`/`firstAccess.ts`/`requestFlow.ts`, markup through `renderToStaticMarkup`.
- **Interim request shell:** task 3 created a minimal `RequestAccessPage` so the guard built; task 4 replaced it entirely.
- **Prospect handoff:** `RequireAuth` keeps the draft in memory and shows an interim panel; 08-04 replaces this with the full-stats wizard (no request is submitted at this stage).
- **Identity edits win over OCR:** touched ID/nickname/class fields are never overwritten by a later OCR pass.
- **Closed status shape:** `fetchRequestStatus` rebuilds the four allowed keys, so extra columns cannot reach the UI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Interim RequestAccessPage shell for the task-3 build**
- **Found during:** task 3 (route unclaimed logins into first-access)
- **Issue:** `RequireAuth` must render `RequestAccessPage`, a task-4 file, but task 3 runs `npm run build`.
- **Fix:** Created a minimal shell exporting the props/draft type; task 4 replaced the file with the full flow.
- **Files modified:** `src/features/request/RequestAccessPage.tsx`
- **Verification:** `npm run build` green in task 3 and task 4.
- **Committed in:** `8e39f80` (task 3), replaced in `416fdb7` (task 4)

**2. [Rule 3 - Blocking] Pure helper modules added to keep tests runnable**
- **Found during:** tasks 1, 3, 4
- **Issue:** The repo has no DOM test library and the no-new-deps rule forbids adding one; component-internal logic would be untestable.
- **Fix:** Extracted `pin.ts`, `proof.ts`, `firstAccess.ts`, `requestFlow.ts` and asserted components via `renderToStaticMarkup`.
- **Files modified:** `src/features/auth/pin.ts`, `src/features/identity/proof.ts`, `src/features/auth/firstAccess.ts`, `src/features/request/requestFlow.ts`
- **Verification:** 70 new tests across the four task suites; full suite 405 green.
- **Committed in:** task commits above

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** No scope creep; both were required to build/test within the repo's dependency constraints.

## Known Stubs

- **Prospect interim handoff** — `src/features/auth/RequireAuth.tsx` stores the `ProspectDraft` and renders an interim "Aplicação iniciada" panel. This is intentional for 08-03: the full-stats application wizard is plan 08-04 (`ProspectApplicationPage.tsx`), which will consume the draft and post `request_type: 'prospect'`. No stats are collected or submitted before then.

## Issues Encountered
- `renderToStaticMarkup` emits camelCase `inputMode`/`autoComplete`/`maxLength` attributes in this React version; the markup assertions are case-insensitive.
- `tsc` caught an unused `touched` state value in `RequestAccessPage`; the touched map now lives only in a ref (no render dependency).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- 08-04 can import `parseBasicProfileText`, `validateIdentityDraft`, `ProspectDraft`, `ProofField`, `PinBoxes` and the request-flow builders directly.
- The interim prospect panel in `RequireAuth` is the only piece 08-04 must replace.
- Pre-existing lockout off-by-one and the SEED-02 dummy purge gate remain tracked in STATE.md.

---
*Phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi*
*Completed: 2026-10-21*

## Self-Check: PASSED

