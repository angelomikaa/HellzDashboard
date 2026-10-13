---
phase: 06-trust-celebration-officer-tools-promotion-page
plan: 06
subsystem: frontend-admin
tags: [officer-tools, role-controls, confirm-dialog, owner-only, d08, auth-03, auth-04]

# Dependency graph
requires:
  - phase: 06-01
    provides: migration 0011 RPCs live (set_member_role/set_member_active, owner-only class policy)
  - phase: 06-03
    provides: typed wrappers setMemberRole/setMemberActive + MemberRow.active in src/lib/api.ts
  - phase: 06-04
    provides: shared ConfirmDialog modal (src/features/admin/ConfirmDialog.tsx)
provides:
  - Role-differentiated Controles column on Personagens (owner: role grant/revoke + removal/reactivation on member AND officer targets; officer: removal/reactivation on member rows only)
  - Owner-only add-class form (folded todo owner-only-class-management resolved end-to-end)
affects: [phase 6 verification, /gsd-verify-work traceability for AUTH-03/AUTH-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared per-row feedback state machine carries its message (RowFeedback {id, text}) — edit, role-change, and removal/reactivation flows reuse one savingRowId single-flight lock"
    - "Closed-form D-08 visibility matrix in one ternary chain: owner rows '—' for every viewer; non-staff and officer-viewer-on-officer-target '—'; else controls"
    - "PendingAction discriminated union → one confirmConfig() + one shared confirm handler per action kind"

key-files:
  created: []
  modified:
    - src/features/admin/CharactersPage.tsx
    - src/lib/api.ts (createClass comment only)
    - .planning/todos/completed/owner-only-class-management.md (moved from pending)

key-decisions:
  - "D-08 visibility implemented as one exact ternary matrix on (viewer role × target role × active) — the UI never renders a control the viewer may not use, and the RPCs re-check everything server-side (UX-only gating per house pattern)"
  - "isStaff computed and consumed in the control matrix (defense-in-depth for a tampered member-session render; noUnusedLocals kept honest)"
  - "Reativar confirm dialog body was not locked by the UI-SPEC (only the title/buttons are) — added the honest complement of the removal copy: '{name} voltará a ter acesso ao painel e aos ranks imediatamente.' (discretion call, recorded here)"
  - "Pending todo owner-only-class-management moved to completed: server half landed in 06-01 (0011, smoke-proven 06-02), UI half in this plan's task 2 — all three acceptance bullets now hold"

requirements-completed: [] # AUTH-03/AUTH-04 complete via traceability at phase verification (server smokes 06-01/06-02 + this UI surface)

# Metrics
duration: 11min
completed: 2026-10-12
---

# Phase 6 Plan 06: Personagens Staff Controls Summary

**Personagens now carries the role-differentiated Controles column — the owner grants/revokes officer roles and removes/reactivates member AND officer targets via ConfirmDialog + the 0011 RPCs, officers manage ordinary members only, owner rows are untouchable, and the add-class form is owner-only (D-08/D-09/D-10 copy verbatim; tsc + 284/284 tests green).**

## Performance

- **Duration:** 11min
- **Started:** 2026-10-12T21:24:32Z
- **Completed:** 2026-10-12T21:35:30Z
- **Tasks:** 2/2
- **Files modified:** 3 (CharactersPage.tsx +252/−12; api.ts comment; todo moved)

## Accomplishments

- **task 1 — Controles column (AUTH-03/AUTH-04):** new 14px-semibold "Controles" table column with the full D-08 matrix: owner rows render `—` for every viewer; officer viewers render `—` on officer/owner rows; owner sees `Conceder oficial`/`Revogar oficial` (member/officer targets) + `Remover`/`Reativar` on both target kinds; officers see `Remover`/`Reativar` on member rows only. All flows open the shared ConfirmDialog with the locked Surface-3 copy (officer-removal body appends `Somente você pode remover oficiais.`), call `setMemberRole`/`setMemberActive` exclusively (no PATCH path — 0005 grants), show the per-action success line (`Papel atualizado. Efetivo no próximo login.` / `Membro removido.` / `Membro reativado.`) and enumeration-safe per-row errors (unauthorized → SESSION_ERROR), then refetch. Inactive rows get whole-`<tr>` `opacity-60`.
- **task 2 — owner-only add-class (D-09):** the entire `Nova classe` section (form + success/error lines) renders inside `{isOwner && (...)}` — officers have no form, no placeholder; `createClass` wrapper comment updated to owner-only per 0011; pending todo moved to `.planning/todos/completed/`.

## Task Commits

Each task was committed atomically:

1. **task 1: Role-differentiated role + removal/reactivation controls (Controles column)** - `0da1996` (feat)
2. **task 2: Owner-only add-class gate (folded todo)** - `9b341fa` (feat, includes todo move + api.ts comment)

**Plan metadata:** *(this commit)* (docs: complete plan)

## Files Created/Modified

- `src/features/admin/CharactersPage.tsx` (modified) — Controles column + D-08 matrix, ConfirmDialog wiring, PendingAction/RowFeedback state, owner-gated add-class, enforcement comments (RPC-only writes, 0005 ungranted columns, UX-only gating)
- `src/lib/api.ts` (modified) — createClass comment now states owner-only (staff_insert_classes, 0011)
- `.planning/todos/completed/owner-only-class-management.md` (moved from pending) — status: completed with the 06-01/06-02/06-06 evidence pointers

## Verification

- `npx tsc -b` — exit 0 (both tasks)
- `npm test` — 17 files / 284 tests, all green (both tasks)
- Grep gates: `setMemberRole`/`setMemberActive` imported and exclusively used; role buttons gated on `isOwner && member.role === ...`; officer visibility limited by `!isStaff || (!isOwner && member.role !== 'member')` → `—`; owner-target `—` branch present; locked strings verbatim (`Conceder oficial`, `Revogar oficial`, `Remover`, `Reativar`, `Papel atualizado. Efetivo no próximo login.`, `Membro removido.`, `Membro reativado.`, `Somente você pode remover oficiais.`); modal confirm labels direction-matching (not `Confirmar`); zero `role:`/`active:` inside any updateCharacter call; `opacity-60` on inactive `<tr>`; `isOwner && (` wrapping the Nova classe section; owner-only createClass comment

## Deviations from Plan

None of substance — plan executed as written. Two recorded discretion notes:

1. **Reativar dialog body (copy gap):** the UI-SPEC locks only the Reativar title and buttons; ConfirmDialog requires a body. Added `${name} voltará a ter acesso ao painel e aos ranks imediatamente.` — the honest inverse of the locked removal copy. No locked string touched.
2. **Todo resolution:** the plan body did not explicitly instruct moving `owner-only-class-management.md`, but its three acceptance bullets are all satisfied (server refusal smoke-proven in 06-02, owner path intact, UI gate in task 2) and the files_to_read context instructed resolving it if instructed — resolved and documented in the todo file itself.

## Known Stubs

None — all controls are fully wired to the live 0011 RPC wrappers; no placeholder/TODO patterns.

## Threat Flags

None — no new trust surface beyond the plan's threat model: role grant/revoke renders owner-only (T-06-03), removal/reactivation renders per D-08 with server-side target rules re-checked in the RPCs (T-06-04), add-class DOM is owner-only with the 0011 policy as enforcement (T-06-08), D-10 stale-claim caveat visible in every role-change success line (T-06-09), and no PATCH path exists for role/active (T-06-14).

## Self-Check: PASSED

- `src/features/admin/CharactersPage.tsx` modified on disk with Controles column + owner-gated add-class — FOUND
- `src/lib/api.ts` createClass comment states owner-only — FOUND
- `.planning/todos/completed/owner-only-class-management.md` present, pending copy gone — FOUND
- Commits `0da1996` and `9b341fa` present in git log — FOUND
- tsc -b clean, 284/284 tests green — VERIFIED
