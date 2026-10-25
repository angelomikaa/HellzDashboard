-- NeoFoot migration 0028: KEYU ordered-set repair + relevants-are-never-keys filter.
--
-- Found by Phase 10 UAT (owner report 2026-10-24, "the OVR calculation requires
-- at least 3 of the same class and role"): two stacked defects.
--
-- 1. DATA — 0018 added class_key_stats.selection_order with default 0 and its
--    backfill copied that 0 into every original key row (the pre-0018 table had
--    no order at all, 0009 inserted plain (class_name, stat_key)). Every combo
--    landed at all-zeros; set_key_stat_v2 appends then computed
--    max(selection_order) + 1 = 1..k, INSIDE the <=6 key range. Combos where
--    officers later selected extra stats (High Priest/suporte: 10 rows,
--    High Wizard/mdps: 9) broke every count(*) = 6 OVR gate -> OVR null +
--    data_sufficient false despite a full cohort, and my_card returned 10/9
--    key_stats (relevants rendered on the Painel strip).
--    Repair: renumber each combo's ordered set to contiguous 1..N by
--    (selection_order, selected_at, stat_key) — backfilled base keys first
--    (alphabetical tie-break: OVR is order-independent and my_card /
--    get_promotion order key lists by label, so no display order changes),
--    later v2 appends after (they become the relevants they were meant to be).
--
-- 2. RPCs — the owner rule (2026-10-24): relevants must be ignored BOTH for
--    the OVR count AND from the Painel; their usage is in the foco de
--    melhoria priority set. Every class_key_stats key-set read in my_report,
--    my_card, class_top5 and get_promotion now filters selection_order <= 6.
--    Bodies are byte-faithful to the LIVE pg_proc source (dumped pre-apply)
--    with only that filter added.
--
-- Append-only: 0001-0027 are never edited in place.
-- Apply: node scripts/apply-seed.mjs supabase/migrations/0028_keyu_order_repair_rpc_key_filter.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Data repair: contiguous 1..N selection_order per (class, char_function)
-- ---------------------------------------------------------------------------

with ranked as (
  select class_name, char_function, stat_key,
         row_number() over (
           partition by class_name, char_function
           order by selection_order, selected_at, stat_key
         ) as rn
  from class_key_stats
)
update class_key_stats k
set selection_order = r.rn
from ranked r
where k.class_name = r.class_name
  and k.char_function = r.char_function
  and k.stat_key = r.stat_key;

-- Guard: the KEYU invariant must hold exactly after the renumber.
do $$
begin
  if exists (
    select 1 from class_key_stats
    group by class_name, char_function
    having count(*) <> count(distinct selection_order)
        or min(selection_order) <> 1
        or max(selection_order) <> count(*)
  ) then
    raise exception 'class_key_stats renumber failed: orders must be contiguous 1..N per (class, char_function)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2.1 my_report: key-set reads filter to selection_order <= 6
-- ---------------------------------------------------------------------------

create or replace function public.my_report()
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
      where sub.status <> 'rejected'
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where m.char_class = v_class and m.char_function = v_function
    ),
    agg as (
      select stat_key,
             count(*) as n,
             avg(value) as avg_v,
             max(value) as max_v,
             min(value) as min_v
      from cohort
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
            'class_average', a.avg_v,
            'best',
              case c.stat_direction
                when 'lower' then a.min_v
                else a.max_v
              end,
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
      ),
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
          where ks.class_name = v_class
            and ks.char_function = v_function
            and ks.selection_order <= 6
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
$$;

comment on function public.my_report() is
  'Member rank report (Phase 9): per-stat own value, class average, best (stat_direction-aware), value-proportional points, OVR (51 + mean(6 key-stat points) * 48/99, all-6-or-nothing) and last_validated_at. 0028: the key set is class_key_stats rows with selection_order <= 6 ONLY — relevants (7+) never count as keys (owner rule 2026-10-24); with fewer than 6 ordered rows configured OVR stays null. Key-stat identity NEVER serialised (RNK-02). Exceptions: no_member_claim/forbidden.';

revoke execute on function public.my_report() from public, anon;
grant  execute on function public.my_report() to authenticated;

-- ---------------------------------------------------------------------------
-- 2.2 my_card: key-set reads filter to selection_order <= 6
-- ---------------------------------------------------------------------------

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
            and ks.selection_order <= 6
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
          and ks.selection_order <= 6
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
  'Leak-safe member card payload: char_class/char_function from the JWT, OVR (0009 semantics), key_stats filtered to the caller''s own build-role config, relevant_stat_keys identity only. 0028: key_stats and the OVR gate read selection_order <= 6 ONLY — relevants (7+) never appear on the Painel strip nor count as keys (owner rule 2026-10-24). Key-stat CONFIG never serialised.';

revoke execute on function public.my_card() from public, anon;
grant  execute on function public.my_card() to authenticated;

-- ---------------------------------------------------------------------------
-- 2.3 class_top5: key-set reads filter to selection_order <= 6
-- ---------------------------------------------------------------------------

create or replace function public.class_top5(p_class text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$

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
    where sub.status <> 'rejected'
    order by sub.member_id, ss.stat_key, sub.submitted_at desc
  ),
  class_members as (
    select m.id, m.display_name, m.char_function
    from members m
    where m.char_class = p_class
  ),
  cohort as (
    select l.member_id, l.stat_key, l.value, cm.char_function
    from latest l
    join class_members cm on cm.id = l.member_id
  ),
  cmp as (
    select a.member_id, a.stat_key,
           count(*) as n,
           count(*) filter (where b.value < a.value) as below,
           count(*) filter (where b.value = a.value) as ties
    from cohort a
    join cohort b on b.stat_key = a.stat_key and b.char_function = a.char_function
    group by a.member_id, a.stat_key
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
      from class_members cm
      cross join lateral (
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
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
            and ks.selection_order <= 6
        ) kp
      ) o
      order by o.ovr desc nulls last, cm.display_name
      limit 5
    ) t
  ), '[]'::jsonb)
  into v_rows;

  return v_rows;
end;
$$;

comment on function public.class_top5(p_class text) is
  'Staff-only top-5-by-OVR preview for a class. 0028: the OVR gate reads the (class, role) key set as selection_order <= 6 ONLY — relevants (7+) never count as keys (owner rule 2026-10-24).';

revoke execute on function public.class_top5(p_class text) from public, anon;
grant  execute on function public.class_top5(p_class text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2.4 get_promotion: key-set reads filter to selection_order <= 6
-- ---------------------------------------------------------------------------

create or replace function public.get_promotion()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$

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
    class_members as (
      select m.id, m.display_name, m.char_function, m.char_class
      from members m
      where m.char_class is not null and m.active
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value, cm.char_function, cm.char_class
      from latest l
      join class_members cm on cm.id = l.member_id
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
      select cm.char_class, cm.id, cm.display_name, cm.char_function, o.ovr
      from class_members cm
      cross join lateral (
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
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
            and ks.selection_order <= 6
        ) kp
      ) o
    ),
    top5 as (
      select char_class, id, display_name, char_function, ovr,
             row_number() over (
               partition by char_class
               order by ovr desc nulls last, display_name
             ) as rn
      from ovr_rows
      where ovr is not null
    ),
    hl as (
      select t.id, hl.h as highlights
      from top5 t
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
      jsonb_build_object('class_name', cards.char_class, 'cards', cards.cards)
      order by cards.char_class
    ), '[]'::jsonb)
    from (
      select t.char_class,
             jsonb_agg(
               jsonb_build_object(
                 'display_name', t.display_name,
                 'char_function', t.char_function,
                 'ovr', t.ovr,
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top5 t
      join hl on hl.id = t.id
      where t.rn <= 5
      group by t.char_class
    ) cards
  );
end;
$$;

comment on function public.get_promotion() is
  'Member-invocable promotion payload: per-class top-5 by OVR with key-stat highlights. 0028: both the OVR gate and the highlights list read selection_order <= 6 ONLY — relevants (7+) never count as keys nor appear on showcase cards (owner rule 2026-10-24).';

revoke execute on function public.get_promotion() from public, anon;
grant  execute on function public.get_promotion() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bookkeeping: record 0028 so a future CLI push never re-runs it (0012 way)
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0028', 'keyu_order_repair_rpc_key_filter', null);

commit;
