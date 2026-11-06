-- NeoFoot migration 0075: real-members-only progress references.
--
-- Owner report 2026-11-06 ("o maior dano médio da guild entre os arquimagos é
-- Venon, mas o gráfico parece não condizer"): my_stat_progress (0074) averaged
-- EVERY active member, including the sanctioned smoke fixtures. For High
-- Wizard / dmg_vs_medium the four smoke rows (26.6, 25.2, 1.9, 1.8) dragged
-- the class average from 40.69 to 27.28 and the cohort from 40.69 to 35.76.
--
-- The rank engine (my_report/my_card/role_rank) intentionally keeps fixtures
-- so seeded cohorts reach n >= 3; the ANALYTICS surfaces (stat_overview,
-- anti-cheat, regression) have always excluded them. The progression
-- references are analytics: they must describe the REAL guild.
--
-- Change: the three aggregate CTEs read a fixture-free active_latest
-- (`discord_handle` not smoke%/dummy-%). The caller's own value + history are
-- untouched, so a fixture account still sees its own timeline. No rank math,
-- no payload shape change.
--
-- Append-only: 0074 is superseded by this body. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0075_progress_real_references.sql

begin;

create or replace function public.my_stat_progress(p_stat_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member uuid;
  v_class text;
  v_function text;
  v_group text;
  v_keys text[];
begin
  -- Parenthesised before the cast (the 0016 precedence lesson).
  v_member := (auth.jwt() ->> 'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  select m.char_class, m.char_function into v_class, v_function
  from members m
  where m.id = v_member;

  v_group := public.cohort_group(v_class);

  -- Allow-list: the catalog is the only source of valid stat keys. An empty or
  -- null request yields an empty array (never a crash, never a full dump).
  select coalesce(array_agg(distinct k), '{}'::text[])
    into v_keys
  from unnest(coalesce(p_stat_keys, '{}'::text[])) as k
  where exists (select 1 from stat_catalog c where c.stat_key = k);

  return (
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected', 'discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc, sub.id desc
    ),
    -- 0075: fixtures never enter the comparison averages (the caller's own
    -- history below still does). coalesce keeps a null handle eligible.
    active_latest as (
      select l.member_id, l.stat_key, l.value,
             public.cohort_group(m.char_class) as cohort_class,
             m.char_function
      from latest l
      join members m on m.id = l.member_id
      where m.active
        and m.char_class is not null
        and coalesce(m.discord_handle, '') not like 'smoke%'
        and coalesce(m.discord_handle, '') not like 'dummy-%'
    ),
    agg_class as (
      select stat_key, count(*) as n, avg(value) as avg_v
      from active_latest
      where cohort_class = v_group
      group by stat_key
    ),
    agg_function as (
      select stat_key, count(*) as n, avg(value) as avg_v
      from active_latest
      where char_function = v_function
      group by stat_key
    ),
    agg_cohort as (
      select stat_key, count(*) as n, avg(value) as avg_v
      from active_latest
      where cohort_class = v_group and char_function = v_function
      group by stat_key
    ),
    own_history as (
      select ss.stat_key, ss.value, sub.submitted_at,
             row_number() over (
               partition by ss.stat_key
               order by sub.submitted_at desc, sub.id desc
             ) as rn
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.member_id = v_member
        and sub.status not in ('rejected', 'discarded')
        and ss.stat_key = any(v_keys)
    )
    select jsonb_build_object(
      'char_class', v_class,
      'char_function', v_function,
      'stats', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'stat_key', c.stat_key,
            'label', c.label,
            'label_short', c.label_short,
            'group_name', c.group_name,
            'value_type', c.value_type,
            'stat_direction', c.stat_direction,
            'own_value', o.value,
            'history', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'value', h.value,
                  'submitted_at', h.submitted_at
                )
                order by h.submitted_at desc, h.rn
              )
              from own_history h
              where h.stat_key = c.stat_key and h.rn <= 3
            ), '[]'::jsonb),
            'class_average', case when ac.n >= 3 then round(ac.avg_v, 2) end,
            'class_sample_size', coalesce(ac.n, 0),
            'function_average', case when af.n >= 3 then round(af.avg_v, 2) end,
            'function_sample_size', coalesce(af.n, 0),
            'cohort_average', case when ah.n >= 3 then round(ah.avg_v, 2) end,
            'cohort_sample_size', coalesce(ah.n, 0)
          )
          order by c.group_name, c.label
        )
        from stat_catalog c
        left join latest o on o.stat_key = c.stat_key and o.member_id = v_member
        left join agg_class ac on ac.stat_key = c.stat_key
        left join agg_function af on af.stat_key = c.stat_key
        left join agg_cohort ah on ah.stat_key = c.stat_key
        where c.stat_key = any(v_keys)
      ), '[]'::jsonb)
    )
  );
end;
$function$;

revoke all on function public.my_stat_progress(text[]) from public;
revoke execute on function public.my_stat_progress(text[]) from anon;
grant execute on function public.my_stat_progress(text[]) to authenticated;

comment on function public.my_stat_progress(text[]) is
  'Member progress tracker (0075): for each requested catalog stat returns the caller''s own latest value + last 3 submission points (non-rejected/discarded, newest first) and three DISTINCT n>=3 references — class (same merged class, any role), function (same build role, any class) and cohort (same merged class + role). 0075: the references exclude smoke%/dummy-% fixtures (real guild only); the caller''s own value/history are untouched. Aggregates + own history only; never another member''s value and never key-stat config. Exceptions: no_member_claim/forbidden.';

-- ---------------------------------------------------------------------------
-- Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0075', 'progress_real_references', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
