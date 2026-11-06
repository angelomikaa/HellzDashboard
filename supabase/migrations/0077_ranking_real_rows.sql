-- NeoFoot migration 0077: hide smoke/dummy fixtures from the staff ranking
-- lists (owner request 2026-11-06: "verifique se isso acontece em outras
-- tabelas e conserte-as também").
--
-- 0076 fixed the displayed AVERAGES. The staff LISTS still showed the seeded
-- fixtures ("Smoke Arquimago Mágico Um", ...) as if they were players:
--   * role_rank  -> the Ranking OVR board rows;
--   * class_top5 -> the Stats-Chave top-5 preview.
--
-- The rating basis stays UNCHANGED: the OVR lateral keeps reading `agg` over
-- every active member (0073/0076 semantics), so no real member's OVR moves and
-- the six smoke-primed cohorts with one real member keep their rating. Only
-- the OUTPUT rows switch to the fixture-free member set.
--
-- get_promotion/get_promotion_public are deliberately NOT touched: their
-- placeholder cards are sanctioned fillers beside a real player (0055/10.11),
-- and the client already hides builds made only of fixtures.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0077_ranking_real_rows.sql

begin;

create or replace function public.role_rank(p_function text, p_class text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'invalid_function';
  end if;

  if p_class = '' then
    p_class := null;
  end if;

  if p_class is not null
     and not exists (select 1 from classes where class_name = p_class) then
    raise exception 'unknown_class';
  end if;

  return (
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc, sub.id desc
    ),
    role_members as (
      select m.id, m.display_name, public.cohort_group(m.char_class) as char_class, m.char_function
      from members m
      where m.char_function = p_function
        and m.active
        and m.char_class is not null
        and (p_class is null or public.cohort_group(m.char_class) = p_class)
    ),
    -- 0077: the OUTPUT rows exclude fixtures; `role_members` stays the rating
    -- basis below (agg/OVR unchanged).
    role_members_real as (
      select rm.*
      from role_members rm
      join members m on m.id = rm.id
      where coalesce(m.discord_handle, '') not like 'smoke%'
        and coalesce(m.discord_handle, '') not like 'dummy-%'
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value, rm.char_function, rm.char_class
      from latest l
      join role_members rm on rm.id = l.member_id
    ),
    agg as (
      select char_class, stat_key, count(*) as n, avg(value) as avg_v,
             max(value) as max_v, min(value) as min_v
      from cohort
      group by char_class, stat_key
    ),
    -- 0076 display aggregate: real members only.
    cohort_real as (
      select l.member_id, l.stat_key, l.value, rm.char_function, rm.char_class
      from latest l
      join role_members rm on rm.id = l.member_id
      join members m on m.id = l.member_id
      where coalesce(m.discord_handle, '') not like 'smoke%'
        and coalesce(m.discord_handle, '') not like 'dummy-%'
    ),
    agg_real as (
      select char_class, stat_key, count(*) as n, avg(value) as avg_v
      from cohort_real
      group by char_class, stat_key
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'member_id', rr.id,
        'display_name', rr.display_name,
        'char_class', rr.char_class,
        'char_function', rr.char_function,
        'ovr', rr.ovr,
        'stats', rr.stats
      )
      order by rr.ovr desc nulls last, rr.display_name
    ), '[]'::jsonb)
    from (
      select rm.id, rm.display_name, rm.char_class, rm.char_function, o.ovr,
             (
               select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'stat_key', sc.stat_key,
                   'label', sc.label,
                   'label_short', sc.label_short,
                   'value_type', sc.value_type,
                   'value', lt.value,
                   'points', case
                     when coalesce(ag.n, 0) >= 3 and lt.value is not null then
                       least(greatest(round(
                         case sc.stat_direction
                           when 'lower' then lt.value / nullif(ag.min_v, 0)
                           else lt.value / nullif(ag.max_v, 0)
                         end * 99, 2), 0), 99)
                   end,
                   'class_average', agr.avg_v
                 )
                 order by sc.group_name, sc.label
               ), '[]'::jsonb)
               from stat_catalog sc
               left join latest lt
                 on lt.stat_key = sc.stat_key and lt.member_id = rm.id
               left join agg ag
                 on ag.stat_key = sc.stat_key and ag.char_class = rm.char_class
               left join agg_real agr
                 on agr.stat_key = sc.stat_key and agr.char_class = rm.char_class
             ) as stats
      from role_members_real rm
      cross join lateral (
        select case
          when (select count(*) from class_key_stats kk
                  where kk.class_name = rm.char_class
                    and kk.char_function = rm.char_function
                    and kk.selection_order <= 6) = 6
             and count(p) >= 1
              then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when ag.n >= 3 and o.value is not null then
              least(greatest(round(
                case c.stat_direction
                  when 'lower' then o.value / nullif(ag.min_v, 0)
                  else o.value / nullif(ag.max_v, 0)
                end * 99, 2), 0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = rm.id
          left join agg ag on ag.stat_key = ks.stat_key and ag.char_class = rm.char_class
          where ks.class_name = rm.char_class
            and ks.char_function = rm.char_function
        ) kp
      ) o
    ) rr
  );
end;
$function$;

revoke all on function public.role_rank(p_function text, p_class text) from public;
grant execute on function public.role_rank(p_function text, p_class text) to authenticated;

comment on function public.role_rank(p_function text, p_class text) is
  'Staff ranking board (0077): one row per ACTIVE REAL member of the requested build role (smoke%/dummy-% fixtures hidden, 0077); each OVR computed inside the member''s own (class, function) cohort with the 0073/0076 rating basis unchanged; the per-stat class_average display excludes fixtures. Merged groups (Artista) stay first-class. Server-ordered ovr desc nulls last, display_name. Internal gate: member_role in (officer,owner) AND caller active.';

create or replace function public.class_top5(p_class text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows jsonb;
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from classes where class_name = p_class) then
    raise exception 'unknown_class';
  end if;

  with latest as (
    select distinct on (sub.member_id, ss.stat_key)
           sub.member_id, ss.stat_key, ss.value
    from submission_stats ss
    join submissions sub on sub.id = ss.submission_id
    where sub.status not in ('rejected','discarded')
    order by sub.member_id, ss.stat_key, sub.submitted_at desc, sub.id desc
  ),
  class_members as (
    select m.id, m.display_name, m.char_function
    from members m
    where public.cohort_group(m.char_class) = p_class and m.active
  ),
  -- 0077: the preview lists real players only; the rating basis below stays
  -- `class_members` (all active) so no OVR moves.
  class_members_real as (
    select cm.*
    from class_members cm
    join members m on m.id = cm.id
    where coalesce(m.discord_handle, '') not like 'smoke%'
      and coalesce(m.discord_handle, '') not like 'dummy-%'
  ),
  cohort as (
    select l.member_id, l.stat_key, l.value, cm.char_function
    from latest l
    join class_members cm on cm.id = l.member_id
  ),
  agg as (
    select stat_key,
           count(*) as n,
           max(value) as max_v,
           min(value) as min_v
    from cohort
    group by stat_key
  )
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'display_name', t.display_name,
        'char_function', t.char_function,
        'ovr', t.ovr
      )
      order by t.ovr desc nulls last, t.display_name
    )
    from (
      select cm.display_name, cm.char_function, o.ovr
      from class_members_real cm
      cross join lateral (
        select case
          when (select count(*) from class_key_stats kk
                  where kk.class_name = p_class
                    and kk.char_function = cm.char_function
                    and kk.selection_order <= 6) = 6
             and count(p) >= 1
              then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when ag.n >= 3 and o.value is not null then
              least(greatest(
                round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(ag.min_v, 0)
                    else o.value / nullif(ag.max_v, 0)
                  end * 99, 2),
                0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = cm.id
          left join agg ag on ag.stat_key = ks.stat_key
          where ks.class_name = p_class
            and ks.char_function = cm.char_function
        ) kp
      ) o
      order by o.ovr desc nulls last, cm.display_name
      limit 5
    ) t
  ), '[]'::jsonb)
  into v_rows;

  return v_rows;
end;
$function$;

revoke all on function public.class_top5(p_class text) from public;
grant execute on function public.class_top5(p_class text) to authenticated;

comment on function public.class_top5(p_class text) is
  'Staff-only top-5-by-OVR preview for a class (0077): the list hides smoke%/dummy-% fixtures; the OVR semantics are unchanged from 0073/0076 (keys + relevants, 6-key gate, n>=3 per-stat gate, floor-51 rescale). Members with insufficient data get ovr null (sorted last). Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0077', 'ranking_real_rows', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
