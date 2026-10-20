-- get_promotion rating unification (07.2-05 checkpoint round 8, owner:
-- "the OVR in the cards is different, in the painel tab the value pdmg.r is
-- 147.56 rated at 86 out of 99, in destaques, overall goes down to 97 as the
-- same pdmg.r 147.56 is rated at 78. Ratings are an universal measurement,
-- once calculated they must be displayed equally. the card the player sees
-- in the panel must be the same one available in destaques, in case they're
-- pristine rank").
--
-- ROOT CAUSE (traced 2026-10-19 across 0013 + the 0010/0011 bodies):
-- my_card() computes every points value AND the OVR inside the caller's
-- CLASS+FUNCTION cohort (0013:318-324: cohort where m.char_class = v_class
-- and m.char_function = v_function — the 0009 my_report semantics), while
-- get_promotion()'s cmp CTE joins on char_function ONLY (0010:287-297
-- shape): the same value ranks against ALL classes of one function — a
-- bigger pool → systematically lower points AND lower OVR on Destaques
-- (PDMG.R 147.56 → 86 in the class+function cohort vs 78 function-only).
-- Secondary drift: my_card rounds points to 2 decimals (0013:381-387),
-- get_promotion's sp subselect emitted the raw quotient.
--
-- THE FIX (server-side single source of truth — rank math lives only in
-- Postgres, never patched client-side): get_promotion DELEGATES to the
-- my_card computation — the cohort rows carry char_class and cmp joins on
-- class AND function (byte-identical percentile formula, n>=3 gate, floor-51
-- OVR rescale), and the highlight points adopt my_card's round(..., 2).
-- Never the other way around: Painel is the canonical card the owner
-- approved; Destaques must show THE SAME numbers.
--
-- UNNUMBERED live apply via scripts/apply-seed.mjs (migration 0014 is
-- RESERVED for Phase 8; the card-photos-storage.sql / promotion-photo-path.sql
-- precedent). The committed artifact carries NO secrets.
--
-- Supersession discipline (0013's own standard): a FULL byte-faithful copy
-- of the LIVE get_promotion body (seeds/live/promotion-photo-path.sql — the
-- round-7 photo_path supersession) with EXACTLY the unification changes:
--   1. cohort selects cm.char_class alongside char_function;
--   2. cmp joins b.char_class = a.char_class AND b.char_function =
--      a.char_function (the my_card/0009 class+function cohort — also the
--      0011 role_rank OVR semantics, which already scoped cmp by class);
--   3. sp.points wraps the percentile in round(..., 2) (my_card parity).
-- The OVR lateral consumes cmp unchanged → identical {value} semantics to
-- my_card's ovr subquery for the same member. Everything else — gates,
-- top-5, omitted-classes, photo_path, closed field lists — byte-preserved.

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
  -- Member gate (0010:135-141 shape): identity from the JWT only.
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  return (
    with latest as (
      -- 0010:265-273 verbatim: latest value per (member, stat) over
      -- non-rejected, non-discarded submissions.
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    class_members as (
      -- 0010:274-281 shape + D-07: active members only in every cohort
      -- (the D-06 supersession — see the 0011 header).
      select m.id, m.display_name, m.char_function, m.char_class
      from members m
      where m.char_class is not null and m.active
    ),
    cohort as (
      -- 0010:282-286 shape + 07.2-05 ROUND 8 UNIFICATION: char_class rides
      -- the cohort so every rank below is computed inside the member's OWN
      -- class+function cohort — the my_card basis (0013:318-324; the 0009
      -- my_report semantics), never the function-only pool.
      select l.member_id, l.stat_key, l.value, cm.char_function, cm.char_class
      from latest l
      join class_members cm on cm.id = l.member_id
    ),
    cmp as (
      -- 0010:287-297 shape + 07.2-05 ROUND 8 UNIFICATION: per (member,
      -- stat), n = members of the SAME class AND function holding the stat;
      -- below/ties include the member. THE ONE cohort basis for points AND
      -- OVR — identical numbers to my_card for the same member.
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
    ovr_rows as (
      -- 0010:308-326 OVR lateral verbatim (exactly-6 key stats, member holds
      -- all 6, each with n >= 3, floor-51 rescale) across ALL classes. With
      -- the unified cmp this is now the SAME OVR my_card returns (the
      -- class+function cohort percentile, identical formula).
      select cm.char_class, cm.id, cm.display_name, cm.char_function, o.ovr
      from class_members cm
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
          join cmp c on c.member_id = cm.id and c.stat_key = ks.stat_key
          where ks.class_name = cm.char_class
        ) kp
      ) o
    ),
    top5 as (
      -- 0010:305/327-329 semantics: ovr desc nulls last, display_name.
      -- Classes with no OVR-capable member produce no rows (D-13: omitted
      -- SERVER-SIDE — the client adds no empty sections).
      select char_class, id, display_name, char_function, ovr,
             row_number() over (
               partition by char_class
               order by ovr desc nulls last, display_name
             ) as rn
      from ovr_rows
      where ovr is not null
    ),
    hl as (
      -- 07.2 D-13 SUPERSESSION (kept): every card's highlights are the
      -- class's key stats, ordered by sc.label (stable) — the SANCTIONED
      -- key reveal with the closed field list
      -- {stat_key,label,label_short,value_type,value,points}. Points stay
      -- null when the stat's cohort has n < 3. 07.2-05 ROUND 8
      -- UNIFICATION: points adopt my_card's EXACT expression — the same
      -- percentile wrapped in round(..., 2) (0013:379-388) — so the number
      -- on Destaques IS the number on the Painel card, bit for bit.
      -- Tier banding stays CLIENT-side (tierForOvr): the RPC returns the
      -- ovr value only.
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
            'points', sp.points
          )
          order by sc.label
        ), '[]'::jsonb) as h
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join latest lt on lt.stat_key = ks.stat_key and lt.member_id = t.id
        left join (
          select c.member_id, c.stat_key,
                 round(
                   (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99, 2
                 ) as points
          from cmp c
          where c.member_id = t.id and c.n >= 3
        ) sp on sp.stat_key = ks.stat_key
        where ks.class_name = t.char_class
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
                 -- 07.2-05 round 7 (kept): the member's card-photos storage
                 -- object path — server-composed from the member id, fetched
                 -- by the client as a blob (the private bucket's RLS grants
                 -- active members read).
                 'photo_path', 'card-photos/' || t.id::text || '/card.jpg',
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
  'Member-invocable promotion payload (SHWC-02; 07.2-05 round-8 rating UNIFICATION): per class, top-5-by-OVR cards whose highlights are the class''s KEY STATS with the closed field list {stat_key,label,label_short,value_type,value,points}. Points AND OVR are computed in the member''s CLASS+FUNCTION cohort — the my_card basis (universal ratings: the same stat/OVR shows the same points on the Painel card and on Destaques, owner round 8) — and points carry my_card''s round(...,2). Card rows carry photo_path — the member''s card-photos storage object path (server-composed, round 7). Key-stat CONFIG is never serialised. Active members only in every cohort (D-07). Internal gate: JWT member_id claim AND caller active. Exceptions: no_member_claim/forbidden.';
