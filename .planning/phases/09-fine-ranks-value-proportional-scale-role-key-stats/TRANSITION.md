# Phase 9 Transition Summary

**Commit:** 9df6209
**Phase:** 09 — Fine Ranks — Value-Proportional Scale & Role-Differentiated Key Stats
**Plans:** 09-01 through 09-05 complete (5/5). Plan 09-06 env-gated.

## What Was Delivered

### Migration 0018 (`supabase/migrations/0018_fine_ranks_role_key_stats.sql`)
- **stat_direction** column on `stat_catalog` (CHECK `'higher'|'lower'`, default `'higher'`); `fixed_ct_pct`, `global_cd_pct`, `variable_ct_pct` marked `'lower'`
- **class_key_stats** PK rebuilt to `(class_name, char_function, stat_key)`; `selection_order` + `selected_at` columns added; `char_function` CHECK (`dps|mdps|suporte`)
- **Backfill DML**: every existing class's 6 key stats copied into all 3 build roles (18 rows/class), `selection_order` 1-6 preserved
- **set_key_stat_v2**: single RPC replacing `set_key_stat` + `set_relevant_stat`; advisory lock `hashtext('cks:'||p_class||':'||p_function)`; KEYU ordered set (first 6 = keys, 7th+ = relevants; deselect key promotes oldest relevant); old signatures dropped
- **my_report**: value-proportional points `round(own/best×99,2)` clamped [0,99], stat_direction-aware best (max/min), per-member own (class, build-role) config + cohorts, `last_validated_at` scalar, OVR unchanged
- **class_top5**: same formula swap, per-(class, function) cohort
- **get_promotion**: same formula swap, class-wide OVR kept (cross-role comparable currency)

### Client layer
- `setKeyStat(session, className, charFunction, statKey, enabled)` → `/rpc/set_key_stat_v2`
- `setRelevantStat` removed
- `fetchKeyStats`/`fetchKeyRelevantStats` accept optional `charFunction`
- `KeyStatsPage`: role selector (class → function from FUNCTION_LABELS), KEYU ordered-set chips (no block-at-7), coverage indicator (`keyCount/6`)

### rankMath tripod re-lock
- `rankMath.ts`: `percentilePoints` → value-proportional; `ovrFromPoints` unchanged
- `rankMath.test.ts`: 22 locked test vectors re-baselined
- `smoke-rank.mjs`: clean value-proportional fixtures (OVR a=75/b=91/c=99), KEYU tests
- `smoke-promotion.mjs`: set_key_stat_v2 RPC calls

### Dashboard UI
- `percentilePhrase` removed from `presentation.ts` + `StatCard.tsx`
- Points shown as raw 0-99 integer + tier badge

## Verification
- 548 tests pass (35 files), build green
- All must-haves verified in VERIFICATION.md

## Deferred (env-gated)
- Plan 09-06 (live smoke verification against deployed Supabase): requires `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF` — not available in this environment. Must be run when live credentials are accessible.

## Pre-existing changes (not part of this commit)
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` have uncommitted modifications for Phase 9.1 (Hidden Raw Defenses, DEF-01..DEF-06) — these were in the working tree before Phase 9 execution and remain uncommitted

## Next
- Run plan 09-06 live smoke when Supabase credentials are available
- Phase 9.1 (Hidden Raw Defenses) planning follows Phase 9 completion
- Phase 10 (Personalized Home Landing Tab) depends on Phase 9's `last_validated_at`
