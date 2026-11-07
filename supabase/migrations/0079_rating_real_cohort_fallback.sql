-- NeoFoot migration 0079: real-cohort rating basis, with a small-cohort
-- fallback (owner decision A+D, 2026-11-07).
--
-- Owner report: the progression modal showed a player LAST in High Priest ·
-- suporte (RPDEF 3.901 vs real class average 4.050,33) yet "PONTOS 90". The
-- 0..99 points are value-proportional to the cohort BEST (3.901 / 4.284 * 99
-- = 90,15), not to any average — correct by SCALE-01, but the rating cohort
-- included smoke/dummy fixtures while every DISPLAY aggregate (0075/0076)
-- excluded them (n=8 vs n=6 in the modal).
--
-- 0079 aligns the rating basis with the display basis, without touching a
-- single number:
--   1. A stat group with n >= 3 REAL members (handle not smoke%/dummy-%)
--      rates over the real members only.
--   2. A stat group with fewer than 3 real members keeps the fixtures, ONLY
--      to reach the unchanged n >= 3 gate (D-12). Phase 10.2 normalises every
--      fixture below the worst real value, so fixtures never hold max_v for
--      higher-is-better nor min_v for lower-is-better: the BEST — and thus
--      every point — is identical under both bases. Verified live on
--      2026-11-07: 0 direction-aware best changes across every real cohort
--      with n >= 3; 295 stat groups in 5 small cohorts keep the n >= 3 gate.
--   3. The same conditional basis is applied to EVERY OVR-producing RPC
--      (my_report, my_card, class_top5, role_rank, get_promotion,
--      get_promotion_public, staff_requests, ovr_projection) so UNIF-01
--      parity holds across surfaces.
--
-- Display aggregates and payload shapes are byte-preserved. Append-only:
-- 0073/0076/0077/0078 are superseded for these bodies only.
-- Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0079_rating_real_cohort_fallback.sql

begin;

-- my_report: 0079 conditional real-cohort rating basis.
CREATE OR REPLACE FUNCTION public.my_report()
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
    -- 0079 (owner D, 2026-11-07): rating basis = REAL cohort when the stat
    -- has n >= 3 real members; fixtures only satisfy the n >= 3 gate in small
    -- cohorts (they sit below the real best, so max_v/min_v never move).
    cohort_all as (
      select l.member_id, l.stat_key, l.value,
             (coalesce(m.discord_handle, '') like 'smoke%'
              or coalesce(m.discord_handle, '') like 'dummy-%') as is_fixture
      from latest l
      join members m on m.id = l.member_id
      where public.cohort_group(m.char_class) = public.cohort_group(v_class) and m.char_function = v_function and m.active
    ),
    cohort_real_n as (
      select stat_key, count(*) as n
      from cohort_all
      where not is_fixture
      group by stat_key
    ),
    cohort as (
      select c.member_id, c.stat_key, c.value
      from cohort_all c
      left join cohort_real_n r on r.stat_key = c.stat_key
      where not c.is_fixture or coalesce(r.n, 0) < 3
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
            -- Rating basis: 0079 real cohort (fixtures only keep the n>=3 gate).
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

-- my_card: 0079 conditional real-cohort rating basis.
CREATE OR REPLACE FUNCTION public.my_card()
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
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    -- 0079 (owner D, 2026-11-07): the rating cohort is the REAL cohort
    -- whenever the stat has n >= 3 real members. Smoke/dummy fixtures stay
    -- only when the real cohort cannot reach the n >= 3 gate; the fixture
    -- floor keeps them below the real best, so max_v/min_v never move.
    cohort_all as (
      select l.member_id, l.stat_key, l.value,
             (coalesce(m.discord_handle, '') like 'smoke%'
              or coalesce(m.discord_handle, '') like 'dummy-%') as is_fixture
      from latest l
      join members m on m.id = l.member_id
      where public.cohort_group(m.char_class) = public.cohort_group(v_class) and m.char_function = v_function and m.active
    ),
    cohort_real_n as (
      select stat_key, count(*) as n
      from cohort_all
      where not is_fixture
      group by stat_key
    ),
    cohort as (
      select c.member_id, c.stat_key, c.value
      from cohort_all c
      left join cohort_real_n r on r.stat_key = c.stat_key
      where not c.is_fixture or coalesce(r.n, 0) < 3
    ),
    agg as (
      select stat_key, count(*) as n,
             max(value) as max_v, min(value) as min_v
      from cohort
      group by stat_key
    )
    select jsonb_build_object(
      'char_class', v_class,
      'char_function', v_function,
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
              least(greatest(round(
                case c.stat_direction
                  when 'lower' then o.value / nullif(a.min_v, 0)
                  else o.value / nullif(a.max_v, 0)
                end * 99, 2), 0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
          left join agg a on a.stat_key = ks.stat_key
          where ks.class_name = public.cohort_group(v_class)
            and ks.char_function = v_function
        ) kp
      ),
      'key_stats', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', ks.stat_key,
            'label', c.label,
            'label_short', c.label_short,
            'value_type', c.value_type,
            'own_value', o.value,
            'points', case
              when coalesce(a.n, 0) >= 3 and o.value is not null then
                least(greatest(round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(a.min_v, 0)
                    else o.value / nullif(a.max_v, 0)
                  end * 99, 2), 0), 99)
            end
          )
          order by c.label
        ), '[]'::jsonb)
        from class_key_stats ks
        join stat_catalog c on c.stat_key = ks.stat_key
        left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
        left join agg a on a.stat_key = ks.stat_key
        where ks.class_name = public.cohort_group(v_class)
          and ks.char_function = v_function
          and ks.selection_order <= 6
      ),
      'relevant_stat_keys', (
        coalesce((
          select jsonb_agg(ks.stat_key order by ks.selection_order, ks.stat_key)
          from class_key_stats ks
          where ks.class_name = public.cohort_group(v_class)
            and ks.char_function = v_function
            and ks.selection_order > 6
        ), '[]'::jsonb)
      )
    )
  );
end;
$function$;

-- class_top5: 0079 conditional real-cohort rating basis.
CREATE OR REPLACE FUNCTION public.class_top5(p_class text)
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
    select m.id, m.display_name, m.char_function,
           (coalesce(m.discord_handle, '') like 'smoke%'
            or coalesce(m.discord_handle, '') like 'dummy-%') as is_fixture
    from members m
    where public.cohort_group(m.char_class) = p_class and m.active
  ),
  -- 0077: the preview lists real players only. 0079 (owner D, 2026-11-07):
  -- the rating basis is the REAL cohort when the stat has n >= 3 real
  -- members; fixtures remain only to satisfy the n >= 3 gate in small cohorts.
  class_members_real as (
    select cm.id, cm.display_name, cm.char_function
    from class_members cm
    where not cm.is_fixture
  ),
  cohort_all as (
    select l.member_id, l.stat_key, l.value, cm.char_function, cm.is_fixture
    from latest l
    join class_members cm on cm.id = l.member_id
  ),
  cohort_real_n as (
    select stat_key, count(*) as n
    from cohort_all
    where not is_fixture
    group by stat_key
  ),
  cohort as (
    select c.member_id, c.stat_key, c.value, c.char_function
    from cohort_all c
    left join cohort_real_n r on r.stat_key = c.stat_key
    where not c.is_fixture or coalesce(r.n, 0) < 3
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

-- role_rank: 0079 conditional real-cohort rating basis.
CREATE OR REPLACE FUNCTION public.role_rank(p_function text, p_class text DEFAULT NULL::text)
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
      select m.id, m.display_name, public.cohort_group(m.char_class) as char_class, m.char_function,
             (coalesce(m.discord_handle, '') like 'smoke%'
              or coalesce(m.discord_handle, '') like 'dummy-%') as is_fixture
      from members m
      where m.char_function = p_function
        and m.active
        and m.char_class is not null
        and (p_class is null or public.cohort_group(m.char_class) = p_class)
    ),
    -- 0077: the OUTPUT rows exclude fixtures. 0079 (owner D, 2026-11-07):
    -- the rating basis is the REAL cohort when the stat has n >= 3 real
    -- members; fixtures remain only to satisfy the n >= 3 gate in small cohorts.
    role_members_real as (
      select rm.id, rm.display_name, rm.char_class, rm.char_function
      from role_members rm
      where not rm.is_fixture
    ),
    cohort_all as (
      select l.member_id, l.stat_key, l.value, rm.char_function, rm.char_class, rm.is_fixture
      from latest l
      join role_members rm on rm.id = l.member_id
    ),
    cohort_real_n as (
      select char_class, stat_key, count(*) as n
      from cohort_all
      where not is_fixture
      group by char_class, stat_key
    ),
    cohort as (
      select c.member_id, c.stat_key, c.value, c.char_function, c.char_class
      from cohort_all c
      left join cohort_real_n r on r.char_class = c.char_class and r.stat_key = c.stat_key
      where not c.is_fixture or coalesce(r.n, 0) < 3
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

-- get_promotion: 0079 conditional real-cohort rating basis.
CREATE OR REPLACE FUNCTION public.get_promotion()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member uuid;
begin
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  return (
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    -- 0078: the card date = the latest submission feeding the values.
    last_submitted as (
      select sub.member_id, max(sub.submitted_at) as last_submitted_at
      from submissions sub
      where sub.status not in ('rejected','discarded')
      group by sub.member_id
    ),
    class_members as (
      select m.id, m.display_name, m.char_function, public.cohort_group(m.char_class) as char_class,
             coalesce(m.discord_handle like 'smoke%', false) as is_placeholder,
             (coalesce(m.discord_handle, '') like 'smoke%'
              or coalesce(m.discord_handle, '') like 'dummy-%') as is_fixture
      from members m
      where m.char_class is not null and m.active
    ),
    -- 0079 (owner D, 2026-11-07): rating basis = REAL cohort when the
    -- (class, function, stat) group has n >= 3 real members; fixtures remain
    -- only to satisfy the n >= 3 gate in small cohorts.
    cohort_all as (
      select l.member_id, l.stat_key, l.value, cm.char_function, cm.char_class, cm.is_fixture
      from latest l
      join class_members cm on cm.id = l.member_id
    ),
    cohort_real_n as (
      select char_class, char_function, stat_key, count(*) as n
      from cohort_all
      where not is_fixture
      group by char_class, char_function, stat_key
    ),
    cohort as (
      select c.member_id, c.stat_key, c.value, c.char_function, c.char_class
      from cohort_all c
      left join cohort_real_n r
        on r.char_class = c.char_class
       and r.char_function = c.char_function
       and r.stat_key = c.stat_key
      where not c.is_fixture or coalesce(r.n, 0) < 3
    ),
    cmp as (
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b on b.stat_key = a.stat_key
                     and b.char_function = a.char_function
                     and b.char_class = a.char_class
      group by a.member_id, a.stat_key
    ),
    agg as (
      select char_class, char_function, stat_key,
             count(*) as n,
             max(value) as max_v,
             min(value) as min_v
      from cohort
      group by char_class, char_function, stat_key
    ),
    ovr_rows as (
      select cm.char_class, cm.id, cm.display_name, cm.char_function, o.ovr,
             cm.is_placeholder
      from class_members cm
      cross join lateral (
        select case
          when (select count(*) from class_key_stats kk
                  where kk.class_name = cm.char_class
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
                          and ag.char_class = cm.char_class
                          and ag.char_function = cm.char_function
          where ks.class_name = cm.char_class
            and ks.char_function = cm.char_function
        ) kp
      ) o
    ),
    -- 0037: top 3 PER COHORT, meta cohorts only (owner decision 2026-10-28).
    top3 as (
      select char_class, id, display_name, char_function, ovr, is_placeholder,
             row_number() over (
               partition by char_class, char_function
               order by ovr desc nulls last, display_name
             ) as rn
      from ovr_rows
      where ovr is not null
        and exists (
          select 1 from class_cohorts cc
          where cc.class_name = ovr_rows.char_class
            and cc.char_function = ovr_rows.char_function
            and cc.meta
        )
    ),
    hl as (
      select t.id, hl.h as highlights
      from top3 t
      cross join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', sc.stat_key,
            'label', sc.label,
            'label_short', sc.label_short,
            'value_type', sc.value_type,
            'value', lt.value,
            'points', case
              when ag.n >= 3 and lt.value is not null then
                least(greatest(
                  round(
                    case sc.stat_direction
                      when 'lower' then lt.value / nullif(ag.min_v, 0)
                      else lt.value / nullif(ag.max_v, 0)
                    end * 99, 2),
                  0), 99)
            end
          )
          order by sc.label
        ), '[]'::jsonb) as h
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join latest lt on lt.stat_key = ks.stat_key and lt.member_id = t.id
        left join agg ag on ag.stat_key = ks.stat_key
                        and ag.char_class = t.char_class
                        and ag.char_function = t.char_function
        where ks.class_name = t.char_class
          and ks.char_function = t.char_function
          and ks.selection_order <= 6
      ) hl
    )
    select coalesce(jsonb_agg(
      jsonb_build_object('class_name', cards.char_class, 'char_function', cards.char_function, 'cards', cards.cards)
      order by cards.char_class, cards.char_function
    ), '[]'::jsonb)
    from (
      select t.char_class, t.char_function,
             jsonb_agg(
               jsonb_build_object(
                 'display_name', t.display_name,
                 'char_function', t.char_function,
                 'ovr', t.ovr,
                 'placeholder', t.is_placeholder,
                 'photo_path', 'card-photos/' || t.id::text || '/card.jpg',
                 'last_submitted_at', ls.last_submitted_at,
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top3 t
      join hl on hl.id = t.id
      left join last_submitted ls on ls.member_id = t.id
      where t.rn <= 3
      group by t.char_class, t.char_function
    ) cards
  );
end;
$function$;

-- get_promotion_public: 0079 conditional real-cohort rating basis.
CREATE OR REPLACE FUNCTION public.get_promotion_public()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_show_values boolean;
begin
  -- 0045 gate, verbatim: anon requests carry no member_id claim, so this is
  -- false; a valid member session must resolve to an ACTIVE member row.
  -- Parenthesised before the cast (the 0016 precedence lesson).
  v_show_values := exists (
    select 1
    from members m
    where m.id = (auth.jwt() ->> 'member_id')::uuid
      and m.active
  );

  return (
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    -- 0078: the card date = the latest submission feeding the values.
    last_submitted as (
      select sub.member_id, max(sub.submitted_at) as last_submitted_at
      from submissions sub
      where sub.status not in ('rejected','discarded')
      group by sub.member_id
    ),
    class_members as (
      select m.id, m.display_name, m.char_function,
             public.cohort_group(m.char_class) as char_class,
             m.char_class as own_class,
             coalesce(m.discord_handle like 'smoke%', false) as is_placeholder,
             (coalesce(m.discord_handle, '') like 'smoke%'
              or coalesce(m.discord_handle, '') like 'dummy-%') as is_fixture
      from members m
      where m.char_class is not null and m.active
    ),
    -- 0079 (owner D, 2026-11-07): rating basis = REAL cohort when the
    -- (class, function, stat) group has n >= 3 real members; fixtures remain
    -- only to satisfy the n >= 3 gate in small cohorts.
    cohort_all as (
      select l.member_id, l.stat_key, l.value, cm.char_function, cm.char_class, cm.is_fixture
      from latest l
      join class_members cm on cm.id = l.member_id
    ),
    cohort_real_n as (
      select char_class, char_function, stat_key, count(*) as n
      from cohort_all
      where not is_fixture
      group by char_class, char_function, stat_key
    ),
    cohort as (
      select c.member_id, c.stat_key, c.value, c.char_function, c.char_class
      from cohort_all c
      left join cohort_real_n r
        on r.char_class = c.char_class
       and r.char_function = c.char_function
       and r.stat_key = c.stat_key
      where not c.is_fixture or coalesce(r.n, 0) < 3
    ),
    cmp as (
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b on b.stat_key = a.stat_key
                     and b.char_function = a.char_function
                     and b.char_class = a.char_class
      group by a.member_id, a.stat_key
    ),
    agg as (
      select char_class, char_function, stat_key,
             count(*) as n,
             max(value) as max_v,
             min(value) as min_v
      from cohort
      group by char_class, char_function, stat_key
    ),
    ovr_rows as (
      select cm.char_class, cm.own_class, cm.id, cm.display_name, cm.char_function, o.ovr,
             cm.is_placeholder
      from class_members cm
      cross join lateral (
        select case
          when (select count(*) from class_key_stats kk
                  where kk.class_name = cm.char_class
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
                          and ag.char_class = cm.char_class
                          and ag.char_function = cm.char_function
          where ks.class_name = cm.char_class
            and ks.char_function = cm.char_function
        ) kp
      ) o
    ),
    -- 0037: top 3 PER COHORT, meta cohorts only (owner decision 2026-10-28).
    top3 as (
      select char_class, own_class, id, display_name, char_function, ovr, is_placeholder,
             row_number() over (
               partition by char_class, char_function
               order by ovr desc nulls last, display_name
             ) as rn
      from ovr_rows
      where ovr is not null
        and exists (
          select 1 from class_cohorts cc
          where cc.class_name = ovr_rows.char_class
            and cc.char_function = ovr_rows.char_function
            and cc.meta
        )
    ),
    hl as (
      select t.id, hl.h as highlights
      from top3 t
      cross join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', sc.stat_key,
            'label', sc.label,
            'label_short', sc.label_short,
            'value_type', sc.value_type,
            -- 0063 (0045 restored): raw value withheld unless the caller is an
            -- ACTIVE member. points/value_type/identity stay public.
            'value', case when v_show_values then lt.value else null end,
            'points', case
              when ag.n >= 3 and lt.value is not null then
                least(greatest(
                  round(
                    case sc.stat_direction
                      when 'lower' then lt.value / nullif(ag.min_v, 0)
                      else lt.value / nullif(ag.max_v, 0)
                    end * 99, 2),
                  0), 99)
            end
          )
          order by sc.label
        ), '[]'::jsonb) as h
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join latest lt on lt.stat_key = ks.stat_key and lt.member_id = t.id
        left join agg ag on ag.stat_key = ks.stat_key
                        and ag.char_class = t.char_class
                        and ag.char_function = t.char_function
        where ks.class_name = t.char_class
          and ks.char_function = t.char_function
          and ks.selection_order <= 6
      ) hl
    )
    select coalesce(jsonb_agg(
      jsonb_build_object('class_name', cards.char_class, 'char_function', cards.char_function, 'cards', cards.cards)
      order by cards.char_class, cards.char_function
    ), '[]'::jsonb)
    from (
      select t.char_class, t.char_function,
             jsonb_agg(
               jsonb_build_object(
                 'display_name', t.display_name,
                 'char_function', t.char_function,
                 'char_class', t.own_class,
                 'ovr', t.ovr,
                 'placeholder', t.is_placeholder,
                 'photo_path', 'card-photos/' || t.id::text || '/card.jpg',
                 'last_submitted_at', ls.last_submitted_at,
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top3 t
      join hl on hl.id = t.id
      left join last_submitted ls on ls.member_id = t.id
      where t.rn <= 3
      group by t.char_class, t.char_function
    ) cards
  );
end;
$function$;

-- staff_requests: 0079 conditional real-cohort rating basis.
CREATE OR REPLACE FUNCTION public.staff_requests()
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

  return coalesce((
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    -- 0079 (owner D, 2026-11-07): rating basis = REAL cohort when the
    -- (class, function, stat) group has n >= 3 real members; fixtures remain
    -- only to satisfy the n >= 3 gate in small cohorts.
    cohort_all as (
      select l.member_id, l.stat_key, l.value, public.cohort_group(m.char_class) as char_class, m.char_function,
             (coalesce(m.discord_handle, '') like 'smoke%'
              or coalesce(m.discord_handle, '') like 'dummy-%') as is_fixture
      from latest l
      join members m on m.id = l.member_id
      where m.active and m.char_class is not null
    ),
    cohort_real_n as (
      select char_class, char_function, stat_key, count(*) as n
      from cohort_all
      where not is_fixture
      group by char_class, char_function, stat_key
    ),
    cohort as (
      select c.member_id, c.stat_key, c.value, c.char_class, c.char_function
      from cohort_all c
      left join cohort_real_n r
        on r.char_class = c.char_class
       and r.char_function = c.char_function
       and r.stat_key = c.stat_key
      where not c.is_fixture or coalesce(r.n, 0) < 3
    ),
    agg as (
      select char_class, char_function, stat_key, count(*) as n,
             max(value) as max_v, min(value) as min_v
      from cohort
      group by char_class, char_function, stat_key
    )
    select jsonb_agg(
      jsonb_build_object(
        'request_id', r.id,
        'discord_handle', r.discord_handle,
        'request_type', r.request_type,
        'char_id', r.char_id,
        'nickname', r.nickname,
        'char_class', r.char_class,
        'char_function', r.char_function,
        'proof_path', r.proof_path,
        'created_at', r.created_at,
        'member_id', r.member_id,
        'ovr', o.ovr,
        'data_sufficient', (o.ovr is not null),
        'stats', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'stat_key', sc.stat_key,
              'label', sc.label,
              'label_short', sc.label_short,
              'value_type', sc.value_type,
              'group_name', sc.group_name,
              'value', rs.value
            )
            order by sc.group_name, sc.label
          ), '[]'::jsonb)
          from stat_catalog sc
          left join membership_request_stats rs
            on rs.request_id = r.id and rs.stat_key = sc.stat_key
        )
      )
      order by r.created_at desc
    )
    from membership_requests r
    cross join lateral (
      -- 0073 OVR semantics: the applicant's own (class, function) config must
      -- hold its 6 keys; every configured stat (keys + relevants) then feeds
      -- the value-proportional mean, ignoring stats without points (at least
      -- one point is required). Cohort = ACTIVE members of the SAME
      -- class+function; the applicant's own stats never join it (D-14).
      select case
        when (select count(*) from class_key_stats kk
                  where kk.class_name = public.cohort_group(r.char_class)
                    and kk.char_function = r.char_function
                    and kk.selection_order <= 6) = 6
             and count(p) >= 1
              then 51 + avg(p) * 48.0/99
      end as ovr
      from (
        select case
          when coalesce(a.n, 0) >= 3 and rq.value is not null then
            least(greatest(round(
              case sc.stat_direction
                when 'lower' then rq.value / nullif(a.min_v, 0)
                else rq.value / nullif(a.max_v, 0)
              end * 99, 2), 0), 99)
        end as p
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join membership_request_stats rq
          on rq.request_id = r.id and rq.stat_key = ks.stat_key
        left join agg a
          on a.stat_key = ks.stat_key
         and a.char_class = public.cohort_group(r.char_class)
         and a.char_function = r.char_function
        where ks.class_name = public.cohort_group(r.char_class)
          and ks.char_function = r.char_function
      ) kp
    ) o
    where r.status = 'pending'
  ), '[]'::jsonb);
end;
$function$;

-- ovr_projection: 0079 conditional real-cohort rating basis.
CREATE OR REPLACE FUNCTION public.ovr_projection(p_member uuid, p_class text, p_function text, p_stats jsonb DEFAULT NULL::jsonb, p_exclude_submission uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with latest as (
    select distinct on (s.member_id, ss.stat_key)
           s.member_id, ss.stat_key, ss.value,
           (coalesce(m.discord_handle, '') like 'smoke%'
            or coalesce(m.discord_handle, '') like 'dummy-%') as is_fixture
    from submission_stats ss
    join submissions s on s.id = ss.submission_id
    join members m on m.id = s.member_id
    where s.status not in ('rejected', 'discarded')
      and (p_exclude_submission is null or s.id <> p_exclude_submission)
      and m.active
      and public.cohort_group(m.char_class) = public.cohort_group(p_class)
      and m.char_function = p_function
    order by s.member_id, ss.stat_key, s.submitted_at desc, s.id desc
  ),
  pending as (
    select coalesce(
      (
        select jsonb_object_agg(e->>'stat_key', (e->>'value')::numeric)
        from jsonb_array_elements(
          case when jsonb_typeof(p_stats) = 'array' then p_stats else '[]'::jsonb end
        ) e
      ),
      '{}'::jsonb
    ) as vals
  ),
  -- 0079 (owner D, 2026-11-07): rating basis = REAL cohort when the stat
  -- has n >= 3 real members; fixtures remain only to satisfy the n >= 3 gate.
  cohort_all as (
    select l.member_id, l.stat_key,
           case
             when l.member_id = p_member and pn.vals ? l.stat_key
               then (pn.vals->>l.stat_key)::numeric
             else l.value
           end as value,
           l.is_fixture
    from latest l
    cross join pending pn
  ),
  cohort_real_n as (
    select stat_key, count(*) as n
    from cohort_all
    where not is_fixture
    group by stat_key
  ),
  cohort as (
    select c.member_id, c.stat_key, c.value
    from cohort_all c
    left join cohort_real_n r on r.stat_key = c.stat_key
    where not c.is_fixture or coalesce(r.n, 0) < 3
  ),
  agg as (
    select stat_key, count(*) as n, max(value) as max_v, min(value) as min_v
    from cohort
    group by stat_key
  ),
  member_values as (
    select ks.stat_key,
           coalesce((pn.vals->>ks.stat_key)::numeric, lv.value) as value
    from class_key_stats ks
    cross join pending pn
    left join latest lv
      on lv.member_id = p_member and lv.stat_key = ks.stat_key
    where ks.class_name = public.cohort_group(p_class)
      and ks.char_function = p_function
  ),
  points as (
    select case
      when a.n >= 3 and mv.value is not null then
        least(greatest(round(
          case c.stat_direction
            when 'lower' then mv.value / nullif(a.min_v, 0)
            else mv.value / nullif(a.max_v, 0)
          end * 99, 2), 0), 99)
    end as p
    from member_values mv
    join stat_catalog c on c.stat_key = mv.stat_key
    left join agg a on a.stat_key = mv.stat_key
  )
  select case
    when (select count(*) from class_key_stats kk
                  where kk.class_name = public.cohort_group(p_class)
                    and kk.char_function = p_function
                    and kk.selection_order <= 6) = 6
     and count(p) >= 1
      then 51 + avg(p) * 48.0 / 99
  end
  from points;
$function$;

-- ---------------------------------------------------------------------------
-- Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0079', 'rating_real_cohort_fallback', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
