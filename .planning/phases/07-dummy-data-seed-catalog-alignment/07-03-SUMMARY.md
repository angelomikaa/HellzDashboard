---
phase: 07-dummy-data-seed-catalog-alignment
plan: 03
subsystem: dummy-seed
tags: [supabase, seeds, dummy-data, purge, rehearsal, live-derived-bases, d12-approved]
requires:
  - "migration 0012 (07-01): 15-class aligned catalog + dps/mdps/suporte vocabulary"
  - "scripts/apply-seed.mjs transport contract (legacy Management API query endpoint)"
  - "scripts/hash-pin.mjs (bcrypt PIN hashing)"
provides:
  - "scripts/dummy-value-report.mjs (read-only live distribution report, env-gated)"
  - "supabase/seeds/dummy/value-bases.json (live per-stat min/p25/median/p75/max + cohorts, generated 2026-10-14T06:43:52Z)"
  - "supabase/seeds/dummy/seed-dummies.sql (idempotent transactional 73-member dummy seed, LIVE-DERIVED bases)"
  - "supabase/seeds/dummy/purge-dummies.sql (FK-safe purge + four-zero verification)"
  - "supabase/seeds/dummy/SEED-NOTES.md (D-12 review sheet — APPROVED)"
affects:
  - "07-04 (live apply of this approved seed)"
tech-stack:
  added: []
  patterns:
    - "sentinel-prefix namespace (dummy-%) with transactional clean-slate re-seed"
    - "deterministic value generation: per-stat live-median base x per-member factor profile (no faker)"
    - "FK-safe purge order: pin_login_attempts/submission_stats -> submissions -> members (NO ACTION FK)"
key-files:
  created:
    - scripts/dummy-value-report.mjs
    - supabase/seeds/dummy/value-bases.json
    - supabase/seeds/dummy/seed-dummies.sql
    - supabase/seeds/dummy/purge-dummies.sql
    - supabase/seeds/dummy/SEED-NOTES.md
  modified: []
decisions:
  - "D-11 honest rebuild (owner D-12 decision, 2026-10-14): every base = live median from value-bases.json (live validated submissions, n=3, cohorts Assassin/tank + Priest/tank), rounded per value_type — 53 of 57 bases changed"
  - "The 4 degenerate all-zero live stats (refine_mdef, crit_dmg, fixed_ct, variable_ct) keep owner-supplied samples — live data cannot shape them; still the only low-confidence flags in SEED-NOTES"
  - "Negative live ranges preserved, never clamped: fixed_ct_pct −49.4 (ladder −49.4…−30.1), global_cd_pct −10.0 (−10.0…−6.1), variable_ct_pct −60.0 (−60.0…−36.6); signed base x factor keeps the live sign across the whole ladder"
  - "Live-zero stats not in the owner's degenerate list (ignore_pdef_pct, ignore_mdef_pct, dmg_vs_demi_human) take base 0.0 honestly from the live median"
  - "Sniper (not Ranger) CONFIRMED by owner at the D-12 gate; splits as authored (LK 3/1, Paladin 3/1, Biochemist 2/1/1, Mastersmith 1/2/1, Summoner 3/3/2, Sniper/Rebellion 4+4), Stalker wildcard ×1, and live residency (D-13) all confirmed"
metrics:
  duration: ~61 min (tasks 1-2) + ~35 min (continuation: rebuild + re-rehearsal + gate close)
  completed: 2026-10-14
---

# Phase 7 Plan 3: Dummy-Data Seed & Catalog Alignment (Seed Authoring + Rehearsal) Summary

**STATUS: COMPLETE — D-12 gate CLOSED. The owner approved the live-derived value bases (median-anchored rebuild), the Sniper correction, the authored splits, the Stalker wildcard, and live residency, on 2026-10-14. Nothing has been applied to the live project — plan 07-04 owns the live apply.**

The reversible dummy seed package is authored, live-derived, and rehearsed green locally (21/21): 73 dummy members following the owner roster, deterministic values (live-median base table × factor ladder), FK-safe idempotent purge, and the D-12 review sheet with the approval record.

## What Was Built

### Task 1 — Read-only live value-distribution report (commit baa2e76)

- `scripts/dummy-value-report.mjs` — env-gated sibling of `apply-seed.mjs` (same legacy Management API query endpoint, Node fetch, token never echoed/persisted). ONE fetch call with ONE SELECT-only statement returning per-stat distribution (n/min/p25/median/p75/max over validated submissions, joined to stat_catalog) plus per-(class, char_function) cohort sizes as a single jsonb row; prints aligned text and writes `supabase/seeds/dummy/value-bases.json` with `generated_at`. Exits 1 when env vars are absent (proven in-session).
- **The live report has since been run successfully** (owner session): `value-bases.json` generated 2026-10-14T06:43:52Z covers all 57 catalog stats (n=3 each) over live validated submissions, cohorts Assassin/tank + Priest/tank (n=1 each). Committed (dba1a80) — aggregates only (T-07-07).

### Task 2 — Seed + purge + review sheet + local rehearsal (commits f56b5e3, dba1a80, d5cf18d)

- `supabase/seeds/dummy/seed-dummies.sql` — ONE file, ONE transaction: ordered clean-slate deletes of the `dummy-%` namespace (pin_login_attempts → submission_stats → submissions → members) then: 73-row `dummy_members` temp table (exact 07-RESEARCH §6 roster), `dummy_profiles` factor ladder (leader 1.000 / runnerup 0.985 / tie_a+tie_b 0.920 exact ties / mid1 0.880 / mid2 0.800 / mid3 0.740 / low 0.610), 57-row `dummy_stat_base`, invariant guards (exactly 57 bases, exact stat_catalog coverage, DO-block exceptions), member inserts (catalog class names + number per D-09, uniform bcrypt PIN hash per D-10, role 'member'), validated submission per dummy with fresh 0–2 / stale 8–30 `submitted_at` spread, pending-only `dummy-hp-16` (D-15), and set-based 57-stats-per-submission generation (percentual → 1 decimal, flat → integer).
- **`dummy_stat_base` REBUILT from live medians (commit dba1a80)** per the owner's D-12 decision — see "Live-Base Rebuild" below.
- `supabase/seeds/dummy/purge-dummies.sql` — ONE file, ONE transaction, same FK-safe order, ends with the four-zero verification query (members/submissions/submission_stats/pin_login_attempts).
- `supabase/seeds/dummy/SEED-NOTES.md` — the D-12 owner review sheet (commit d5cf18d now carries the APPROVED record): roster matrix, factor table, full 57-stat live min/median/max → base provenance table, pending-only callout, Sniper/splits/wildcard/residency confirmations, purge summary, 07-04 apply command. **No plaintext PIN anywhere.**

### Live-Base Rebuild (D-11 honest, owner decision at the gate)

Every non-degenerate stat's base = live median, rounded per value_type (flat → integer, percentual → 1 decimal). Magnitudes of the change vs the previous owner samples (examples):

| Stat | Old sample | New base (live median) | Δ |
|---|---|---|---|
| patk | 15800 | 2933 | ÷5.4 |
| hp | 285000 | 100670 | ÷2.8 |
| combat_power | 265000 | 288216 | +8.8% |
| matk | 16400 | 5839 | ÷2.8 |
| mdmg | 12800 | 40 | ÷320 |
| pdmg | 12500 | 34 | ÷368 |
| ignore_pdef | 210 | 843 | ×4.0 |
| pvp_dmg_reduction | 380 | 1730 | ×4.6 |
| fixed_ct_pct | −12.0 | −49.4 | deeper negative |
| variable_ct_pct | −18.0 | −60.0 | deeper negative |
| global_cd_pct | −8.0 | −10.0 | deeper negative |
| pdmg_r | 42.0 | 154.5 | ×3.7 |
| equip_matk_pct | 38.0 | 69.9 | ×1.8 |
| crit_dmg_res | 45.0 | 14.0 | ÷3.2 |

…plus 40 further live-median replacements (full table in SEED-NOTES.md §3). The 4 degenerate all-zero live stats (refine_mdef 280, crit_dmg 155.0, fixed_ct −90, variable_ct −35) keep owner samples; 3 further live-zero stats (ignore_pdef_pct, ignore_mdef_pct, dmg_vs_demi_human) take base 0.0 from the live median. Negative live sign ranges are respected across the whole ladder — never clamped to positive.

### Local rehearsal (embedded real Postgres 18.4, 07-01 fallback pattern — no supabase CLI/Docker in this environment)

Harness (temp workspace, outside repo) replayed stubs → migrations 0001–0012 → flat seeds → seed → verifications → idempotent re-seed → purge → re-seed. **21/21 checks GREEN after the rebuild:**

| Check | Result |
|---|---|
| All 12 migrations + flat seeds apply | PASS |
| Post-flat-seeds `dummy-%` count = 0 (subfolder outside the flat `./seeds/*.sql` glob) | PASS |
| Base table: 57 entries; exactly 53 changed; 4 degenerate kept | PASS |
| 73 dummy members; 72 validated + 1 pending; 4104 stat rows (72×57) | PASS |
| Cohort matrix exact (21 combos: HP/suporte 15 … Stalker/dps 1) | PASS 21/21 |
| 57-stats invariant (0 validated submissions ≠ 57 rows) | PASS |
| patk leader 2933 ×14 / runner-up 2889 ×10 / exact tie 2698 ×6 | PASS |
| combat_power leader = live median 288216 | PASS |
| pdmg_r percentual: max 154.5, runner-up 152.2, tie 142.1 ×6 | PASS |
| Negative stats all-negative with expected ladder endpoints (fixed_ct_pct [−49.4…−30.1], variable_ct_pct [−60…−36.6], global_cd_pct [−10…−6.1]) | PASS |
| 4 degenerate stats keep owner samples (leader = base) | PASS |
| Live-zero stats all 0 (ignore_pdef_pct / ignore_mdef_pct / dmg_vs_demi_human) | PASS |
| dummy-hp-16 pending-only (1 pending, 0 validated) | PASS |
| submitted_at spread fresh 32 + stale 40 = 72 | PASS |
| Idempotent re-seed (counts unchanged 73/73/4104) | PASS |
| Purge → four zeros → re-seed → 73 | PASS |
| Non-dummy members untouched (3 whitelist placeholders) | PASS |

## Deviations from Plan

**1. [Rule 3 - Blocking] Live value report env-gated out — owner-supplied-sample bases (SEED-01 fallback) — RESOLVED**
- **Found during:** task 1 run (checkpoint session)
- **Issue:** `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` absent from the authoring session; D-11 live distributions unreachable
- **Fix:** per the plan's fallback, bases were authored from owner samples, ALL flagged low-confidence in SEED-NOTES with the exact refresh command. **Resolution (continuation session):** the live report ran successfully (value-bases.json, 2026-10-14T06:43:52Z) and the owner directed the D-11 honest rebuild — bases now live-derived medians (commit dba1a80); low-confidence flags removed for the 53 live-derived stats (commit d5cf18d)
- **Files modified:** supabase/seeds/dummy/seed-dummies.sql, supabase/seeds/dummy/value-bases.json, supabase/seeds/dummy/SEED-NOTES.md
- **Commit:** dba1a80, d5cf18d

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

Non-deviation notes: the rehearsal harness's `embedded.stop()` can hit an EBUSY rmdir on Windows temp cleanup — harness quirk outside the repo, all checks completed before it. Two initial harness check failures (base-regex over-match on the profiles table; degenerate-keep assertion wrong for negative bases) were HARNESS bugs, fixed in the harness before the green 21/21 run — zero seed changes involved. No auth gates in the continuation session. No stubs in application code (data files only).

## Threat Model Compliance

- **T-07-07 (Info Disclosure, report output):** mitigated — aggregates only (percentiles + cohort counts), no per-member rows selected; `value-bases.json` committed inside seeds/dummy/ contains only per-stat aggregates; token never echoed/persisted (single fetch, env-gated, grep-verified).
- **T-07-08 (Spoofing, uniform PIN):** hash-only in repo; plaintext handed off out-of-band at the checkpoint; purge removes the credential surface (pin_login_attempts delete).
- **T-07-09 (Tampering, RLS bypass):** single transactional file, sentinel prefix scopes every delete, local rehearsal before live, zero-dummy verification query.
- **T-07-10 (DoS, purge FK order):** submissions BEFORE members rehearsed (four zeros); belt-and-suspenders explicit stats delete.
- **T-07-11 (Repudiation, partial apply):** single-file discipline documented for 07-04; idempotent re-run rehearsed.

## D-12 Gate: CLOSED (owner approval 2026-10-14)

Owner decisions recorded at the gate:

1. **Value bases: REBUILD FROM LIVE (D-11 honest)** — done (dba1a80): median-anchored from value-bases.json, spread per the factor ladder; 4 degenerate all-zero stats keep owner samples; negative percentual ranges respected, never clamped.
2. **All other gate items CONFIRMED:** Sniper (not Ranger) for the Hunter line; authored splits as rehearsed (LK 3dps/1sup, Paladin 3/1, Biochemist 2/1/1, Mastersmith 1/2/1, Sniper 4, Rebellion 4, Summoner 3/3/2, HP/suporte 15 + 1 pending-only, Gypsy 8, Bard 8, Stalker wildcard ×1); live residency approved (D-13).
3. With the rebuild + re-rehearsal green (21/21), the gate is satisfied. **Zero live writes performed in this plan** — the live apply is plan 07-04 via `node scripts/apply-seed.mjs supabase/seeds/dummy/seed-dummies.sql`.

**Requirements:** ROLE-09 marked complete (seed composition verified by the exact cohort matrix — every populated (class, build-role) combo has ≥3 dummies, both value_types covered per cohort). SEED-01/SEED-02 intentionally left open — plan 07-04 also declares them (live apply + SEED-02 pre-release gate recording) and owns their completion.

## TDD Gate Compliance

Not applicable — plan type is execute (no `type: tdd` frontmatter; no RED/GREEN cycle required).

## Self-Check: PASSED
