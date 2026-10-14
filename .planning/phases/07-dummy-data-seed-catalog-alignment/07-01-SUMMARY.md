---
phase: 07-dummy-data-seed-catalog-alignment
plan: 01
subsystem: database-catalog
tags: [supabase, migrations, catalog, role-vocabulary, appendix-only, local-rehearsal]
requires:
  - "0005_registry_catalog.sql (members.char_class FK + char_function CHECK)"
  - "0001_schema.sql (class_key_stats, no classes FK)"
provides:
  - "migration 0012: 15-class aligned catalog + dps/mdps/suporte vocabulary"
  - "supabase/seeds/classes.sql rewritten to the post-migration catalog (re-runnable)"
affects:
  - "07-02 (vocabulary propagation in TS/smoke fixtures)"
  - "07-04 (live push + key-stat count parity re-check)"
tech-stack:
  added: []
  patterns:
    - "5-step lockstep rename (insert new class -> move key_stats -> merge-delete -> repoint members -> delete old class)"
    - "CHECK constraint widen via drop -> data update -> re-add (order is load-bearing)"
    - "member-referenced guarded deletes (append-only discipline: referenced rows intentionally remain)"
key-files:
  created:
    - supabase/migrations/0012_catalog_alignment_roles.sql
  modified:
    - supabase/seeds/classes.sql
decisions:
  - "Hunter -> Sniper (live-API verified 2026-10-13): the Archer line's released top job is Sniper (second_advanced_transfer, id 52); its third_transfer job is unreleased by the same rule as Grand Summoner/Nightwatch — D-02's own 'currently-released job wins' tie-break"
  - "Sniper correction surfaced to owner at the D-12 pre-apply review gate (07-03/07-04) for final confirmation"
  - "ASCII-only comments in 0012/classes.sql for encoding portability (repo precedent 0001-0011)"
metrics:
  duration: ~62 min
  completed: 2026-10-14
---

# Phase 7 Plan 1: Catalog Alignment & Role Vocabulary (Schema Half) Summary

Migration 0012 aligns the class catalog to the live-verified official job tree (11 renames, 2 guarded removals, 3 additions — Sniper per the released-job rule) and widens `char_function` to exactly-one-of `dps`/`mdps`/`suporte`, all lockstep with `class_key_stats` + `members.char_class` continuity, locally rehearsed against a real Postgres.

## What Was Built

### Task 1 — Migration 0012 + classes.sql rewrite (commit 84d1b19, b147b38)

- **`supabase/migrations/0012_catalog_alignment_roles.sql`** (new, append-only corrective):
  1. **Vocabulary widen (D-04/D-05):** drop `members_char_function_check` → update `'tank'` rows to `'suporte'` → re-add CHECK `in ('dps','mdps','suporte')`. Exact order is load-bearing (update before drop would violate the old CHECK).
  2. **11 renames (D-02), each in the mandated 5-step sub-order:** insert new class (`on conflict do nothing`) → move `class_key_stats` old→new with merge guard → delete merged leftovers → repoint `members.char_class` → delete old class row. Pairs: Assassin→Assassin Cross, Knight→Lord Knight, Wizard→High Wizard, **Hunter→Sniper**, Priest→High Priest, Blacksmith→Mastersmith, Crusader→Paladin, Sage→Professor, Rogue→Stalker, Alchemist→Biochemist, Monk→Champion.
  3. **Guarded removals (Dancer, Super Novice):** deleted only when no member references them; if referenced, rows intentionally REMAIN (staff reassigns via Personagens — append-only discipline).
  4. **Additions:** `Summoner`, `Rebellion` plain inserts (`Sniper` comes from the rename pair).
- **`supabase/seeds/classes.sql`** rewritten to the post-migration 15-class catalog with the same re-runnable `on conflict (class_name) do nothing` shape; header documents the verification source and date.
- Header comments cite 07-CONTEXT D-01..D-05, the 2026-10-13 live-API verification, and the Sniper correction. The string `'Ranger'` does not appear anywhere in 0012 (plan acceptance criterion).

### Task 2 — Local verification (no live push; 07-04 owns it)

`supabase db reset` was **unavailable in this environment** (no supabase CLI, no Docker, no WSL, no local Postgres). Per the plan's fallback instruction, verification ran against a **real Postgres 18.4** (embedded-postgres npm binaries in a temp workspace, since deleted) with Supabase-shaped stubs (`anon`/`authenticated`/`service_role` roles + `auth.jwt()`). Rehearsal replayed migrations 0001→0012 in order, then the three flat seeds (`classes.sql`, `stat_catalog.sql`, `whitelist.sql`) exactly as the `db.seed` flat glob would. **All checks passed:**

| Check | Result |
|---|---|
| All 12 migrations apply cleanly (0012 last) | PASS |
| `classes` count = 15, exact expected name set | PASS (15) |
| Forbidden names absent (Dancer, Super Novice, all 11 old names, Ranger) | PASS |
| `char_function` values ⊆ {dps, mdps, suporte}; zero 'tank' | PASS |
| `suporte` insert probe succeeds; `mdps` update probe succeeds | PASS |
| `'tank'` update probe rejected by `members_char_function_check` | PASS |
| Zero `class_key_stats` rows under old names | PASS (table locally empty — see note) |
| Whitelist placeholder rows = 3; stat_catalog = 57 | PASS |
| No orphan `members.char_class` refs | PASS |
| classes.sql re-runnable (second application, no error) | PASS |

**Key-stat continuity note:** the local DB has zero `class_key_stats` rows (key-stat config exists only in the live DB, populated via `set_key_stat` — no seed populates it). So the locally provable assertions are: the merge-guarded rename SQL applies cleanly and zero rows remain under old names. The **live per-class count-parity assertion (6-per-renamed-class pre/post) is explicitly re-checked in plan 07-04** per threat model T-07-01 — this was always the plan's design.

## Sniper-vs-Ranger Verification Outcome (mandated by plan + D-02)

Fetched `GET https://rooc-official-am-api.joymaker.com/api/rooc/job-intro` live during this execution. The Archer line's `second_advanced_transfer` (released transcendent top job) is **Sniper** (id 52); Ranger (id 55) is `third_transfer` — site-hidden, therefore unreleased by the same rule the owner applies to Grand Summoner/Nightwatch. **Hunter → `Sniper` ships** (D-02's "currently-released job wins" tie-break). The Ranger entry name never appears in 0012. Per 07-RESEARCH §2, this correction is surfaced to the owner at the D-12 pre-apply review gate for final confirmation.

## Deviations from Plan

**1. [Rule 3 - Blocking] `supabase db reset` unavailable — real-Postgres rehearsal fallback**
- **Found during:** task 2
- **Issue:** environment has no supabase CLI, no Docker, no WSL distro, no local Postgres (`db reset` / `supabase start` / psql all impossible)
- **Fix:** per the plan's own fallback instruction, replayed the full migration+seed chain against real Postgres 18.4 binaries (embedded-postgres npm package, temp workspace, deleted after); all plan assertions executed unchanged
- **Files modified:** none in the repo (rehearsal harness lived in temp)
- **Commit:** n/a (verification only)

**2. [Rule 3 - Blocking] ASCII normalization of 0012 + classes.sql comments**
- **Found during:** task 2 rehearsal
- **Issue:** the temp rehearsal cluster initialized with WIN1252 encoding (pt-BR locale); UTF-8 arrows (→) and circled numerals (①..⑤) in 0012 comments have no WIN1252 equivalent → migration load failed with `character with byte sequence 0xe2 0x86 0x92 ... has no equivalent`
- **Fix:** replaced arrows/circled numerals/em-dashes in **comments only** with ASCII equivalents; zero SQL statement changes. This also matches the ASCII-comment precedent of migrations 0001–0011 and removes any encoding sensitivity on the live push
- **Files modified:** supabase/migrations/0012_catalog_alignment_roles.sql, supabase/seeds/classes.sql (comments only)
- **Commit:** b147b38

No other deviations. No auth gates encountered. No stubs introduced (data files, not application code).

## Threat Model Compliance

- **T-07-01 (Tampering, class_key_stats rename):** lockstep rename in one migration + merge guards; local rehearsal proves clean apply + zero old-name rows; **live parity re-check owned by 07-04** (documented above).
- **T-07-02 (DoS, CHECK swap):** exact drop→update→add order; rehearsed locally before any live push (07-04).
- **T-07-03 (Elevation, char_function):** accepted — display vocabulary only; 0005 grants/RLS untouched.
- **T-07-04 (Repudiation, append-only):** only 0012 is new; `git diff` for the plan shows zero edits to 0001–0011 (verified via `git diff --stat` at each commit).

## Verification

- Task 1 automated grep checks: all acceptance criteria pass (exactly one drop/add constraint, tank→suporte update, 11 pairs × 5 steps each, Summoner/Rebellion inserts, guarded removals, `'Ranger'` absent, `'Sniper'` present, 15-entry seed, `on conflict` preserved, zero `create or replace function` in 0012 — no rank RPC touched).
- Task 2 rehearsal: ALL CHECKS PASSED (table above). Path used: embedded real Postgres (fallback), recorded per plan instruction.
- `git diff --stat` across the plan touches ONLY the two `files_modified` paths (plus .planning/ tracking files in the final docs commit).

## Next Steps

- **07-02:** propagate the vocabulary to TS (`FUNCTION_LABELS`, api.ts unions, pages) + smoke fixtures + api.test.ts — the smoke battery must never sit red.
- **07-03:** dummy seed + purge in `supabase/seeds/dummy/` (outside the flat glob).
- **07-04:** live push (`supabase db push` with token env), live key-stat count parity re-check, smoke battery, D-12 review gate surfacing the Sniper correction.

## Self-Check: PASSED
