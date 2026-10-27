-- NeoFoot migration 0036: universal rating unification (Phase 10.1, urgent).
--
-- Owner report 2026-10-27: "the OVR from the cards looks inconsistent with the
-- OVR from the Ranking tab." Investigation (read-only live audit + migration
-- archaeology, 10.1-CONTEXT.md) proved the ratings engine split-brain:
-- migration 0018 (Phase 9) swapped the value-proportional formula into only 3
-- of the 6 OVR-producing RPCs; the 0023/0024 role-filter hotfixes preserved
-- the pre-Phase-9 rank-percentile formula in role_rank/my_card/staff_requests;
-- 0028's selection_order <= 6 key filter missed role_rank and staff_requests.
-- Measured live: 6/6 OVR-capable members show different OVRs across surfaces;
-- 3 (High Priest/suporte) show null on the Ranking tab while their cards show
-- a number; every staff_requests applicant OVR has been null since the 0018
-- backfill (class-only key read x 18 rows per class -> count(*) = 6 can never
-- hold).
--
-- This migration restores the 07.2 round-8 owner ruling ("Ratings are an
-- universal measurement, once calculated they must be displayed equally"):
--   1. role_rank/my_card/staff_requests are rebased onto the Phase 9
--      value-proportional formula (SCALE-01, src/lib/rankMath.ts): the
--      least(greatest(round(case stat_direction ...))) shapes are the 0028
--      value-proportional expressions copied verbatim — never re-derived.
--      The pre-Phase-9 rank-percentile counting is gone from production RPCs.
--   2. Every OVR gate and key-stat list read filters
--      ks.selection_order <= 6 (0028 owner rule: relevants are never keys);
--      staff_requests additionally gains ks.char_function = r.char_function —
--      the 0018-era omission that nulled every applicant OVR.
--   3. my_report/class_top5 join the ONE cohort definition (D-10.1-02):
--      latest value per (member, stat) over submissions
--      status not in ('rejected','discarded'), over ACTIVE members.
--   get_promotion/get_promotion_public are already canonical (0029) and are
--   NOT touched (D-10.1-04).
--
-- Payload shapes are byte-preserved: field lists, key ordering, null
-- semantics and error vocabulary are unchanged — the client renders these
-- values verbatim (zero payload-shape changes, zero client changes).
--
-- The trailing NOTIFY matters: migrations are applied through the Management
-- API Run Query endpoint, which does not emit PostgREST's schema-reload
-- notification — a just-replaced RPC can answer "no function matches" until
-- the next DDL (0035 lesson, live owner report 2026-10-26).
--
-- Append-only: 0001-0035 are never edited in place; create or replace only,
-- exact signatures, zero drop function.
-- Apply (plan 10.1-02): node scripts/apply-seed.mjs supabase/migrations/0036_universal_rating_unification.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. role_rank — Ranking tab rebase: value-proportional points + the 0028
--    selection_order <= 6 key filter (10.1-CONTEXT §4 defects #1 + #2).
--    Byte-faithful supersession of the 0024 body: staff gate,
--    invalid_function/unknown_class whitelist, CTE structure, server ordering
--    and payload field list unchanged. The cmp CTE (pre-Phase-9 rank-percentile
--    counting) is dropped — it has no consumer left; agg gains max_v/min_v
--    (keeps n, avg_v — the stats list still renders class_average); the
--    stats-lateral points and the OVR lateral p use the 0028/0029
--    value-proportional shapes (SCALE-01, stat_direction-aware best, clamped
--    [0,99]); the OVR key-set read filters ks.selection_order <= 6 — relevants
--    at positions 7+ never count as keys.
-- ---------------------------------------------------------------------------

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
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
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
            and ks.selection_order <= 6
        ) kp
      ) o
    ) rr
  );
end;
$$;

comment on function public.role_rank(text, text) is
  'Staff-only officials rank view (0036 rating unification): per-stat points and OVR use the Phase 9 value-proportional formula (SCALE-01, stat_direction-aware best, clamped [0,99]) over the member''s own build-role key config filtered to selection_order <= 6 (0028 owner rule — relevants 7+ never count as keys). Staff-only gate unchanged: member_role in (officer,owner) AND caller active.';

revoke execute on function public.role_rank(text, text) from public, anon;
grant execute on function public.role_rank(text, text) to authenticated;
