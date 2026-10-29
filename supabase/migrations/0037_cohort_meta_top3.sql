-- NeoFoot migration 0037: meta / non-viable cohort split + Início Top 3 per cohort.
--
-- Owner decision 2026-10-28 (two parts):
--   1. The class/function cohorts we created are not equally playable. Exactly
--      TWENTY-THREE of them are the current meta and are the only cohorts that
--      deserve data shaping (the smoke primers target them); the other sixteen
--      keyed combos are non-viable "until second order" and are forgotten.
--      The split must persist in the database, not in a script constant.
--   2. Início ("Os Impecáveis da Hellz") stops showing EVERY platinum card of a
--      class: it shows at most the TOP 3 cards PER (class, function) cohort.
--
-- This migration therefore:
--   1. creates public.class_cohorts (class_name, char_function, meta) — the ONE
--      source of truth for the split. meta defaults to FALSE: a cohort is only
--      meta once an officer designates it (the owner's list is authoritative and
--      a new combo must be opted in, never silently exposed on the landing);
--   2. seeds the owner's 23 meta combos (meta = true) and the 16 remaining keyed
--      combos (meta = false), idempotently re-synced on re-run;
--   3. replaces get_promotion and get_promotion_public with byte-faithful
--      supersessions of the live 0029 bodies whose ONLY changes are
--      (a) row_number() partitions by char_class AND char_function and
--          rn <= 3 (was: partition by char_class, rn <= 5) and
--      (b) the ranked set keeps META cohorts only (class_cohorts join).
--      Payload shape, field lists, ordering, photo_path composition, tier
--      semantics and the client's platinum filter are untouched — a class with
--      several meta cohorts keeps ONE section (the client keys sections by
--      class_name) carrying up to 3 cards per cohort, ordered by OVR desc.
--
-- Scope: Início only. The Ranking boards (role_rank / class_top5) still rank
-- every class and function — non-viable builds remain visible internally, they
-- just never claim a showcase slot.
--
-- Leak discipline (RNK-02 / D-03): class_cohorts is configuration. RLS is
-- deny-all for members (exactly like class_key_stats, 0002:44 + 0009:30-37);
-- only ACTIVE staff may select rows, and no RPC ever serialises the flag —
-- get_promotion/get_promotion_public read it INSIDE a SECURITY DEFINER body,
-- which bypasses RLS as the table owner.
--
-- The trailing NOTIFY matters: migrations are applied through the Management
-- API Run Query endpoint, which does not emit PostgREST's schema-reload
-- notification (0035 lesson) — a just-replaced RPC can answer "no function
-- matches" until the next DDL.
--
-- Append-only: 0001-0036 are never edited in place; create or replace only,
-- exact signatures, no function is dropped.
-- Apply (plan 10.2-01): node scripts/apply-seed.mjs supabase/migrations/0037_cohort_meta_top3.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. class_cohorts — the persisted meta / non-viable split.
--    Primary key = the cohort identity (class_name, char_function), the same
--    pair every RPC already uses to scope key stats and rankings.
-- ---------------------------------------------------------------------------

create table if not exists public.class_cohorts (
  class_name text not null,
  char_function text not null,
  meta boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (class_name, char_function),
  constraint class_cohorts_function_check
    check (char_function in ('dps', 'mdps', 'suporte'))
);

comment on table public.class_cohorts is
  'Persisted cohort viability split (owner decision 2026-10-28). meta = true marks a currently playable (class, function) build — the only cohorts the Início showcase ranks and the only ones the smoke primers target. meta = false keeps a keyed-but-non-viable combo out of the showcase until the owner revisits it ("forgotten until second order"). Configuration data: RLS deny-all for members, staff-select only, never serialised in any RPC payload.';
comment on column public.class_cohorts.meta is
  'true = current meta cohort (showcased, primed with smoke data). false = non-viable for now. Defaults to false so a newly added combo must be explicitly promoted.';

alter table public.class_cohorts enable row level security;

-- Deny-all for members: no policy for the plain member role (0002:44 pattern).
-- Officers/owners may read the split (admin surfaces); nothing writes rows from
-- a client credential — migrations own this table.
grant select on public.class_cohorts to authenticated;

-- Belt and braces: this project's default privileges grant ALL on new public
-- tables to anon/authenticated, so the write paths (and anon's read) are
-- revoked explicitly. RLS already answers zero rows for a member and rejects a
-- member insert, but configuration data must not depend on a future policy
-- slip. get_promotion_public reads this table inside a SECURITY DEFINER body
-- (owner: postgres), so revoking anon changes nothing for the landing.
revoke insert, update, delete on public.class_cohorts from anon, authenticated;
revoke select on public.class_cohorts from anon;

drop policy if exists staff_select_cohorts on public.class_cohorts;
create policy staff_select_cohorts on public.class_cohorts
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

-- ---------------------------------------------------------------------------
-- 2. Seed the split: 23 meta combos (owner list, pt-BR -> canonical catalog
--    keys) + the 16 other keyed combos as non-viable. Upsert so a re-run
--    reconciles the flags instead of duplicating rows.
-- ---------------------------------------------------------------------------

insert into public.class_cohorts (class_name, char_function, meta) values
  -- Algoz Físico / Mágico
  ('Assassin Cross', 'dps',            true),
  ('Assassin Cross', 'mdps',           true),
  -- Menestrel Suporte
  ('Bard',           'suporte',        true),
  -- Criador Físico / Mágico / Suporte
  ('Biochemist',     'dps',            true),
  ('Biochemist',     'mdps',           true),
  ('Biochemist',     'suporte',        true),
  -- Mestre Físico
  ('Champion',       'dps',            true),
  -- Cigana Suporte
  ('Gypsy',          'suporte',        true),
  -- Sumo Sacerdote Suporte
  ('High Priest',    'suporte',        true),
  -- Arquimago Mágico / Suporte
  ('High Wizard',    'mdps',           true),
  ('High Wizard',    'suporte',        true),
  -- Lorde Físico
  ('Lord Knight',    'dps',            true),
  -- Mestre Ferreiro Físico
  ('Mastersmith',    'dps',            true),
  -- Paladino Físico / Suporte
  ('Paladin',        'dps',            true),
  ('Paladin',        'suporte',        true),
  -- Professor Mágico / Suporte
  ('Professor',      'mdps',           true),
  ('Professor',      'suporte',        true),
  -- Insurgente Físico
  ('Rebellion',      'dps',            true),
  -- Atirador de Elite Físico
  ('Sniper',         'dps',            true),
  -- Desordeiro Físico
  ('Stalker',        'dps',            true),
  -- Invocador Físico / Mágico / Suporte
  ('Summoner',       'dps',            true),
  ('Summoner',       'mdps',           true),
  ('Summoner',       'suporte',        true),
  -- ---- non-viable keyed combos (kept out of the showcase) -----------------
  ('Assassin Cross', 'suporte',        false),
  ('Bard',           'dps',            false),
  ('Bard',           'mdps',           false),
  ('Gypsy',          'dps',            false),
  ('Gypsy',          'mdps',           false),
  ('High Priest',    'dps',            false),
  ('High Priest',    'mdps',           false),
  ('High Wizard',    'dps',            false),
  ('Lord Knight',    'mdps',           false),
  ('Lord Knight',    'suporte',        false),
  ('Mastersmith',    'mdps',           false),
  ('Mastersmith',    'suporte',        false),
  ('Paladin',        'mdps',           false),
  ('Professor',      'dps',            false),
  ('Sniper',         'mdps',           false),
  ('Sniper',         'suporte',        false)
on conflict (class_name, char_function) do update
  set meta = excluded.meta,
      updated_at = now();

-- Seed invariants: every class exists in the registry (a typo would silently
-- create a cohort no member can ever hold) and the split matches the owner's
-- counts (23 meta + 16 non-viable keyed combos).
do $$
declare
  v_meta int;
  v_dark int;
begin
  if exists (
    select 1 from public.class_cohorts cc
    where not exists (select 1 from public.classes c where c.class_name = cc.class_name)
  ) then
    raise exception 'class_cohorts references an unknown class';
  end if;

  select count(*) filter (where meta), count(*) filter (where not meta)
    into v_meta, v_dark
  from public.class_cohorts;

  if v_meta <> 23 or v_dark <> 16 then
    raise exception 'class_cohorts seed mismatch: % meta / % non-viable (expected 23 / 16)',
      v_meta, v_dark;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. get_promotion — Início showcase for members (byte-faithful 0029 body).
--    Changes: the ranked CTE is now top3 over (char_class, char_function) and
--    restricted to META cohorts; rn <= 3 in the aggregating select.
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
    -- 0037: top 3 PER COHORT, meta cohorts only (owner decision 2026-10-28).
    top3 as (
      select char_class, id, display_name, char_function, ovr,
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
                 'photo_path', 'card-photos/' || t.id::text || '/card.jpg',
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top3 t
      join hl on hl.id = t.id
      where t.rn <= 3
      group by t.char_class
    ) cards
  );
end;
$$;

comment on function public.get_promotion() is
  'Members-only Início showcase (0014 + 0028 + 0029 + 0037): per class, the TOP 3 by OVR of EACH meta (class, function) cohort — class_cohorts.meta gates the ranking, so non-viable combos never claim a showcase slot and a class with several meta cohorts keeps one section with up to 3 cards per cohort. Highlights are the class''s KEY STATS with the closed field list {stat_key,label,label_short,value_type,value,points}. photo_path is the member card-photos object key. Key-stat CONFIG and the cohort flags are never serialised.';

revoke all on function public.get_promotion() from public;
grant execute on function public.get_promotion() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_promotion_public — identical body, member gate removed (anon landing).
-- ---------------------------------------------------------------------------

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
    -- 0037: top 3 PER COHORT, meta cohorts only (owner decision 2026-10-28).
    top3 as (
      select char_class, id, display_name, char_function, ovr,
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
                 'photo_path', 'card-photos/' || t.id::text || '/card.jpg',
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top3 t
      join hl on hl.id = t.id
      where t.rn <= 3
      group by t.char_class
    ) cards
  );
end;
$$;

comment on function public.get_promotion_public() is
  'Public landing Início showcase (owner decisions 2026-10-24 + 2026-10-28): identical body to get_promotion with the member gate removed - anon-callable, active members only in the data, top 3 by OVR PER meta (class, function) cohort only (class_cohorts.meta). Same closed field list; key-stat CONFIG and cohort flags are never serialised.';

revoke all on function public.get_promotion_public() from public;
grant execute on function public.get_promotion_public() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Bookkeeping: record 0037 so a future CLI push never re-runs it
--    (0012/0028/0029/0036 pattern), then reload the PostgREST schema cache.
--    The Management API Run Query endpoint never emits the reload NOTIFY
--    itself (0035 lesson): without this, a just-replaced RPC answers
--    "no function matches" until the next DDL.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0037', 'cohort_meta_top3', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
