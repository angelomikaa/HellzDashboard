-- NeoFoot Phase 9 follow-up: my_card() was never re-keyed when class_key_stats
-- gained char_function (0018). It still reads class_key_stats by class_name only,
-- which now returns 3x the rows (one per build role) after the 0018 backfill,
-- so the Painel key-stat strip shows 18 cards and OVR is always null
-- (count(*) = 18 <> 6). Filter both the OVR subquery and the key_stats list
-- by the caller's own char_function, matching my_report()/class_top5()/get_promotion().
-- Append-only: 0001-0022 are never edited in place.

create or replace function public.my_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
    cohort as (
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where m.char_class = v_class and m.char_function = v_function and m.active
    ),
    agg as (
      select stat_key, count(*) as n
      from cohort
      group by stat_key
    )
    select jsonb_build_object(
      'char_class', v_class,
      'char_function', v_function,
      'ovr', (
        select jsonb_build_object(
          'value', case
            when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
          end,
          'data_sufficient', count(*) = 6 and count(p) = 6
        )
        from (
          select case
            when coalesce(a.n, 0) >= 3 and o.value is not null then
              (
                (select count(*) from cohort cb
                  where cb.stat_key = ks.stat_key and cb.value < o.value)
                + ((select count(*) from cohort ct
                      where ct.stat_key = ks.stat_key and ct.value = o.value) - 1)::numeric / 2
              ) / (a.n - 1) * 99
          end as p
          from class_key_stats ks
          left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
          left join agg a on a.stat_key = ks.stat_key
          where ks.class_name = v_class
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
                round(
                  (
                    (select count(*) from cohort cb
                      where cb.stat_key = ks.stat_key and cb.value < o.value)
                    + ((select count(*) from cohort ct
                          where ct.stat_key = ks.stat_key and ct.value = o.value) - 1)::numeric / 2
                  ) / (a.n - 1) * 99, 2)
            end
          )
          order by c.label
        ), '[]'::jsonb)
        from class_key_stats ks
        join stat_catalog c on c.stat_key = ks.stat_key
        left join latest o on o.stat_key = ks.stat_key and o.member_id = v_member
        left join agg a on a.stat_key = ks.stat_key
        where ks.class_name = v_class
          and ks.char_function = v_function
      ),
      'relevant_stat_keys', (
        coalesce((
          select jsonb_agg(rs.stat_key order by rs.stat_key)
          from class_relevant_stats rs
          where rs.class_name = v_class
        ), '[]'::jsonb)
      )
    )
  );
end;
$$;

comment on function public.my_card() is
  'Leak-safe member card payload (Phase 9 hotfix): char_class/char_function from the JWT, OVR (0009 semantics), key_stats filtered to the caller''s own build-role config, relevant_stat_keys identity only. Key-stat CONFIG never serialised.';

revoke execute on function public.my_card() from public, anon;
grant execute on function public.my_card() to authenticated;