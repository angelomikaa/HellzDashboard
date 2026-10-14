---
phase: 07-dummy-data-seed-catalog-alignment
reviewed: 2026-10-14T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - supabase/migrations/0012_catalog_alignment_roles.sql
  - supabase/seeds/classes.sql
  - supabase/seeds/dummy/seed-dummies.sql
  - supabase/seeds/dummy/purge-dummies.sql
  - scripts/dummy-value-report.mjs
  - scripts/smoke-officer.mjs
  - scripts/smoke-promotion.mjs
  - scripts/smoke-rls.mjs
  - src/lib/groups.ts
  - src/lib/api.ts
  - src/lib/api.test.ts
  - src/features/admin/CharactersPage.tsx
  - src/features/dashboard/OvrHero.tsx
  - src/features/submit/SubmitPage.tsx
findings:
  blocker: 0
  advisory: 2
  nit: 3
  total: 5
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-10-14
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

All 14 scoped files were read in full and cross-checked against the 07-CONTEXT decisions (D-01..D-15) and the four plan SUMMARYs. The implementation is solid overall: migration 0012's 5-step lockstep rename is correct (insert → merge-guarded key-stat move → merge-delete → member repoint → old-class delete, in the FK-safe order), the CHECK widen uses the load-bearing drop→update→add order, `char_function` remains `not null default 'dps'` (0005:26) so the client's non-nullable union is safe, the seed's `dummy_stat_base` has exactly 57 entries matching `stat_catalog` (enforced by an in-seed guard), the roster/splits match the 07-04 cohort matrix exactly (73 members: HP 16, Gypsy 8, Bard 8, LK 3/1, Paladin 3/1, HW 4, PF 4, BC 2/1/1, MS 1/2/1, Sniper 4, Rebellion 4, Summoner 3/3/2, Stalker 1), `'tank'` and `'Ranger'` are absent from the shipped artifacts (comments documenting the rename in 0012 excepted), no key-stat identity leaks into any member-facing type, no plaintext PIN or token material is committed, and the smoke scripts' cleanup discipline is intact. SUMMARY claims spot-checked and verified: smoke-officer.mjs:94-100 (suporte roles), smoke-promotion.mjs:357 (three-role filter), smoke-rls.mjs:183/246/258 (Assassin Cross/suporte + probe fix), api.test.ts:208 (`'suporte'` fixture), zero `tank` in `src/`.

Five findings, none blocking: two advisories (an empty payload on the pending-only dummy's queue card, and the sentinel-delete pattern matching slightly more handles than the documented `dummy-` prefix) and three nits.

## Findings

| ID | Severity | File:Line | Description | Suggested Fix |
|----|----------|-----------|-------------|---------------|
| WR-01 | advisory | `supabase/seeds/dummy/seed-dummies.sql:221-225` | The pending-only dummy's submission (`dummy-hp-16`) is inserted with **zero** `submission_stats` rows — the stats generation at lines 229-240 filters `sub.status = 'validated'`. D-15 mandates "all 57 stats per submission" without exempting the pending one, so the Validações queue renders this row with an empty stats payload (`OfficerQueueRow.stats` is typed as all-57), and an officer who validates it would create a *validated* submission with no stat rows for the member the seed designates as "never-submitted". The 07-03/07-04 verification checks were scoped to validated-only submissions, which masks the gap. | Generate the 57 stat rows for the pending submission too (drop the `status = 'validated'` filter in the stats INSERT), or explicitly document the exemption in the seed header + SEED-NOTES so queue consumers know a pending row can carry 0 stats. |
| WR-02 | advisory | `supabase/seeds/dummy/seed-dummies.sql:33-41`, `supabase/seeds/dummy/purge-dummies.sql:12-20` | The destructive deletes scope with `discord_handle like 'dummy-%'`. In SQL LIKE, `_` is a single-char wildcard, so this matches any handle starting with `dummy` + **one arbitrary character** — e.g. a real member handle `dummytest` or `dummy1` (not just the documented `dummy-` sentinel) would be silently deleted from the LIVE project. No current real handle matches (member-handle / officer-handle / owner-handle), and Phase 8's `add_member` will reject the `dummy-` prefix, but the purge is a hard pre-release gate run against live data — the delete scope should be exactly the sentinel. | Replace with a regex or exact-prefix predicate: `where discord_handle ~ '^dummy-'` (regex, `-` is literal) in all 8 delete statements + the verification query across both files. |
| IN-01 | nit | `.planning/phases/07-dummy-data-seed-catalog-alignment/07-03-SUMMARY.md:150` | Claim inaccurate against its own matrix: "every populated (class, build-role) combo has ≥3 dummies" — the cohort matrix (and the seed) show LK/suporte 1, Paladin/suporte 1, Biochemist/mdps 1, Biochemist/suporte 1, Mastersmith/dps 1, Mastersmith/suporte 1, Stalker/dps 1. The starvation cohorts are intentional per D-07/D-08/D-14 (owner-confirmed splits), so the *seed* is correct — but the ROLE-09 completion claim as worded contradicts D-15's ≥3 rule and the SUMMARY's own table. | Reword the claim to "≥3 dummies in every primary cohort; the 7 intentionally starved (class, role) combos are 1–2 by owner-confirmed splits (D-07/D-14), rendering data-insufficient by design." |
| IN-02 | nit | `scripts/dummy-value-report.mjs:160` | Output path `path.resolve('supabase/seeds/dummy')` is CWD-dependent — running the script from anywhere other than the repo root silently writes `value-bases.json` elsewhere. | Resolve relative to the script: `path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase/seeds/dummy')`. |
| IN-03 | nit | `scripts/smoke-rls.mjs:243-261` | Probe 9 permanently PATCHes the real placeholder member's `char_class`/`char_function` (now Assassin Cross/suporte) with no snapshot-and-restore in `finally` — unlike the active-flag restore in probe 13 (lines 343-353). Pre-existing pattern and idempotent across runs, but each smoke run leaves a live-data mutation behind. | Snapshot the original values via `mgmtQuery` before the PATCH and restore them in the probe-13 `finally` block. |

## Per-File Verification Notes

- **0012_catalog_alignment_roles.sql** — CHECK widen order is correct (drop → update → re-add, 0005:26 proves `'tank'` rows existed); all 11 rename pairs follow the exact 5-step sub-order with merge guards; removals properly guarded by member references; `'Ranger'` string absent (verified by grep); no rank RPC touched; FK reasoning (NO ACTION on members.char_class) matches 0005.
- **classes.sql** — exactly 15 post-migration names, re-runnable `on conflict do nothing`, matches the 0012 end state including the Sniper correction.
- **seed-dummies.sql** — single transaction; delete order FK-safe (pin_login_attempts → submission_stats → submissions → members); 57/57 base coverage with hard invariant guard; roster counts and splits verified line-by-line (73 rows, cohort matrix matches 07-04 exactly); pending-only hp-16 exception to the 57-stat invariant (see WR-01); no plaintext PIN (bcrypt hash only, per D-10).
- **purge-dummies.sql** — FK-safe, idempotent, ends with the four-zero verification; sentinel scoping breadth caveat (WR-02).
- **dummy-value-report.mjs** — genuinely read-only (single SELECT-only statement, single fetch); aggregates only, no per-member rows (T-07-07 honored); env-gated with exit 1 on missing env; token never echoed/persisted. CWD-dependent output path (IN-02).
- **smoke-officer.mjs** — fixtures on `suporte`/`dps` per 0012 vocabulary (lines 94-100); probe 3c correctly asserts member_a `dps`; cleanup order FK-safe and runs pre-run + in finally.
- **smoke-promotion.mjs** — shape filter widened to the three-role set (line 357); key-stat leak-diff probes intact; spare-class D-13 hidden-section probe unaffected by the vocabulary change.
- **smoke-rls.mjs** — `Assassin Cross`/`suporte` fixtures updated including the plan-external classes-read probe fix (line 183, Rule-3 deviation claim verified); probe-13 officer reactivation discipline intact.
- **groups.ts** — single shared map, exact locked pt-BR copy (Dano Físico / Dano Mágico / Suporte); no local duplicates remain anywhere in `src/` (verified: all 7 consumers import from `lib/groups`).
- **api.ts** — all five `char_function` unions widened consistently; non-nullable union is sound (column is `not null`); no key-stat identity in any member-facing type (RNK-02 intact); `updateCharacter`/`fetchKeyStats` keep the `encodeURIComponent` hardening.
- **api.test.ts** — fixture updated to `'suporte'` (line 208); assertions and gateway-contract coverage unchanged and valid.
- **CharactersPage.tsx** — the select cast is total over the exact three-option set rendered from the shared map; server CHECK cited as the real boundary (T-07-05); PATCH projection still limited to `{display_name, char_class, char_function}`; UI structure untouched.
- **OvrHero.tsx** — prop widened; rendering logic unchanged; tier/insufficient-data branches sound.
- **SubmitPage.tsx** — only the import + header usage changed; wizard/OCR/verification state machines untouched and coherent.

---

_Reviewed: 2026-10-14_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
