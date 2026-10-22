-- NeoFoot Phase 9 (plan 09-01): Fine Ranks — Value-Proportional Scale +
-- Role-Differentiated Key Stats. ONE migration rewrites the same three RPC
-- bodies (my_report, class_top5, get_promotion) once, per owner decision #8
-- (never rewrite the same three RPC bodies twice in one milestone).
--
-- Append-only: 0001–0017 are NEVER edited in place. This file supersedes:
--   - set_key_stat(text,text,boolean)  -> set_key_stat_v2 (new, old dropped)
--   - set_relevant_stat(...)           -> eliminated (folded into v2)
--   - my_report()                      -> value-proportional points + role cohorts + last_validated_at
--   - class_top5(text)                 -> value-proportional points + role cohorts
--   - get_promotion()                  -> value-proportional points + role cohorts (class-wide OVR kept)
--
-- D-04: stat_direction column on stat_catalog (higher | lower, default higher);
--       fixed_ct_pct, global_cd_pct, variable_ct_pct marked 'lower'.
-- D-09: class_key_stats PK rebuilt to (class_name, char_function, stat_key);
--       selection_order + selected_at columns added.
-- D-10: backfill every existing class's 6 key stats into all 3 build roles
--       (dps/mdps/suporte) so OVR parity holds on deploy day.
-- D-11..D-14: set_key_stat_v2 — ONE ordered selection set per (class, function):
--             first 6 = keys, 7th+ = relevants; deselecting a key promotes the
--             oldest relevant; advisory lock scoped to (class, function).
-- D-15/D-18: OVR reads the member's own (class, build-role) config; cohorts
--            become class+build-role; no configured combo -> OVR null.
-- D-19/HOME-03: my_report gains only last_validated_at (max submitted_at
--               filter status='validated' over caller's own submissions).
-- D-05: points clamped to [0, 99]; OVR formula unchanged (51 + mean * 48/99,
--       all-6-or-nothing, floor 51).

-- ---------------------------------------------------------------------------
-- 1. stat_direction column (D-04)
-- ---------------------------------------------------------------------------

alter table stat_catalog add column stat_direction text not null default 'higher'
  constraint stat_catalog_direction_check check (stat_direction in ('higher','lower'));

update stat_catalog set stat_direction = 'lower'
  where stat_key in ('fixed_ct_pct','global_cd_pct','variable_ct_pct');

-- ---------------------------------------------------------------------------
-- 2. class_key_stats PK rebuild (D-09): re-key to (class_name, char_function,
--    stat_key). Add selection_order (1-6 = keys, 7th+ = relevants) and
--    selected_at. char_function holds one of dps/mdps/suporte (vocabulary in
--    src/lib/groups.ts FUNCTION_LABELS); CHECK constraint here for migration-only
--    FK hygiene (references nothing — build-role vocabulary is client-owned).
-- ---------------------------------------------------------------------------

alter table class_key_stats drop constraint class_key_stats_pkey;

alter table class_key_stats
  add column char_function text not null default 'dps'
    constraint class_key_stats_function_check
    check (char_function in ('dps','mdps','suporte'));

alter table class_key_stats
  add column selection_order integer not null default 0;

alter table class_key_stats
  add column selected_at timestamptz not null default now();

alter table class_key_stats
  add constraint class_key_stats_pkey primary key (class_name, char_function, stat_key);

-- ---------------------------------------------------------------------------
-- 3. Backfill DML (D-10 / ROLE-04): every existing class's 6 key stats copied
--    into all 3 build roles at migration time (18 rows/class), selection_order
--    1-6 preserved per copy. Runs regardless of member role distribution.
-- ---------------------------------------------------------------------------

insert into class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
  select cks.class_name, f.role, cks.stat_key, cks.selection_order, now()
  from class_key_stats cks
  cross join (values ('dps'),('mdps'),('suporte')) as f(role)
  on conflict (class_name, char_function, stat_key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. set_key_stat v2 (D-11..D-14): single RPC replacing set_key_stat +
--    set_relevant_stat. p_enabled=true appends to the ordered set (items at
--    positions 7+ are relevants automatically — no block at 7). p_enabled=false
--    removes; if it was a key (order <= 6), the oldest relevant (lowest order
--    > 6) is promoted into the vacated slot; remaining rows shift down.
--    Returns the class's current key-stat count (selection_order <= 6).
--    Errors: forbidden | unknown_class | unknown_function.
-- ---------------------------------------------------------------------------

create or replace function public.set_key_stat_v2(
  p_class text,
  p_function text,
  p_stat_key text,
  p_enabled boolean
) returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Internal gate FIRST (officer/owner claim AND caller's live active flag).
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

  if p_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'unknown_function';
  end if;

  -- Serialize toggles per (class, function) so concurrent officers cannot
  -- violate the ordered-set invariants (CR-01 atomicity lesson).
  perform pg_advisory_xact_lock(hashtext('cks:' || p_class || ':' || p_function));

  -- unknown stat_key: the class_key_stats FK to stat_catalog raises naturally.

  if p_enabled then
    -- D-12: append at the end (highest selection_order + 1). Items at 7+ are
    -- relevants automatically — no block at 7, no key_stat_limit.
    insert into class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
    select p_class, p_function, p_stat_key,
      coalesce(max(selection_order), 0) + 1,
      now()
    from class_key_stats
    where class_name = p_class and char_function = p_function
    on conflict (class_name, char_function, stat_key) do nothing;
  else
    -- D-13: remove the stat. If it was a key (order <= 6), promote the oldest
    -- relevant (lowest order > 6) into the vacated slot; shift remaining rows
    -- down so the key set stays at 6 whenever >= 6 stats are selected.
    declare
      v_old_order int;
    begin
      select selection_order into v_old_order
      from class_key_stats
      where class_name = p_class and char_function = p_function and stat_key = p_stat_key;

      if v_old_order is not null then
        delete from class_key_stats
        where class_name = p_class and char_function = p_function and stat_key = p_stat_key;

        if v_old_order <= 6 then
          -- Promote the oldest relevant into the vacated key slot.
          update class_key_stats
          set selection_order = v_old_order
          where class_name = p_class
            and char_function = p_function
            and selection_order = (
              select min(selection_order)
              from class_key_stats
              where class_name = p_class and char_function = p_function
                and selection_order > 6
            );

          -- Shift rows between the promoted slot's old position and the end
          -- down by one (preserve relative order of remaining relevants).
          update class_key_stats
          set selection_order = selection_order - 1
          where class_name = p_class
            and char_function = p_function
            and selection_order > v_old_order
            and selection_order <= (
              select max(selection_order)
              from class_key_stats
              where class_name = p_class and char_function = p_function
            );
        else
          -- Removed a relevant: shift rows after it down by one.
          update class_key_stats
          set selection_order = selection_order - 1
          where class_name = p_class
            and char_function = p_function
            and selection_order > v_old_order;
        end if;
      end if;
    end;
  end if;

  return (
    select count(*) from class_key_stats
    where class_name = p_class and char_function = p_function and selection_order <= 6
  );
end;
$$;

comment on function public.set_key_stat_v2(text, text, text, boolean) is
  'Staff-only ordered key/relevant selection set per (class, build-role) (Phase 9 D-11..D-14). p_enabled=true appends to the end of the ordered set (positions 7+ are relevants automatically, no block at 7); p_enabled=false removes and, if the removed stat was a key (order <= 6), promotes the oldest relevant into the vacated slot. Returns the class''s current key-stat count (order <= 6). Advisory lock: hashtext(''cks:''||p_class||'':''||p_function). Errors: forbidden/unknown_class/unknown_function. Replaces set_key_stat(text,text,boolean) and set_relevant_stat(text,text,boolean) — old signatures dropped in migration 0018.';

-- ---------------------------------------------------------------------------
-- 5. Drop old RPCs (D-11): old 3-arg set_key_stat and set_relevant_stat are
--    dropped in the same migration — no bypass path remains. class_relevant_stats
--    table kept (unused by RPCs) for rollback safety — no DML via RPC anymore.
-- ---------------------------------------------------------------------------

drop function if exists public.set_key_stat(text, text, boolean);
drop function if exists public.set_relevant_stat(text, text, boolean);

-- ---------------------------------------------------------------------------
-- 6. EXECUTE hygiene: revoke execute from public/anon, grant to authenticated.
--    PostgREST calls as authenticated; membership enforced inside the function.
-- ---------------------------------------------------------------------------

revoke execute on function public.set_key_stat_v2(text, text, text, boolean) from public, anon;
grant  execute on function public.set_key_stat_v2(text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. my_report rewrite: value-proportional points (own/best x 99 clamped
--    [0,99], stat_direction-aware), per-member own (class, build-role) key
--    config + class+build-role cohorts, plus last_validated_at scalar.
--    Closed payload: zero new per-stat fields, zero key-stat hints.
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
  'Member rank report (Phase 9): per-stat own value, class average, best (stat_direction-aware), value-proportional points (round(own/best*99,2) clamped [0,99]; best=max higher-is-better / min lower-is-better), OVR (51 + mean(6 key-stat points) * 48/99, all-6-or-nothing, floor 51, member''s own class+build-role key config + cohorts) and last_validated_at (max submitted_at over caller''s validated submissions). Key-stat identity NEVER serialised (RNK-02). Exceptions: no_member_claim/forbidden.';

-- ---------------------------------------------------------------------------
-- 8. class_top5 rewrite: value-proportional points, per-(class, function)
--    cohort for OVR (per-member own build-role), same all-6-or-nothing
--    semantics, clamp [0,99]. Staff-only.
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
    -- Per (member, stat): n = members of the SAME function holding the stat;
    -- below/ties vs the member's own latest value (ties include the member).
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
            when c.n >= 3 and o.value is not null then
              least(greatest(
                round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(c.min_v, 0)
                    else o.value / nullif(c.max_v, 0)
                  end * 99, 2),
                0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = cm.id
          left join agg c on c.stat_key = ks.stat_key
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
$$;

comment on function public.class_top5(text) is
  'Staff-only top-5-by-OVR preview for a class (Phase 9): value-proportional points, per-member class+function cohort for OVR, exactly-6 key stats (member''s own build-role config), n>=3 gate, floor-51 rescale, clamp [0,99]. Members with insufficient data get ovr null (sorted last). Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 9. get_promotion rewrite: value-proportional points scoped to the member's
--    own class+function cohort; OVR stays class-wide across roles
--    (cross-role comparable currency). Highlights remain the class's key stats
--    (same set for every card of that class), closed field list
--    {stat_key,label,label_short,value_type,value,points}. Member-invocable.
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
      -- Per (member, stat): n = members of the SAME class AND function holding
      -- the stat; below/ties include the member.
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
            when c.n >= 3 and o.value is not null then
              least(greatest(
                round(
                  case c.stat_direction
                    when 'lower' then o.value / nullif(c.min_v, 0)
                    else o.value / nullif(c.max_v, 0)
                  end * 99, 2),
                0), 99)
          end as p
          from class_key_stats ks
          join stat_catalog c on c.stat_key = ks.stat_key
          left join latest o on o.stat_key = ks.stat_key and o.member_id = cm.id
          left join agg c on c.stat_key = ks.stat_key
                         and c.char_class = cm.char_class
                         and c.char_function = cm.char_function
          where ks.class_name = cm.char_class
            and ks.char_function = cm.char_function
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
      select t.id,
             coalesce(jsonb_agg(
               jsonb_build_object(
                 'stat_key', sc.stat_key,
                 'label', sc.label,
                 'label_short', sc.label_short,
                 'value_type', sc.value_type,
                 'value', lt.value,
                 'points', sp.points
               )
               order by sc.label
             ), '[]'::jsonb) as highlights
      from top5 t
      cross join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', ks.stat_key,
            'label', sc.label,
            'label_short', sc.label_short,
            'value_type', sc.value_type,
            'value', lt.value,
            'points', case
              when c.n >= 3 and lt.value is not null then
                least(greatest(
                  round(
                    case c.stat_direction
                      when 'lower' then lt.value / nullif(c.min_v, 0)
                      else lt.value / nullif(c.max_v, 0)
                    end * 99, 2),
                  0), 99)
              end
          )
          order by sc.label
        ), '[]'::jsonb) as h
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join latest lt on lt.stat_key = ks.stat_key and lt.member_id = t.id
        left join agg c on c.stat_key = ks.stat_key
                       and c.char_class = t.char_class
                       and c.char_function = t.char_function
        where ks.class_name = t.char_class
          and ks.char_function = t.char_function
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
  'Member-invocable promotion payload (Phase 9): per class, top-5-by-OVR cards whose highlights are the class''s key stats (same set for every card of that class, ordered by label — sanctioned reveal, closed field list {stat_key,label,label_short,value_type,value,points}), value-proportional points scoped to member''s own class+function cohort, OVR class-wide across roles (cross-role comparable currency). Key-stat CONFIG never serialised. Exceptions: no_member_claim/forbidden.';
