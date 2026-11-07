-- NeoFoot migration 0078: submission date on the showcase cards.
--
-- Owner request 2026-11-06 ("precisamos ajustar a questão da data de envio nos
-- cards"): the Início showcase cards carried no date at all, while the Painel
-- own card used the last VALIDATED submission. The owner chose the SUBMISSION
-- date as the single basis: the latest submission that feeds the values
-- (validated OR pending, never rejected/discarded) — the same `latest` basis
-- the cards already use for the stats/OVR.
--
-- Change: get_promotion / get_promotion_public add `last_submitted_at` to each
-- card (max(submitted_at) over non-rejected/discarded submissions). The client
-- feeds it into the card's LAST_UPDATE line (rendered as DD-MM) and the Painel
-- own card switches to the same basis via fetchMySubmissions.
--
-- Append-only: 0073 bodies are superseded. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0078_card_submission_date.sql

begin;

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
    -- 0078: the card date = the latest submission feeding the values.
    last_submitted as (
      select sub.member_id, max(sub.submitted_at) as last_submitted_at
      from submissions sub
      where sub.status not in ('rejected','discarded')
      group by sub.member_id
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

revoke all on function public.get_promotion() from public;
grant execute on function public.get_promotion() to authenticated;

comment on function public.get_promotion() is
  'Members-only Início showcase (0078): one section per meta (class, function) cohort with the TOP 3 by OVR. Each card carries last_submitted_at (latest non-rejected/discarded submission, 0078) for the LAST_UPDATE line. Highlights remain the six KEY stats (closed field list); OVR averages every configured stat with available points. Key-stat CONFIG and cohort flags are never serialised.';

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

revoke all on function public.get_promotion_public() from public;
grant execute on function public.get_promotion_public() to anon, authenticated;

comment on function public.get_promotion_public() is
  'Public landing Início showcase (0078): identical body to get_promotion with the member gate removed — anon-callable, active members only, top 3 by OVR per meta (class, function) cohort. Each card carries last_submitted_at (latest non-rejected/discarded submission, 0078). The 0063 raw-value gate is preserved. Highlights remain the six KEY stats. Key-stat CONFIG and cohort flags are never serialised.';

-- ---------------------------------------------------------------------------
-- Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0078', 'card_submission_date', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
