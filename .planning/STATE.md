---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Home, Whitelist & Fine Ranks
status: executing
stopped_at: CHECKPOINT 07-03 (D-12 owner review gate): dummy seed package (73-member roster, value bases, purge) authored + rehearsed 20/20 green locally; awaiting owner approval of value tables, Sniper correction, splits, wildcard + PIN handoff before 07-04 live apply
last_updated: "2026-10-14T03:33:00.000Z"
last_activity: 2026-10-14
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 4
  completed_plans: 2
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-13, after v1.0 milestone)

**Core value:** Each player can see, through their stat cards, exactly where they stand compared to players of the same class and function — and what they must improve to reach guild standards.
**Current focus:** Phase 07 — Dummy-Data Seed & Catalog Alignment

## Current Position

Phase: 07 (Dummy-Data Seed & Catalog Alignment) — EXECUTING
Plan: 3 of 4 — tasks 1-2 complete; task 3 = D-12 checkpoint (owner review), OPEN
Status: Blocked on owner (human-verify gate)
Last activity: 2026-10-14

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md Key Decisions and the archived phase documents (`.planning/milestones/v1.0-ROADMAP.md`, phase SUMMARY/VERIFICATION files kept in `.planning/phases/`).

- [Phase 07]: Hunter line catalog entry = Sniper (not Ranger): live-API verification 2026-10-13 confirmed the Archer line's released top job is Sniper (second_advanced_transfer); Ranger is third_transfer/unreleased, same rule as Grand Summoner/Nightwatch. Surfaced at the D-12 review gate.
- [Phase 07]: Migration 0012 ships catalog alignment (11 renames, guarded Dancer/Super Novice removals, Summoner/Rebellion additions) + char_function CHECK widen (tank->suporte, mdps added) in one append-only corrective migration. Local rehearsal ran against real Postgres 18.4 via embedded binaries (no supabase CLI/Docker in this environment); live key-stat count parity re-check owned by 07-04.
- [Phase 07]: Client role vocabulary lives in ONE shared map (src/lib/groups.ts FUNCTION_LABELS, dps/mdps/suporte with locked pt-BR copy); the staff form renders its three options from the map so options can never drift from the vocabulary
- [Phase 07]: Dummy seed (07-03) uses OWNER-SUPPLIED-SAMPLE base values for all 57 stats (SEED-01 fallback) — the live value report (scripts/dummy-value-report.mjs) was env-gated out of the authoring session; every stat flagged low-confidence in SEED-NOTES.md; owner should run `node scripts/dummy-value-report.mjs` (env-gated) to refresh bases or approve the samples at the D-12 gate before 07-04 applies live
- [Phase 07]: Dummy seed roster splits authored per D-08 (LK/Paladin 3/1 dps:suporte, Biochemist 2/1/1, Mastersmith 1/2/1, Summoner 3/3/2, Sniper+Rebellion 4+4, Stalker wildcard n=1) — owner-correctable at the D-12 gate; uniform dummy PIN is hash-only in the repo, plaintext handed off out-of-band (never committed)

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

Last session: 2026-10-14T03:33:00.000Z
Stopped at: CHECKPOINT 07-03 (D-12 owner review gate): dummy seed authored + rehearsed 20/20 green locally; awaiting owner approval (values / Sniper / splits / wildcard) + PIN handoff before 07-04 live apply
Resume file: .planning/phases/07-dummy-data-seed-catalog-alignment/07-03-SUMMARY.md

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 07 | 07-01 | ~62 min | 2 | 2 | 2026-10-14 |
| 07 | 07-02 | ~15 min | 2 | 6 | 2026-10-14 |
| 07 | 07-03 | ~61 min (tasks 1-2, checkpoint open) | 2/3 | 4 | 2026-10-14 |

---
*v1.0 shipped 2026-10-13. v2 deferred items: delta badges (DELT-01), history view (HIST-01), officer guild-health dashboard (OFCR-01), catalog self-service (CAT-01), OCR confidence surfacing (OCRX-01), shareable PNG export (SHAR-01), power-shift significance rule.*
