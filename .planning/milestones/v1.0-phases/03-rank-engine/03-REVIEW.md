---
phase: 03-rank-engine
reviewed: 2026-10-10T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/App.tsx
  - src/features/admin/KeyStatsPage.tsx
  - src/lib/api.test.ts
  - src/lib/api.ts
  - src/lib/rankMath.test.ts
  - src/lib/rankMath.ts
  - scripts/smoke-rank.mjs
  - scripts/smoke-rls.mjs
  - supabase/functions/verify-pin/index.ts
  - supabase/migrations/0007_staff_active_check.sql
  - supabase/migrations/0008_staff_active_check_fix.sql
  - supabase/migrations/0009_rank_engine.sql
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-10-10
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the Phase 3 rank-engine deliverables at standard depth: the 0009 rank RPC migration, the 0007/0008 staff-active RLS migrations, the verify-pin fix, the pure rank-math spec + tests, the REST wrappers + tests, the staff key-stats UI, and both live smoke scripts. Cross-file checks were performed: the SQL formula was verified against `rankMath.ts`/`rankMath.test.ts` locked vectors (74.25 / 49.5 / 99 / 0 / OVR 61-77-87 all reproduce), the 0009 `staff_select_key_stats` inline `exists` on members was traced through the 0008 members policies and confirmed free of 42P17 recursion, key-stat identity was confirmed absent from the `my_report` payload (RNK-02), and EXECUTE hygiene + internal officer/owner+active gates were confirmed on all three RPCs.

No critical issues found — the security invariants (member-invisible key-stat config, JWT-derived identity, active-flag revocation, append-only submissions, hashed PINs, rate-limited attempts) all hold in the reviewed code. Two warnings: a state-clobbering race in `KeyStatsPage` when the officer switches class during an in-flight toggle, and an undocumented spec divergence where `my_report` rounds per-stat points to 2 decimals while the locked 03-01 spec is unrounded. The rest are robustness/maintenance notes.

## Warnings

### WR-01: Class switch during an in-flight toggle clobbers per-class state

**File:** `src/features/admin/KeyStatsPage.tsx:130-153` (interacting with the effect at `112-128`)
**Issue:** `handleToggle` captures `selectedClass` at click time, but the class `<select>` (`193-205`) is never disabled while `toggling` is true. If the officer clicks a chip for class A and then switches the select to class B before the toggle resolves: (1) the class-B effect resets `keyStats`/`top5` to `null` and starts loading B; (2) the toggle continuation then runs `setKeyStats(...)` — applying class A's `statKey` to whatever state is current (with `keys === null` it becomes `[statKey]`, a phantom selection for class B) — and then calls `loadClassData(selectedClass)` with the **captured** class A, overwriting the effect's in-flight class-B load. The rendered result is the class-B header showing class A's key stats and top-5 preview. The `cancelled` flag protects only the effect's own promise, not the toggle's continuation, so nothing guards this path.
**Fix:** Guard the toggle continuation against class changes — disable the select while busy and compare the class captured at click time before applying state:

```tsx
<select
  id="keystats-class"
  value={selectedClass}
  onChange={(e) => setSelectedClass(e.target.value)}
  disabled={busy} // ← add
  ...
/>

async function handleToggle(statKey: string, enabled: boolean) {
  const className = selectedClass
  ...
  await setKeyStat(session, className, statKey, enabled)
  if (className !== selectedClassRef.current) return // class switched mid-flight; the new class's effect owns state now
  setKeyStats((keys) =>
    enabled ? [...(keys ?? []), statKey] : (keys ?? []).filter((k) => k !== statKey),
  )
  ...
}
```

(Use a `useRef` mirroring `selectedClass`, or a per-class request-id counter.)

### WR-02: `my_report` per-stat points are rounded to 2 decimals — undocumented divergence from the 03-01 locked spec

**File:** `supabase/migrations/0009_rank_engine.sql:174-183` (comment claiming otherwise at `194-195`)
**Issue:** The stats array wraps the percentile formula in `round(..., 2)`. The 03-01 executable spec (`rankMath.ts`) returns the raw formula value and its test header locks the contract as exact decimals; `rankMath.test.ts` states the smoke "must reproduce these EXACT values". For most cohort sizes the quotient has >2 decimals — e.g. a tie of 2 in the middle of a 5-member cohort: `(1 + 0.5) / 4 * 99 = 12.375`, which the RPC returns as `12.38` while the spec yields `12.375`. Every smoke/lock vector happens to have ≤2 decimals, so the divergence is untested and invisible. OVR inputs inside the same function stay unrounded, so OVR is unaffected — but Phase 4 will render the per-stat `points` and any client-side comparison against spec-exact values will disagree. The comment at line 195 ("per-stat points stay unrounded here too") is at best misleading about which block it covers.
**Fix:** Either remove `round(..., 2)` so the RPC matches the spec exactly (rounding becomes a Phase 4 display concern, as the spec dictates), or explicitly document the 2-dp presentation rounding in the function comment, the 03-01 spec header, and the plan's locked contract — and add a smoke vector with a 3-decimal value (e.g. 5-member cohort, odd below-count) so the divergence is at least pinned by a test.

## Info

### IN-01: Deactivated-officer reactivation flag is set only after the update returns

**File:** `scripts/smoke-rls.mjs:303-304` (finally block at `327-337`)
**Issue:** `officerDeactivated = true` is assigned after `await mgmtQuery(update ... set active = false)`. If the server applies the update but the response is lost (network error/timeout), the assignment never runs, the `finally` block skips reactivation, and the live smoke officer is left permanently deactivated — despite the WR-06 comment claiming "ALWAYS reactivate". Also, the `ZZSmokeDeactivated` class deletion lives inside `if (officerDeactivated)`, so residue can escape if a later `mgmtQuery` in `finally` throws (the script then exits via `main().catch`).
**Fix:** Set the flag before the await (or use try/catch around the update with reactivation attempted unconditionally), and move the `ZZSmokeDeactivated` cleanup out of the `if`.

### IN-02: smoke-rank prints "RANK SMOKE PASSED" even when cleanup failed

**File:** `scripts/smoke-rank.mjs:497-513`
**Issue:** The cleanup in `finally` sets `process.exitCode = 1` on failure, but the post-`finally` block still prints `RANK SMOKE PASSED` when `failures` is empty. Exit code is preserved, but the success banner contradicts the `CLEANUP FAILED` line directly above it and can mislead a human skimming CI output.
**Fix:** Track cleanup success (e.g. `let cleanupOk = true`) and gate the banner: `if (failures.length === 0 && cleanupOk) console.log('RANK SMOKE PASSED')`.

### IN-03: Percentile formula duplicated in two places in 0009

**File:** `supabase/migrations/0009_rank_engine.sql:174-183` and `203-211`
**Issue:** The points expression (`countBelow + (ties-1)::numeric/2, / (n-1) * 99`) is written out twice — once in the per-stat `stats` block, once in the OVR block — and a third variant (without `round`) exists in `class_top5` (`309-311`). Any future tie-semantics or cohort-rule change must be edited in three places; a miss would silently desynchronize per-stat points, OVR, and the top-5 preview.
**Fix:** Extract the expression into a single immutable SQL helper (e.g. `rank_points(p_stat_key uuid_or_text, p_member uuid, p_cohort ...)`) or a shared CTE fragment, and have all three call sites use it.

### IN-04: `parseBody` lets raw `SyntaxError` escape the `ApiError` contract

**File:** `src/lib/api.ts:74-78`
**Issue:** `JSON.parse(text)` on a non-JSON 2xx body (proxy HTML page, truncated response) throws a bare `SyntaxError`, not an `ApiError`. Callers keying on `err instanceof ApiError` (e.g. `KeyStatsPage`'s error mapping at `54-61`, `88-93`) fall through to the generic NETWORK_ERROR copy, and any future caller that only handles `ApiError` will get an unhandled rejection. The failure is misclassified: the server *responded*, the body was malformed.
**Fix:** Wrap the parse in `try/catch` inside `parseBody` and rethrow as `new ApiError(res.status, 'server', 'invalid JSON response body')`.

### IN-05: `updateCharacter` interpolates the member id without encoding

**File:** `src/lib/api.ts:127`
**Issue:** `/members?id=eq.${id}` does not `encodeURIComponent(id)`, unlike `fetchKeyStats` which hardens its class filter (`161`). The id is a server-issued uuid so this is not exploitable today, but the inconsistency means a future caller passing arbitrary text (or an id-shaped value with `=`/`&`) would corrupt the PostgREST filter silently.
**Fix:** `await restFetch(session, `/members?id=eq.${encodeURIComponent(id)}`, ...)` for consistency with the 03-04 hardening precedent.

### IN-06: Demotion (role change) is not revoked until token expiry — only deactivation is

**File:** `supabase/migrations/0009_rank_engine.sql:62` (and `0008_staff_active_check_fix.sql` policies)
**Issue:** The internal gates and staff policies check the frozen `member_role` JWT claim (7-day life) plus the live `active` flag. D-14 closes the deactivation hole, but demoting an officer to `member` without deactivating them leaves `set_key_stat`, `class_top5`, and all staff RLS policies open for up to 7 days. This is a systemic property of the claim design (not new in Phase 3), but it is worth an explicit decision entry since the rank RPCs are the highest-value staff surface.
**Fix:** Either document demotion-requires-deactivation as the operational rule for officers, or fold the live `role` column into the gate the same way the `active` flag is (the SECURITY DEFINER subquery in `set_key_stat`/`class_top5` already reads `members` — select `m.role` and compare it to the claim there too).

### IN-07: Lockout gate is read-then-act — a concurrent burst can exceed MAX_ATTEMPTS

**File:** `supabase/functions/verify-pin/index.ts:88-100`
**Issue:** The lockout check reads `pin_login_attempts` before the bcrypt compare, but concurrent wrong-PIN requests all pass the gate before the first `record_pin_failure` commits. N parallel attempts therefore all perform bcrypt work and all record a failure — the atomic RPC engages the lock at 5, but attempts already in flight still burn compute and inflate `failed_count` past 5. The window is small and no lockout *bypass* is possible (the RPC is the authority), so this is hardening, not a vulnerability.
**Fix:** Optional: have `record_pin_failure` return the post-lock state and re-check `isLocked` on its result, short-circuiting the response for requests that raced the lock.

---

_Reviewed: 2026-10-10_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
