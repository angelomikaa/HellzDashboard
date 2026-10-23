-- NeoFoot Phase 9 follow-up: role_rank() OVR lateral read class_key_stats by
-- class_name only, which now returns 3x rows after the 0018 backfill (one per
-- build role), so staff OVR was always null (count(*) = 18 <> 6). Filter by
-- the member's own char_function, matching my_report()/class_top5()/get_promotion().
-- Append-only: 0001-0023 are never edited in place.

create or replace function public.role_rank(p_function text, p_class text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    role_members as (
      select m.id, m.display_name, m.char_class, m.char_function
      from members m
      where m.char_function = p_function
        and m.active
        and m.char_class is not null
        and (p_class is null or m.char_class = p_class)
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value, rm.char_function, rm.char_class
      from latest l
      join role_members rm on rm.id = l.member_id
    ),
    cmp as (
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b
        on b.stat_key = a.stat_key
       and b.char_function = a.char_function
       and b.char_class = a.char_class
      group by a.member_id, a.stat_key
    ),
    agg as (
      select char_class, stat_key, count(*) as n, avg(value) as avg_v
      from cohort
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
                       round(
                         (
                           (select count(*) from cohort cb
                             where cb.stat_key = sc.stat_key
                               and cb.char_class = rm.char_class
                               and cb.value < lt.value)
                           + ((select count(*) from cohort ct
                                 where ct.stat_key = sc.stat_key
                                   and ct.char_class = rm.char_class
                                   and ct.value = lt.value) - 1)::numeric / 2
                         ) / (ag.n - 1) * 99, 2)
                   end,
                   'class_average', ag.avg_v
                 )
                 order by sc.group_name, sc.label
               ), '[]'::jsonb)
               from stat_catalog sc
               left join latest lt
                 on lt.stat_key = sc.stat_key and lt.member_id = rm.id
               left join agg ag
                 on ag.stat_key = sc.stat_key and ag.char_class = rm.char_class
             ) as stats
      from role_members rm
      cross join lateral (
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when c.n >= 3 then
              (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99
          end as p
          from class_key_stats ks
          join cmp c on c.member_id = rm.id and c.stat_key = ks.stat_key
          where ks.class_name = rm.char_class
            and ks.char_function = rm.char_function
        ) kp
      ) o
    ) rr
  );
end;
$$;

comment on function public.role_rank(text, text) is
  'Staff-only officials rank view (Phase 9 hotfix): OVR filtered to the member''s own build-role key config.';

revoke execute on function public.role_rank(text, text) from public, anon;
grant execute on function public.role_rank(text, text) to authenticated;