---
phase: 02-registry-catalog-manual-data-ingestion
reviewed: 2026-10-09T12:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - public/examples/basic.svg
  - public/examples/general.svg
  - public/examples/quasi.svg
  - public/examples/special.svg
  - scripts/apply-seed.mjs
  - scripts/smoke-rls.mjs
  - src/App.tsx
  - src/features/admin/CharactersPage.tsx
  - src/features/auth/session.test.ts
  - src/features/submit/HistoryList.tsx
  - src/features/submit/ReviewStep.tsx
  - src/features/submit/StatGroupStep.tsx
  - src/features/submit/SubmitPage.tsx
  - src/features/submit/wizard.test.ts
  - src/features/submit/wizard.ts
  - src/lib/api.test.ts
  - src/lib/api.ts
  - src/lib/parseStatValue.test.ts
  - src/lib/parseStatValue.ts
  - supabase/migrations/0005_registry_catalog.sql
  - supabase/migrations/0006_staff_claim_fix.sql
  - supabase/seeds/classes.sql
  - supabase/seeds/stat_catalog.sql
findings:
  critical: 2
  warning: 7
  info: 7
  total: 16
status: issues_found
threats_open: 2
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-09T12:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Reviewed all 23 phase-2 files at standard depth: SQL migrations/seeds (live-applied —
corrective migrations required, not naive edits), live-ops scripts, the REST data layer,
the submit wizard, the admin characters page, and tests. Cross-referenced 0001–0004
migrations, `session.ts`, and the `verify-pin` Edge Function that the in-scope
`smoke-rls.mjs` depends on.

Overall: the client code is disciplined — explicit safe projections (never `select=*`),
enumeration-safe pt-BR copy, append-only submission paths, UX-only gating with server
enforcement, and `pin_hash` provably unreachable. The live RLS matrix passing is
legitimate evidence for the policies it exercises. However, the staff policies
reintroduce exactly the deactivation-revocation gap that migration 0004 fixed for
members (CR-01), two grant-layer statements do not do what their comments claim
(WR-01/WR-02), and cross-referencing the login dependency surfaced a repo-vs-live
drift that would break all logins on the next deploy (CR-02). The wizard has one
real state trap (WR-03).

## Critical Issues

### CR-01: Staff RLS policies have no `active` check — a deactivated officer/owner keeps full staff access for up to 7 days

**File:** `supabase/migrations/0006_staff_claim_fix.sql:16-30` (policies originally created in `supabase/migrations/0005_registry_catalog.sql:35-42`)
**Issue:** Migration 0004 (`0004_rls_active.sql`) established the invariant that
deactivating a member (`active=false`) must revoke already-minted tokens — its own
header says "deactivate revokes already-minted tokens" and it added `and active` /
`exists (... m.active)` checks to every member-facing policy. The three NEW staff
policies shipped in this phase — `staff_select_all_members`, `staff_update_characters`,
`staff_insert_classes`, in both 0005 and the 0006 rewrite — match only on
`auth.jwt()->>'member_role' in ('officer','owner')` with no `active` check on the
caller. The JWT claim is frozen at login for 7 days (D-06), so an officer removed
from the guild keeps: reading every member's row (handles, display names, roles),
mutating any member's `display_name`/`char_class`/`char_function`, and inserting
classes — until token expiry. The live smoke matrix cannot catch this because both
smoke accounts are active. This is an authorization gap against the project's
non-negotiable "non-whitelisted access blocked at the server" and the documented
Phase 6 removal mechanism (`active=false` is the revocation path).
**Fix:** The migrations are live — ship a corrective `0007_staff_active_check.sql`
mirroring the 0004 pattern (do NOT edit 0005/0006 in place):
```sql
drop policy if exists staff_select_all_members on members;
create policy staff_select_all_members on members
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

drop policy if exists staff_update_characters on members;
create policy staff_update_characters on members
  for update to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active))
  with check (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

drop policy if exists staff_insert_classes on classes;
create policy staff_insert_classes on classes
  for insert to authenticated
  with check (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));
```
Then extend `scripts/smoke-rls.mjs` with an assertion that deactivates the smoke
officer via the Management API, re-tests staff reads/writes expecting denial, and
reactivates — so the matrix live-proves this invariant too.

### CR-02: `verify-pin` references an undeclared identifier — the repo's login path always returns 400 (repo-vs-live drift; hard dependency of in-scope `smoke-rls.mjs`)

**File:** `supabase/functions/verify-pin/index.ts:58` (cross-file finding — outside the declared 23-file scope, surfaced by tracing `scripts/smoke-rls.mjs:72-90 login()`, which is in scope)
**Issue:** Line 58 reads
`const handle = typeof discordHandle === 'string' ? discordHandle.trim() : ''`.
`discordHandle` is never declared (the parsed body field is `body.discord_handle`).
`typeof` on an undeclared identifier does not throw — it evaluates to `'undefined'`,
so `handle` is ALWAYS `''` and every request fails the `handle.length === 0` guard with
400 `invalid_request`. As written, the repo's verify-pin cannot log anyone in. The
prompt states the live smoke matrix passes (login is its first step), which proves
the deployed function does NOT match this repo file — a dangerous drift: the next
`functions deploy` from this tree bricks all logins. It also silently invalidates the
"live-proven" claims that this phase's scripts and 14-assertion matrix rest on.
**Fix:** Correct line 58 to read the parsed body:
```ts
const handle = typeof body.discord_handle === 'string' ? body.discord_handle.trim() : ''
```
Then reconcile repo vs live immediately: redeploy verify-pin from the fixed source and
re-run `scripts/smoke-rls.mjs` against live to confirm the deployed artifact matches
the repo. (Verify-pin is a Phase 1 file — routing the fix through the 01 code-review-fix
workflow is appropriate — but the drift must be resolved before anything in this
phase can claim live validation.)

## Warnings

### WR-01: `classes` table never revokes Supabase default privileges — anon/authenticated hold table-level ALL grants, contradicting the migration's own comment

**File:** `supabase/migrations/0005_registry_catalog.sql:10-15`
**Issue:** On `members`, this migration correctly does revoke-then-grant (lines 30-33),
which only makes sense because Supabase's default privileges grant ALL on new public
tables to `anon` and `authenticated` — that is why the revoke was needed. `classes` is
created fresh in this same migration but only receives `grant select, insert on
classes to authenticated;` with the comment "no update/delete to any client
credential" (line 15). No revoke runs, so by the project's own demonstrated default
privileges: `anon` retains ALL grants on `classes` (select/insert/update/delete), and
`authenticated` retains default UPDATE/DELETE in addition to the intended
select/insert. The comment's claim is false at the grant layer. RLS currently blocks
everything (no anon policies; no update/delete policies), so behavior is safe today —
but this is exactly the single-layer-of-defense posture the members hardening in this
same file abandoned, and any future policy mistake becomes exploitable.
**Fix:** Corrective migration (0005 is live):
```sql
revoke all on classes from anon, authenticated;
grant select, insert on classes to authenticated;
```
and fix the comment to describe the real grant state.

### WR-02: `revoke execute on function create_submission(jsonb) from anon;` is a no-op — EXECUTE is granted to PUBLIC by default

**File:** `supabase/migrations/0005_registry_catalog.sql:76`
**Issue:** Postgres grants function EXECUTE to `PUBLIC` at creation. `REVOKE ... FROM
anon` only removes privileges granted *directly* to `anon`; the PUBLIC grant is
untouched, so anon still holds EXECUTE and PostgREST still exposes
`/rpc/create_submission` to the anon key. The function currently fails closed because
an anon JWT has no `member_id` claim (`raise 'no_member_claim'`) and the insert
policies deny anon — but the stated hardening line does nothing, and the smoke matrix
never probes anon against the RPC.
**Fix:** Corrective migration:
```sql
revoke execute on function create_submission(jsonb) from public;
grant execute on function create_submission(jsonb) to authenticated;
```
and add an anon-probe assertion to `scripts/smoke-rls.mjs`.

### WR-03: Step 1 "Continuar" ignores an invalid Poder de Combate — step 2 then blocks silently with no visible cause

**File:** `src/features/submit/SubmitPage.tsx:327-335` (interacts with `src/features/submit/wizard.ts:42-55` and `SubmitPage.tsx:340-343`)
**Issue:** `combat_power` is optional but "typed garbage" must parse
(`groupComplete`: `blank || parseStatValue(raw).ok`, wizard.ts:52). The step-1
Continuar button (line 327-335) has NO `disabled` condition, so a player who typed an
unparseable `combat_power` (e.g. `abc`) sails past step 1 — where the INVALID_HINT
lives — and lands on step 2, whose Continuar IS gated on
`groupComplete(catalog, 'general', inputs)` (line 340-343). Because
`groupEntries('general')` excludes `combat_power` (line 181-184), no field on step 2
shows any error, yet the button stays disabled with no explanation. The only escape is
guessing to go back to step 1.
**Fix:** Gate step 1 the same way the other steps are gated:
```tsx
{step === 1 && (
  <button
    type="button"
    onClick={() => setStep(2)}
    disabled={combatPowerInvalid}
    className="... disabled:cursor-not-allowed disabled:opacity-60"
  >
    Continuar
  </button>
)}
```
(Optionally also surface the invalid combat_power value as `—` with a "fix on step 1"
cue in ReviewStep, since `buildStatsPayload` silently drops unparseable optionals.)

### WR-04: Expired-session (401) failures in the submit/save paths show "check your connection" retry copy instead of session copy

**File:** `src/features/submit/SubmitPage.tsx:140-142`, `src/features/admin/CharactersPage.tsx:108-110` and `147-148`
**Issue:** `HistoryList.tsx:44-49` correctly maps `ApiError.kind === 'unauthorized'`
to SESSION_ERROR, but the write paths catch everything as generic copy:
`handleSubmit` → SUBMIT_ERROR ("Verifique sua conexão"), `handleAddClass` →
ADD_CLASS_ERROR ("Verifique a conexão"), `handleSave` → SAVE_ERROR ("tente
novamente"). With an expired token the retry can never succeed, so the player/officer
is told to retry forever with state that cannot be saved (and the officer may believe
a save succeeded after later re-login when it did not).
**Fix:** In each catch, branch on the error kind the way HistoryList does:
```ts
} catch (err) {
  setSubmitError(
    err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : SUBMIT_ERROR,
  )
}
```
(same pattern for `handleAddClass`/`handleSave` in CharactersPage).

### WR-05: CharactersPage edit mode has no cancel affordance — the only exits are a DB write or a page reload

**File:** `src/features/admin/CharactersPage.tsx:320-354`
**Issue:** Clicking "Editar" puts a row into edit mode (draft populated from live
data), but the action cell then renders only "Salvar" — there is no "Cancelar" button
and no other path that clears `draft` except a successful save. An officer who
misclicks Editar (or starts editing the wrong member) must either commit a write or
abandon the page. Given saves mutate other people's registry rows, forcing a write
to escape the UI is a data-integrity hazard, and a mid-edit `display_name`/class is
one distracted click away from being persisted.
**Fix:** Add a cancel button in the editing branch:
```tsx
<button type="button" onClick={() => setDraft(null)} disabled={saving}
  className="... border border-line ...">
  Cancelar
</button>
```

### WR-06: Smoke matrix check 9 permanently mutates the live placeholder member row with no restore

**File:** `scripts/smoke-rls.mjs:213-231` (cleanup at 264-270)
**Issue:** Check 9 PATCHes the live `member-handle` row to
`char_class='Assassin', char_function='tank'` and only verifies the effect — it never
restores the previous values, and the cleanup block (264-270) removes only the smoke
class and smoke submission. Every run silently rewrites live member data. It happens
to be the throwaway placeholder account today, but the script hardcodes the patch, so
if it is ever repointed at a real account (handles are consts at lines 53-54), each
run corrupts that member's registered class/function — data that Phase 3 rank RPCs
partition on.
**Fix:** Read the row's current `char_class`/`char_function` before the PATCH
(already fetched via the officer projection in check 6) and restore them in the
cleanup block via `mgmtQuery`, e.g.:
```js
// before patching:
const before = rows.find((r) => r.id === member.member_id)
// in cleanup:
await mgmtQuery(`update members set char_class = ${before.char_class === null ? 'null' : `'${before.char_class}'`}, char_function = '${before.char_function}' where id = '${member.member_id}';`)
```

### WR-07: Unbounded text inputs — no `maxLength` on class name / display name, and no DB length constraints to back them

**File:** `src/features/admin/CharactersPage.tsx:173-181` (class input) and `245-255` (name input); `supabase/migrations/0005_registry_catalog.sql:10-13` and `24-26`
**Issue:** `members.discord_handle` got an explicit DB length bound in 0003 (the WR-04
fix), but this phase adds `classes.class_name text primary key` and editable
`members.display_name` with no length constraint, and the admin inputs have no
`maxLength`. An officer can paste a multi-megabyte class name or display name; it is
stored, rendered in every dropdown/table row, and echoed in the
`Classe "..." adicionada` message. Staff-only blast radius, but it is exactly the
unbounded-junk-input class of defect the project already fixed once for handles.
**Fix:** Corrective migration for the live tables:
```sql
alter table classes add constraint classes_name_len check (char_length(class_name) between 1 and 64);
alter table members add constraint members_display_name_len check (char_length(display_name) between 1 and 64);
```
plus `maxLength={64}` on both inputs in CharactersPage (the client gate is UX-only;
the constraint is the enforcement).

## Info

### IN-01: Stale `characters` tab after a staff→member session switch leaves the placeholder content with no tab marked current

**File:** `src/App.tsx:33-37, 94-102`
**Issue:** `tab` state survives logout/login (App stays mounted). If a staff user on
`characters` logs out and a member logs in, `showCharacters` is false and `showSubmit`
is false, so the Painel placeholder renders — but `aria-current` on the nav is driven
by raw `tab`, so NO tab is marked current for the member. Content and nav disagree.
**Fix:** Either reset `tab` to `'painel'` when the session identity changes (e.g. key
the nav on `session.member_id`), or compute the highlighted tab from the same
derived state used for content.

### IN-02: Smoke cleanup interpolates the RPC-returned uuid into SQL before the format check gates it

**File:** `scripts/smoke-rls.mjs:265-267`
**Issue:** `uuid` is format-validated inside check 11's assertion, but the cleanup at
line 266 runs `if (uuid)` regardless of whether that check passed, interpolating the
raw string into a Management-API DELETE executed with the owner token. PostgREST
JSON-encodes a `uuid` return type so injection is not reachable today — but the
validate-then-use ordering is inverted, and this is owner-credential SQL.
**Fix:** Gate the interpolation on the validated value:
`if (uuid && /^[0-9a-f-]{36}$/.test(uuid)) { ... }`.

### IN-03: Hardcoded 57-row catalog count is brittle against legitimate catalog evolution

**File:** `scripts/smoke-rls.mjs:259-262`
**Issue:** Check 12 asserts exactly 57 live rows. The catalog is designed to be
extendable (officer seed / future stats); any legitimate addition breaks the smoke
matrix with a misleading "RLS failure".
**Fix:** Assert a stable invariant instead — e.g. `count >= 57` and that
`combat_power`/`hp`/`crit` are present — or read the expected count from
`supabase/seeds/stat_catalog.sql` at runtime.

### IN-04: `stat_catalog.sql` header comment's value_type rule doesn't cover four percentual keys

**File:** `supabase/seeds/stat_catalog.sql:3-5` vs lines 32-33, 35, 37
**Issue:** The comment states percentual = "key ends in `_pct` OR % damage modifier
(pdmg_bonus, mdmg_bonus, pve/pvp dmg reduction/bonus, dmg_vs_*, dmg_reduction_vs_*)".
But `crit_dmg`, `crit_dmg_res`, `pdmg_r`, and `mdmg_r` are seeded `percentual` without
an `_pct` suffix and are not in the enumerated modifier list. The data is presumably
correct (owner-validated); the rule as written would seed those four as `flat` on a
future re-derivation.
**Fix:** Extend the comment: "... or a % damage/crit modifier (`crit_dmg`,
`crit_dmg_res`, `pdmg_r`, `mdmg_r`, ...)". The upsert seed makes a corrective re-run a
no-op if the data itself is right.

### IN-05: `api.ts` latent hardening — header spread breaks on a `Headers` instance, unencoded id interpolation, no request timeout

**File:** `src/lib/api.ts:54-61` and `127`
**Issue:** (a) `...init?.headers` only behaves if callers pass a plain object; a
`Headers` instance would spread to nothing and silently drop headers (latent — all
current callers pass none). (b) `/members?id=eq.${id}` interpolates the id unencoded;
harmless for server-issued UUIDs but a query-injection footgun if ever fed other
input. (c) No `AbortSignal.timeout` — a hung request leaves `submitting`/`busy` UI
stuck indefinitely.
**Fix:** Use `new Headers({ apikey: ..., Authorization: ..., 'Content-Type': ... })`
and merge `init?.headers` via `Headers` semantics; `encodeURIComponent(id)` in the
filter; add `signal: AbortSignal.timeout(15000)` to the fetch.

### IN-06: Submission history fetch is unbounded — every submission ever, forever, in one response

**File:** `src/lib/api.ts:152-153`, `src/features/submit/HistoryList.tsx:40-42`
**Issue:** `fetchMySubmissions` has no `limit` and HistoryList renders everything.
A member's own list grows without bound across the guild's lifetime (the append-only
design guarantees growth). Not a perf flag per se — the robustness angle is the
eventually-large JSON payload parsed on a phone.
**Fix:** Add `&limit=50` (and later a "carregar mais") once the list is a product
surface.

### IN-07: Duplicate class insert surfaces as a connection error; smoke script's placeholder credentials must not outlive placeholder replacement

**File:** `src/features/admin/CharactersPage.tsx:108-110`, `scripts/smoke-rls.mjs:53-55`
**Issue:** (a) Adding an existing class fails with PK 23505 and shows "Não foi
possível adicionar. Verifique a conexão." — enumeration-safe but misleading (nothing is
wrong with the connection). (b) `smoke-rls.mjs` hardcodes the live placeholder
credentials (`member-handle`/`officer-handle`/PIN `1234`) documented as compromised in
the Phase 1 WR-06 acceptance; once the owner replaces the placeholder rows per the
whitelist seed instructions, this script must NOT be run with or updated to contain
real member PINs.
**Fix:** (a) Distinguish 23505 with a "essa classe já existe" message (still no raw
error text). (b) Add a guard comment/early-exit to smoke-rls that it is placeholder-only,
or read handles/PIN from session env vars instead of literals.

---

## Notes on verified-good properties (no action)

- `parseStatValue` traced against every boundary (blank, `-`, lone separators,
  multi-comma, bad tails, negative %) — spike-identical rules hold; tests cover the
  dangerous shapes.
- `wizard.ts` optional-drop semantics (blank ≠ 0, unparseable optionals dropped not
  coerced) match tests and ReviewStep display (`—`).
- `api.ts` never uses `select=*`; member/officer projections cannot surface
  `pin_hash` (column ungranted — live-proven by smoke checks 2/3/6/8).
- `create_submission` RPC derives `member_id` from the JWT, rejects unknown keys,
  and is atomic (constraint failure rolls back the whole submission) — append-only
  holds; no update/delete path exists anywhere in the client.
- Stat catalog seed row count is exactly 57, matching the smoke assertion.
- All four example SVGs are static, script-free placeholders; no screenshot bytes
  leave the browser anywhere in the wizard.

_Reviewed: 2026-10-09T12:00:00Z_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
