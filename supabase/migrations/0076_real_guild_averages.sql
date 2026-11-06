-- NeoFoot migration 0076: real-guild averages in the member-facing displays.
--
-- Owner report 2026-11-06 ("verifique se isso acontece em outras tabelas e
-- conserte-as também"): after 0075 fixed the progression references, the same
-- fixture pollution remained in the DISPLAYED averages:
--   * my_report.class_average / best  -> the Painel StatCard "Média · Melhor"
--     line and the foco selection (improvementFocus);
--   * role_rank.stats.class_average   -> the Ranking "Ver stats" modal.
--
-- Scope is deliberately the DISPLAY: the rating basis (points / OVR /
-- data_sufficient) stays byte-identical to 0073, so no real member's OVR moves
-- and the six smoke-primed cohorts with only one real member keep their rating.
-- Two aggregates are computed side by side:
--   agg      = every active member (unchanged rating basis)
--   agg_real = active real members only (smoke%/dummy-% excluded) for display
--
-- `best` follows the same real-only basis (a fixture must never be the
-- displayed "Melhor"). `class_average` keeps the existing no-gate behaviour:
-- null only when no real member has a value.
--
-- Append-only: 0073 is superseded for these two bodies. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0076_real_guild_averages.sql

begin;

create or replace function public.my_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member uuid;
  v_class text;
  v_function text;
begin
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  select m.char_class, m.char_function into v_class, v_function
  from members m
  where m.id = v_member;

  return (
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc, sub.id desc
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where public.cohort_group(m.char_class) = public.cohort_group(v_class) and m.char_function = v_function and m.active
    ),
    agg as (
      select stat_key,
             count(*) as n,
             avg(value) as avg_v,
             max(value) as max_v,
             min(value) as min_v
      from cohort
      group by stat_key
    ),
    -- 0076: display-only aggregate over REAL members (fixtures excluded).
    cohort_real as (
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where public.cohort_group(m.char_class) = public.cohort_group(v_class)
        and m.char_function = v_function
        and m.active
        and coalesce(m.discord_handle, '') not like 'smoke%'
        and coalesce(m.discord_handle, '') not like 'dummy-%'
    ),
    agg_real as (
      select stat_key,
             count(*) as n,
             avg(value) as avg_v,
             max(value) as max_v,
             min(value) as min_v
      from cohort_real
      group by stat_key
    )
    select jsonb_build_object(
      'char_class', v_class,
      'char_function', v_function,
      'stats', (
        select jsonb_agg(
          jsonb_build_object(
            'stat_key', c.stat_key,
            'label', c.label,
            'group_name', c.group_name,
            'value_type', c.value_type,
            'own_value', o.value,
            -- Display: real members only.
            'class_average', ar.avg_v,
            'best',
              case c.stat_direction
                when 'lower' then ar.min_v
                else ar.max_v
              end,
            -- Rating basis: unchanged (all active members, 0073 semantics).
            'points', case
              when coalesce(a.n, 0) >= 3 and o.value is not null then
                least(greatest(
                  round(
                    case c.stat_direction
                      when 'lower' then o.value / nullif(a.min_v, 0)
                      else o.value / nullif(a.max_v, 0)
                    end * 99, 2),
                  0), 99)
              end,
            'data_sufficient', coalesce(a.n, 0) >= 3
          )
          order by c.group_name, c.label
        )
        from stat_catalog c
        left join latest o on o.stat_key = c.stat_key and o.member_id = v_member
        left join agg a on a.stat_key = c.stat_key
        left join agg_real ar on ar.stat_key = c.stat_key
      ),
      'ovr', (
        select jsonb_build_object(
          'value', case
            when (select count(*) from class_key_stats kk
                  where kk.class_name = public.cohort_group(v_class)
                    and kk.char_function = v_function
                    and kk.selection_order <= 6) = 6
             and count(p) >= 1
              then 51 + avg(p) * 48.0/99
          end,
          'data_sufficient', (select count(*) from class_key_stats kk
                  where kk.class_name = public.cohort_group(v_class)
                    and kk.char_function = v_function
                    and kk.selection_order <= 6) = 6
             and count(p) >= 1
        )
        from (
          select case
            when coalesce(a.n, 0) >= 3 and o.value is not null then
              least(greatest(
                round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(a.min_v, 0)
                    else o.value / nullif(a.max_v, 0)
                  end * 99, 2),
                0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
          left join agg a on a.stat_key = ks.stat_key
          where ks.class_name = public.cohort_group(v_class)
            and ks.char_function = v_function
        ) kp
      ),
      'last_validated_at', (
        select max(sub.submitted_at)
        from submissions sub
        where sub.member_id = v_member and sub.status = 'validated'
      )
    )
  );
end;
$function$;

revoke all on function public.my_report() from public;
grant execute on function public.my_report() to authenticated;

comment on function public.my_report() is
  'Member rank report (0076): per-stat own value, REAL-members-only class average/best (0076 display fix), value-proportional points and OVR over EVERY configured stat with the 0073 rating basis unchanged (all active members, 6-key gate, n>=3 per-stat gate), and last_validated_at. Key/relevant identity is NEVER serialised here (RNK-02). Exceptions: no_member_claim/forbidden.';

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
    -- 0076: display-only aggregate over REAL members (fixtures excluded).
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
                   -- Display: real members only.
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
      from role_members rm
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
  'Staff ranking board (0076): one row per active member of the requested build role, each OVR computed inside the member''s own (class, function) cohort with the 0073 rating basis unchanged; the per-stat class_average display now excludes smoke%/dummy-% fixtures (0076). Merged groups (Artista) stay first-class. Server-ordered ovr desc nulls last, display_name. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0076', 'real_guild_averages', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
