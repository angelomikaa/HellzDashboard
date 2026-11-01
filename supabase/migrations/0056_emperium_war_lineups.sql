-- NeoFoot migration 0056: Emperium War lineup mode (owner 2026-11-01).
--
-- Owner request: the Escalação tab needs a second war mode, the Guerra do
-- Emperium. Unlike Vingança de Vigrid (two fixed battlefields, 8 parties x 5
-- slots each), an officer can divide the guild into 2..8 raids. The guild
-- currently uses 3 raids, so 3 are seeded; the officer can add up to 6 more
-- (max 8) and remove empty extras (min 2). Each raid keeps the established
-- 8 parties x 5 slots structure.
--
-- Append-only. Existing Vigrid rows are preserved: war_mode defaults to
-- 'vigrid' and raid_index is derived from the two existing battlefield ids.
-- The old 4-arg RPCs remain as wrappers over the new mode-aware RPCs, so an
-- already-deployed client keeps working during the rollout.
--
-- Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0056_emperium_war_lineups.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. War-mode dimension on the existing tables.
--    vigrid:    raid 1 = vigrid_field, raid 2 = ruinscape
--    emperium:  raid N = emperium_raid_N (N = 1..8)
-- ---------------------------------------------------------------------------

alter table public.lineup_parties
  add column if not exists war_mode text not null default 'vigrid',
  add column if not exists raid_index smallint;

alter table public.lineup_slots
  add column if not exists war_mode text not null default 'vigrid',
  add column if not exists raid_index smallint;

update public.lineup_parties
set raid_index = case battlefield
  when 'vigrid_field' then 1
  when 'ruinscape' then 2
end
where raid_index is null;

update public.lineup_slots
set raid_index = case battlefield
  when 'vigrid_field' then 1
  when 'ruinscape' then 2
end
where raid_index is null;

alter table public.lineup_parties alter column raid_index set not null;
alter table public.lineup_slots alter column raid_index set not null;

-- The 0040 battlefield CHECKs only knew the two Vigrid ids; replace them with
-- a mode-aware constraint. Keep the party/slot range checks untouched.
alter table public.lineup_parties drop constraint if exists lineup_parties_battlefield_check;
alter table public.lineup_slots drop constraint if exists lineup_slots_battlefield_check;

-- Drop and rebuild keys/FKs so every uniqueness rule is scoped per war mode.
alter table public.lineup_slots drop constraint if exists lineup_slots_battlefield_party_index_fkey;
alter table public.lineup_slots drop constraint if exists lineup_slots_pkey;
alter table public.lineup_slots drop constraint if exists lineup_slots_unique_member;
alter table public.lineup_parties drop constraint if exists lineup_parties_pkey;

alter table public.lineup_parties
  add constraint lineup_parties_pkey primary key (war_mode, battlefield, party_index),
  add constraint lineup_parties_war_mode_check check (war_mode in ('vigrid', 'emperium')),
  add constraint lineup_parties_raid_index_check check (raid_index between 1 and 8),
  add constraint lineup_parties_mode_raid_check check (
    (war_mode = 'vigrid' and (
      (raid_index = 1 and battlefield = 'vigrid_field')
      or (raid_index = 2 and battlefield = 'ruinscape')
    ))
    or (war_mode = 'emperium' and battlefield = 'emperium_raid_' || raid_index)
  ),
  add constraint lineup_parties_mode_raid_party_key unique (war_mode, raid_index, party_index);

alter table public.lineup_slots
  add constraint lineup_slots_pkey primary key (war_mode, battlefield, party_index, slot_index),
  add constraint lineup_slots_unique_member unique (war_mode, member_id),
  add constraint lineup_slots_war_mode_check check (war_mode in ('vigrid', 'emperium')),
  add constraint lineup_slots_raid_index_check check (raid_index between 1 and 8),
  add constraint lineup_slots_mode_raid_check check (
    (war_mode = 'vigrid' and (
      (raid_index = 1 and battlefield = 'vigrid_field')
      or (raid_index = 2 and battlefield = 'ruinscape')
    ))
    or (war_mode = 'emperium' and battlefield = 'emperium_raid_' || raid_index)
  ),
  add constraint lineup_slots_party_fkey foreign key (war_mode, battlefield, party_index)
    references public.lineup_parties(war_mode, battlefield, party_index) on delete cascade;

comment on table public.lineup_parties is
  'Escalação party headers (0040/0056): war_mode (vigrid|emperium) x raid x 8 parties with an optional role label. Emperium raids are 1..8. Writes only via the SECURITY DEFINER RPCs.';
comment on table public.lineup_slots is
  'Escalação slots (0040/0056): war_mode x raid x 8 parties x 5 slots, slot 1 = party leader. member_id is UNIQUE per war_mode, so a player occupies at most one slot in each mode.';

-- ---------------------------------------------------------------------------
-- 2. Per-mode raid count (Emperium variable 2..8; Vigrid fixed at 2).
-- ---------------------------------------------------------------------------

create table if not exists public.lineup_war_config (
  war_mode text primary key check (war_mode in ('vigrid', 'emperium')),
  raid_count smallint not null check (raid_count between 2 and 8),
  updated_at timestamptz not null default now()
);

alter table public.lineup_war_config enable row level security;
revoke all on public.lineup_war_config from anon, authenticated;

insert into public.lineup_war_config (war_mode, raid_count)
values ('vigrid', 2), ('emperium', 3)
on conflict (war_mode) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Read RPC — active members see one war mode + the assignable roster.
--    Closed field list: never stats, points, OVR, key-stat config or pin_hash.
-- ---------------------------------------------------------------------------

create or replace function public.get_lineups_mode(p_war_mode text default 'vigrid')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'vigrid');
  v_member uuid;
  v_raid_count smallint;
begin
  if v_mode not in ('vigrid', 'emperium') then
    raise exception 'invalid_war_mode';
  end if;

  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  select c.raid_count into v_raid_count
  from lineup_war_config c
  where c.war_mode = v_mode;
  if v_raid_count is null then
    v_raid_count := case v_mode when 'vigrid' then 2 else 3 end;
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
      select s.war_mode, s.battlefield, s.raid_index, s.party_index, s.slot_index,
             jsonb_build_object(
               'slot_index', s.slot_index,
               'member_id', s.member_id,
               'display_name', coalesce(l.nickname, m.display_name),
               'char_class', coalesce(l.char_class, m.char_class),
               'char_function', m.char_function
             ) as j
      from lineup_slots s
      left join members m on m.id = s.member_id
      left join lateral (
        select h.nickname, h.char_class
        from member_identity_history h
        where h.member_id = m.id
        order by h.created_at desc, h.id desc
        limit 1
      ) l on true
      where s.war_mode = v_mode
    ),
    parties as (
      select p.war_mode, p.battlefield, p.raid_index, p.party_index,
             jsonb_build_object(
               'party_index', p.party_index,
               'role_label', p.role_label,
               'filled', (
                 select count(*) from lineup_slots s
                 where s.war_mode = p.war_mode
                   and s.battlefield = p.battlefield
                   and s.party_index = p.party_index
                   and s.member_id is not null
               ),
               'slots', (
                 select coalesce(jsonb_agg(sl.j order by sl.slot_index), '[]'::jsonb)
                 from slots sl
                 where sl.war_mode = p.war_mode
                   and sl.battlefield = p.battlefield
                   and sl.party_index = p.party_index
               )
             ) as j
      from lineup_parties p
      where p.war_mode = v_mode
    ),
    grouped as (
      select pa.battlefield, pa.raid_index,
             jsonb_agg(pa.j order by pa.party_index) as parties
      from parties pa
      group by pa.battlefield, pa.raid_index
    )
    select jsonb_build_object(
      'war_mode', v_mode,
      'raid_count', v_raid_count,
      'min_raids', 2,
      'max_raids', 8,
      'battlefields', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'battlefield', g.battlefield,
            'raid_index', g.raid_index,
            'parties', g.parties
          )
          order by g.raid_index
        ), '[]'::jsonb)
        from grouped g
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
$function$;

comment on function public.get_lineups_mode(text) is
  'Escalação read (0056): active members read one war mode (vigrid|emperium), its raid count and the assignable roster. Closed display-only fields; never stats, points, OVR, key-stat config or pin_hash.';

revoke all on function public.get_lineups_mode(text) from public, anon;
grant execute on function public.get_lineups_mode(text) to authenticated;

-- Backward-compatible Vigrid reader for the deployed client.
create or replace function public.get_lineups()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select public.get_lineups_mode('vigrid')
$function$;

revoke all on function public.get_lineups() from public, anon;
grant execute on function public.get_lineups() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Slot write RPC — officer/owner only, device bound, scoped to one mode.
--    Moves a seated player within the mode; swaps when the target was occupied.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_slot_mode(
  p_war_mode text,
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
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'vigrid');
  v_displaced uuid;
  v_old_bf text;
  v_old_party smallint;
  v_old_slot smallint;
  v_raid_index smallint;
  v_raid_count smallint;
begin
  if v_mode not in ('vigrid', 'emperium') then
    raise exception 'invalid_war_mode';
  end if;

  perform public.assert_device_bound();

  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  select p.raid_index into v_raid_index
  from lineup_parties p
  where p.war_mode = v_mode
    and p.battlefield = p_battlefield
    and p.party_index = p_party;

  select c.raid_count into v_raid_count
  from lineup_war_config c
  where c.war_mode = v_mode;
  if v_raid_count is null then
    v_raid_count := case v_mode when 'vigrid' then 2 else 3 end;
  end if;

  if v_raid_index is null
     or v_raid_index > v_raid_count
     or p_slot is null
     or p_slot not between 1 and 5
     or not exists (
       select 1 from lineup_slots s
       where s.war_mode = v_mode
         and s.battlefield = p_battlefield
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

  -- Lock the target row and the member's current row in one deterministic pass.
  perform 1
  from lineup_slots s
  where s.war_mode = v_mode
    and (
      (s.battlefield = p_battlefield and s.party_index = p_party and s.slot_index = p_slot)
      or (p_member is not null and s.member_id = p_member)
    )
  order by s.battlefield, s.party_index, s.slot_index
  for update;

  select s.member_id into v_displaced
  from lineup_slots s
  where s.war_mode = v_mode
    and s.battlefield = p_battlefield
    and s.party_index = p_party
    and s.slot_index = p_slot;

  if p_member is null then
    update lineup_slots set member_id = null, updated_at = now()
    where war_mode = v_mode
      and battlefield = p_battlefield
      and party_index = p_party
      and slot_index = p_slot;
  else
    select s.battlefield, s.party_index, s.slot_index
      into v_old_bf, v_old_party, v_old_slot
    from lineup_slots s
    where s.war_mode = v_mode and s.member_id = p_member;

    if v_old_slot is null then
      -- Not seated in this mode: place (a displaced occupant becomes unassigned).
      update lineup_slots set member_id = p_member, updated_at = now()
      where war_mode = v_mode
        and battlefield = p_battlefield
        and party_index = p_party
        and slot_index = p_slot;
    elsif v_old_bf = p_battlefield and v_old_party = p_party and v_old_slot = p_slot then
      null; -- already in this slot: no-op
    else
      -- Seated elsewhere in this mode: vacate the source first, place into the
      -- target, then return the target's displaced occupant (if any) to the source.
      update lineup_slots set member_id = null, updated_at = now()
      where war_mode = v_mode
        and battlefield = v_old_bf
        and party_index = v_old_party
        and slot_index = v_old_slot;

      update lineup_slots set member_id = p_member, updated_at = now()
      where war_mode = v_mode
        and battlefield = p_battlefield
        and party_index = p_party
        and slot_index = p_slot;

      if v_displaced is not null then
        update lineup_slots set member_id = v_displaced, updated_at = now()
        where war_mode = v_mode
          and battlefield = v_old_bf
          and party_index = v_old_party
          and slot_index = v_old_slot;
      end if;
    end if;
  end if;

  return public.get_lineups_mode(v_mode);
end;
$function$;

comment on function public.set_lineup_slot_mode(text, text, smallint, smallint, uuid) is
  'Officer/owner slot write (0056): device-bound; scoped to one war mode; rejects smoke, dummy or inactive members (invalid_lineup_member); a seated player is moved, and a swap happens when the target was occupied. Returns get_lineups_mode().';

revoke all on function public.set_lineup_slot_mode(text, text, smallint, smallint, uuid) from public, anon;
grant execute on function public.set_lineup_slot_mode(text, text, smallint, smallint, uuid) to authenticated;

-- Backward-compatible Vigrid writer for the deployed client.
create or replace function public.set_lineup_slot(
  p_battlefield text,
  p_party smallint,
  p_slot smallint,
  p_member uuid default null
)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $function$
  select public.set_lineup_slot_mode('vigrid', p_battlefield, p_party, p_slot, p_member)
$function$;

revoke all on function public.set_lineup_slot(text, smallint, smallint, uuid) from public, anon;
grant execute on function public.set_lineup_slot(text, smallint, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Party role-label write RPC — officer/owner only, device bound.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_party_label_mode(
  p_war_mode text,
  p_battlefield text,
  p_party smallint,
  p_label text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'vigrid');
  v_label text := nullif(btrim(p_label), '');
begin
  if v_mode not in ('vigrid', 'emperium') then
    raise exception 'invalid_war_mode';
  end if;

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
  where war_mode = v_mode
    and battlefield = p_battlefield
    and party_index = p_party;

  if not found then
    raise exception 'invalid_lineup_party';
  end if;

  return public.get_lineups_mode(v_mode);
end;
$function$;

comment on function public.set_lineup_party_label_mode(text, text, smallint, text) is
  'Officer/owner party role label write (0056): device-bound; scoped to one war mode; max 40 chars; empty clears the label. Returns get_lineups_mode().';

revoke all on function public.set_lineup_party_label_mode(text, text, smallint, text) from public, anon;
grant execute on function public.set_lineup_party_label_mode(text, text, smallint, text) to authenticated;

-- Backward-compatible Vigrid label writer for the deployed client.
create or replace function public.set_lineup_party_label(
  p_battlefield text,
  p_party smallint,
  p_label text default null
)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $function$
  select public.set_lineup_party_label_mode('vigrid', p_battlefield, p_party, p_label)
$function$;

revoke all on function public.set_lineup_party_label(text, smallint, text) from public, anon;
grant execute on function public.set_lineup_party_label(text, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Raid-count write RPC — Emperium only, officer/owner, device bound.
--    Adding creates the missing 8 parties x 5 slots. Removing is allowed only
--    when the raids being removed are empty (no data loss).
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_raid_count(
  p_war_mode text,
  p_raid_count smallint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'vigrid');
  v_raid smallint;
begin
  if v_mode not in ('vigrid', 'emperium') then
    raise exception 'invalid_war_mode';
  end if;

  perform public.assert_device_bound();

  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_raid_count is null or p_raid_count < 2 or p_raid_count > 8 then
    raise exception 'invalid_lineup_raid_count';
  end if;

  -- Vigrid deliberately stays at its two fixed raids.
  if v_mode = 'vigrid' then
    if p_raid_count <> 2 then
      raise exception 'invalid_lineup_raid_count';
    end if;
    insert into lineup_war_config (war_mode, raid_count)
    values ('vigrid', 2)
    on conflict (war_mode) do update set raid_count = 2, updated_at = now();
    return public.get_lineups_mode('vigrid');
  end if;

  if exists (
    select 1 from lineup_slots s
    where s.war_mode = 'emperium'
      and s.raid_index > p_raid_count
      and s.member_id is not null
  ) then
    raise exception 'lineup_raid_not_empty';
  end if;

  -- Ensure every raid up to the requested count exists (idempotent repair/creation).
  for v_raid in 1..p_raid_count loop
    insert into lineup_parties (war_mode, battlefield, raid_index, party_index)
    select 'emperium', 'emperium_raid_' || v_raid, v_raid, g
    from generate_series(1, 8) as g
    on conflict (war_mode, battlefield, party_index) do nothing;

    insert into lineup_slots (war_mode, battlefield, raid_index, party_index, slot_index)
    select 'emperium', 'emperium_raid_' || v_raid, v_raid, g, s
    from generate_series(1, 8) as g
    cross join generate_series(1, 5) as s
    on conflict (war_mode, battlefield, party_index, slot_index) do nothing;
  end loop;

  delete from lineup_parties
  where war_mode = 'emperium' and raid_index > p_raid_count;

  insert into lineup_war_config (war_mode, raid_count)
  values ('emperium', p_raid_count)
  on conflict (war_mode) do update set raid_count = excluded.raid_count, updated_at = now();

  return public.get_lineups_mode('emperium');
end;
$function$;

comment on function public.set_lineup_raid_count(text, smallint) is
  'Officer/owner raid-count write (0056): Emperium only, device-bound, 2..8 raids. Adding seeds the missing parties/slots; removing is refused while the removed raids still have seated members (lineup_raid_not_empty). Returns get_lineups_mode().';

revoke all on function public.set_lineup_raid_count(text, smallint) from public, anon;
grant execute on function public.set_lineup_raid_count(text, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Seed the three Emperium raids the guild currently uses (empty slots).
--    Vigrid rows are untouched; the config already exists from step 2.
-- ---------------------------------------------------------------------------

insert into public.lineup_parties (war_mode, battlefield, raid_index, party_index)
select 'emperium', 'emperium_raid_' || r, r, p
from generate_series(1, 3) as r
cross join generate_series(1, 8) as p
on conflict (war_mode, battlefield, party_index) do nothing;

insert into public.lineup_slots (war_mode, battlefield, raid_index, party_index, slot_index)
select 'emperium', 'emperium_raid_' || r, r, p, s
from generate_series(1, 3) as r
cross join generate_series(1, 8) as p
cross join generate_series(1, 5) as s
on conflict (war_mode, battlefield, party_index, slot_index) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Seed invariants.
-- ---------------------------------------------------------------------------

do $$
declare
  v_vigrid_parties int;
  v_vigrid_slots int;
  v_vigrid_filled int;
  v_emperium_parties int;
  v_emperium_slots int;
  v_emperium_filled int;
  v_mode_bad int;
begin
  select count(*) into v_vigrid_parties from public.lineup_parties where war_mode = 'vigrid';
  select count(*), count(member_id) into v_vigrid_slots, v_vigrid_filled
  from public.lineup_slots where war_mode = 'vigrid';
  select count(*) into v_emperium_parties from public.lineup_parties where war_mode = 'emperium';
  select count(*), count(member_id) into v_emperium_slots, v_emperium_filled
  from public.lineup_slots where war_mode = 'emperium';

  select count(*) into v_mode_bad
  from public.lineup_slots s
  join public.lineup_parties p
    on p.war_mode = s.war_mode
   and p.battlefield = s.battlefield
   and p.party_index = s.party_index
  where p.raid_index <> s.raid_index;

  if v_vigrid_parties <> 16 or v_vigrid_slots <> 80 then
    raise exception '0056: expected 16 Vigrid parties / 80 slots, got % / %', v_vigrid_parties, v_vigrid_slots;
  end if;
  if v_vigrid_slots <> 80 then
    raise exception '0056: expected 80 Vigrid slots, got %', v_vigrid_slots;
  end if;
  if v_emperium_parties <> 24 or v_emperium_slots <> 120 then
    raise exception '0056: expected 24 Emperium parties / 120 slots, got % / %', v_emperium_parties, v_emperium_slots;
  end if;
  if v_emperium_filled <> 0 then
    raise exception '0056: expected an empty Emperium seed, got % filled slots', v_emperium_filled;
  end if;
  if v_mode_bad <> 0 then
    raise exception '0056: % slots carry a raid_index that disagrees with their party', v_mode_bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Bookkeeping + PostgREST reload.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0056', 'emperium_war_lineups', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
