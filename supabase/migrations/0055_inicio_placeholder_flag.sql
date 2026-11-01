-- NeoFoot migration 0055: Início placeholder flag.
--
-- Owner request (2026-11-01): "ocultar as coortes que até o momento estão
-- compostas apenas por smokes — as builds são viáveis, a guilda apenas não tem
-- nenhum jogador na classe nesse momento. Se algum jogador mudar para algoz, a
-- coorte deve voltar aos destaques imediatamente."
--
-- The showcase cannot tell a placeholder from a real player today: the cards
-- carry only display_name/ovr/photo_path/highlights. This migration adds ONE
-- additive boolean to each card of BOTH Início RPCs:
--
--   'placeholder', coalesce(m.discord_handle like 'smoke%', false)
--
-- The smoke% namespace is the sanctioned fixture set (smoke-mtx primers,
-- smoke-bio/hp/sum, smoke-cleanup). A real member can never carry that handle.
-- The client then drops any BUILD whose cards are ALL placeholders, and the
-- build returns automatically as soon as one real member exists in the cohort
-- — no re-seed, no manual flag, no cache.
--
-- The bodies below are the LIVE supersessions (verified 2026-11-01):
--   - get_promotion:        one section per (class, function) cohort, meta only
--   - get_promotion_public: same body without the member gate, plus each card's
--                           own_class (pre-merge class) for display
-- Only the placeholder plumbing is added; every CTE, ordering and field is kept
-- byte-faithful.
--
-- Append-only. Apply AFTER 0054:
--   node scripts/apply-seed.mjs supabase/migrations/0055_inicio_placeholder_flag.sql

begin;

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
$$;

comment on function public.get_promotion() is
  'Members-only Início showcase (0014 + 0028 + 0029 + 0037 + 0055): one section per meta (class, function) cohort with the TOP 3 by OVR, plus each card''s placeholder boolean (members.discord_handle like ''smoke%''), so the client can hide cohorts that currently consist only of smoke fixtures. Highlights are the class''s KEY STATS with the closed field list {stat_key,label,label_short,value_type,value,points}. photo_path is the member card-photos object key. Key-stat CONFIG and the cohort flags are never serialised.';

revoke all on function public.get_promotion() from public;
grant execute on function public.get_promotion() to authenticated;

create or replace function public.get_promotion_public()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
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
$$;

comment on function public.get_promotion_public() is
  'Public landing Início showcase (owner decisions 2026-10-24 + 2026-10-28 + 2026-11-01): identical body to get_promotion with the member gate removed - anon-callable, active members only in the data, top 3 by OVR PER meta (class, function) cohort only (class_cohorts.meta), each card carrying its own_class and a placeholder boolean (discord_handle like ''smoke%'') so cohorts made only of smoke fixtures can be hidden. Same closed field list; key-stat CONFIG and cohort flags are never serialised.';

revoke all on function public.get_promotion_public() from public;
grant execute on function public.get_promotion_public() to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0055', 'inicio_placeholder_flag', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
