-- NeoFoot migration 0040: Battlefield lineups + 80-player roster sync (phase 10.4-01).
--
-- Owner 2026-10-30: two battlefields, each 8 parties (G1..G8) x 5 slots (slot 1 =
-- party leader). Vigrid Field = Raid 1, Ruinscape = Raid 2. Default party role labels
-- seeded (Raid 1 G5/G6, Raid 2 G3/G4). All 80 real players from the owner's two
-- lineup screenshots are pre-registered into public.members and seeded into slots.
--
--   1. lineup_parties / lineup_slots tables (CHECK-constrained, PK + FK).
--      unique(member_id) on lineup_slots: one slot per player across both raids.
--   2. RLS on both tables; anon/authenticated get SELECT only (active member gate).
--      All writes happen through the SECURITY DEFINER RPCs below.
--   3. get_lineups()          — active member read: battlefields + closed roster.
--      set_lineup_slot()      — officer/owner + assert_device_bound(); atomic move/swap.
--      set_lineup_party_label() — officer/owner + assert_device_bound(); label edit.
--   4. Roster pre-registration: XAVENTAL reactivated; 39 new unclaimed members
--      (pin_hash null, char_class null, char_function 'dps', role member, active).
--      Existing matched members are preserved untouched.
--   5. Default seed: 16 parties, 80 slots (exact owner transcription), invariant DO block.
--
-- Append-only: no earlier migration is edited. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0040_battlefield_lineups.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.lineup_parties (
  battlefield text not null check (battlefield in ('vigrid_field', 'ruinscape')),
  party_index smallint not null check (party_index between 1 and 8),
  role_label text null check (role_label is null or char_length(role_label) between 1 and 40),
  updated_at timestamptz not null default now(),
  primary key (battlefield, party_index)
);

create table if not exists public.lineup_slots (
  battlefield text not null check (battlefield in ('vigrid_field', 'ruinscape')),
  party_index smallint not null check (party_index between 1 and 8),
  slot_index smallint not null check (slot_index between 1 and 5),
  member_id uuid null references public.members(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (battlefield, party_index, slot_index),
  foreign key (battlefield, party_index)
    references public.lineup_parties(battlefield, party_index) on delete cascade,
  constraint lineup_slots_unique_member unique (member_id)
);

comment on table public.lineup_parties is
  'Battlefield party headers (0040): 2 battlefields x 8 parties with an optional role label. Writes only via set_lineup_party_label().';
comment on table public.lineup_slots is
  'Battlefield slots (0040): 2 battlefields x 8 parties x 5 slots, slot 1 = party leader. member_id is UNIQUE across the table so a player occupies at most one slot. Writes only via set_lineup_slot().';

-- ---------------------------------------------------------------------------
-- 2. RLS and privilege hygiene
-- ---------------------------------------------------------------------------

alter table public.lineup_parties enable row level security;
alter table public.lineup_slots enable row level security;

revoke all on public.lineup_parties, public.lineup_slots from anon, authenticated;
grant select on public.lineup_parties, public.lineup_slots to authenticated;

drop policy if exists active_member_select_lineup_parties on public.lineup_parties;
create policy active_member_select_lineup_parties on public.lineup_parties
  for select to authenticated
  using (exists (
    select 1 from public.members m
    where m.id::text = auth.jwt()->>'member_id' and m.active
  ));

drop policy if exists active_member_select_lineup_slots on public.lineup_slots;
create policy active_member_select_lineup_slots on public.lineup_slots
  for select to authenticated
  using (exists (
    select 1 from public.members m
    where m.id::text = auth.jwt()->>'member_id' and m.active
  ));

-- ---------------------------------------------------------------------------
-- 3. Read RPC — active member; closed display-only roster fields.
--    Never serialises stats, points, OVR, key-stat config or pin_hash.
-- ---------------------------------------------------------------------------

create or replace function public.get_lineups()
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
    with roster as (
      select m.id,
             coalesce(l.nickname, m.display_name) as display_name,
             coalesce(l.char_class, m.char_class) as char_class,
             m.char_function
      from members m
      left join lateral (
        select h.nickname, h.char_class
        from member_identity_history h
        where h.member_id = m.id
        order by h.created_at desc, h.id desc
        limit 1
      ) l on true
      where m.active
        and m.discord_handle not ilike 'smoke%'
        and m.discord_handle not ilike 'dummy-%'
    ),
    slots as (
      select s.battlefield, s.party_index, s.slot_index,
             jsonb_build_object(
               'slot_index', s.slot_index,
               'member_id', s.member_id,
               'display_name', r.display_name,
               'char_class', r.char_class,
               'char_function', r.char_function
             ) as j
      from lineup_slots s
      left join roster r on r.id = s.member_id
    ),
    parties as (
      select p.battlefield, p.party_index,
             jsonb_build_object(
               'party_index', p.party_index,
               'role_label', p.role_label,
               'filled', (
                 select count(*) from lineup_slots s
                 where s.battlefield = p.battlefield
                   and s.party_index = p.party_index
                   and s.member_id is not null
               ),
               'slots', (
                 select coalesce(jsonb_agg(sl.j order by sl.slot_index), '[]'::jsonb)
                 from slots sl
                 where sl.battlefield = p.battlefield
                   and sl.party_index = p.party_index
               )
             ) as j
      from lineup_parties p
    )
    select jsonb_build_object(
      'battlefields', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'battlefield', bf.battlefield,
            'parties', (
              select coalesce(jsonb_agg(pa.j order by pa.party_index), '[]'::jsonb)
              from parties pa
              where pa.battlefield = bf.battlefield
            )
          )
          order by bf.ord
        ), '[]'::jsonb)
        from (values ('vigrid_field', 1), ('ruinscape', 2)) as bf(battlefield, ord)
      ),
      'roster', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'member_id', r.id,
            'display_name', r.display_name,
            'char_class', r.char_class,
            'char_function', r.char_function
          )
          order by lower(r.display_name)
        ), '[]'::jsonb)
        from roster r
      )
    )
  );
end;
$$;

comment on function public.get_lineups() is
  'Lineup read (0040): active members see both battlefields and the assignable roster (active, non-smoke, non-dummy). Closed display-only fields; never stats, points, OVR, key-stat config or pin_hash.';

revoke all on function public.get_lineups() from public, anon;
grant execute on function public.get_lineups() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Write RPC — set or clear one slot. Officer/owner only, device bound.
--    Moves a player already seated elsewhere atomically; when the target held
--    another player and the source was seated, the two swap.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_slot(
  p_battlefield text,
  p_party smallint,
  p_slot smallint,
  p_member uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_displaced uuid;
  v_old_bf text;
  v_old_party smallint;
  v_old_slot smallint;
begin
  perform public.assert_device_bound();

  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_battlefield not in ('vigrid_field', 'ruinscape')
     or p_party not between 1 and 8
     or p_slot not between 1 and 5
     or not exists (
       select 1 from lineup_slots s
       where s.battlefield = p_battlefield
         and s.party_index = p_party
         and s.slot_index = p_slot
     ) then
    raise exception 'invalid_lineup_slot';
  end if;

  if p_member is not null and not exists (
    select 1 from members m
    where m.id = p_member
      and m.active
      and m.discord_handle not ilike 'smoke%'
      and m.discord_handle not ilike 'dummy-%'
  ) then
    raise exception 'invalid_lineup_member';
  end if;

  select s.member_id into v_displaced
  from lineup_slots s
  where s.battlefield = p_battlefield and s.party_index = p_party and s.slot_index = p_slot
  for update;

  if p_member is null then
    update lineup_slots set member_id = null, updated_at = now()
    where battlefield = p_battlefield and party_index = p_party and slot_index = p_slot;
  else
    select s.battlefield, s.party_index, s.slot_index
      into v_old_bf, v_old_party, v_old_slot
    from lineup_slots s
    where s.member_id = p_member
    for update;

    if v_old_slot is null then
      -- Not seated anywhere: place (a displaced occupant of the target becomes unassigned).
      update lineup_slots set member_id = p_member, updated_at = now()
      where battlefield = p_battlefield and party_index = p_party and slot_index = p_slot;
    elsif v_old_bf = p_battlefield and v_old_party = p_party and v_old_slot = p_slot then
      null; -- already in this slot: no-op
    else
      -- Seated elsewhere: vacate the source first (unique member_id), place into
      -- target, then return the target's displaced occupant (if any) to the source.
      update lineup_slots set member_id = null, updated_at = now()
      where battlefield = v_old_bf and party_index = v_old_party and slot_index = v_old_slot;

      update lineup_slots set member_id = p_member, updated_at = now()
      where battlefield = p_battlefield and party_index = p_party and slot_index = p_slot;

      if v_displaced is not null then
        update lineup_slots set member_id = v_displaced, updated_at = now()
        where battlefield = v_old_bf and party_index = v_old_party and slot_index = v_old_slot;
      end if;
    end if;
  end if;

  return public.get_lineups();
end;
$$;

comment on function public.set_lineup_slot(text, smallint, smallint, uuid) is
  'Officer/owner slot write (0040): device-bound; rejects smoke, dummy or inactive members (invalid_lineup_member); a seated player is moved, and a swap happens when the target was occupied. Returns get_lineups().';

revoke all on function public.set_lineup_slot(text, smallint, smallint, uuid) from public, anon;
grant execute on function public.set_lineup_slot(text, smallint, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Write RPC — party role label. Officer/owner only, device bound.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_party_label(
  p_battlefield text,
  p_party smallint,
  p_label text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_label text := nullif(btrim(p_label), '');
begin
  perform public.assert_device_bound();

  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if v_label is not null and char_length(v_label) > 40 then
    raise exception 'invalid_lineup_label';
  end if;

  update lineup_parties set role_label = v_label, updated_at = now()
  where battlefield = p_battlefield and party_index = p_party;

  if not found then
    raise exception 'invalid_lineup_party';
  end if;

  return public.get_lineups();
end;
$$;

comment on function public.set_lineup_party_label(text, smallint, text) is
  'Officer/owner party role label write (0040): device-bound; max 40 chars; empty clears the label. Returns get_lineups().';

revoke all on function public.set_lineup_party_label(text, smallint, text) from public, anon;
grant execute on function public.set_lineup_party_label(text, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Default party structure (16 parties) and role labels.
-- ---------------------------------------------------------------------------

insert into public.lineup_parties (battlefield, party_index, role_label)
select bf.battlefield,
       p.party_index,
       case
         when bf.battlefield = 'vigrid_field' and p.party_index = 5 then 'MOBS CIMA/BAIXO'
         when bf.battlefield = 'vigrid_field' and p.party_index = 6 then 'MOBS DIREITA/ESQUERDA'
         when bf.battlefield = 'ruinscape' and p.party_index = 3 then 'MOBS CIMA/BAIXO'
         when bf.battlefield = 'ruinscape' and p.party_index = 4 then 'MOBS DIREITA/ESQUERDA'
       end
from (values ('vigrid_field'), ('ruinscape')) as bf(battlefield)
cross join generate_series(1, 8) as p(party_index)
on conflict (battlefield, party_index) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Roster pre-registration (LNUP-04).
--    7a. XAVENTAL (owner's Raid 1 G2 slot 1) is an existing inactive row: reactivate.
--    7b. The 39 real players with no existing member row become new unclaimed
--        members: pin_hash null, char_class null (no ambiguous class guessed),
--        char_function 'dps' (NOT NULL column; officers refine), role member, active.
--        Insert is guarded by a case-insensitive handle check, so a re-run is a no-op.
-- ---------------------------------------------------------------------------

update public.members set active = true
where lower(discord_handle) = 'xavental' and not active;

insert into public.members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
select v.handle, v.display, null, 'member', true, null, 'dps'
from (values
  ('lanaya', 'Lanaya'),
  ('mentos', 'mentos'),
  ('tifa', 'Tifa'),
  ('kiom', 'Kiom'),
  ('yoshiyavi', 'Yoshiyavi'),
  ('grilaum', 'Grilaum'),
  ('demongorgon', 'DEMONGORGON'),
  ('arkshim', 'Arkshim'),
  ('jonys', 'Jonys'),
  ('hard', 'Hard'),
  ('mafi', 'MAFI'),
  ('sylveon', 'Sylveon'),
  ('zsereno', 'zSereno'),
  ('patifa', 'PATIFA'),
  ('revozord', 'revOzord'),
  ('naito', 'Naito'),
  ('lavanda', 'Lavanda'),
  ('beca', 'Beca'),
  ('capah', 'CAPAH'),
  ('jauregui', 'Jauregui'),
  ('hawkarim', 'Hawkarim'),
  ('alear', 'Alear'),
  ('xsamlx', 'xSamlx'),
  ('panutexx', 'panutexx'),
  ('oden', 'Oden'),
  ('sunatzu', 'Sunatzu'),
  ('magicuzinho', 'Magicuzinho'),
  ('karyu', 'Karyu'),
  ('oninik', 'Oninik'),
  ('alael', 'Alael'),
  ('smash', 'Smash'),
  ('batatinha', 'Batatinha'),
  ('stokinha', 'Stokinha'),
  ('toka', 'TOKA'),
  ('rioot', 'RIOOT'),
  ('mirage', 'MIRAGE'),
  ('agamenom', 'agamenom'),
  ('slink', 'Slink'),
  ('rn1x', 'rN1x')
) as v(handle, display)
where not exists (
  select 1 from public.members m where lower(m.discord_handle) = lower(v.handle)
);

-- ---------------------------------------------------------------------------
-- 8. Default lineup seed: 80 slots. Each row is (battlefield, party, slot, member
--    handle). Existing members are matched by their exact discord_handle; new
--    members by the handle inserted in step 7b.
-- ---------------------------------------------------------------------------

insert into public.lineup_slots (battlefield, party_index, slot_index, member_id)
select v.battlefield, v.party_index, v.slot_index, m.id
from (values
  -- Vigrid Field (Raid 1)
  ('vigrid_field', 1, 1, 'pedromachado.pm'), ('vigrid_field', 1, 2, 'Txxx'),
  ('vigrid_field', 1, 3, 'lanaya'), ('vigrid_field', 1, 4, 'mentos'), ('vigrid_field', 1, 5, 'tifa'),
  ('vigrid_field', 2, 1, 'xAVENTAL'), ('vigrid_field', 2, 2, 'Dandelion'),
  ('vigrid_field', 2, 3, 'nomercybr3167'), ('vigrid_field', 2, 4, 'synyster0515'), ('vigrid_field', 2, 5, '0gohan1'),
  ('vigrid_field', 3, 1, 'kiom'), ('vigrid_field', 3, 2, 'yoshiyavi'),
  ('vigrid_field', 3, 3, 'grilaum'), ('vigrid_field', 3, 4, 'demongorgon'), ('vigrid_field', 3, 5, 'whantedy_67548'),
  ('vigrid_field', 4, 1, 'starkz'), ('vigrid_field', 4, 2, 'Awx1_'),
  ('vigrid_field', 4, 3, 'arkshim'), ('vigrid_field', 4, 4, 'alexandresimoes9176'), ('vigrid_field', 4, 5, 'KATYBaby'),
  ('vigrid_field', 5, 1, 'punch77'), ('vigrid_field', 5, 2, 'MaxX1'),
  ('vigrid_field', 5, 3, 'Outsider'), ('vigrid_field', 5, 4, 'upyr_drakul'), ('vigrid_field', 5, 5, 'yummytumm1'),
  ('vigrid_field', 6, 1, 'Deviling'), ('vigrid_field', 6, 2, 'jonys'),
  ('vigrid_field', 6, 3, 'daskefps'), ('vigrid_field', 6, 4, 'Notturnna'), ('vigrid_field', 6, 5, '.s1lva7'),
  ('vigrid_field', 7, 1, 'barukrocha'), ('vigrid_field', 7, 2, 'hard'),
  ('vigrid_field', 7, 3, 'soldier8828'), ('vigrid_field', 7, 4, 'mafi'), ('vigrid_field', 7, 5, 'satturne'),
  ('vigrid_field', 8, 1, 'arthurcn3'), ('vigrid_field', 8, 2, 'marcoslessa'),
  ('vigrid_field', 8, 3, 'lucasscr'), ('vigrid_field', 8, 4, 'honorsoriginal'), ('vigrid_field', 8, 5, 'dmo9362'),
  -- Ruinscape (Raid 2)
  ('ruinscape', 1, 1, '.lieno'), ('ruinscape', 1, 2, 'sylveon'),
  ('ruinscape', 1, 3, 'zsereno'), ('ruinscape', 1, 4, 'patifa'), ('ruinscape', 1, 5, 'revozord'),
  ('ruinscape', 2, 1, 'naito'), ('ruinscape', 2, 2, 'lavanda'),
  ('ruinscape', 2, 3, 'quezzu'), ('ruinscape', 2, 4, 'beca'), ('ruinscape', 2, 5, 'pai_de_menina'),
  ('ruinscape', 3, 1, 'capah'), ('ruinscape', 3, 2, 'jauregui'),
  ('ruinscape', 3, 3, 'hawkarim'), ('ruinscape', 3, 4, 'alear'), ('ruinscape', 3, 5, 'Karlamayara'),
  ('ruinscape', 4, 1, 'ChaOz'), ('ruinscape', 4, 2, 'arturbrosa'),
  ('ruinscape', 4, 3, 'hyxo'), ('ruinscape', 4, 4, 'tiowelden'), ('ruinscape', 4, 5, 'xsamlx'),
  ('ruinscape', 5, 1, 'panutexx'), ('ruinscape', 5, 2, 'oden'),
  ('ruinscape', 5, 3, 'YuriJr'), ('ruinscape', 5, 4, 'sunatzu'), ('ruinscape', 5, 5, 'magicuzinho'),
  ('ruinscape', 6, 1, 'Atillos'), ('ruinscape', 6, 2, 'karyu'),
  ('ruinscape', 6, 3, 'oninik'), ('ruinscape', 6, 4, 'Banzo'), ('ruinscape', 6, 5, 'alael'),
  ('ruinscape', 7, 1, 'smash'), ('ruinscape', 7, 2, 'batatinha'),
  ('ruinscape', 7, 3, 'Umbreon'), ('ruinscape', 7, 4, 'stokinha'), ('ruinscape', 7, 5, 'toka'),
  ('ruinscape', 8, 1, 'rioot'), ('ruinscape', 8, 2, 'mirage'),
  ('ruinscape', 8, 3, 'agamenom'), ('ruinscape', 8, 4, 'slink'), ('ruinscape', 8, 5, 'rn1x')
) as v(battlefield, party_index, slot_index, handle)
join public.members m on m.discord_handle = v.handle
on conflict (battlefield, party_index, slot_index) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Seed invariants: 16 parties, 80 filled slots, no smoke/dummy/inactive member
--    assigned, and every seeded player unique (unique(member_id) enforces it).
-- ---------------------------------------------------------------------------

do $$
declare
  v_parties int;
  v_slots int;
  v_empty int;
  v_bad int;
begin
  select count(*) into v_parties from public.lineup_parties;
  select count(*), count(*) filter (where member_id is null)
    into v_slots, v_empty
  from public.lineup_slots;
  select count(*) into v_bad
  from public.lineup_slots s
  join public.members m on m.id = s.member_id
  where m.discord_handle ilike 'smoke%'
     or m.discord_handle ilike 'dummy-%'
     or not m.active;

  if v_parties <> 16 then
    raise exception 'lineup seed: expected 16 parties, got %', v_parties;
  end if;
  if v_slots <> 80 or v_empty <> 0 then
    raise exception 'lineup seed: expected 80 filled slots, got % slots / % empty', v_slots, v_empty;
  end if;
  if v_bad <> 0 then
    raise exception 'lineup seed: % seeded slots hold a smoke, dummy or inactive member', v_bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0040', 'battlefield_lineups', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
