-- NeoFoot migration 0073: OVR over keys + relevants, hole-preserving key slots
-- (owner decisions 2026-11-05).
--
-- 1. OVR base: every SELECTED stat of the (class, build-role) config now feeds
--    the value-proportional mean — the 6 keys AND the relevants. The keys are
--    still the six stats highlighted on the card, but they no longer cap the
--    OVR pool. The 6-key config remains the mandatory gate: with fewer than 6
--    keys the OVR is null (so Início drops the cohort) until the key set is
--    complete again.
-- 2. Missing points are ignored: the mean runs over the configured stats that
--    have points, provided at least one does (owner: "média dos disponíveis").
--    The old all-6-or-nothing points rule is gone.
-- 3. set_key_stat_v2 no longer promotes the oldest relevant when a key is
--    removed. The slot stays empty (keys compact 1..n); a relevant can only be
--    added once the 6 keys exist and an existing relevant can only be removed
--    when the key set is complete ("key_set_incomplete" otherwise).
-- 4. my_card's relevant_stat_keys now reads the real relevants (ordered set
--    rows at selection_order > 6) instead of the retired class_relevant_stats
--    table, so the Painel foco strip follows the live config.
--
-- Append-only: 0001–0072 are never edited in place; create or replace only,
-- exact signatures, no function is dropped. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0073_ovr_selected_stats_and_key_slots.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Normalize the ordered set: keys compact 1..n, relevants re-based at 7..
--    (defensive against legacy gaps; the new RPC also fills the first free
--    key slot, so a gap can never collide again).
-- ---------------------------------------------------------------------------

with ranked as (
  select class_name, char_function, stat_key,
         row_number() over (
           partition by class_name, char_function
           order by selection_order, stat_key
         ) as rn
  from public.class_key_stats
  where selection_order <= 6
)
update public.class_key_stats k
set selection_order = r.rn
from ranked r
where k.class_name = r.class_name
  and k.char_function = r.char_function
  and k.stat_key = r.stat_key
  and k.selection_order <> r.rn;

with ranked as (
  select class_name, char_function, stat_key,
         6 + row_number() over (
           partition by class_name, char_function
           order by selection_order, stat_key
         ) as rn
  from public.class_key_stats
  where selection_order > 6
)
update public.class_key_stats k
set selection_order = r.rn
from ranked r
where k.class_name = r.class_name
  and k.char_function = r.char_function
  and k.stat_key = r.stat_key
  and k.selection_order <> r.rn;

-- ---------------------------------------------------------------------------
-- 2. set_key_stat_v2 (0073 semantics).
-- ---------------------------------------------------------------------------

create or replace function public.set_key_stat_v2(p_class text, p_function text, p_stat_key text, p_enabled boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n_keys int;
  v_old_order int;
  v_slot int;
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
  -- violate the slot invariants (CR-01 atomicity lesson).
  perform pg_advisory_xact_lock(hashtext('cks:' || p_class || ':' || p_function));

  -- unknown stat_key: the class_key_stats FK to stat_catalog raises naturally.

  select count(*) into v_n_keys
  from class_key_stats
  where class_name = p_class and char_function = p_function and selection_order <= 6;

  if p_enabled then
    -- 0073 rule: keys fill slots 1..6; only once all 6 exist does a new
    -- selection become a relevant (slot >= 7). No block at 7.
    if not exists (
      select 1 from class_key_stats
      where class_name = p_class and char_function = p_function and stat_key = p_stat_key
    ) then
      if v_n_keys < 6 then
        -- First free key slot (robust even against legacy gaps).
        select min(s.slot) into v_slot
        from generate_series(1, 6) as s(slot)
        where not exists (
          select 1 from class_key_stats k
          where k.class_name = p_class and k.char_function = p_function
            and k.selection_order = s.slot
        );

        insert into class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
        values (p_class, p_function, p_stat_key, v_slot, now());
      else
        insert into class_key_stats (class_name, char_function, stat_key, selection_order, selected_at)
        select p_class, p_function, p_stat_key,
               coalesce(max(selection_order), 6) + 1,
               now()
        from class_key_stats
        where class_name = p_class and char_function = p_function;
      end if;
    end if;
  else
    select selection_order into v_old_order
    from class_key_stats
    where class_name = p_class and char_function = p_function and stat_key = p_stat_key;

    if v_old_order is not null then
      -- 0073 rule: relevants are frozen while the key set is incomplete —
      -- they may only be modified after the 6 keys are selected again.
      if v_old_order > 6 and v_n_keys <> 6 then
        raise exception 'key_set_incomplete';
      end if;

      delete from class_key_stats
      where class_name = p_class and char_function = p_function and stat_key = p_stat_key;

      -- 0073 rule: removing a key leaves its slot EMPTY — never promote a
      -- relevant. Keys are compacted 1..n (relative order preserved); a
      -- relevant removed while the set is complete re-compacts 7..n.
      if v_old_order <= 6 then
        update class_key_stats k
        set selection_order = r.rn
        from (
          select stat_key,
                 row_number() over (order by selection_order, stat_key) as rn
          from class_key_stats
          where class_name = p_class and char_function = p_function
            and selection_order <= 6
        ) r
        where k.class_name = p_class
          and k.char_function = p_function
          and k.stat_key = r.stat_key;

        select count(*) into v_n_keys
        from class_key_stats
        where class_name = p_class and char_function = p_function and selection_order <= 6;
      else
        update class_key_stats k
        set selection_order = 6 + r.rn
        from (
          select stat_key,
                 row_number() over (order by selection_order, stat_key) as rn
          from class_key_stats
          where class_name = p_class and char_function = p_function
            and selection_order > 6
        ) r
        where k.class_name = p_class
          and k.char_function = p_function
          and k.stat_key = r.stat_key;
      end if;
    end if;
  end if;

  return (
    select count(*) from class_key_stats
    where class_name = p_class and char_function = p_function and selection_order <= 6
  );
end;
$function$;

revoke all on function public.set_key_stat_v2(p_class text, p_function text, p_stat_key text, p_enabled boolean) from public;
grant execute on function public.set_key_stat_v2(p_class text, p_function text, p_stat_key text, p_enabled boolean) to authenticated;


comment on function public.set_key_stat_v2(text, text, text, boolean) is
  'Staff-only key/relevant configuration per (class, build-role) (0073 owner rules 2026-11-05). p_enabled=true fills the first free key slot while fewer than 6 keys exist, then appends a relevant once the 6-key set is complete; p_enabled=false removes a key WITHOUT promoting any relevant (the slot stays empty), and refuses to touch a relevant while the key set is incomplete (key_set_incomplete). Keys are compacted 1..n after every removal; relevants live at selection_order > 6. Returns the class''s current key count. Advisory lock: hashtext(''cks:''||p_class||'':''||p_function). Errors: forbidden/unknown_class/unknown_function/key_set_incomplete.';

-- ---------------------------------------------------------------------------
-- 3. Rank RPCs: OVR reads every selected stat (keys + relevants) and averages
--    the available points; the 6-key config gate stays.
-- ---------------------------------------------------------------------------

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
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
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
  'Member rank report (0073): per-stat own value, class average, best (stat_direction-aware), value-proportional points, OVR over EVERY configured stat of the caller''s (class, build-role) config — keys + relevants — ignoring stats without points and requiring at least one point plus the full 6-key set (owner 2026-11-05), and last_validated_at. Key/relevant identity is NEVER serialised here (RNK-02). Exceptions: no_member_claim/forbidden.';

create or replace function public.my_card()
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
    cohort as (
      select l.member_id, l.stat_key, l.value
      from latest l
      join members m on m.id = l.member_id
      where public.cohort_group(m.char_class) = public.cohort_group(v_class) and m.char_function = v_function and m.active
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

revoke all on function public.my_card() from public;
grant execute on function public.my_card() to authenticated;


comment on function public.my_card() is
  'Member Painel card (0073): char_class/char_function from the JWT, OVR over every configured stat (keys + relevants, available points only, 6-key gate), key_stats = the six card highlights (closed field list), relevant_stat_keys = the live relevants (selection_order > 6). Key/relevant CONFIG is never serialised.';

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
    order by sub.member_id, ss.stat_key, sub.submitted_at desc
  ),
  class_members as (
    select m.id, m.display_name, m.char_function
    from members m
    where public.cohort_group(m.char_class) = p_class and m.active
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
      from class_members cm
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
  'Staff-only top-5-by-OVR preview for a class (0073): same OVR semantics as my_report — every configured stat (keys + relevants) with available points, 6-key gate, n>=3 per-stat gate, floor-51 rescale. Members with insufficient data get ovr null (sorted last). Internal gate: member_role in (officer,owner) AND caller active.';

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
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
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
  'Staff ranking board (0073): one row per active member of the requested build role, each OVR computed inside the member''s own (class, function) cohort with the 0073 base — keys + relevants, available points only, 6-key gate. Merged groups (Artista) stay first-class. Server-ordered ovr desc nulls last, display_name. Internal gate: member_role in (officer,owner) AND caller active.';

create or replace function public.get_promotion()
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
    class_members as (
      select m.id, m.display_name, m.char_function, public.cohort_group(m.char_class) as char_class,
             coalesce(m.discord_handle like 'smoke%', false) as is_placeholder
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
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top3 t
      join hl on hl.id = t.id
      where t.rn <= 3
      group by t.char_class, t.char_function
    ) cards
  );
end;
$function$;

revoke all on function public.get_promotion() from public;
grant execute on function public.get_promotion() to authenticated;


comment on function public.get_promotion() is
  'Members-only Início showcase (0073): one section per meta (class, function) cohort with the TOP 3 by OVR. Highlights remain the six KEY stats (closed field list); OVR itself now averages every configured stat (keys + relevants) with available points. A cohort with fewer than 6 keys has no OVR and drops out of Início until the key set is complete again. Key-stat CONFIG and cohort flags are never serialised.';

create or replace function public.get_promotion_public()
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
    class_members as (
      select m.id, m.display_name, m.char_function,
             public.cohort_group(m.char_class) as char_class,
             m.char_class as own_class,
             coalesce(m.discord_handle like 'smoke%', false) as is_placeholder
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
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top3 t
      join hl on hl.id = t.id
      where t.rn <= 3
      group by t.char_class, t.char_function
    ) cards
  );
end;
$function$;

revoke all on function public.get_promotion_public() from public;
grant execute on function public.get_promotion_public() to anon, authenticated;


comment on function public.get_promotion_public() is
  'Public landing Início showcase (0073): identical body to get_promotion with the member gate removed — anon-callable, active members only, top 3 by OVR per meta (class, function) cohort. The 0063 raw-value gate is preserved (value withheld unless the caller is an active member). Highlights remain the six KEY stats; OVR averages every configured stat with available points. Key-stat CONFIG and cohort flags are never serialised.';

create or replace function public.staff_requests()
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
    cohort as (
      select l.member_id, l.stat_key, l.value, public.cohort_group(m.char_class) as char_class, m.char_function
      from latest l
      join members m on m.id = l.member_id
      where m.active and m.char_class is not null
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

revoke all on function public.staff_requests() from public;
grant execute on function public.staff_requests() to authenticated;


comment on function public.staff_requests() is
  'Staff requests board with per-applicant OVR (0073): the applicant''s own (class, function) config must hold 6 keys; every configured stat (keys + relevants) then feeds the value-proportional mean, ignoring stats without points (at least one required). Cohort = active members of the same class/function; the applicant never joins it.';

create or replace function public.ovr_projection(p_member uuid, p_class text, p_function text, p_stats jsonb DEFAULT NULL::jsonb, p_exclude_submission uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with latest as (
    select distinct on (s.member_id, ss.stat_key)
           s.member_id, ss.stat_key, ss.value
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
  cohort as (
    select l.member_id, l.stat_key,
           case
             when l.member_id = p_member and pn.vals ? l.stat_key
               then (pn.vals->>l.stat_key)::numeric
             else l.value
           end as value
    from latest l
    cross join pending pn
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

revoke execute on function public.ovr_projection(uuid, text, text, jsonb, uuid) from public, anon, authenticated;


comment on function public.ovr_projection(uuid, text, text, jsonb, uuid) is
  'Internal review-only OVR projection (0073): the value-proportional formula over EVERY configured stat of the member''s (class, build-role) — keys + relevants — with available points only and the 6-key gate. p_stats optionally overrides the member''s own values; p_exclude_submission removes exactly one row ("OVR before"). No client EXECUTE — called only by the SECURITY DEFINER officer_queue().';

-- ---------------------------------------------------------------------------
-- 4. Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0073', 'ovr_selected_stats_and_key_slots', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
