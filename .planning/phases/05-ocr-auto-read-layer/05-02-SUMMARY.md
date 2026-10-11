---
phase: 05-ocr-auto-read-layer
plan: 02
subsystem: database
tags: [rls, postgres, submissions-lifecycle, one-pending-rule, discarded-status, postgrest, smoke-tests, supabase]

# Dependency graph
requires:
  - phase: 02-registry-catalog-manual-data-ingestion (plan 02-01)
    provides: create_submission(jsonb) v1 (0005) whose contract 0010's v2 supersedes with the discard step
  - phase: 03-rank-engine (plan 03-03)
    provides: my_report / class_top5 (0009) whose latest-per-stat cohort CTEs 0010 re-creates with the widened exclusion
provides:
  - migration 0010 (live): 'discarded' as a legal status, the one-pending-per-player rule inside create_submission v2, cohort filters `not in ('rejected','discarded')` in my_report/class_top5, column grant + RLS policy limiting direct REST writes to own-pending→discarded
  - scripts/smoke-lifecycle.mjs: 11-check live proof (discard-on-resubmit, cohort exclusion, policy tightness, append-only) — re-runnable with zero residue
  - client status surface: SubmissionRow status union extended with 'discarded'; HistoryList renders it as 'Descartado' (text-muted)
affects: [05-ocr-auto-read-layer (05-04 OCR wiring multiplies resubmission — the one-pending rule is what keeps cohorts clean; 05-05 UAT), 06-officer-review (officer validation queue must account for the discarded status — D-13)]

# Tech tracking
tech-stack:
  added: []
  patterns: [PostgREST zero-row-update probes — an RLS UPDATE policy's `using` clause silently filters rows out of the update set (never reaching `with check`), so PostgREST answers a fully-blocked PATCH with 204/200-empty, NOT 403; the correct probe is Prefer return=representation + assert 0 rows updated]

key-files:
  created:
    - supabase/migrations/0010_discard_lifecycle.sql
    - scripts/smoke-lifecycle.mjs
  modified:
    - src/lib/api.ts
    - src/features/submit/HistoryList.tsx

key-decisions:
  - "0010 is an append-only corrective (0008 precedent): the 0001 status check is resolved from the catalog by definition (never hardcoded name) and re-added with all four statuses; 0005's create_submission and 0009's my_report/class_top5 are superseded via create or replace, prior migration files byte-untouched"
  - "Discard is a status mark, never a delete (INPT-04): the RLS surface is column-grant-scoped (update (status) only) and the policy admits exactly one transition — own row, pending → discarded, `using`+`with check` both; everything else (self-validate, other members' rows, transitions back) is unreachable"
  - "Smoke PATCH probes assert PostgREST zero-row semantics (204/200-empty via Prefer return=representation) rather than non-2xx — RLS `using` filters silently, which is a DIFFERENT HTTP shape from a `with check` 403 but the same security outcome; caught live when the first run failed 2/11 on assertion shape, not on behavior"
  - "INPT-02 stays Pending by traceability (05-01/05-03 precedent) — this plan is the lifecycle foundation only; the requirement completes when 05-04 wires the wizard and 05-05 UAT-verifies end-to-end"

patterns-established:
  - "Zero-row-update proof pattern: to prove an RLS policy makes a row unreachable via REST PATCH, send Prefer return=representation and assert the updated-rows body is empty — a bare 204 alone is ambiguous with success"

requirements-completed: []  # INPT-02 deliberately left Pending — lifecycle foundation only; completes in 05-04/05-05 (traceability precedent)

# Metrics
duration: 25min
completed: 2026-10-11
---

# Phase 5 Plan 2: Pending-Replacement Submission Lifecycle Summary

**Migration 0010 live-proved the D-11/D-12 discard lifecycle: a resubmit marks the player's previous pending 'discarded' (status mark, never a delete), discarded rows leave the my_report/class_top5 rank cohorts exactly like rejected ones, and the RLS surface admits exactly one transition — own pending → discarded — proven by an 11-check live smoke run twice consecutively plus a 27-check rank regression run**

## Performance

- **Duration:** ~25 min active work in this continuation session (live push + smokes + docs); tasks 1–2 and the smoke script were committed in the prior session before the auth gate
- **Started:** 2026-10-11 (prior session); continuation 20:12Z
- **Completed:** 2026-10-11T20:35Z (continuation session)
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)
- **Commits:** 4 code/test + 1 blocker record + docs

## Accomplishments

- **Migration 0010 (task 1, prior session):** auto-named status check resolved from the catalog and re-added with `('pending','validated','rejected','discarded')`; `grant update (status)` column-limited; policy `submissions_discard_own_pending` (`using` own+pending, `with check` own+discarded); `create_submission` v2 discards the member's previous pending rows before insert (D-11 one-pending rule, JWT-derived member_id preserved, `revoke ... from anon` retained); `my_report`/`class_top5` re-created with `where sub.status not in ('rejected','discarded')` in each `latest` CTE (D-12)
- **Client surface (task 2, prior session):** `SubmissionRow['status']` union extended with `'discarded'`; HistoryList renders `Descartado` / `text-muted` (same weight as Aguarda validação — a replaced pending, not an officer judgment); `tsc -b` clean via Record exhaustiveness, 106/106 tests green
- **Live push + smokes (task 3, this session):** `db push --dry-run` confirmed exactly 0010 pending → push applied cleanly; LIFECYCLE SMOKE PASSED 11/11, then again 11/11 consecutively (exit 0, zero residue — pre-run + finally cleanup of submissions/member/pin_login_attempts); RANK SMOKE PASSED (exit 0) — the 0009→0010 function replacement caused no rank regression (74.25/49.5/99/0 tie math, OVR 61/77/87, RNK-02 leak-probes all exact)

## task Commits

Each task was committed atomically:

1. **task 1: migration 0010 — discarded status, one-pending rule, cohort filters** - `cd54b84` (feat)
2. **task 2: client status surface — discarded in SubmissionRow + history label** - `49c156a` (feat)
3. **task 3: live lifecycle smoke script + live push** - `3126cd0` (test) + `873c0d1` (fix — assertion semantics correction)

**Blocker record:** `14d7a29` (chore — the SUPABASE_ACCESS_TOKEN auth-gate pause; cleared by this session)

## Files Created/Modified

- `supabase/migrations/0010_discard_lifecycle.sql` - the whole server-side lifecycle (constraint swap, column grant, discard policy, create_submission v2, cohort-filtered my_report/class_top5)
- `scripts/smoke-lifecycle.mjs` - 11-check live matrix: D-11 discard-on-resubmit, D-12 cohort exclusion via real my_report, T-05-04/T-05-08 PATCH probes, INPT-04 append-only; pre-run + finally cleanup makes it residue-free
- `src/lib/api.ts` - SubmissionRow status union extended with 'discarded'
- `src/features/submit/HistoryList.tsx` - STATUS_LABELS 'Descartado' + STATUS_CLASSES 'text-muted'

## Decisions Made

- The one-pending rule lives INSIDE `create_submission` (not a unique index): the discard UPDATE is scoped to `member_id = v_member and status = 'pending'`, executes as invoker, and passes the new policy row-by-row — the RPC never trusts the caller (T-05-05)
- Already-discarded rows are proven unreachable by zero-row-update semantics (see Deviations): the security outcome is identical to a 403, the HTTP shape is not — the smoke now documents and asserts the correct contract
- Auth gate handling followed the 03-02 precedent exactly: token used as a session env var only, never on disk/commit/echo; recorded as normal flow, not a deviation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - assertion bug] Already-discarded PATCH probes expected non-2xx; PostgREST returns zero-row success**
- **Found during:** task 3 (first live smoke run after the push — 2/11 FAIL)
- **Issue:** for UPDATE, the policy's `using (status = 'pending')` clause silently filters the already-discarded row out of the update set — Postgres never evaluates `with check` (which is what yields 403 on the pending row). PostgREST therefore answers a fully-blocked PATCH with 204 No Content (and 200 + `[]` under return=representation), not an error. The RLS was airtight; the smoke's HTTP expectation was wrong.
- **Fix:** probes on the already-discarded row now send `Prefer: return=representation` and assert 0 rows updated (204 or empty-array 200); `rest()` helper gained an `extraHeaders` passthrough; header doc updated to the correct semantics
- **Files modified:** scripts/smoke-lifecycle.mjs
- **Verification:** LIFECYCLE SMOKE PASSED 11/11 twice consecutively; the 403 path (pending row + `with check` violation) still asserts non-2xx exactly as before
- **Committed in:** 873c0d1

---

**Total deviations:** 1 auto-fixed (assertion bug)
**Impact on plan:** None on scope or behavior — the live security posture matches the plan's must-haves exactly; only the smoke's HTTP contract was corrected.

## Issues Encountered

- Auth gate (normal flow, 03-02 precedent): task 3's live push required SUPABASE_ACCESS_TOKEN; the prior executor stopped at the gate and recorded blocker `14d7a29`; the owner supplied the token to this continuation session (session env var only — never written to any file, never committed, never echoed). The blocker is cleared in STATE.md.
- Standing owner action (unchanged, 03-02 precedent): rotate the Supabase access token now that this deploy is done.

## Verification

- `npx supabase db push --dry-run` → exactly `0010_discard_lifecycle.sql` pending; real push → "Applying migration 0010_discard_lifecycle.sql... Finished" cleanly
- `node scripts/smoke-lifecycle.mjs` → `LIFECYCLE SMOKE PASSED 11/11`, exit 0; second consecutive run → `LIFECYCLE SMOKE PASSED 11/11`, exit 0 (no residue)
- `node scripts/smoke-rank.mjs` → `RANK SMOKE PASSED`, exit 0 (0009→0010 replacement regression gate — 27/27 live-proven checks per the 03-03 matrix, exact tie values preserved)
- Task 2 (prior session): `npx tsc -b` clean, submit-feature suites 106/106
- Token handling audit: `git status` clean before/after; the token appears in no file, no commit, and no persisted output

## Security Notes (threat model compliance)

- T-05-04 (mitigate, proven live): column grant `update (status)` only + `submissions_discard_own_pending` — `status='validated'` PATCH on own pending row → 403 (`with check` violation); on already-discarded row → 0 rows updated; no other column is reachable through this path
- T-05-05 (mitigate, proven live): create_submission v2 derives member_id exclusively from the JWT claim; the discard UPDATE is scoped to own+pending inside the RPC
- T-05-06 (mitigate, proven live): final smoke state shows both submissions still present, all statuses marks — INPT-04 append-only audit trail intact, `submitted_at` untouched
- T-05-07 (accept): my_report/class_top5 v2 are byte-copies of the 0009 security-definer shapes (member_role/active gates preserved); only the cohort exclusion widened — no new data crosses the API
- T-05-08 (mitigate, proven live): own-pending→discarded is the ONLY reachable transition — validated PATCHes and any touch of an already-discarded row are blocked at the server

## Known Stubs

None — the lifecycle is complete and live; no placeholder data paths were added.

## User Setup Required

None — the owner-supplied SUPABASE_ACCESS_TOKEN (session env var, 03-02 handling) covered the deploy. Standing action remains: rotate the token now that the deploy is done.

## Next Phase Readiness

- 05-04 (OCR wizard wiring) can now rely on the one-pending rule: OCR-accelerated resubmission cannot multiply pending rows — each create_submission discards the previous pending server-side
- 05-05 UAT: the player's own history will show Descartado on replaced pendings (HistoryList change is live in the client surface)
- Phase 6 (officer validation queue, D-13): the officer queue reads pending rows only — discarded and rejected rows are structurally out of its cohort; officer-side status transitions remain untouched by this plan's policy (intentional, per T-05-04 disposition)

## Self-Check: PASSED

- Files exist: 0010_discard_lifecycle.sql, smoke-lifecycle.mjs, api.ts, HistoryList.tsx, 05-02-SUMMARY.md — all FOUND
- Commits exist: cd54b84 (feat/task 1), 49c156a (feat/task 2), 3126cd0 (test/task 3), 873c0d1 (fix/task 3 semantics), 14d7a29 (chore/blocker record) — all FOUND in git log
- Live verification re-confirmed within this session: db push applied 0010; LIFECYCLE SMOKE PASSED 11/11 twice consecutively (exit 0); RANK SMOKE PASSED (exit 0)

---
*Phase: 05-ocr-auto-read-layer*
*Completed: 2026-10-11*
