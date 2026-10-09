---
phase: 02-registry-catalog-manual-data-ingestion
plan: 02
subsystem: ui
tags: [react-19, tailwind-v4, tab-shell, inline-editing, admin-ui, pt-BR, a11y, rls-gated]

# Dependency graph
requires:
  - phase: 02-registry-catalog-manual-data-ingestion
    plan: 01
    provides: live classes/members schema + staff RLS (member_role claim), src/lib/api.ts safe-projection REST client (fetchMembers/fetchClasses/updateCharacter/createClass)
provides:
  - "App tab shell (Painel / Personagens) — the navigation spine Phase 2's remaining screens hang from"
  - "Personagens admin page: member table with inline character registration (display_name, char_class, char_function) — REG-01 UI"
  - "Add-class form that inserts and immediately refreshes the class dropdown — REG-02 UI (requirement now complete end-to-end with 02-01's live staff-only insert)"
affects: [02-03, phase-4-member-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
  - "Tab visibility = UX-only gate on session.member_role (officer/owner); enforcement stays the 02-01 staff RLS policies — zero new security surface"
  - "Single-editable-row draft state (one member editable at a time) with per-row Salvo./Falha status and aria-busy while saving"
  - "Global busy flag: any in-flight request (row save or class insert) disables every CTA on the page"
  - "Safe-projection-only data path: page imports api.ts functions exclusively — no raw fetch in components, PIN hash column never named or referenced"

key-files:
  created:
    - src/features/admin/CharactersPage.tsx
  modified:
    - src/App.tsx

key-decisions:
  - "Tab content render re-checks isStaff (not just the button): App stays mounted across logout/login on the same browser, so a lingering staff tab can never leak the admin page to a member session"
  - "Save with the display-only '—' class option is blocked by disabling Salvar (a character must have a class) rather than an error message — keeps copy matrix exactly per UI-SPEC"
  - "Refresh-after-save failures keep the stale table instead of erroring: the save itself succeeded (Salvo. shown); a failed re-fetch is cosmetic and must not read as a failed save"
  - "401/403 loads render the UI-SPEC Screen 2 session copy (Sua sessão expirou…) distinct from the generic network copy — ApiError.kind drives the choice, still enumeration-safe"

patterns-established:
  - "Feature-page layout: src/features/<area>/… consumes ../../lib/api only, owns its pt-BR copy constants at module top, Role pill and h-11 control markup copied verbatim from LoginPage/App"
  - "Per-row async write UX: Editar → draft (inputs swap in-place) → Salvar → aria-busy + disabled controls → Salvo. (text-success) or Falha ao salvar (role=alert, retry in place) → list refreshed"

requirements-completed: [REG-01, REG-02]

# Metrics
duration: 20min
completed: 2026-10-09
---

# Phase 2 Plan 2: Admin Personagens Page Summary

**App tab shell + officer/owner Personagens page: inline character registration (name/class/function via updateCharacter) and an add-class form (createClass) on the 02-01 safe-projection API — tab gated UX-only on member_role with all writes refused server-side by the live staff RLS**

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-09T15:20:19Z
- **Completed:** 2026-10-09T15:40:17Z
- **Tasks:** 2 of 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- App shell reworked: Phase 1 header kept verbatim (Olá + role pill + Sair), placeholder body replaced by the tab bar — Painel for everyone (placeholder copy preserved), Personagens rendered only for officer/owner; state-driven tabs, no router, max-w-3xl content column
- Personagens page (REG-01): member table on the explicit safe projection with loading/empty/error states; per-row inline edit of display_name + Classe select (from the live class list, '—' display-only and blocked on save) + Função select; Salvar → updateCharacter → Salvo./Falha ao salvar feedback, aria-busy, list refreshed after save
- Add-class form (REG-02): Nova classe input + outline Adicionar Classe → createClass → success copy + input cleared + dropdown refreshed so the new class is immediately selectable
- All 62 tests, tsc -b, and vite build green; no new dependencies; zero server changes (zero new security surface)

## task Commits

Each task was committed atomically:

1. **task 1: App tab shell + admin characters table (read side)** - `3b0ac9b` (feat)
2. **task 2: Inline character registration + class management (REG-01, REG-02)** - `c5cd150` (feat)

**Plan metadata:** (final docs commit follows this summary)

## Files Created/Modified
- `src/features/admin/CharactersPage.tsx` - Personagens admin page: safe-projection member table, per-row inline character editing, add-class form, enumeration-safe pt-BR states
- `src/App.tsx` - Tab shell (Painel / Personagens) with UX-only staff gating; Phase 1 header and Painel placeholder copy preserved

## Decisions Made
- **Content-level staff re-check:** the render path (`showCharacters = tab === 'characters' && isStaff`) re-verifies the role, not just the button visibility — App stays mounted when RequireAuth invalidates, so a staff tab selected before logout can never surface the admin page to the next (member) session on the same browser.
- **'—' class option semantics:** value `''` maps to the unregistered state for display only; Salvar is disabled while it is selected (client-side block — a character must have a class), so no invalid patch can ever be sent.
- **Refresh failures ≠ save failures:** after a successful updateCharacter/createClass the list re-fetch is best-effort; if it throws, the stale table stays and the success copy still shows (the write itself succeeded and is persisted server-side).
- **Session-expired copy for 401/403 loads** per UI-SPEC Screen 2 state matrix, distinct from the generic network copy — chosen via ApiError.kind, never via raw status exposure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Save-failure error copy was unreachable in the first draft**
- **Found during:** task 2 (self-review of the edit-mode render branches before commit)
- **Issue:** a failed save keeps the row in edit mode (retry by pressing Salvar again, per the state matrix), but the `Falha ao salvar — tente novamente.` alert was only rendered in the non-editing branch — the officer would never see it
- **Fix:** the editing actions cell now renders the `role="alert"` status below the Salvar button whenever `saveErrorRowId` matches the row
- **Files modified:** src/features/admin/CharactersPage.tsx
- **Verification:** branch trace: save failure → draft kept → editing cell renders Salvar + alert together; all grep gates + vitest/tsc/build green
- **Committed in:** c5cd150

**2. [Rule 3 - Blocking] Header comment violated the literal pin_hash grep gate**
- **Found during:** task 1 acceptance gate run
- **Issue:** the task gate requires `Select-String -Pattern "pin_hash"` on the page to return NOTHING; my provenance comment named the column, failing the letter of the gate
- **Fix:** reworded the comment ("the PIN hash column is ungranted… never named or referenced here") — the gate's intent (no data path) and now its letter both hold
- **Files modified:** src/features/admin/CharactersPage.tsx
- **Verification:** grep returns nothing; tsc/build re-run green
- **Committed in:** 3b0ac9b

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 gate blocker)
**Impact on plan:** Both fixes required for correctness/gate compliance. No scope creep; no interface, security, or copy changes.

## Issues Encountered
- The task 2 commit message initially failed: PowerShell 5.1 parsed the embedded `\"` quotes in the double-quoted `-m` argument and split the message into bogus pathspecs. No commit was created; retried with a single-quoted message (`c5cd150`). Process note only — no code impact.

## Authentication Gates
None. This plan made zero server calls from automation (UI-only work); all live API behavior it relies on was already live-proven by 02-01's RLS smoke matrix (officer sees all members, officer class insert → 201, char PATCH re-read matches, member sees only own row).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 02-03 (member submit wizard): the tab shell has a slot for its Enviar Status tab, the wizard's blocked-state copy already references the Personagens tab, and api.ts exposes fetchCatalog/createSubmission/fetchMySubmissions verbatim
- Owner browser spot-checks (officer edits a character; member session lacks the tab and a direct member PATCH is refused) are folded into 02-03's owner UAT checkpoint per this plan's verification section — RLS refusal side is already live-proven
- Standing owner actions unchanged: fix the latent `discordHandle` ReferenceError in verify-pin before redeploying it, rotate seeded credentials, rotate the deploy token (see 02-01 SUMMARY and 02 deferred-items.md)

## Self-Check: PASSED

Both key files exist on disk (src/App.tsx, src/features/admin/CharactersPage.tsx); both task commits (3b0ac9b, c5cd150) present in git log; task acceptance criteria re-verified after the final state: all Screen 2 / shell strings greppable, no pin_hash reference, officer gating on member_role, vitest 62/62, tsc -b exit 0, vite build exit 0, working tree clean.

---
*Phase: 02-registry-catalog-manual-data-ingestion*
*Completed: 2026-10-09*
