---
phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi
plan: 04
subsystem: auth
tags: [identity, ocr, tesseract, submission, whitelist, request-access, rls]

# Dependency graph
requires:
  - phase: 08-03
    provides: readBasicProfile/parseBasicProfileText, OFFICIAL_CLASSES, validateIdentityDraft, request-access prospect contract + RequestAccessPage handoff
  - phase: 08-01
    provides: create_submission(p_stats, p_identity) + assert_char_id_available, whitelist_requests schema
provides:
  - Mandatory identity capture (char_id/nickname/char_class/char_function) on every SubmitPage submission, sent as create_submission p_identity
  - Advisory OCR profile prefill (nickname/ID/class) from the Basic screenshot via OcrCapture onImage, no char_function inference
  - Public stat catalog reader for anonymous browsers (fetchPublicCatalog)
  - Session-less ProspectApplicationPage writing a full 56+ stat payload through request-access (request_type 'prospect')
  - Shared applyOcrOutcomes applier reused by both wizards
  - RequireAuth application view replacing the 08-03 interim handoff panel
affects: [08-05 staff review queue, 08-06 request approval, phase 09/10 submission + rating UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure flow modules (requestFlow / ocr/apply) hold payload build, gating and error copy; components stay thin"
    - "SSR-only component tests via renderToStaticMarkup with dependency-injected seams (initialCatalog, initialView)"
    - "OCR helpers accept a decoded canvas so one upload feeds both stat OCR and identity prefill"

key-files:
  created:
    - src/features/submit/ocr/apply.ts
    - src/features/submit/SubmitPage.test.tsx
    - src/features/request/ProspectApplicationPage.tsx
    - src/features/request/ProspectApplicationPage.test.tsx
  modified:
    - src/features/submit/SubmitPage.tsx
    - src/features/submit/OcrCapture.tsx
    - src/lib/api.ts
    - src/features/request/requestFlow.ts
    - src/features/request/RequestAccessPage.tsx
    - src/features/auth/RequireAuth.tsx

key-decisions:
  - "Identity is client-validated with the same rules the RPC enforces (validateIdentityDraft) and blocked before Enviar, but stays advisory data until staff approval"
  - "OCR prefill only fills empty/untouched identity fields and never derives char_function; unmatched class resets to blank"
  - "Prospect wizard has no per-step verification attestations (those are SubmitPage-specific) — ReviewStep receives allStepsVerified"
  - "Prospect flow helpers live in requestFlow.ts and take requestAccess as a dependency, so payload/error/gating rules are unit-testable without network stubs"
  - "Anonymous catalog reads the 0014 column-limited grant (labels/types only), never class_key_stats"

patterns-established:
  - "Test seam props (initialCatalog, initialView) keep RequireAuth/page view machines SSR-testable in a node-only Vitest setup"
  - "Server error codes map to one copy table per flow (prospectErrorCopy) instead of ad-hoc strings in components"

requirements-completed: [WHIT-08, WHIT-09, IDEN-01, IDEN-02, IDEN-03]

# Metrics
duration: 49min
completed: 2026-10-21
---

# Phase 8 Plan 4: Identity-stamped submissions + session-less prospect application

**Every submission now carries validated char_id/nickname/class/function (OCR-prefilled, human-editable) and a prospect without a session can submit a full 56-stat application through request-access — never create_submission, never a session.**

## Performance

- **Duration:** 49 min
- **Started:** 2026-10-21T07:10:00Z
- **Completed:** 2026-10-21T07:59:00Z
- **Tasks:** 2
- **Files modified:** 10 (+1661 / −82)

## Accomplishments
- SubmitPage collects ID/Nick/Classe/Função above Poder de Combate, prefilled from the member row, gated by `validateIdentityDraft`, and sends `p_identity` with `create_submission`; `duplicate_char_id` / `unknown_class` surface inline without discarding wizard state.
- The Basic screenshot now produces stats *and* an identity profile from one upload (`OcrCapture.onImage` → `readBasicProfile`), filling only untouched fields, never `char_function`, with the standard "Preenchido pela leitura — confira." hint.
- `ProspectApplicationPage`: anon catalog load with retry, read-only identity summary with inline error + "Corrigir identidade" back-path, steps Personagem/Geral/Quasi/Especial/Revisão reusing `StatGroupStep`/`ReviewStep`/`OcrCapture`, submit through `request-access` (`request_type: 'prospect'`) routing to the owning step on missing labels.
- `RequireAuth` application view replaces the 08-03 interim stub; the request view can render the success panel with the returned protocol.
- 31 test files / 491 tests green; `npm run build` green; `npm run lint` 0 errors (23 house-style warnings, none new in this plan's files beyond the existing export-pattern warnings).

## Task Commits

Each task was committed atomically:

1. **Task 1: OCR profile decoders + mandatory identity on SubmitPage** - `119898d` (feat)
2. **Task 2: Session-less prospect application wizard** - `661f635` (feat)
3. **Key-link note on the prospect submit call site** - `1156d1e` (docs)

**Plan metadata:** `pending` (docs: complete plan)

## Files Created/Modified
- `src/features/submit/ocr/apply.ts` — shared `applyOcrOutcomes` (writes every displayed key, replaces one step's filled/failed sets wholesale)
- `src/features/submit/OcrCapture.tsx` — optional `onImage(canvas)` hook fired once per accepted upload before `readScreenshot`
- `src/features/submit/SubmitPage.tsx` — identity state/selects, profile prefill, `identitySubmitBlock`/`submitErrorFor`, `p_identity` submit, duplicate/unknown_class jump-to-fix
- `src/features/submit/SubmitPage.test.tsx` — 14 tests (identity gate, prefill parity, applied scoping, payload, catalog reader)
- `src/lib/api.ts` — `createSubmission(session, stats, identity?)`, `fetchPublicCatalog()`
- `src/features/request/requestFlow.ts` — prospect payload/gating/error/submit helpers + `PROSPECT_STEP_GROUP`
- `src/features/request/ProspectApplicationPage.tsx` — the session-less wizard
- `src/features/request/ProspectApplicationPage.test.tsx` — 17 tests (gating, group scoping, payload contract, 56/57 stats, missing→step, error copy, createSubmission never called, RequireAuth handoff)
- `src/features/request/RequestAccessPage.tsx` — `initialRequestId` so the success panel survives the handoff
- `src/features/auth/RequireAuth.tsx` — exported `AuthView`, `initialView` test seam, application view

## Decisions Made
- Prospect flow deliberately omits per-step verification checkboxes (SubmitPage-only feature); ReviewStep gets `allStepsVerified={true}` so Enviar runs the payload build and jumps to the owning step.
- `submitProspectApplication` validates the already-confirmed identity again, then applies `buildStatsPayload`; the extra `stats.length < 56` check mirrors the Edge validator as defense-in-depth.
- Anonymous browsing talks to `stat_catalog` only through the 0014 column-limited anon grant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Prospect flow helpers extracted to `requestFlow.ts`**
- **Found during:** task 2 (prospect wizard lint pass)
- **Issue:** Keeping payload/gating/error helpers inside the page produced 7 `only-export-components` warnings and left pure rules only testable through a component file — against the repo's flow-module pattern.
- **Fix:** Moved `buildProspectPayload`, `prospectCanContinue`, `prospectGroupEntries`, `prospectStepForMissing`, `prospectErrorCopy`, `submitProspectApplication` (+ copy constants and `PROSPECT_STEP_GROUP`) into `requestFlow.ts`; the page imports them.
- **Files modified:** `src/features/request/requestFlow.ts`, `ProspectApplicationPage.tsx`, `ProspectApplicationPage.test.tsx`
- **Verification:** `npx tsc -b` clean, 17/17 prospect tests, lint back to the pre-plan 23 warnings.
- **Committed in:** `661f635`

**2. [Rule 2 - Missing Critical] `RequestAccessPage` accepts an initial request id**
- **Found during:** task 2 (RequireAuth wiring)
- **Issue:** The success panel state lived only in `RequestAccessPage`; returning to the request view after a prospect submission lost the protocol number.
- **Fix:** Added `initialRequestId?: string`, seeded into state.
- **Files modified:** `src/features/request/RequestAccessPage.tsx`
- **Verification:** RequireAuth handoff test asserts "Solicitação enviada" + protocol.
- **Committed in:** `661f635`

**3. [Rule 3 - Blocking] RequireAuth view machine needed a test seam**
- **Found during:** task 2 (acceptance: "RequireAuth can render the application view")
- **Issue:** Node-env tests cannot click through login → request → application, so the handoff was untestable without a seam.
- **Fix:** Exported `AuthView` and added optional `initialView` (production never passes it), mirroring the existing `initialHandle`/`initialCatalog` pattern.
- **Files modified:** `src/features/auth/RequireAuth.tsx`
- **Verification:** Two SSR tests render the application view and the request success view.
- **Committed in:** `661f635`

---

**Total deviations:** 3 auto-fixed (2 missing critical, 1 blocking)
**Impact on plan:** No scope creep — all three keep promised behavior testable/consistent. `requestFlow.ts` and `RequestAccessPage.tsx` were not in the plan's `files_modified` list; `ocr/apply.ts` was listed under task 1 files but omitted from frontmatter.

## Issues Encountered
- None functional. One Windows detail: `tsc -b` caught a leftover `Step` alias after the helper extraction, fixed by switching the page to `ProspectStep`.

## Known Stubs
None. The `initialCatalog` / `initialView` props are test seams, not placeholders; every UI path is wired to live data or explicit error states.

## Threat Flags
None beyond the plan's register (T-08-25..30 all mitigated: identity stays advisory until approval, OCR never overwrites typed fields, server owns duplicate/class checks, request-access never mints a member/session, anon catalog is column-limited, payloads server-validated).

## User Setup Required
None for this plan. The manual UAT line in the plan's `<verification>` (Basic OCR round-trip, duplicate ID inline, prospect request + no member row) requires the deployed Supabase project and is carried in `08-VALIDATION.md`.

## Next Phase Readiness
- Staff review queue (08-05/08-06) can rely on `whitelist_requests` rows carrying full stats + identity for both member and prospect types.
- Phase 09 submission work should keep the `p_identity` call shape (`createSubmission(session, stats, identity)`); two-arg call sites still compile with `p_identity: null`.

---
*Phase: 08-whitelist-lifecycle-self-request-whitelisting-first-login-pi*
*Completed: 2026-10-21*

## Self-Check: PASSED
