---
phase: 07-dummy-data-seed-catalog-alignment
plan: 04
subsystem: dummy-seed
tags: [supabase, live-push, migration-0012, dummy-data, smoke-battery, rls, purge-gate, catalog-alignment]
requires:
  - "07-01: migration 0012 (15-class aligned catalog + dps/mdps/suporte CHECK) rehearsed locally"
  - "07-02: FUNCTION_LABELS shared role-vocabulary map (client)"
  - "07-03: approved seed package (seed-dummies.sql, purge-dummies.sql, uniform PIN hash, D-12 gate closed)"
provides:
  - "migration 0012 APPLIED LIVE with provable OVR continuity (key-stat count parity per renamed class)"
  - "73-member dummy cohort RESIDENT on the live panel (owner decision 7 / D-13), all starvation cases verified data-insufficient server-side"
  - "smoke battery (rank/promotion/rls/officer/lifecycle) updated to the dps/mdps/suporte vocabulary and 5/5 green on live"
  - "SEED-02 purge recorded as a HARD pre-release checklist gate in STATE.md Blockers/Concerns"
affects:
  - "Phase 08+ (v1.1 development observes v1.0 on realistic dummy cohorts)"
  - "pre-release checklist (purge gate must run before ANY release)"
tech-stack:
  added: []
  patterns:
    - "live push via apply-seed.mjs Management API path (no supabase CLI/Docker in this environment) with schema_migrations bookkeeping row so a future CLI push never re-runs 0012"
    - "pre/post parity snapshot as a destructive-migration gate (per-class key-stat counts before vs after)"
key-files:
  created:
    - ".planning/phases/07-dummy-data-seed-catalog-alignment/07-04-SUMMARY.md"
  modified:
    - scripts/smoke-officer.mjs
    - scripts/smoke-promotion.mjs
    - scripts/smoke-rls.mjs
    - .planning/STATE.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
key-decisions:
  - "Live push path adapted (07-01 precedent): migration 0012 applied via scripts/apply-seed.mjs (legacy Management API /database/query) — gates preserved as live-query equivalents (parity snapshot, pending-migration check, post-push parity + vocabulary); schema_migrations bookkeeping row recorded so a future CLI push never re-runs 0012"
  - "Starvation contract probed with self-cleaning throwaway members (Stalker/dps → n=2, Biochemist/mdps → n=2) because the uniform dummy PIN is hash-only in the repo (T-07-08) and was handed off out-of-band; my_report returned HTTP 200 with OVR null / data_sufficient false / all 57 stat points null — never a 500"
  - "Dummies stay resident on live for the whole milestone (owner decision 7 / D-13); the purge is a scripted HARD pre-release gate recorded in STATE.md (SEED-02)"
requirements-completed: [ROLE-12, SEED-01, SEED-02]
metrics:
  duration: ~3h wall (incl. owner observation window); active execution ~2h
  completed: 2026-10-14
---

# Phase 7 Plan 4: Dummy-Data Seed & Catalog Alignment (Live Push + Live Apply) Summary

**STATUS: COMPLETE — owner APPROVED the live observation pass 2026-10-14.** Migration 0012 is live with provable OVR continuity, the 73-dummy cohort is resident on the LIVE panel (v1.0 renders it under the current scale, starvation cases data-insufficient), the smoke battery is 5/5 green on the new vocabulary, and the SEED-02 purge is recorded as a hard pre-release gate.

## What Was Built

### Task 1 — Smoke fixtures + 0012 live push + parity + smoke battery (commit 9fae564)

Three verbatim fixture edits (plan `<interfaces>`), nothing else:

- `scripts/smoke-officer.mjs:95-96` — ROLES map `['owner','tank']`/`['officer','tank']` → `'suporte'` + adjacent comment (staff tank → staff suporte)
- `scripts/smoke-promotion.mjs:357` — filter widened to `(dps || mdps || suporte)`; probe label at ~359 updated to `(dps,mdps,suporte)`
- `scripts/smoke-rls.mjs:246,258` — `Assassin`/`tank` → `Assassin Cross`/`suporte`, plus the plan-external `classList.includes('Assassin')` → `'Assassin Cross'` probe fix (Rule 3 — see Deviations)

**Live-write log (apply-seed.mjs Management API path, per the 07-01 precedent — no supabase CLI/Docker in this environment):**

1. **Pre-push parity snapshot** (live query `select class_name, count(*)::int from class_key_stats group by class_name order by class_name`): 11 classes present, each with exactly 6 key stats.
2. **Pending-migration check** (live equivalent of `db push --dry-run`): only 0012 pending in `supabase_migrations` bookkeeping — nothing else queued.
3. **0012 applied live**: 11 renames (e.g., Blacksmith→Mastersmith, Priest→High Priest, Assassin→Assassin Cross), guarded Dancer/Super Novice removals, Summoner/Rebellion additions, `char_function` CHECK widened to `dps/mdps/suporte`.
4. **Post-push parity**: every renamed pair's new-name key-stat count exactly equals its old-name pre-push count (all 6/6); zero rows under old names.
5. **Vocabulary check**: `select distinct char_function from members;` → `dps`, `mdps`, `suporte` only — no `tank`.
6. **schema_migrations bookkeeping row** recorded for 0012 so a future CLI `db push` never re-runs it.
7. **Smoke battery 5/5 green on live, in order**: `smoke-rank.mjs`, `smoke-promotion.mjs`, `smoke-rls.mjs`, `smoke-officer.mjs`, `smoke-lifecycle.mjs` — all exit 0.

### Task 2 — Dummy seed applied live + verification matrix (seed committed at d5cf18d in 07-03; live apply + verification this plan)

`node scripts/apply-seed.mjs supabase/seeds/dummy/seed-dummies.sql` → **APPLIED**, no error. D-12 gate confirmed closed (07-03 checkpoint "approved"); live write executed only after that approval (D-12/D-13).

**Verification matrix (all green):**

| Check | Expected | Result |
|-------|----------|--------|
| Cohort matrix (21 rows) | High Priest/suporte 15, Gypsy/suporte 8, Bard/suporte 8, Lord Knight/dps 3, Lord Knight/suporte 1, Paladin/dps 3, Paladin/suporte 1, High Wizard/mdps 4, Professor/mdps 4, Biochemist/dps 2, Biochemist/mdps 1, Biochemist/suporte 1, Mastersmith/dps 1, Mastersmith/mdps 2, Mastersmith/suporte 1, Sniper/dps 4, Rebellion/dps 4, Summoner/dps 3, Summoner/mdps 3, Summoner/suporte 2, Stalker/dps 1 | EXACT match |
| 57-stats invariant | zero validated dummy submissions with ≠ 57 stats rows | 0 violations |
| Age spread | fresh (>0–3d) > 0 AND stale (8–30d) > 0 | 32 fresh / 40 stale |
| Pending-only member | ≥1 dummy with zero submissions (`dummy-hp-16`) + ≥1 pending row in queue | present |
| Starvation (n<3) probe | `my_report` → HTTP 200, OVR null, `data_sufficient: false`, all 57 stat points null — never 500 | green (both probes) |
| Dummy count | exactly 73 `dummy-%` members | 73 |
| Real-member guard | real (non-dummy, active) member count unchanged from pre-seed | unchanged |

Starvation probe note (Rule 3 adaptation, recorded in STATE.md): the uniform dummy PIN is hash-only in the repo (T-07-08) and was handed off out-of-band to the owner only, so the server-side n<3 contract was probed with self-cleaning throwaway members placed into the starved cohorts (Stalker/dps → n=2, Biochemist/mdps → n=2). The real dummy logins (`dummy-wild-01`, `dummy-hp-01`) are covered by the owner observation pass — attempting them with an unknown PIN would burn rate-limited login attempts.

### Task 3 — Owner observation pass (checkpoint:human-verify) — **APPROVED**

The owner completed the live browser observation pass and returned **"approved"** (2026-10-14). Verified by the owner in the browser:

1. Dummy login (`dummy-hp-01`) → Painel renders the report under the current scale; stat cards + OVR show points
2. Stalker wildcard dummy (`dummy-wild-01`) → data-insufficient state renders (no points/OVR, no error/crash)
3. Destaques: dummy cards appear (Critical-1 owner-accepted); n<3 classes absent rather than erroring
4. Officer views: Validações shows the pending dummy submission; Personagens edit form shows the three roles (Dano Físico / Dano Mágico / Suporte); a real member's card still renders with its OVR intact after the renames
5. Residency accepted for the milestone observation window (D-13)

No rendering issues reported.

### Task 4 — SEED-02 pre-release gate recorded (commit 851d43a)

Added to `.planning/STATE.md` → **Blockers/Concerns (open — carry to next milestone)**:

> **[Pre-release] HARD GATE (SEED-02): run the dummy purge before ANY release** — `node scripts/apply-seed.mjs supabase/seeds/dummy/purge-dummies.sql` then the zero-dummy verification query (four zeros across members/submissions/submission_stats/pin_login_attempts). Dummies are LIVE and resident by owner decision 7; shipping without the purge exposes dummy names on Destaques and distorts every real member's ranks.

The purge runbook is one command + one verification query — it cannot be missed at release time.

## Task Commits

1. **Task 1: smoke fixtures + 0012 live push + parity + battery** — `9fae564` (chore)
2. **Task 2: dummy seed live apply + verification matrix** — seed file itself at `d5cf18d` (07-03); live apply is data-only on the live DB (no repo diff beyond state records)
3. **Task 3: checkpoint state records** — `3e49a24`, `e4a3523` (docs)
4. **Task 4: SEED-02 pre-release gate record** — `851d43a` (docs)

**Plan metadata:** final docs commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS).

## Files Created/Modified

- `scripts/smoke-officer.mjs` — staff fixtures on suporte (verbatim plan lines)
- `scripts/smoke-promotion.mjs` — card filter widened to the three-role vocabulary
- `scripts/smoke-rls.mjs` — Assassin Cross/suporte fixtures + classes-read probe fix
- `.planning/STATE.md` — SEED-02 gate in Blockers/Concerns; position/decisions/session updated
- `.planning/REQUIREMENTS.md` — ROLE-12, SEED-01, SEED-02 marked complete
- `.planning/ROADMAP.md` — Phase 7 plan progress 4/4

## Decisions Made

- Live push via the apply-seed.mjs Management API path with schema_migrations bookkeeping (no supabase CLI/Docker available; 07-01 precedent) — all plan gates preserved as live-query equivalents
- Starvation probes via self-cleaning throwaway members rather than dummy logins (PIN is hash-only in repo; burning rate-limited attempts on the real dummies would be reckless) — the real dummy logins were covered by the owner's observation pass
- Dummies remain resident for the milestone (owner decision 7); purge is a hard, scripted, pre-release gate (SEED-02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Live-push path unavailable — adapted to apply-seed.mjs Management API**
- **Found during:** task 1 (pre-flight)
- **Issue:** no supabase CLI / Docker in this environment → `supabase db push` impossible
- **Fix:** migration 0012 applied via `scripts/apply-seed.mjs` (the sanctioned live-write path, 07-01 precedent); all gates preserved as live-query equivalents (pre-push parity snapshot, pending-migration check, post-push parity + vocabulary checks) + a schema_migrations bookkeeping row so a future CLI push never re-runs 0012
- **Verification:** post-push parity exact; vocabulary suporte-only; battery 5/5 green
- **Committed in:** state record `3e49a24`; live apply data-only

**2. [Rule 3 - Blocking] smoke-rls.mjs classes-read probe referenced the dead class name**
- **Found during:** task 1 (fixture edits)
- **Issue:** the probe asserted `classList.includes('Assassin')` — post-rename that class no longer exists, so the battery would sit red after the push
- **Fix:** probe now asserts `'Assassin Cross'` (one line beyond the plan's listed touchpoints)
- **Verification:** `smoke-rls.mjs` green in the 5/5 battery
- **Committed in:** `9fae564`

**3. [Rule 3 - Blocking] Starvation probes could not log in as the real dummy wildcards**
- **Found during:** task 2 (starvation smoke)
- **Issue:** the uniform dummy PIN is hash-only in the repo (T-07-08) — plaintext was handed off out-of-band to the owner only, so the executor cannot authenticate as `dummy-wild-01`; guessing would burn rate-limited login attempts
- **Fix:** probed the server-side n<3 contract with self-cleaning throwaway members placed in the starved cohorts (Stalker/dps → n=2, Biochemist/mdps → n=2); real dummy logins covered by the owner observation pass (task 3)
- **Verification:** `my_report` returned HTTP 200 with OVR null / data_sufficient false / all 57 stat points null; throwaways deleted after probe
- **Committed in:** state record `e4a3523`

---

**Total deviations:** 3 auto-fixed (all Rule 3 blocking-environment issues)
**Impact on plan:** All adaptations preserve the plan's gates and security posture. No scope creep; no live-write protocol weakened.

## Issues Encountered

- None beyond the three Rule 3 adaptations above. Owner token freshness gate (Medium-3b) was honored — the push ran only after a fresh `SUPABASE_ACCESS_TOKEN` was set as a session env var (never echoed or persisted).

## User Setup Required

None new — the owner's session env vars (`SUPABASE_ACCESS_TOKEN` — rotated fresh per the standing action — and `SUPABASE_PROJECT_REF`) were supplied in-session for the live writes. Standing pre-release actions remain recorded in STATE.md (token rotation, placeholder example shots, whitelist/PIN rotation, catalog re-seed of the 6 flat-damage stats — pre-existing, untouched by this plan).

## Requirements Completed

- **ROLE-12** — class catalog aligned with the official job tree (transcendent names, unreleased jobs excluded, Summoner/Rebellion added; verified against the live official API 2026-10-13 in 07-01 and now live)
- **SEED-01** — reversible dummy seed following the owner roster, live-derived realistic values, applied to the LIVE panel via apply-seed.mjs (73 members, validated submissions, submitted_at spread incl. never-submitted member)
- **SEED-02** — purge by sentinel prefix FK-safe (submissions before members), idempotent, and recorded as a hard pre-release checklist gate in STATE.md

## Next Phase Readiness

- Phase 7 is COMPLETE (4/4 plans). v1.0 renders the resident dummy cohorts under the current scale — the milestone observation window (D-13) is open for v1.1 development.
- **HARD pre-release gate (SEED-02)** is live in STATE.md: run `node scripts/apply-seed.mjs supabase/seeds/dummy/purge-dummies.sql` + the four-zero verification before ANY release.
- Pre-existing operational concerns carried in STATE.md (JWT key, token rotation, placeholder SVGs, 6-stat catalog re-seed, OCR recalibration) — none block v1.1 development.

## Self-Check: PASSED

- `07-04-SUMMARY.md` exists on disk — FOUND
- Task commits verified in `git log --all`: `9fae564` (task 1), `3e49a24` / `e4a3523` (checkpoint state records), `851d43a` (task 4) — all FOUND
- `REQUIREMENTS.md`: ROLE-12, SEED-01, SEED-02 checkboxes `[x]` + traceability table "Complete" — verified
- `ROADMAP.md`: Phase 7 row `4/4 | Complete | 2026-10-14`, phase checkbox `[x]`, plans 4/4 checked — verified
- `STATE.md`: SEED-02 hard gate present in Blockers/Concerns; position/session/metrics updated — verified

---
*Phase: 07-dummy-data-seed-catalog-alignment*
*Completed: 2026-10-14*
