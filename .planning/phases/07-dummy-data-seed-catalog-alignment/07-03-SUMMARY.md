---
phase: 07-dummy-data-seed-catalog-alignment
plan: 03
subsystem: dummy-seed
tags: [supabase, seeds, dummy-data, purge, rehearsal, checkpoint-pending]
requires:
  - "migration 0012 (07-01): 15-class aligned catalog + dps/mdps/suporte vocabulary"
  - "scripts/apply-seed.mjs transport contract (legacy Management API query endpoint)"
  - "scripts/hash-pin.mjs (bcrypt PIN hashing)"
provides:
  - "scripts/dummy-value-report.mjs (read-only live distribution report, env-gated)"
  - "supabase/seeds/dummy/seed-dummies.sql (idempotent transactional 73-member dummy seed)"
  - "supabase/seeds/dummy/purge-dummies.sql (FK-safe purge + four-zero verification)"
  - "supabase/seeds/dummy/SEED-NOTES.md (D-12 owner review sheet)"
affects:
  - "07-04 (live apply of this seed after owner approval at the D-12 gate)"
tech-stack:
  added: []
  patterns:
    - "sentinel-prefix namespace (dummy-%) with transactional clean-slate re-seed"
    - "deterministic value generation: per-stat base x per-member factor profile (no faker)"
    - "FK-safe purge order: pin_login_attempts/submission_stats -> submissions -> members (NO ACTION FK)"
key-files:
  created:
    - scripts/dummy-value-report.mjs
    - supabase/seeds/dummy/seed-dummies.sql
    - supabase/seeds/dummy/purge-dummies.sql
    - supabase/seeds/dummy/SEED-NOTES.md
  modified: []
decisions:
  - "Owner-supplied-sample bases for all 57 stats (SEED-01 fallback): the live value report could not run because SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF were absent from the execution session; every stat is flagged low-confidence in SEED-NOTES.md with the exact refresh command for the owner"
  - "Sniper (not Ranger) carried from 07-01 into the seed roster; surfaced at the D-12 gate for final confirmation"
  - "Roster splits authored per D-08 (LK/Paladin 3/1 dps:suporte, Biochemist 2/1/1, Mastersmith 1/2/1, Summoner 3/3/2, Sniper/Rebellion 4+4, Stalker wildcard)"
metrics:
  duration: ~61 min (tasks 1-2; task 3 checkpoint open)
  completed: 2026-10-14 (checkpoint pending owner approval)
---

# Phase 7 Plan 3: Dummy-Data Seed & Catalog Alignment (Seed Authoring + Rehearsal) Summary

**STATUS: CHECKPOINT OPEN — tasks 1-2 complete and committed; task 3 (D-12 owner review gate) is awaiting the owner. Nothing has been applied to the live project.**

The reversible dummy seed package is authored and rehearsed green locally: 73 dummy members following the owner roster, deterministic values (live-report-designed base table x factor ladder), FK-safe idempotent purge, and the D-12 review sheet. The live apply is plan 07-04, gated on owner approval.

## What Was Built

### Task 1 — Read-only live value-distribution report (commit baa2e76)

- `scripts/dummy-value-report.mjs` — env-gated sibling of `apply-seed.mjs` (same legacy Management API query endpoint, Node fetch, token never echoed/persisted). ONE fetch call with ONE SELECT-only statement returning per-stat distribution (n/min/p25/median/p75/max over validated submissions, joined to stat_catalog) plus per-(class, char_function) cohort sizes as a single jsonb row; prints aligned text and writes `supabase/seeds/dummy/value-bases.json` with `generated_at`. Exits 1 when env vars are absent (proven in-session). n<3 stats are flagged for the SEED-NOTES low-confidence rule.
- **The script could NOT run against live in this session** (env vars absent — auth gate per plan fallback). The value-report SQL was syntax-validated against the local rehearsal Postgres (empty live-shaped result OK). The owner can run it before approving: `node scripts/dummy-value-report.mjs` with the env vars set.

### Task 2 — Seed + purge + review sheet + local rehearsal (commit f56b5e3)

- `supabase/seeds/dummy/seed-dummies.sql` — ONE file, ONE transaction: ordered clean-slate deletes of the `dummy-%` namespace (pin_login_attempts → submission_stats → submissions → members) then: 73-row `dummy_members` temp table (exact 07-RESEARCH §6 roster), `dummy_profiles` factor ladder (leader 1.000 / runnerup 0.985 / tie_a+tie_b 0.920 exact ties / mid1 0.880 / mid2 0.800 / mid3 0.740 / low 0.610), 57-row `dummy_stat_base`, invariant guards (exactly 57 bases, exact stat_catalog coverage, DO-block exceptions), member inserts (catalog class names + number per D-09, uniform bcrypt PIN hash per D-10, role 'member'), validated submission per dummy with fresh 0–2 / stale 8–30 `submitted_at` spread, pending-only `dummy-hp-16` (D-15), and set-based 57-stats-per-submission generation (percentual → 1 decimal, flat → integer).
- `supabase/seeds/dummy/purge-dummies.sql` — ONE file, ONE transaction, same FK-safe order, ends with the four-zero verification query (members/submissions/submission_stats/pin_login_attempts).
- `supabase/seeds/dummy/SEED-NOTES.md` — the D-12 owner review sheet: roster matrix, factor table, base-table source with ALL 57 stats flagged low-confidence (owner-supplied samples, SEED-01 fallback), pending-only callout, Sniper confirmation request, D-08 splits note, D-14 wildcard note, purge summary, 07-04 apply command. **No plaintext PIN anywhere** (grep 0).
- `supabase/seeds/` direct children untouched (git status: only the `dummy/` subfolder is new).

### Local rehearsal (embedded real Postgres 18.4, 07-01 fallback pattern — no supabase CLI/Docker in this environment)

Harness (temp workspace, outside repo) replayed stubs → migrations 0001–0012 → flat seeds → seed → verifications → purge → re-seed. **20/20 checks GREEN:**

| Check | Result |
|---|---|
| All 12 migrations + flat seeds apply | PASS |
| Post-flat-seeds `dummy-%` count = 0 (subfolder outside the flat `./seeds/*.sql` glob) | PASS |
| value-report SQL valid (empty live-shape result) | PASS |
| 73 dummy members; 72 validated + 1 pending; 4104 stat rows (72×57) | PASS |
| Cohort matrix exact (21 combos: HP/suporte 15 … Stalker/dps 1) | PASS 21/21 |
| 57-stats invariant (0 validated submissions ≠ 57 rows) | PASS |
| patk leader 15800 / runner-up 15563 / exact tie 14536 ×6 members | PASS |
| pdmg_r percentual: max 42.0, tie 38.6 present | PASS |
| dummy-hp-16 pending-only (1 pending, 0 validated) | PASS |
| submitted_at spread fresh 32 + stale 40 = 72 | PASS |
| Idempotent re-seed (counts unchanged) | PASS |
| Purge → four zeros → re-seed → 73 | PASS |
| Non-dummy members untouched (3 whitelist placeholders) | PASS |

## Deviations from Plan

**1. [Rule 3 - Blocking] Live value report env-gated out — owner-supplied-sample bases (SEED-01 fallback)**
- **Found during:** task 1 run
- **Issue:** `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` absent from the execution session; D-11 live distributions unreachable
- **Fix:** per the plan's fallback (and SEED-01's explicit "live data **or owner-supplied samples**"), the seed's `dummy_stat_base` uses realistic game-scale samples (combat_power anchored on the owner's real 288927 UAT read; CT/CD negatives per 05-RESEARCH sanity ranges). ALL 57 stats flagged low-confidence in SEED-NOTES.md §3 with the exact refresh command; corrections loop through a revised seed file per D-12
- **Files modified:** supabase/seeds/dummy/seed-dummies.sql (base table), supabase/seeds/dummy/SEED-NOTES.md
- **Commit:** f56b5e3

**2. [Rule 1 - Bug] Three `age_days` values violated the D-11 spread**
- **Found during:** task 2 rehearsal (spread check fresh+stale=72 failed: 3 members at age 3/5)
- **Issue:** rb-03 (3), su-08 (5), wild-01 (3) fell between the fresh 0–2 and stale 8–30 windows
- **Fix:** rebalanced to 2, 10, 2 → fresh 32 / stale 40 = 72
- **Files modified:** supabase/seeds/dummy/seed-dummies.sql
- **Commit:** f56b5e3 (folded into the task-2 commit before it was made)

**3. [Rule 3 - Blocking] ASCII normalization of one seed comment**
- **Found during:** task 2 rehearsal (cluster encoding WIN1252, 07-01 precedent)
- **Issue:** "Validações" in a seed-dummies.sql comment risks client-encoding mismatch on WIN1252 clusters
- **Fix:** ASCII-normalized the comment ("Validacoes"); zero SQL statement changes
- **Commit:** f56b5e3

Non-deviation notes: the rehearsal harness's `embedded.stop()` hits an EBUSY rmdir on Windows temp cleanup — harness quirk outside the repo, all checks completed before it. No auth gates beyond the env-var absence documented above. No stubs in application code (data files only; the low-confidence base table is a deliberate, flagged SEED-01 fallback, not an unwired placeholder).

## Threat Model Compliance

- **T-07-07 (Info Disclosure, report output):** mitigated — aggregates only (percentiles), no per-member rows selected; output stays in seeds/dummy/; token never echoed/persisted (grep-verified, no hardcoded tokens).
- **T-07-08 (Spoofing, uniform PIN):** hash-only in repo; plaintext handed off out-of-band at the checkpoint; purge removes the credential surface (pin_login_attempts delete).
- **T-07-09 (Tampering, RLS bypass):** single transactional file, sentinel prefix scopes every delete, local rehearsal before live, zero-dummy verification query.
- **T-07-10 (DoS, purge FK order):** submissions BEFORE members rehearsed (four zeros); belt-and-suspenders explicit stats delete.
- **T-07-11 (Repudiation, partial apply):** single-file discipline documented for 07-04; idempotent re-run rehearsed.

## Checkpoint (task 3 — D-12 gate): OPEN

Awaiting owner review of `supabase/seeds/dummy/SEED-NOTES.md`: value tables (or refreshed live bases), Sniper confirmation, shared-slot splits, wildcard pick, PIN handoff. On "approved" → 07-04 applies the seed live. On corrections → revised seed file + task-2 rehearsal re-run (D-12 loop).

## TDD Gate Compliance

Not applicable — plan type is execute (no `type: tdd` frontmatter; no RED/GREEN cycle required).

## Self-Check: PASSED
