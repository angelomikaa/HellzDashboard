# Phase 9 Verification — Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats

**Commit:** 9df6209 (17 files, +1228/-432)
**Plans completed:** 09-01, 09-02, 09-03, 09-04, 09-05 (all committed)
**Plan 09-06:** env-gated (live smoke requires SUPABASE_ACCESS_TOKEN/PROJECT_REF — not present in this environment)

## Must-Have Verification

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Migration 0018 with stat_direction column | PASS | `supabase/migrations/0018_fine_ranks_role_key_stats.sql` — stat_direction CHECK higher\|lower; fixed_ct_pct/global_cd_pct/variable_ct_pct = 'lower' |
| 2 | class_key_stats PK rebuilt to (class, function, stat) | PASS | Migration section 2 — PK drop + recreate, selection_order + selected_at columns added |
| 3 | Backfill DML: 6 stats → 3 build roles (18 rows/class) | PASS | Migration section 3 — INSERT with cross join (dps/mdps/suporte), selection_order 1-6 preserved |
| 4 | set_key_stat_v2 with advisory lock per (class, function) | PASS | Migration section 4 — pg_advisory_xact_lock(hashtext('cks:'\|\|p_class\|\|':'\|\|p_function)) |
| 5 | KEYU ordered set: first 6 = keys, 7th+ = relevants | PASS | Migration section 4 — p_enabled=true appends (no block at 7); p_enabled=false promotes oldest relevant |
| 6 | Old set_key_stat/set_relevant_stat dropped | PASS | Migration section 5 — drop function if exists for both old signatures |
| 7 | my_report: value-proportional points + last_validated_at | PASS | Migration section 7 — round(own/best×99,2) clamped [0,99], stat_direction-aware, last_validated_at scalar |
| 8 | class_top5: value-proportional, per-(class, function) cohort | PASS | Migration section 8 — same formula swap, char_function in cohort joins |
| 9 | get_promotion: value-proportional, class-wide OVR kept | PASS | Migration section 9 — formula swap per member's own class+function, OVR class-wide |
| 10 | rankMath.ts: percentilePoints value-proportional | PASS | `src/lib/rankMath.ts` — round(own/best×99,2), direction param, clamp [0,99] |
| 11 | rankMath.test.ts: 22 locked test vectors re-baselined | PASS | 22 tests pass — clean values (33, 49.5, 66, 99), tie at top = 99, lower-is-better inversion |
| 12 | smoke-rank.mjs: re-baselined + KEYU tests | PASS | `scripts/smoke-rank.mjs` — set_key_stat_v2 with p_function, KEYU 7th-selection + deselect-promote tests, OVR a=75/b=91/c=99 |
| 13 | smoke-promotion.mjs: re-baselined | PASS | `scripts/smoke-promotion.mjs` — set_key_stat_v2 RPC calls instead of direct INSERT |
| 14 | api.ts: setKeyStat uses set_key_stat_v2 + p_function | PASS | `src/lib/api.ts` — POST to /rpc/set_key_stat_v2 with {p_class, p_function, p_stat_key, p_enabled} |
| 15 | api.ts: setRelevantStat removed | PASS | No references to setRelevantStat or set_relevant_stat remain |
| 16 | KeyStatsPage: role selector + KEYU chips + coverage | PASS | `src/features/admin/KeyStatsPage.tsx` — class + function selector from FUNCTION_LABELS, no block-at-7, keyCount/6 badge |
| 17 | presentation.ts: percentilePhrase removed | PASS | `src/features/dashboard/presentation.ts` — function deleted, tierForPoints/tierForOvr/improvementFocus untouched |
| 18 | StatCard.tsx: no percentilePhrase, raw points + tier badge | PASS | `src/features/dashboard/StatCard.tsx` — Math.round(stat.points) badge, no phrase JSX |
| 19 | 548 tests pass, build green | PASS | `npm run build` exits 0; `npm run test` — 35 files, 548 tests all pass |

## Notes
- Migration numbered 0018 (0017 consumed by live step-up repair applied in Phase 08.1)
- Roadmap.md/REQUIREMENTS.md have pre-existing uncommitted changes for Phase 9.1 (Hidden Raw Defenses) — not part of this commit
- 09-06 live smoke verification deferred to environment with Supabase credentials
