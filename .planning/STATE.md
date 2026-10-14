---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Home, Whitelist & Fine Ranks
status: executing
stopped_at: "07-04 CHECKPOINT (human-action): task 1 pre-flight done (smoke fixtures edited + local checks green); awaiting FRESH SUPABASE_ACCESS_TOKEN session env to push 0012 live"
last_updated: "2026-10-14T08:20:00.000Z"
last_activity: 2026-10-14
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-13, after v1.0 milestone)

**Core value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.
**Current focus:** Phase 07 — Dummy-Data Seed & Catalog Alignment

## Current Position

Phase: 07 (Dummy-Data Seed & Catalog Alignment) — EXECUTING
Plan: 4 of 4 — 07-04 IN PROGRESS: task 1 checkpoint — awaiting fresh SUPABASE_ACCESS_TOKEN (+SUPABASE_PROJECT_REF) as session env; smoke fixture edits staged uncommitted (commit lands only after push + 5/5 green smokes, per plan step 8)
Status: BLOCKED on owner human-action (token)
Last activity: 2026-10-14

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md Key Decisions and the archived phase documents (`.planning/milestones/v1.0-ROADMAP.md`, phase SUMMARY/VERIFICATION files kept in `.planning/phases/`).

- [Phase 07]: Hunter line catalog entry = Sniper (not Ranger): live-API verification 2026-10-13 confirmed the Archer line's released top job is Sniper (second_advanced_transfer); Ranger is third_transfer/unreleased, same rule as Grand Summoner/Nightwatch. Surfaced at the D-12 review gate.
- [Phase 07]: Migration 0012 ships catalog alignment (11 renames, guarded Dancer/Super Novice removals, Summoner/Rebellion additions) + char_function CHECK widen (tank->suporte, mdps added) in one append-only corrective migration. Local rehearsal ran against real Postgres 18.4 via embedded binaries (no supabase CLI/Docker in this environment); live key-stat count parity re-check owned by 07-04.
- [Phase 07]: Client role vocabulary lives in ONE shared map (src/lib/groups.ts FUNCTION_LABELS, dps/mdps/suporte with locked pt-BR copy); the staff form renders its three options from the map so options can never drift from the vocabulary
- [Phase 07]: Dummy seed roster splits authored per D-08 (LK/Paladin 3/1 dps:suporte, Biochemist 2/1/1, Mastersmith 1/2/1, Summoner 3/3/2, Sniper+Rebellion 4+4, Stalker wildcard n=1) — CONFIRMED by owner at the D-12 gate 2026-10-14; uniform dummy PIN is hash-only in the repo, plaintext handed off out-of-band (never committed)
- [Phase 07]: Dummy seed value bases REBUILT from live medians (D-11 honest, owner D-12 decision): base = live median from value-bases.json (n=3, Assassin/tank + Priest/tank), 53/57 bases changed; the 4 degenerate all-zero live stats (refine_mdef, crit_dmg, fixed_ct, variable_ct) keep owner samples; negative live ranges (fixed_ct_pct -49.4, global_cd_pct -10, variable_ct_pct -60) preserved unclamped across the whole ladder; 3 further live-zero stats (ignore_pdef_pct, ignore_mdef_pct, dmg_vs_demi_human) take base 0.0
- [Phase 07]: D-12 gate CLOSED (owner, 2026-10-14): Sniper (not Ranger) confirmed, authored splits as rehearsed, Stalker wildcard x1, live residency (D-13) approved; ZERO live writes in 07-03 - plan 07-04 owns the live apply via apply-seed.mjs and the SEED-02 pre-release gate
- [Phase 07]: 07-04 live-push path adapted (no supabase CLI/Docker in this environment, 07-01 precedent): migration 0012 applies via scripts/apply-seed.mjs (legacy Management API /database/query - the sanctioned live-write path), replacing the unavailable `supabase db push`; gates preserved as live-query equivalents (pre-push parity snapshot, pending-migration check against supabase_migrations, post-push parity + vocabulary checks); a schema_migrations bookkeeping row for 0012 is recorded post-apply so a future CLI push never re-runs it
- [Phase 07]: smoke fixture vocabulary update includes one plan-external line (Rule 3): smoke-rls.mjs classes-read probe checked `classList.includes('Assassin')` - post-rename that class no longer exists, so the probe now asserts 'Assassin Cross'; without it the battery would sit red after the push

### Blockers/Concerns (open — carry to next milestone)

- **[Operational] Do NOT revoke JWT signing key 6f7657c3** (standby) — revoking it kills every member session instantly
- **[Pre-launch] Owner must rotate the Supabase access token** used for deploys, and rotate placeholder whitelist rows/PINs before inviting real members (credentials/hashes recoverable from git history, WR-06; standing action since 03-02)
- **[Pre-launch] Owner must replace `public/examples/*.svg`** placeholder example shots with real game screenshots before inviting real members (acknowledged 02-03 UAT step 8)
- **[Pending live op] Catalog re-seed of the 6 reclassified flat damage stats** (pve_dmg_bonus, pvp_dmg_bonus, mdmg_bonus, pdmg_bonus, pve_dmg_reduction, pvp_dmg_reduction → 'flat', D-05-UAT-10) via apply-seed.mjs was auth-gated and never run — live catalog still shows the superseded value_type for those six
- **[OCR calibration] Structural reader thresholds need production-data calibration** — spike GO was 100.0% on 11 owner-device samples but device fragmentation is not covered; after a game-UI change, recalibrate the visual grammar in structure.ts (GAME_LABELS, SCREENS row order, probe thresholds) and re-run the harness grid — never pixel fractions

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-10-13:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| todo | power-shift-significance | pending — v2 domain (delta badges / submission history); owner wants combat_power shifts flagged as significant only at thousands scale between submissions |
| uat | 05-UAT.md / 06-UAT.md "unknown" audit flags | false positive — both files carry `status: complete` with owner verbatim approvals recorded; parser artifact, no action needed |

## Session Continuity

Last session: 2026-10-14T08:20:00.000Z
Stopped at: 07-04 CHECKPOINT (human-action): task 1 pre-flight done (smoke fixtures edited + local checks green); awaiting FRESH SUPABASE_ACCESS_TOKEN session env to push 0012 live
Resume file: .planning/phases/07-dummy-data-seed-catalog-alignment/07-04-PLAN.md

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 07 | 07-01 | ~62 min | 2 | 2 | 2026-10-14 |
| 07 | 07-02 | ~15 min | 2 | 6 | 2026-10-14 |
| 07 | 07-03 | ~96 min (tasks 1-2 + gate close) | 3 | 5 | 2026-10-14 |

---
*v1.0 shipped 2026-10-13. v2 deferred items: delta badges (DELT-01), history view (HIST-01), officer guild-health dashboard (OFCR-01), catalog self-service (CAT-01), OCR confidence surfacing (OCRX-01), shareable PNG export (SHAR-01), power-shift significance rule.*
