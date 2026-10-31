-- NeoFoot migration 0047: cross-cohort stat overview for the staff Ranking tab.
--
-- Owner request (2026-10-30): "a solution to see the same stat of all the
-- members, independently of class and cohort. This is useful to see if a member
-- might be already cheating their stats."
--
-- The existing rank surfaces are cohort-scoped on purpose (points/OVR compare
-- a member only inside their class+build-role). Cheat investigation needs the
-- opposite lens: ONE stat, EVERY real member, raw values side by side.
--
-- `stat_overview(p_stat_key)` returns, staff-only:
--   - the selected stat's catalog metadata (label/group/type/direction);
--   - guild-wide aggregates over the latest VALIDATED value per active real
--     member (fixtures excluded -- smoke% / dummy-% are test data);
--   - one row per active real member (members with no value come back with
--     value null, ordered last) with the member's class/role cohort average
--     (self excluded, same rule as the 0046 anti-cheat flag) and both ratios.
--
-- `outlier` hints are HEURISTICS for human review, not verdicts:
--   higher-is-better: value >= 1.5x the baseline average
--   lower-is-better:  value <= 0.5x the baseline average
-- Ratios/outliers are suppressed when the baseline average <= 0 (negative
-- stats such as CT% make a ratio meaningless) or when n < 3.
--
-- Read-only. Staff gate copied from role_rank (0009/0036): officer or owner
-- claim AND a live active row INSIDE the function. Members never reach this
-- payload (the Ranking tab is already staff-only; this RPC is the real gate).
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0047_cross_cohort_stat_overview.sql

begin;

-- The view filters submission_stats by stat_key; without this the 80-member
-- scan walks the whole EAV table for every stat selection.
create index if not exists idx_submission_stats_stat_key
  on public.submission_stats(stat_key);

create or replace function public.stat_overview(p_stat_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_label text;
  v_label_short text;
  v_group text;
  v_type text;
  v_dir text;
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  select label, label_short, group_name, value_type, stat_direction
    into v_label, v_label_short, v_group, v_type, v_dir
  from stat_catalog
  where stat_key = p_stat_key;

  if not found then
    raise exception 'unknown_stat';
  end if;

  return (
    with latest as (
      -- Latest VALIDATED value per member for exactly this stat.
      select distinct on (m.id)
             m.id as member_id,
             m.char_class,
             m.char_function,
             ss.value,
             s.submitted_at
      from members m
      join submissions s on s.member_id = m.id and s.status = 'validated'
      join submission_stats ss on ss.submission_id = s.id and ss.stat_key = p_stat_key
      where m.active
        and m.discord_handle not like 'smoke%'
        and m.discord_handle not like 'dummy-%'
      order by m.id, s.submitted_at desc, s.id desc
    ),
    roster as (
      -- Every active real member, even without a value for this stat.
      select m.id as member_id, m.display_name, m.char_id, m.char_class, m.char_function
      from members m
      where m.active
        and m.discord_handle not like 'smoke%'
        and m.discord_handle not like 'dummy-%'
    ),
    guild as (
      select count(*) as n,
             avg(value) as avg_v,
             min(value) as min_v,
             max(value) as max_v,
             percentile_cont(0.5) within group (order by value) as median_v
      from latest
    )
    select jsonb_build_object(
      'stat_key', p_stat_key,
      'label', v_label,
      'label_short', v_label_short,
      'group_name', v_group,
      'value_type', v_type,
      'stat_direction', v_dir,
      'guild', jsonb_build_object(
        'sample_size', g.n,
        'average', case when g.n > 0 then round(g.avg_v, 2) end,
        'median', case when g.n > 0 then round(g.median_v::numeric, 2) end,
        'max', g.max_v,
        'min', g.min_v
      ),
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'member_id', r.member_id,
            'display_name', r.display_name,
            'char_id', r.char_id,
            'char_class', r.char_class,
            'char_function', r.char_function,
            'value', l.value,
            'submitted_at', l.submitted_at,
            'class_average', case when a.n >= 3 then round(a.avg_v, 2) end,
            'class_sample_size', a.n,
            'cohort_ratio', case
              when l.value is not null and a.avg_v > 0
                then round(l.value / a.avg_v, 2)
            end,
            'guild_ratio', case
              when l.value is not null and g.avg_v > 0
                then round(l.value / g.avg_v, 2)
            end,
            'cohort_outlier', case
              when l.value is null or a.n < 3 or a.avg_v is null or a.avg_v <= 0 then false
              when v_dir = 'lower' then l.value <= 0.5 * a.avg_v
              else l.value >= 1.5 * a.avg_v
            end,
            'guild_outlier', case
              when l.value is null or g.n < 3 or g.avg_v is null or g.avg_v <= 0 then false
              when v_dir = 'lower' then l.value <= 0.5 * g.avg_v
              else l.value >= 1.5 * g.avg_v
            end
          )
          order by l.value desc nulls last, r.display_name
        )
        from roster r
        left join latest l on l.member_id = r.member_id
        left join lateral (
          -- Same class+build-role baseline as the 0046 anti-cheat flag:
          -- latest validated values, self excluded.
          select avg(l2.value) as avg_v, count(*) as n
          from latest l2
          where l2.char_class = r.char_class
            and l2.char_function = r.char_function
            and l2.member_id <> r.member_id
        ) a on true
        cross join guild g
      ), '[]'::jsonb)
    )
    from guild g
  );
end;
$$;

comment on function public.stat_overview(text) is
  'Staff-only cross-cohort stat inspector for the Ranking tab (0047, owner request 2026-10-30). For ONE stat_key: catalog metadata, guild aggregates over the latest VALIDATED value per active real member (smoke/dummy fixtures excluded), and one row per active real member with value, latest submission time, class+build-role average/sample (self excluded, n >= 3 to display), cohort_ratio / guild_ratio and direction-aware >= 1.5x / <= 0.5x outlier hints for human review. Members without a value return value null. Once-per-member latest value only; pending submissions stay in Validações. Internal gate: member_role in (officer,owner) AND caller active.';

revoke execute on function public.stat_overview(text) from public, anon;
grant execute on function public.stat_overview(text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0047', 'cross_cohort_stat_overview', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
