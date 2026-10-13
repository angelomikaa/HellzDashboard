---
phase: 04-member-dashboard-improvement-screen
fixed_at: 2026-10-11T03:50:00Z
review_path: .planning/phases/04-member-dashboard-improvement-screen/04-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-10-11T03:50:00Z
**Source review:** .planning/phases/04-member-dashboard-improvement-screen/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (fix_scope: critical_warning): 4 (1 Critical, 3 Warnings)
- Fixed: 4
- Skipped: 0
- Info findings (IN-01..IN-05): out of scope — listed below, not attempted

All fixes are client-side only. No migrations touched, nothing deployed.
Known-accepted items were left as-is per review: the RNK-02 scoped gate
(staff-only `fetchKeyStats` wrapper) and the T-03-10 accepted aggregate leak.

Verification (after all fixes): `npm test` — 8 files / **132 tests passed**
(128 baseline + 4 new); `npm run build` — clean (tsc + vite, 81 modules);
`npm run lint` — 0 errors, 4 warnings (same 4 as the review baseline; the
in-scope one is IN-04's accepted `set-state-in-effect` idiom, untouched).

## Fixed Issues

### CR-01: Stale-class data race — wrong class's key-stat config displayed and writable

**Files modified:** `src/features/admin/KeyStatsPage.tsx`
**Commit:** `85048c5`
**Status:** fixed — requires human verification (state-handling logic fix;
no component-test harness exists — see note below)

**Applied fix** (adapted to the project's established effect-cancellation
pattern, per phase guidance, instead of the review's ref-based variant):

1. `loadClassData` now takes an optional `isStale?: () => boolean` guard and
   checks it after its `Promise.all` resolves, before `setKeyStats`/
   `setTop5` — a stale (out-of-order) response for a previously selected
   class is dropped instead of overwriting the current class's view.
2. The per-class effect passes its existing `cancelled` flag as the guard
   (`loadClassData(selectedClass, () => cancelled)`), so the flag now guards
   ALL state writes for that fetch — success path via `isStale`, error path
   via the existing `cancelled` check in `.catch`.
3. The class `<select>` is now `disabled={busy}` while a toggle is in flight
   (with the same `disabled:cursor-not-allowed disabled:opacity-60` affordance
   the chips use), closing the deterministic mid-toggle race: the
   refresh-after-save in `handleToggle` can no longer run with a class that
   diverges from the selector. A comment there documents why the refresh
   needs no staleness guard of its own (selector disabled ⇒ `selectedClass`
   can't change mid-toggle).

No new tests: the repo has no React component-test harness (no
testing-library; the suite tests logic modules only — `api.test.ts`,
`presentation.test.ts`, etc.), and the race guard lives inside the
component. Verified instead via `tsc -b` (clean) + full suite/build/lint
green. Recommend manual verification: rapid class switching under a slow
connection shows no cross-class bleed; the selector greys out during a
toggle.

### WR-01: Top-5 list keys on `display_name`, which has no uniqueness guarantee

**Files modified:** `src/features/admin/KeyStatsPage.tsx`
**Commit:** `044fe45`

**Applied fix:** composite key `` key={`${row.display_name}-${index}`} ``
(the review's stopgap option). The preferred fix (returning member `id`
from the `class_top5` RPC's `jsonb_build_object`) requires a server
migration — out of scope for these client-side-only fixes. A comment at
the key documents the trade-off and the migration path.

### WR-02: `updateCharacter` interpolates `id` into the path without encoding

**Files modified:** `src/lib/api.ts`, `src/lib/api.test.ts`
**Commit:** `0b502fc`

**Applied fix:** `` `/members?id=eq.${encodeURIComponent(id)}` `` — same
hardening standard as `fetchKeyStats`. Added the test
"updateCharacter URL-encodes the id (interpolation hardening)" mirroring
the existing `fetchKeyStats` hardening test style. The pre-existing
UUID-path assertion still holds (encodeURIComponent is identity for UUIDs).

### WR-03: `parseBody` can return `undefined`; `fetchCatalog`/`fetchMyReport` don't guard — render-path crash

**Files modified:** `src/lib/api.ts`, `src/lib/api.test.ts`
**Commit:** `fe367cb`

**Applied fix:** exactly the review's suggested shape:

- `fetchCatalog`: `return (await parseBody<StatCatalogEntry[]>(res)) ?? []`
  — same `?? []` guard as every other list wrapper.
- `fetchMyReport`: parses, then throws
  `new ApiError(0, 'server', 'malformed my_report response')` when the body
  is empty/`undefined` or `stats` is not an array, keeping the render path
  crash-free and the error enumeration-safe.

Added 3 tests (catalog empty 2xx body → `[]`; my_report empty body →
ApiError `server`; my_report non-array `stats` → ApiError `server`).
One pre-existing test fixture was adapted: the request-level
"fetchMyReport POSTs … with both gateway headers" test stubbed the body as
`'[]'`, which the new guard intentionally rejects — its stub now returns a
minimal valid `MyReport` shape; the test's assertions (URL, method, body,
headers) are unchanged.

## Out of Scope (Info findings — not attempted)

### IN-01: Provable dead null-branches around tier lookups

**Reason:** Info severity, excluded by fix_scope (critical_warning).

### IN-02: Redundant null re-check in OvrHero

**Reason:** Info severity, excluded by fix_scope (critical_warning).

### IN-03: Unreachable `Math.min(90, ...)` clamp in percentilePhrase

**Reason:** Info severity, excluded by fix_scope (critical_warning).

### IN-04: oxlint `react(set-state-in-effect)` warning in the per-class effect

**Reason:** Info severity, excluded by fix_scope (critical_warning). Review
itself records it as an accepted codebase idiom (same pattern in
`CharactersPage.tsx`, `ReviewStep.tsx`) — the lint warning persists
unchanged (4 total warnings, identical to the review baseline).

### IN-05: Lingering-staff-tab fallback loses `aria-current` on the nav

**Reason:** Info severity, excluded by fix_scope (critical_warning).

---

_Fixed: 2026-10-11T03:50:00Z_
_Fixer: OpenCode (gsd-code-fixer)_
_Iteration: 1_
