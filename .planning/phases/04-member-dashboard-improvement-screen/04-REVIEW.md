---
phase: 04-member-dashboard-improvement-screen
reviewed: 2026-10-11T00:09:24Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/App.tsx
  - src/lib/api.ts
  - src/lib/api.test.ts
  - src/lib/groups.ts
  - src/features/admin/KeyStatsPage.tsx
  - src/features/dashboard/presentation.ts
  - src/features/dashboard/presentation.test.ts
  - src/features/dashboard/StatCard.tsx
  - src/features/dashboard/OvrHero.tsx
  - src/features/dashboard/TierLegend.tsx
  - src/features/dashboard/CollapsibleGroup.tsx
  - src/features/dashboard/FocusStrip.tsx
  - src/features/dashboard/DashboardPage.tsx
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues
---

# Phase 4: Code Review Report

**Reviewed:** 2026-10-11T00:09:24Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

All 13 Phase-4 files were read in full and cross-referenced against their imports
(`session.ts`, `RequireAuth.tsx`, `parseStatValue.ts`, `index.css` tier tokens,
`0001_schema.sql`, `0009_rank_engine.sql`). Verification run: `npm test` (128
passed), `npm run build` (clean), `npm run lint` (4 warnings, 1 in scope).

The security posture is correct per AGENTS.md and the accepted-leak list:
`MyReport`/the member contract carries no key-stat identity, key-stat config is
only touched through the sanctioned staff-only `fetchKeyStats`/`setKeyStat`
wrappers (RNK-02 scoped gate respected — not re-reported), the dashboard renders
the RPC output verbatim, and no client-side rank math exists. No secrets, debug
artifacts, XSS sinks, or injection-prone interpolations beyond WR-02.

The dominant problem is a stale-response race in `KeyStatsPage` that can display
one class's key-stat configuration under another class's heading and lead an
officer to persist unintended key-stat changes — flagged BLOCKER because
key-stat config drives every member's OVR.

## Critical Issues

### CR-01: Stale-class data race — wrong class's key-stat config displayed and writable

**Severity:** BLOCKER
**File:** `src/features/admin/KeyStatsPage.tsx:85-95` (also `97-113`, `115-138`)
**Issue:** `loadClassData` calls `setKeyStats`/`setTop5` unconditionally when its
promises resolve. The per-class effect's `cancelled` flag (line 99) only guards
`setClassError` in the `.catch` — the success-path state writes have no
staleness guard at all. Two concrete failure paths:

1. **Rapid class switch with out-of-order responses.** Officer selects class A
   (fetch A in flight), then quickly selects B. The effect for B resets state
   and starts fetch B. If A's responses resolve after B's (no ordering
   guarantee across independent HTTPS requests), `loadClassData(A)` overwrites
   the view with A's key-stat chips and top-5 while the heading and selector say
   class B.
2. **Mid-toggle class switch (deterministic).** The class `<select>` is NOT
   disabled during `toggling` (only the chips are). An officer who switches
   class while a toggle is in flight lets `handleToggle`'s refresh-after-save
   run `loadClassData(selectedClass)` with the class captured at click time —
   guaranteed to overwrite the new class's view with the old class's data.

Consequence: the officer makes toggle decisions from another class's displayed
config (wrong `selected` flags, wrong n/6 count, wrong block-at-6 gating) and
`handleToggle` persists those misinformed decisions to the currently selected
class via `setKeyStat`. Key-stat config determines the OVR of every member in the
guild, so this is a data-integrity risk, not just a display glitch.

**Fix:** Make `loadClassData` staleness-aware — pass a guard into it and check
before every state write, and disable the selector while toggling:

```tsx
const selectedClassRef = useRef(selectedClass)
selectedClassRef.current = selectedClass // or keep in sync via effect

const loadClassData = useCallback(
  async (className: string) => {
    const [keys, preview] = await Promise.all([
      fetchKeyStats(session, className),
      fetchClassTop5(session, className),
    ])
    if (selectedClassRef.current !== className) return // stale response — drop
    setKeyStats(keys)
    setTop5(preview)
  },
  [session],
)
```

and in the per-class effect, fold the existing `cancelled` flag into the same
guard. Additionally add `disabled={toggling}` to the class `<select>` (line 178)
so a toggle's captured class can never diverge from the selector.

## Warnings

### WR-01: Top-5 list keys on `display_name`, which has no uniqueness guarantee

**Severity:** WARNING
**File:** `src/features/admin/KeyStatsPage.tsx:264`
**Issue:** `key={row.display_name}` — `members.display_name` is `text not null`
with NO unique constraint (`supabase/migrations/0001_schema.sql:5`); it is an
in-game nickname set per member. Two members of the same class with the same
display name produce duplicate React keys: a console error and potential
misrender of the ordered top-5 list (items can be dropped/deduplicated by React
during reconciles).

**Fix:** Either extend the `class_top5` RPC select to return the member id and
key on it (`m.id` is already selected at `0009_rank_engine.sql:269` — add
`'id'` to the `jsonb_build_object` and type it in `ClassTop5Row`), or use a
composite key as a stopgap:

```tsx
{top5.map((row, index) => (
  <li key={`${row.display_name}-${index}`} ...>
```

### WR-02: `updateCharacter` interpolates `id` into the path without encoding

**Severity:** WARNING
**File:** `src/lib/api.ts:127`
**Issue:** `` `/members?id=eq.${id}` `` — the only remaining unencoded path
interpolation in the data layer. `fetchKeyStats` deliberately encodes its
parameter (api.ts:161) and even has a dedicated test titled "interpolation
hardening" (api.test.ts:161), so this is an inconsistency against the project's
own hardening standard. In the normal flow the id is a server-issued UUID, but
the function signature accepts any string and a crafted value could inject
PostgREST query operators.

**Fix:**
```ts
await restFetch(session, `/members?id=eq.${encodeURIComponent(id)}`, {
  method: 'PATCH',
  body: JSON.stringify(patch),
})
```

### WR-03: `parseBody` can return `undefined`; `fetchCatalog`/`fetchMyReport` don't guard — render-path crash

**Severity:** WARNING
**File:** `src/lib/api.ts:74-78` (also `80-86`, `221-229`)
**Issue:** `parseBody` maps an empty 2xx body to `undefined` (PostgREST returns
`200` + empty body when an RPC returns NULL, and edge 204s are possible). Every
other wrapper guards it — `fetchClasses`/`fetchMembers`/`fetchMySubmissions`/
`fetchKeyStats` all use `?? []` or `rows?.[0]` — but `fetchCatalog` and
`fetchMyReport` return the raw `parseBody` result typed as non-nullable
(`StatCatalogEntry[]` / `MyReport`). If `my_report` ever returns NULL, the
dashboard crashes at `report.stats.every(...)` (`DashboardPage.tsx:100`) with
no error boundary (white screen); an equivalent empty-body catalog response
crashes KeyStatsPage at `catalog.filter(...)` (`KeyStatsPage.tsx:225`). The
failure mode is outside the client's control (server/proxy behavior), so the
client must not assume the happy shape.

**Fix:**
```ts
export async function fetchCatalog(session: NeoFootSession): Promise<StatCatalogEntry[]> {
  const res = await restFetch(session, '/stat_catalog?select=...')
  return (await parseBody<StatCatalogEntry[]>(res)) ?? []
}

export async function fetchMyReport(session: NeoFootSession): Promise<MyReport> {
  const res = await restFetch(session, '/rpc/my_report', { method: 'POST', body: JSON.stringify({}) })
  const report = await parseBody<MyReport>(res)
  if (!report || !Array.isArray(report.stats)) {
    throw new ApiError(0, 'server', 'malformed my_report response')
  }
  return report
}
```

## Info

### IN-01: Provable dead null-branches around tier lookups

**File:** `src/features/dashboard/StatCard.tsx:32-38`, `src/features/dashboard/FocusStrip.tsx:39`
**Issue:** `tierForPoints` returns `null` only for `null` input
(presentation.ts:10-16), so whenever `points !== null` (which is the exact
condition guarding these expressions), `tier` is non-null. StatCard's final
`: null` (line 38) and FocusStrip's `tier ? TIER_TEXT[tier] : ''` are
unreachable. Dead branches in a "locked state matrix" suggest an intended
fourth state that isn't actually representable — worth either removing or
commenting so future readers don't hunt for the missing case.
**Fix:** Simplify to the two reachable states, or drop the ternary and use
`TIER_TEXT[tier]` directly with a comment noting the invariant.

### IN-02: Redundant null re-check in OvrHero

**File:** `src/features/dashboard/OvrHero.tsx:24`
**Issue:** `sufficient && ovr.value !== null` — `sufficient` (line 22) already
conjoins `ovr.value !== null`, so the second conjunct is dead weight (a TS
narrowing artifact).
**Fix:** `const rounded = sufficient ? Math.round(ovr.value as number) : null`
or restructure so the narrowing happens once.

### IN-03: Unreachable `Math.min(90, ...)` clamp in percentilePhrase

**File:** `src/features/dashboard/presentation.ts:32`
**Issue:** For in-contract inputs (`points ∈ [0,100]`), `band` is
mathematically in `[0, 50]` in both branches, so the `Math.min(90, ...)` half of
the clamp can never fire (the `Math.max(10, ...)` half is the live one). Harm
is limited to a false sense of coverage — but it also means out-of-contract
values (e.g. `points = 101` → band 0 → clamped to 10 → "10% melhores") are
silently coerced instead of being caught.
**Fix:** Drop the `Math.min`, or assert the contract:

```ts
if (points < 0 || points > 100) return `${label}: —` // or clamp points first
const b = Math.max(10, band)
```

### IN-04: oxlint `react(set-state-in-effect` warning in the per-class effect

**File:** `src/features/admin/KeyStatsPage.tsx:100-103`
**Issue:** The synchronous `setKeyStats(null)`/`setTop5(null)`/`setClassError(null)`/
`setToggleError(null)` cascade inside the effect is flagged by the project's own
lint (1 of 4 total warnings, the only one in the reviewed scope). The identical
pattern exists in `CharactersPage.tsx:77` and `ReviewStep.tsx:57`, so it is an
accepted codebase idiom, not a Phase-4 regression — recorded here for
completeness.
**Fix:** If desired, reset per-class state in the `onChange` handler that sets
`selectedClass` (the event that causes the change) instead of inside the effect.

### IN-05: Lingering-staff-tab fallback loses `aria-current` on the nav

**File:** `src/App.tsx:40-45`, `71`, `92`, `104`
**Issue:** The documented fallback (staff tab lingering into a member session
renders DashboardPage) leaves `tab === 'characters'` with `isStaff === false`:
Dashboard content is shown but the Painel button's `aria-current` check is
`tab === 'painel'`, so NO nav button reports `aria-current="page"` while the
dashboard is visibly on screen. Screen-reader users get no current-section
signal in this edge state.
**Fix:** Derive the highlight from the rendered content instead of raw `tab`:

```tsx
const activeTab: Tab =
  showCharacters ? 'characters' : showKeyStats ? 'keystats' : showSubmit ? 'submit' : 'painel'
// then use aria-current={activeTab === 'painel' ? 'page' : undefined} etc.
```

---

**Verification evidence:** `npm test` — 8 files / 128 tests passed;
`npm run build` — clean (81 modules, tsc + vite); `npm run lint` — 0 errors,
4 warnings (1 in scope, see IN-04). Security rules from AGENTS.md verified:
key-stat identity absent from the member contract; members receive aggregates
only; no client-side rank math; accepted leaks (T-03-10 / Pitfall 4) not
re-reported.

_Reviewed: 2026-10-11T00:09:24Z_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
