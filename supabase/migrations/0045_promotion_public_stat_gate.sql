-- NeoFoot migration 0045: the public showcase withholds the RAW stat values
-- from callers without a valid credential.
--
-- Owner decision (2026-10-30): "hide real stats when the user is not
-- authenticated. The third line, the real stats, must show only a hyphen if the
-- player has no valid credential — the view for logged in players can remain
-- the same."
--
-- Server-side gate, never UI-only (AGENTS.md): `get_promotion_public()` is
-- anon-callable for the landing page, but each highlight's `value` is now
-- serialised ONLY when the caller presents a member JWT whose member row is
-- ACTIVE. Anonymous callers receive `value: null` for every highlight, and the
-- client renders '—' on the card's third line. Everything else is unchanged:
-- same cohorts, same top 3 per meta (class, function), same OVR/points, same
-- closed field list, no config/merge data.
--
-- Deployment order: ship the client first (it passes the live session to the
-- same RPC — api.ts fetchPromotionPublic(session)); then apply this migration.
-- The client also masks the line for callers without a session, so both gates
-- agree while the rollout is in flight.
--
-- Append-only: 0039 is not edited; this is create or replace with the exact
-- signature, the 0039 body with ONE expression changed (the highlight value)
-- behind an active-member check.
-- Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0045_promotion_public_stat_gate.sql

begin;

create or replace function public.get_promotion_public()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_show_values boolean;
begin
  -- The credential gate. Anon requests carry no member_id claim, so this is
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
             m.char_class as own_class
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
      select cm.char_class, cm.own_class, cm.id, cm.display_name, cm.char_function, o.ovr
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
    -- 0037: top 3 PER COHORT, meta cohorts only (owner decision 2026-10-28).
    top3 as (
      select char_class, own_class, id, display_name, char_function, ovr,
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
            -- 0045: the raw value is withheld unless the caller is an active
            -- member. `points`, `value_type` and identity stay public (the
            -- card's rating line and tier banding are unchanged).
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
$$;

comment on function public.get_promotion_public() is 'Public landing showcase (0045): as 0039, and highlight.value is serialised ONLY for a caller with a valid active-member JWT - anon callers get null (the card renders a dash). Anon-callable, meta groups only, one section per group and function. Key-stat CONFIG and the merge table are never serialised.';

revoke all on function public.get_promotion_public() from public;
grant execute on function public.get_promotion_public() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bookkeeping + PostgREST reload (the Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0045', 'promotion_public_stat_gate', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
