-- NeoFoot migration 0044: lineup read/write hardening (10.4 code review WR-01, WR-02).
--
-- WR-01 — ghost slots. 0040's `slots` CTE took the display fields from the
-- FILTERED roster CTE (`active and not smoke/dummy`). Deactivating a seated
-- player (reachable today through set_member_active) therefore produced
-- member_id + display_name null: the grid rendered a nameless row that still
-- counted toward N/5. The seat itself is correct data (a deactivated player is
-- still physically in the party until staff replaces them), so the fix is to
-- read the display fields from `members` directly and keep the filter on the
-- ASSIGNABLE roster only.
--
-- WR-02 — mirrored-swap deadlock. 0040's set_lineup_slot locked the TARGET row
-- first and the SOURCE row second. Two officers performing mirrored moves
-- (A: P -> slot holding X, B: X -> slot holding P) acquire the same two row
-- locks in opposite order and Postgres aborts one with 40P01, which the client
-- reports as a generic save failure. Both rows are now locked in ONE statement
-- with a deterministic order (battlefield, party_index, slot_index), so the
-- lock acquisition order can never be inverted.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0044_lineup_read_write_hardening.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. get_lineups(): slot display fields come from members, never from the
--    filtered roster. Payload shape and field list are unchanged (closed set:
--    slot_index, member_id, display_name, char_class, char_function).
-- ---------------------------------------------------------------------------

create or replace function public.get_lineups()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
    -- WR-01: seated members are resolved straight from members (+ newest
    -- identity) so a deactivated occupant still renders with a name instead of
    -- becoming a nameless ghost row. The roster filter above stays untouched:
    -- it only governs who can be ASSIGNED.
    slots as (
      select s.battlefield, s.party_index, s.slot_index,
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
$function$;

-- ---------------------------------------------------------------------------
-- 2. set_lineup_slot(): identical behaviour, deterministic two-row locking.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_slot(
  p_battlefield text,
  p_party smallint,
  p_slot smallint,
  p_member uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- WR-02: lock the target row AND the source row (when the member is already
  -- seated) in one statement, ordered deterministically, so mirrored concurrent
  -- swaps can never acquire the two locks in opposite order.
  perform 1
  from lineup_slots s
  where (s.battlefield = p_battlefield and s.party_index = p_party and s.slot_index = p_slot)
     or (p_member is not null and s.member_id = p_member)
  order by s.battlefield, s.party_index, s.slot_index
  for update;

  select s.member_id into v_displaced
  from lineup_slots s
  where s.battlefield = p_battlefield and s.party_index = p_party and s.slot_index = p_slot;

  if p_member is null then
    update lineup_slots set member_id = null, updated_at = now()
    where battlefield = p_battlefield and party_index = p_party and slot_index = p_slot;
  else
    select s.battlefield, s.party_index, s.slot_index
      into v_old_bf, v_old_party, v_old_slot
    from lineup_slots s
    where s.member_id = p_member;

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
$function$;

revoke all on function public.get_lineups() from public, anon;
grant execute on function public.get_lineups() to authenticated;
revoke all on function public.set_lineup_slot(text, smallint, smallint, uuid) from public, anon;
grant execute on function public.set_lineup_slot(text, smallint, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bookkeeping + PostgREST reload.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0044', 'lineup_read_write_hardening', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
