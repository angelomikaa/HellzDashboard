---
phase: 06-trust-celebration-officer-tools-promotion-page
plan: 04
subsystem: frontend-officer-tools
tags: [react, staff-ui, validation-queue, confirm-modal, accessibility, auth-05]

# Dependency graph
requires:
  - phase: 06-03
    provides: fetchOfficerQueue/setSubmissionStatus typed RPC wrappers + OfficerQueueRow/QueueStat payload types in src/lib/api.ts
  - phase: 06-01
    provides: live 0011 RPCs with staff gates + not_pending two-officer semantics
provides:
  - src/features/admin/ConfirmDialog.tsx — shared accessible confirm modal (role=dialog, Escape/backdrop cancel, focus management) reused by Validações and (06-05) Personagens
  - src/features/admin/ValidacoesPage.tsx — staff validation queue: newest-first list, read-only 57-value review, Validar/Rejeitar with confirm modal, stale-row recovery
  - src/App.tsx — 'validacoes' (staff UX gate + content re-check) and 'destaques' (all members) tab wiring
  - src/features/highlights/HighlightsPage.tsx — placeholder stub so the shell typechecks (plan 06-05 replaces the body)
affects: [06-05 member management UI (reuses ConfirmDialog), 06-06 promotion page UI (replaces HighlightsPage stub), phase verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Whole-row toggle button with aria-expanded/aria-controls for expandable list items"
    - "Single Record<GroupKey, boolean> collapse state reset to defaults per row expansion"
    - "Page-level persistent success line (aria-live) because the acted-on row leaves the queue on refetch"
    - "Shared ConfirmDialog: focus moves to confirm on open, returns to trigger on close, two-button Tab trap"

key-files:
  created:
    - src/features/admin/ConfirmDialog.tsx
    - src/features/admin/ValidacoesPage.tsx
    - src/features/highlights/HighlightsPage.tsx
  modified:
    - src/App.tsx

key-decisions:
  - "Task 2's tsc gate was unsatisfiable in isolation (App.tsx imports ValidacoesPage which task 3 creates) — plan-ordering self-contradiction, 04-01/05-01 precedent; task 2 verified with npm test (284/284) and the full tsc -b + npm test gate ran green after task 3"
  - "Success confirmation persists as a page-level aria-live line: the acted-on row leaves the queue on refetch, so a per-row-only line would vanish with it; the per-row inline line (savedRowId machine) still renders transiently per the plan"
  - "Group collapse lives in one Record<GroupKey, boolean> reset to {Geral open, Quasi/Especial closed} on every row expansion — no per-row memory needed for a queue capped at one row per member"
  - "HighlightsPage is the plan-mandated interface stub (placeholder body) — plan 06-05 owns the real implementation; not a silent stub"

requirements-completed: [] # AUTH-05 code-complete here; completes via traceability at phase verification (06-03 precedent — live walk/verify-work finishes the requirement)

# Metrics
duration: 16min
completed: 2026-10-12
---

# Phase 6 Plan 04: Officer Validation Queue Summary

**The Validações staff tab is live: shared accessible ConfirmDialog, both new tabs wired into the App shell with correct gating (staff vs all-members), and the full staff queue page — newest-first list, read-only 57-value review grouped Geral/Quasi/Especial, Validar/Rejeitar behind a confirm modal, stale-row recovery — tsc clean, 284/284 tests green.**

## Performance

- **Duration:** 16min
- **Started:** 2026-10-12T23:41:02Z
- **Completed:** 2026-10-12T23:56:32Z
- **Tasks:** 3/3
- **Files:** 3 created, 1 modified (+503/−6)

## Accomplishments

- **ConfirmDialog** (`src/features/admin/ConfirmDialog.tsx`): shared modal fulfilling 01-UI-SPEC:226's reservation — `role="dialog"` + `aria-modal` + `aria-labelledby`, Escape and backdrop-click cancel, focus moves to the confirm button on open and returns to the trigger on close, two-button Tab trap, destructive vs accent confirm variants, `busy` lock. Flat-border language, zero new tokens.
- **App shell** (`src/App.tsx`): `Tab` union gains `'validacoes' | 'destaques'`; `showValidacoes = tab === 'validacoes' && isStaff` (UX-only gate + content re-check, T-06-01 — the App-stays-mounted logout/login precedent); `showHighlights` deliberately role-free (D-12, mirrors showSubmit). Destaques nav button renders for everyone after Enviar Status; Validações wrapped in `{isStaff && (...)}`. T-02-09 comment block updated to cover the new staff tab.
- **ValidacoesPage** (`src/features/admin/ValidacoesPage.tsx`): `fetchOfficerQueue` load with cancelled-guard + enumeration-safe ApiError mapping; whole-row toggle buttons (`aria-expanded`/`aria-controls`, ▸/▾ text chevrons, name + `{class ?? '—'} · Função · pt-BR short datetime` meta); expanded read-only review in GROUP_ORDER with per-group collapse (Geral default-open), StatCard label/tag anatomy (14px semibold + FLAT/PERCENTUAL tag) and `formatStatValue` values; actions bar `flex-col sm:flex-row sm:justify-end` with Validar (accent primary) and Rejeitar (outline, destructive color reserved for the modal); Rejeitar opens the shared ConfirmDialog with the locked copy; success via page-level + per-row `text-success` aria-live lines + queue refetch (row leaves); `not_pending` → stale-row copy + refetch (T-06-11); single-flight `busy` disables every CTA.
- **HighlightsPage placeholder** (`src/features/highlights/HighlightsPage.tsx`): minimal stub rendering the loading line so the shell typechecks — plan 06-05 replaces the body entirely (explicit file-ownership ordering against a same-wave race).

## Task Commits

Each task was committed atomically:

1. **task 1: Create shared ConfirmDialog component** - `b092e0c` (feat)
2. **task 2: Wire 'validacoes' + 'destaques' tabs into App.tsx** - `5ddd42e` (feat; includes the HighlightsPage placeholder)
3. **task 3: Build ValidacoesPage (staff queue)** - `fb58c76` (feat)

**Plan metadata:** *(this commit)* (docs: complete plan)

## Verification

- `npx tsc -b` — exit 0 (full project, after task 3)
- `npm test` — 17 files / 284 tests, all green
- Locked-copy grep gates: all five strings present exactly once each in ValidacoesPage
- Read-only gate: 0 matches for `<input` / `<textarea` / `editar` in ValidacoesPage
- Accessibility gates: `aria-expanded` ×2, `aria-controls` ×2, `role="alert"` ×2, `aria-live` ×4
- Color gates: Validar uses `bg-accent`; Rejeitar uses `border-line` outline (destructive only in the modal); ConfirmDialog references only existing utilities

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2's verify gate was unsatisfiable as planned**
- **Found during:** task 2
- **Issue:** the task's `<verify>npx tsc -b</verify>` cannot exit 0 at that point — App.tsx imports `ValidacoesPage`, which task 3 creates later (the plan created a placeholder only for HighlightsPage, not for ValidacoesPage)
- **Fix:** verified task 2 with `npm test` (284/284, no typecheck dependency) and ran the full `npx tsc -b && npm test` gate after task 3 — both green. No code reordering; plan task order preserved.
- **Files modified:** none (verification sequencing only)
- **Commit:** n/a

## Known Stubs

| Stub | File | Reason | Resolves in |
|------|------|--------|-------------|
| HighlightsPage placeholder body | src/features/highlights/HighlightsPage.tsx | Plan-mandated interface stub so App.tsx tab wiring typechecks in this plan (explicit file-ownership ordering: 06-04 wires the shell, 06-05 owns the page to avoid a same-wave race on App.tsx) | Plan 06-05 (next wave) replaces the body entirely |

## Threat Flags

None — no new trust surface beyond the plan's threat register. All four mitigations applied as planned: T-06-01 (UX-only gate + `showValidacoes` content re-check; enforcement is the 0011 RPC staff gates), T-06-02 (zero value-modification affordance — grep-proven 0 inputs/editar; the only writes are the pending-scoped status RPCs, Rejeitar behind the modal), T-06-11 (`not_pending` → stale-row copy + refetch), T-06-12 (data flows only from `fetchOfficerQueue`; no REST fallback exists in the file).

## Self-Check: PASSED

- All 4 artifact files exist on disk — FOUND
- All 3 task commits present in git log (`b092e0c`, `5ddd42e`, `fb58c76`) — FOUND
- must_haves min_lines: ConfirmDialog 127 (≥40), ValidacoesPage 313 (≥120) — VERIFIED
- must_haves contains: `'validacoes'` in App.tsx (8 matches) — VERIFIED
- key_links: ValidacoesPage uses `fetchOfficerQueue`/`setSubmissionStatus` + refetch-after-action; App.tsx `showValidacoes` content re-check — VERIFIED
- tsc -b exit 0 + 284/284 tests — VERIFIED
