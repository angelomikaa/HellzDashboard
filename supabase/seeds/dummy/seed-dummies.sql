-- NeoFoot dummy seed (plan 07-03, SEED-01): 73 dummy members + validated/pending
-- submissions + submission_stats, ONE file, ONE transaction, idempotent
-- (clean-slate delete of the dummy-% sentinel namespace before inserts).
--
-- Owner decisions implemented: D-06 (roster 73), D-07 (role mapping),
-- D-08 (authored shared-slot splits), D-09 (display = class name + number),
-- D-10 (uniform PIN, hash only - plaintext never committed), D-11 (values =
-- live-derived/owner-supplied bases x per-member factor profile), D-14
-- (Stalker wildcard, n=1), D-15 (all 57 stats per validated submission,
-- one pending-only dummy, both value_types covered per cohort).
--
-- Base values (dummy_stat_base) are LIVE-DERIVED (D-11 honest, owner decision
-- at the D-12 gate, 2026-10-14): base = live median from
-- supabase/seeds/dummy/value-bases.json (live validated submissions, n=3,
-- cohorts Assassin/tank + Priest/tank), rounded per value_type (flat ->
-- integer, percentual -> 1 decimal). EXCEPT the 4 degenerate all-zero live
-- stats (refine_mdef, crit_dmg, fixed_ct, variable_ct) which keep the
-- owner-supplied samples - live data cannot shape them. Negative live ranges
-- (fixed_ct_pct -49.4, global_cd_pct -10, variable_ct_pct -60) are preserved
-- as-is: the ladder multiplies the signed base, so every profile value keeps
-- the live sign (never clamped to positive). Stats whose live values are ALL
-- zero but which were not in the owner's degenerate list (ignore_pdef_pct,
-- ignore_mdef_pct, dmg_vs_demi_human) take base 0.0 honestly from the live
-- median.
--
-- Apply to LIVE (plan 07-04, after owner approval): node scripts/apply-seed.mjs supabase/seeds/dummy/seed-dummies.sql

begin;

-- Idempotent clean-slate (FK order: pin_login_attempts + submission_stats
-- before submissions, submissions before members - members FK is NO ACTION;
-- submission_stats also cascades with submissions, kept explicit).
delete from pin_login_attempts where discord_handle like 'dummy-%';
delete from submission_stats where submission_id in (
  select s.id from submissions s join members m on m.id = s.member_id
  where m.discord_handle like 'dummy-%'
);
delete from submissions where member_id in (
  select id from members where discord_handle like 'dummy-%'
);
delete from members where discord_handle like 'dummy-%';

-- 73-row roster (07-RESEARCH section 6 matrix):
--   High Priest x16 suporte (hp-16 is the pending-only dummy, D-15)
--   Gypsy x8 suporte, Bard x8 suporte
--   Lord Knight x4 (dps x3, suporte x1), Paladin x4 (dps x3, suporte x1)
--   High Wizard x4 mdps, Professor x4 mdps
--   Biochemist x4 (dps x2, mdps x1, suporte x1)
--   Mastersmith x4 (dps x1, mdps x2, suporte x1)
--   Sniper x4 dps, Rebellion x4 dps
--   Summoner x8 (dps x3, mdps x3, suporte x2) - the 3/3/2 split
--   Stalker x1 dps - wildcard, n=1 (D-14)
-- age_days: submitted_at = now() - age_days; fresh 0-2 for ~half,
-- stale 8-30 for the rest, mixed across classes (D-11 spread).
create temp table dummy_members (
  handle_suffix text, class_name text, char_function text,
  profile text, display_no int, age_days int, pending_only boolean
) on commit drop;
insert into dummy_members (handle_suffix, class_name, char_function, profile, display_no, age_days, pending_only) values
  ('hp-01',  'High Priest', 'suporte', 'leader',   1, 1,  false),
  ('hp-02',  'High Priest', 'suporte', 'runnerup', 2, 12, false),
  ('hp-03',  'High Priest', 'suporte', 'tie_a',    3, 0,  false),
  ('hp-04',  'High Priest', 'suporte', 'tie_b',    4, 20, false),
  ('hp-05',  'High Priest', 'suporte', 'mid1',     5, 2,  false),
  ('hp-06',  'High Priest', 'suporte', 'mid1',     6, 9,  false),
  ('hp-07',  'High Priest', 'suporte', 'mid1',     7, 15, false),
  ('hp-08',  'High Priest', 'suporte', 'mid2',     8, 1,  false),
  ('hp-09',  'High Priest', 'suporte', 'mid2',     9, 25, false),
  ('hp-10',  'High Priest', 'suporte', 'mid2',     10, 0, false),
  ('hp-11',  'High Priest', 'suporte', 'mid3',     11, 18, false),
  ('hp-12',  'High Priest', 'suporte', 'mid3',     12, 2,  false),
  ('hp-13',  'High Priest', 'suporte', 'mid3',     13, 11, false),
  ('hp-14',  'High Priest', 'suporte', 'low',      14, 28, false),
  ('hp-15',  'High Priest', 'suporte', 'low',      15, 8,  false),
  ('hp-16',  'High Priest', 'suporte', 'mid1',     16, 1,  true),
  ('gy-01',  'Gypsy',       'suporte', 'leader',   1, 2,  false),
  ('gy-02',  'Gypsy',       'suporte', 'runnerup', 2, 14, false),
  ('gy-03',  'Gypsy',       'suporte', 'tie_a',    3, 0,  false),
  ('gy-04',  'Gypsy',       'suporte', 'tie_b',    4, 22, false),
  ('gy-05',  'Gypsy',       'suporte', 'mid1',     5, 8,  false),
  ('gy-06',  'Gypsy',       'suporte', 'mid2',     6, 1,  false),
  ('gy-07',  'Gypsy',       'suporte', 'mid3',     7, 16, false),
  ('gy-08',  'Gypsy',       'suporte', 'low',      8, 30, false),
  ('bd-01',  'Bard',        'suporte', 'leader',   1, 1,  false),
  ('bd-02',  'Bard',        'suporte', 'runnerup', 2, 10, false),
  ('bd-03',  'Bard',        'suporte', 'tie_a',    3, 24, false),
  ('bd-04',  'Bard',        'suporte', 'tie_b',    4, 0,  false),
  ('bd-05',  'Bard',        'suporte', 'mid1',     5, 15, false),
  ('bd-06',  'Bard',        'suporte', 'mid2',     6, 2,  false),
  ('bd-07',  'Bard',        'suporte', 'mid3',     7, 20, false),
  ('bd-08',  'Bard',        'suporte', 'low',      8, 9,  false),
  ('lk-01',  'Lord Knight', 'dps',     'leader',   1, 2,  false),
  ('lk-02',  'Lord Knight', 'dps',     'runnerup', 2, 13, false),
  ('lk-03',  'Lord Knight', 'dps',     'mid1',     3, 1,  false),
  ('lk-04',  'Lord Knight', 'suporte', 'mid1',     4, 19, false),
  ('pa-01',  'Paladin',     'dps',     'leader',   1, 0,  false),
  ('pa-02',  'Paladin',     'dps',     'runnerup', 2, 26, false),
  ('pa-03',  'Paladin',     'dps',     'mid1',     3, 2,  false),
  ('pa-04',  'Paladin',     'suporte', 'mid1',     4, 12, false),
  ('hw-01',  'High Wizard', 'mdps',    'leader',   1, 1,  false),
  ('hw-02',  'High Wizard', 'mdps',    'runnerup', 2, 17, false),
  ('hw-03',  'High Wizard', 'mdps',    'mid1',     3, 0,  false),
  ('hw-04',  'High Wizard', 'mdps',    'mid2',     4, 23, false),
  ('pf-01',  'Professor',   'mdps',    'leader',   1, 2,  false),
  ('pf-02',  'Professor',   'mdps',    'runnerup', 2, 11, false),
  ('pf-03',  'Professor',   'mdps',    'mid1',     3, 29, false),
  ('pf-04',  'Professor',   'mdps',    'mid2',     4, 1,  false),
  ('bc-01',  'Biochemist',  'dps',     'leader',   1, 2,  false),
  ('bc-02',  'Biochemist',  'dps',     'runnerup', 2, 21, false),
  ('bc-03',  'Biochemist',  'mdps',    'mid1',     3, 0,  false),
  ('bc-04',  'Biochemist',  'suporte', 'mid1',     4, 16, false),
  ('ms-01',  'Mastersmith', 'dps',     'leader',   1, 1,  false),
  ('ms-02',  'Mastersmith', 'mdps',    'mid1',     2, 25, false),
  ('ms-03',  'Mastersmith', 'mdps',    'mid2',     3, 2,  false),
  ('ms-04',  'Mastersmith', 'suporte', 'mid1',     4, 10, false),
  ('sn-01',  'Sniper',      'dps',     'leader',   1, 2,  false),
  ('sn-02',  'Sniper',      'dps',     'runnerup', 2, 18, false),
  ('sn-03',  'Sniper',      'dps',     'mid1',     3, 0,  false),
  ('sn-04',  'Sniper',      'dps',     'low',      4, 27, false),
  ('rb-01',  'Rebellion',   'dps',     'leader',   1, 1,  false),
  ('rb-02',  'Rebellion',   'dps',     'runnerup', 2, 14, false),
  ('rb-03',  'Rebellion',   'dps',     'mid1',     3, 2,  false),
  ('rb-04',  'Rebellion',   'dps',     'low',      4, 22, false),
  ('su-01',  'Summoner',    'dps',     'leader',   1, 2,  false),
  ('su-02',  'Summoner',    'dps',     'mid1',     2, 9,  false),
  ('su-03',  'Summoner',    'dps',     'low',      3, 19, false),
  ('su-04',  'Summoner',    'mdps',    'leader',   4, 1,  false),
  ('su-05',  'Summoner',    'mdps',    'mid1',     5, 24, false),
  ('su-06',  'Summoner',    'mdps',    'low',      6, 0,  false),
  ('su-07',  'Summoner',    'suporte', 'leader',   7, 13, false),
  ('su-08',  'Summoner',    'suporte', 'low',      8, 10, false),
  ('wild-01','Stalker',     'dps',     'mid1',     1, 2,  false);

-- Profile ladder (SEED-01 mandated shapes): clear leader 1.000,
-- ~0.985 runner-up, exact ties at 0.920 (tie_a/tie_b), mids, low.
create temp table dummy_profiles (profile text, factor numeric) on commit drop;
insert into dummy_profiles (profile, factor) values
  ('leader',   1.000),
  ('runnerup', 0.985),
  ('tie_a',    0.920),
  ('tie_b',    0.920),
  ('mid1',     0.880),
  ('mid2',     0.800),
  ('mid3',     0.740),
  ('low',      0.610);

-- Per-stat base values: one row per catalog stat. Live-derived median from
-- value-bases.json (D-11) for 53 stats; the 4 degenerate all-zero live stats
-- keep the flagged owner-supplied samples (SEED-01 fallback). Flat stats
-- integer-scaled, percentual 1-decimal-scaled by the insert below.
create temp table dummy_stat_base (stat_key text, base_value numeric) on commit drop;
insert into dummy_stat_base (stat_key, base_value) values
  -- general (flat): live medians, n=3
  ('hp', 100670), ('sp', 1008), ('patk', 2933), ('pdef', 4605),
  ('matk', 5839), ('mdef', 1664), ('refine_patk', 623), ('refine_pdef', 200),
  ('refine_matk', 887),
  -- degenerate (live all-zero): owner-supplied sample kept
  ('refine_mdef', 280),
  ('hp_recover', 530), ('sp_recover', 73), ('hit', 264), ('flee', 148),
  ('combat_power', 288216),
  -- quasi (flat): live medians, n=3
  ('aspd', 110), ('mspd', 155),
  -- degenerate (live all-zero): owner-supplied samples kept
  ('variable_ct', -35), ('fixed_ct', -90),
  ('healing_done', 32), ('healing_taken', 32), ('crit', 40), ('crit_res', 140),
  ('pdmg', 34), ('pdmg_bonus', 245), ('mdmg', 40), ('mdmg_bonus', 735),
  ('ignore_pdef', 843), ('ignore_mdef', 190),
  ('pve_dmg_reduction', 1219), ('pve_dmg_bonus', 673),
  ('pvp_dmg_reduction', 1730), ('pvp_dmg_bonus', 1300),
  -- quasi (percentual): live medians, n=3 - negatives preserved
  ('crit_dmg_res', 14.0), ('pdmg_r', 154.5), ('mdmg_r', 94.1),
  ('fixed_ct_pct', -49.4), ('variable_ct_pct', -60.0),
  ('global_cd_pct', -10.0),
  -- live all-zero (not in owner's degenerate list): live median = 0.0
  ('ignore_pdef_pct', 0.0), ('ignore_mdef_pct', 0.0),
  -- degenerate (live all-zero): owner-supplied sample kept
  ('crit_dmg', 155.0),
  -- special (percentual): live medians, n=3
  ('max_sp_pct', 21.2), ('equip_patk_pct', 19.4), ('equip_matk_pct', 69.9),
  ('equip_pdef_pct', 25.4), ('equip_mdef_pct', 13.4),
  ('dmg_vs_small', 2.0), ('dmg_vs_medium', 4.0), ('dmg_vs_large', 4.0),
  ('dmg_vs_brute', 1.0), ('dmg_vs_demi_human', 0.0),
  ('dmg_reduction_vs_small', 4.0), ('dmg_reduction_vs_medium', 17.0),
  ('dmg_reduction_vs_large', 4.0), ('dmg_reduction_vs_brute', 2.0),
  ('dmg_reduction_vs_demi_human', 4.0);

-- Hard invariant guards: exactly 57 bases, one per catalog stat key.
do $$
begin
  if (select count(*) from dummy_stat_base) <> 57 then
    raise exception 'dummy_stat_base must have exactly 57 rows';
  end if;
  if exists (
    select 1 from stat_catalog sc
    where not exists (select 1 from dummy_stat_base b where b.stat_key = sc.stat_key)
  ) or exists (
    select 1 from dummy_stat_base b
    where not exists (select 1 from stat_catalog sc where sc.stat_key = b.stat_key)
  ) then
    raise exception 'dummy_stat_base must cover stat_catalog exactly (no gaps, no unknown keys)';
  end if;
end $$;

-- 73 dummy members (D-09: display = catalog class name + number; D-10:
-- uniform PIN, hash only; role stays 'member'; sentinel handles dummy-%).
insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
select 'dummy-' || d.handle_suffix,
       d.class_name || ' ' || d.display_no,
       '$2b$10$1l1ZHCv.rRuug8ii.k6fSu8.JTYp9ULKrnS5JcJ0EhEyZNlZxTs8C',
       'member', true, d.class_name, d.char_function
from dummy_members d;

-- Validated submission for every dummy EXCEPT the pending-only one (hp-16,
-- D-15: renders never-submitted in ranks AND populates the Validacoes queue).
insert into submissions (member_id, status, submitted_at)
select m.id, 'validated', now() - (interval '1 day' * d.age_days)
from dummy_members d
join members m on m.discord_handle = 'dummy-' || d.handle_suffix
where d.pending_only = false;

-- Pending-only dummy (hp-16): one pending submission, NO validated submission.
insert into submissions (member_id, status, submitted_at)
select m.id, 'pending', now() - interval '1 day'
from members m
where m.discord_handle = 'dummy-hp-16';

-- All 57 stats per validated submission: value = base x member factor,
-- percentual rounded to 1 decimal, flat to integer (D-15 invariant).
insert into submission_stats (submission_id, stat_key, value)
select sub.id, b.stat_key,
       case when sc.value_type = 'percentual'
            then round(b.base_value * p.factor, 1)
            else round(b.base_value * p.factor) end
from submissions sub
join members m on m.id = sub.member_id
join dummy_members d on 'dummy-' || d.handle_suffix = m.discord_handle
join dummy_profiles p on p.profile = d.profile
cross join dummy_stat_base b
join stat_catalog sc on sc.stat_key = b.stat_key
where m.discord_handle like 'dummy-%' and sub.status = 'validated';

commit;
