-- ---------------------------------------------------------------------------
-- Migration 0019 — Hidden Raw Defenses (RPDEF/RMDEF), Phase 9.1
--
-- Depends on migration 0018_fine_ranks_role_key_stats.sql (Phase 9) which
-- must be applied FIRST and is NOT modified by this file. 0018 provides:
--   - stat_catalog.stat_direction column (CHECK 'higher'|'lower')
--   - class_key_stats PK rebuilt to (class_name, char_function, stat_key)
--   - class_key_stats.selection_order + selected_at columns
--
-- Two independent changes, both required for Phase 9.1:
--   1. Insert rpdef/rmdef catalog rows (special group, flat, higher-is-better,
--      label_short RPDEF/RMDEF). label_short is NOT NULL UNIQUE, so it is set
--      explicitly here (the base catalog seed does not set label_short).
--   2. Remap every class_key_stats row where stat_key in ('pdef','mdef') --
--      keys AND relevants -- to rpdef/rmdef, preserving selection_order and
--      selected_at, then delete the old rows.
--
-- OVR consequence: classes that had pdef/mdef as key stats will show a null
-- OVR until a new validated submission supplies both raw values. Relevant-only
-- positions do not affect OVR.
-- ---------------------------------------------------------------------------

-- 1. Catalog insert (DEF-01): rpdef/rmdef as ordinary member-visible stats.
--    stat_direction exists from 0018; set explicitly for clarity.
insert into stat_catalog (stat_key, label, group_name, value_type, label_short, stat_direction) values
  ('rpdef','RPDEF','special','flat','RPDEF','higher'),
  ('rmdef','RMDEF','special','flat','RMDEF','higher')
on conflict (stat_key) do update
  set label = excluded.label,
      group_name = excluded.group_name,
      value_type = excluded.value_type,
      label_short = excluded.label_short,
      stat_direction = excluded.stat_direction;

-- 2. Key-stat remap (DEF-04): pdef/mdef -> rpdef/rmdef at every position
--    (keys order <= 6 and relevants order > 6), preserving selection_order
--    and selected_at, then delete the old rows. Insert-before-delete keeps
--    the FK to stat_catalog satisfied (rpdef/rmdef inserted in section 1).
with remap(old_key, new_key) as (
  values ('pdef','rpdef'), ('mdef','rmdef')
)
insert into class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
select k.class_name, k.char_function, r.new_key, k.selection_order, k.selected_at
from class_key_stats k
join remap r on r.old_key = k.stat_key
on conflict (class_name, char_function, stat_key) do nothing;

with remap(old_key, new_key) as (
  values ('pdef','rpdef'), ('mdef','rmdef')
)
delete from class_key_stats k
using remap r
where k.stat_key = r.old_key;
