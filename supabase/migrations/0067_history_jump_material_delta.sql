-- NeoFoot migration 0067: history_jump requires a material change.
--
-- WHY: the generic rule in 0053 was `z >= 3.5` alone. z compares the submitted
-- value with the MEDIAN of the member's last 10 validated values, so a player
-- whose build has been trending up sits several sigmas above that median even
-- when the value did NOT change from the previous submission (measured live
-- 2026-11-02: an identical resubmission produced delta 0 with z 6.86 / 6.52 /
-- 9.67 / 3.95 -> "Salto no histórico" and an inconclusive verdict). That
-- poisons the officer's review with a false anomaly and prevents a clean
-- resubmission from ever reaching "Consistente".
--
-- WHAT: the history_jump branch now requires BOTH a robust outlier (z >= 3.5)
-- AND a material change vs the previous validated row:
--   - percentual: |delta| >= 5 p.p.
--   - flat:       |delta| >= 3% of the previous value
-- The explicit large-change branches (>= 20 p.p. on a percent, >= 25% on a
-- flat) stay unchanged: they are material by definition.
--
-- Append-only: 0053 is not edited. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0067_history_jump_material_delta.sql

begin;

create or replace function public.member_history_deviations(
  p_submission uuid,
  p_member uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pending as (
    select ss.stat_key, ss.value
    from submission_stats ss
    where ss.submission_id = p_submission
      and ss.stat_key in (
        'matk', 'equip_matk_pct', 'patk', 'equip_patk_pct',
        'rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct'
      )
  ),
  prev_all as (
    select ss.stat_key, ss.value, s.submitted_at,
           row_number() over (
             partition by ss.stat_key
             order by s.submitted_at desc, s.id desc
           ) as rn
    from submission_stats ss
    join submissions s on s.id = ss.submission_id
    where s.member_id = p_member
      and s.status = 'validated'
      and ss.stat_key in (
        'matk', 'equip_matk_pct', 'patk', 'equip_patk_pct',
        'rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct'
      )
  ),
  latest_prev as (
    select stat_key, value, submitted_at
    from prev_all
    where rn = 1
  ),
  hist as (
    select stat_key, value
    from prev_all
    where rn <= 10
  ),
  hist_stats as (
    select stat_key, count(*) as n,
           percentile_cont(0.5) within group (order by value) as med_v
    from hist
    group by stat_key
  ),
  hist_mad as (
    select h.stat_key,
           percentile_cont(0.5) within group (order by abs(h.value - hs.med_v)) as mad_v
    from hist h
    join hist_stats hs on hs.stat_key = h.stat_key
    group by h.stat_key
  ),
  rows as (
    select p.stat_key, sc.label, sc.value_type, p.value,
           lp.value as prev_value,
           hs.n as history_n,
           hs.med_v as history_med,
           hm.mad_v as history_mad
    from pending p
    join stat_catalog sc on sc.stat_key = p.stat_key
    join latest_prev lp on lp.stat_key = p.stat_key
    left join hist_stats hs on hs.stat_key = p.stat_key
    left join hist_mad hm on hm.stat_key = p.stat_key
  ),
  calc as (
    select *,
           value - prev_value as delta,
           case
             when prev_value <> 0 then (value - prev_value) / abs(prev_value) * 100
           end as delta_pct,
           case
             when history_mad is not null and history_mad > 0
               then (value - history_med) / (1.4826 * history_mad)
           end as z
    from rows
  ),
  classified as (
    select *,
           case
             when value_type = 'percentual'
                  and stat_key in ('equip_matk_pct', 'equip_patk_pct')
                  and delta between 25 and 45 then 'impositio'
             when value_type = 'percentual'
                  and stat_key in ('equip_pdef_pct', 'equip_mdef_pct')
                  and delta between 80 and 110 then 'defense'
             when stat_key in ('rpdef', 'rmdef')
                  and prev_value > 0
                  and value / prev_value between 1.6 and 2.3 then 'defense'
             when z is not null and z >= 3.5
                  and (
                    -- 0067: a robust z alone is not enough. With a tiny MAD,
                    -- an unchanged resubmission already sits many sigmas from
                    -- the history median. Require a MATERIAL change vs the
                    -- previous validated row: >= 5 p.p. on a percent, >= 3% on
                    -- a flat.
                    (value_type = 'percentual' and abs(delta) >= 5)
                    or (value_type = 'flat'
                        and prev_value > 0
                        and abs(delta) / abs(prev_value) >= 0.03)
                  ) then 'history_jump'
             when value_type = 'percentual' and abs(delta) >= 20 then 'history_jump'
             when value_type = 'flat'
                  and prev_value > 0
                  and abs((value - prev_value) / prev_value) >= 0.25 then 'history_jump'
           end as pattern
    from calc
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'stat_key', c.stat_key,
             'label', c.label,
             'value_type', c.value_type,
             'previous', round(c.prev_value, 2),
             'value', round(c.value, 2),
             'delta', round(c.delta, 2),
             'delta_pct', round(c.delta_pct::numeric, 2),
             'history_median', case when c.history_med is not null then round(c.history_med::numeric, 2) end,
             'history_mad', case when c.history_mad is not null then round(c.history_mad::numeric, 2) end,
             'history_sample_size', c.history_n,
             'z', case when c.z is not null then round(c.z::numeric, 2) end,
             'pattern', c.pattern,
             'flagged', c.pattern is not null
           )
           order by case c.pattern
                      when 'impositio' then 0
                      when 'defense' then 1
                      when 'history_jump' then 2
                      else 3
                    end,
                    c.stat_key
         ), '[]'::jsonb)
  from classified c
  where c.pattern is not null;
$$;

comment on function public.member_history_deviations(uuid, uuid) is
  'Internal member-history buff detector (0053 + 0067): compares a pending submission''s buff-sensitive stats with the member''s latest validated value and history (last 10). Known signatures: Impositio +25..45 p.p. on equip MATK/PATK %, Angelus/Assumptio +80..110 p.p. on equip PDEF/MDEF % or rpdef/rmdef x1.6..2.3; generic history jump at robust z >= 3.5 WITH a material change (>= 5 p.p. on a percent or >= 3% on a flat), >= 20 p.p. on a percent, or >= 25% on a flat. Returns only noteworthy entries; empty array when there is no validated history or no deviation. Review aid only.';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0067', 'history_jump_material_delta', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
