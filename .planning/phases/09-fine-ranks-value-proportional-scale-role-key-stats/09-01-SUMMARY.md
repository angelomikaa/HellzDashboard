# Phase 9 — Plan 09-01 SUMMARY

**Migration:** `supabase/migrations/0018_fine_ranks_role_key_stats.sql` (numbered 0018 because 0017 is consumed by the live step-up repair; roadmap/STATE.md note the renumber — owner decision #8's ONE-migration rule still holds: both Phase 9 features land in this single file, rewriting the same three RPC bodies once).

## Sections shipped (in order)

1. **stat_direction column** — `stat_catalog.stat_direction` text CHECK (`'higher'`|`'lower'`, default `'higher'`); `fixed_ct_pct`, `global_cd_pct`, `variable_ct_pct` set to `'lower'`.
2. **class_key_stats PK rebuild** — PK now `(class_name, char_function, stat_key)`; added `char_function` (CHECK `dps|mdps|suporte`), `selection_order` integer, `selected_at` timestamptz.
3. **Backfill DML** — every existing class's 6 key stats inserted into all 3 build roles (18 rows/class), `selection_order` 1-6 preserved per copy.
4. **set_key_stat v2** — `set_key_stat_v2(p_class, p_function, p_stat_key, p_enabled)` returns int. Staff gate verbatim; advisory lock `hashtext('cks:'||p_class||':'||p_function)`; validates `unknown_class`/`unknown_function`; p_enabled=true appends (7th+ = relevants, no block at 7); p_enabled=false removes + promotes oldest relevant into vacated key slot + shifts; returns key-stat count (order ≤ 6).
5. **Old RPCs dropped** — `set_key_stat(text,text,boolean)` and `set_relevant_stat(text,text,boolean)` dropped in same migration. `class_relevant_stats` table kept (unused by RPCs).
6. **EXECUTE hygiene** — revoke from public/anon, grant to authenticated on set_key_stat_v2.
7. **my_report rewrite** — value-proportional points `round(own/best×99,2)` clamped [0,99], best=max (higher) / min (lower, stat_direction-aware), per-member own (class, build-role) config + class+build-role cohorts, OVR unchanged (`51 + mean×48/99`, all-6-or-nothing, floor 51), adds `last_validated_at` scalar (max submitted_at over caller's validated submissions). Closed payload.
8. **class_top5 rewrite** — same formula swap, per-(class, function) cohort for OVR per-member build-role.
9. **get_promotion rewrite** — value-proportional points scoped to member's own class+function cohort; OVR stays class-wide across roles; highlights = class key stats, closed field list.

## Verification

- `npm run build` exits 0 (green)
- File contains `set_key_stat_v2`, `stat_direction`, `selection_order`, `cks:`, `last_validated_at`, `nullif`, `char_function`
- Zero occurrences of `create or replace function public.set_key_stat(` (3-arg old signature), `create or replace function public.set_relevant_stat(`, `drop table`
- `git status` shows only the new file (no prior migration modified)

## Next

Plan 09-02 (client API layer: `setKeyStatV2` + `setRelevantStat` removal + `KeyStatsPage` role selector) depends on 09-01 — unblocked.
