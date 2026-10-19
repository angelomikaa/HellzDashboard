-- get_promotion photo_path (07.2-05 checkpoint round 7, owner decision 3 —
-- "the card preview from the painel does not look the same as the one in
-- destaques"): the promotion payload gains the member's card-photos STORAGE
-- OBJECT PATH so Destaques cards show the member's SUBMITTED photo — the
-- same fallback chain as the Painel own-card (photo → class portrait →
-- ASST-01 monogram, applied client-side).
--
-- UNNUMBERED live apply via scripts/apply-seed.mjs (migration 0014 is
-- RESERVED for Phase 8; the card-photos-storage.sql precedent). The
-- committed artifact carries NO secrets.
--
-- Supersession discipline (0013's own standard): a FULL byte-faithful copy
-- of the 0013 get_promotion body (0013:598-744) with EXACTLY ONE change —
-- the cards aggregation's jsonb_build_object gains 'photo_path'. The path
-- is SERVER-COMPOSED from the member id (`card-photos/<member_id>/card.jpg`)
-- — never a public URL (the bucket is private; its RLS grants ACTIVE members
-- read: card-photos-storage.sql — showcase visibility IS the feature). The
-- client fetches it as a BLOB (T-072-13 canvas-taint discipline) and falls
-- back to the class portrait when the object doesn't exist (no upload yet →
-- 404 → designed state, no existence probe in the RPC — keeps the function
-- free of storage.objects dependencies so the payload can never break on
-- storage internals). Key-stat CONFIG is still never serialised; the
-- highlight field list {stat_key,label,label_short,value_type,value,points}
-- is unchanged (smoke-card probe 7d holds; probe 7f locks the new field).
-- All gates/cohort/top-5/omitted-classes behavior byte-preserved.

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
      -- 0010:282-286 shape.
      select l.member_id, l.stat_key, l.value, cm.char_function
      from latest l
      join class_members cm on cm.id = l.member_id
    ),
    cmp as (
      -- 0010:287-297 shape: per (member, stat), n = members of the SAME
      -- function holding the stat; below/ties include the member.
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b on b.stat_key = a.stat_key and b.char_function = a.char_function
      group by a.member_id, a.stat_key
    ),
    ovr_rows as (
      -- 0010:308-326 OVR lateral verbatim (exactly-6 key stats, member holds
      -- all 6, each with n >= 3, floor-51 rescale) across ALL classes.
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
      -- 07.2 D-13 SUPERSESSION: the old top-6-by-points subselect is
      -- replaced by a join over class_key_stats for the card's class —
      -- every card's highlights are the class's key stats (same set for
      -- every card of that class), ordered by sc.label (stable). This is
      -- the SANCTIONED key-stat reveal (07.2-CONTEXT D-13; RNK-02
      -- re-baselined): the closed field list
      -- {stat_key,label,label_short,value_type,value,points} carries key
      -- identity and per-stat values, but NEVER key-stat config
      -- (weights/toggles/management data). Points stay null when the
      -- stat's cohort has n < 3. Tier banding stays CLIENT-side
      -- (tierForOvr): the RPC returns the ovr value only.
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
                 (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99 as points
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
                 -- 07.2-05 round 7 (THE one change): the member's
                 -- card-photos storage object path — server-composed from
                 -- the member id, fetched by the client as a blob (the
                 -- private bucket's RLS grants active members read).
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
  'Member-invocable promotion payload (SHWC-02; 07.2 D-13 supersession): per class, top-5-by-OVR cards whose highlights are the class''s KEY STATS (same set for every card of that class, ordered by label — the sanctioned 07.2 D-03/D-13 reveal; RNK-02 re-baselined) with the closed field list {stat_key,label,label_short,value_type,value,points}. Card rows also carry photo_path — the member''s card-photos storage object path (server-composed, 07.2-05 round 7 photo consistency: Destaques shows the submitted photo; the client fetches it as a blob under the bucket''s active-members read RLS). Key-stat CONFIG (weights/toggles/management data) is never serialised. Active members only in every cohort (06-CONTEXT D-07). Internal gate: JWT member_id claim AND caller active. Exceptions: no_member_claim/forbidden.';
