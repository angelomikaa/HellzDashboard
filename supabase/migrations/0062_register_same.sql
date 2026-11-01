-- NeoFoot migration 0062: pre-register the player "Same" and seat them.
--
-- Owner 2026-11-01: "Same" is a real player, currently without a registration
-- and without a PIN. Create the unclaimed member row (pin_hash NULL, active,
-- role member, class unknown) and place them in the vacant Emperium slot from
-- the initial image (Raid 2 / G1 / slot 4). The player can claim the account
-- later through First Access; no PIN is created here.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0062_register_same.sql

begin;

do $$
declare
  v_member uuid;
  v_seated uuid;
begin
  select m.id
    into v_member
  from public.members m
  where lower(m.discord_handle) = 'same'
     or lower(m.display_name) = 'same'
     or lower(m.login_key) = 'same'
  order by m.created_at
  limit 1;

  if v_member is null then
    insert into public.members (
      discord_handle,
      display_name,
      pin_hash,
      role,
      active,
      char_class,
      char_function
    )
    values ('same', 'Same', null, 'member', true, null, 'dps')
    returning id into v_member;
  end if;

  update public.lineup_slots
  set member_id = v_member, updated_at = now()
  where war_mode = 'emperium'
    and raid_index = 2
    and party_index = 1
    and slot_index = 4
    and member_id is null;

  select s.member_id
    into v_seated
  from public.lineup_slots s
  where s.war_mode = 'emperium'
    and s.raid_index = 2
    and s.party_index = 1
    and s.slot_index = 4;

  if v_seated is distinct from v_member then
    raise exception '0062: could not seat Same in the Emperium slot';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = v_member and m.active and m.pin_hash is null
  ) then
    raise exception '0062: Same row is not an active unclaimed member';
  end if;

  raise notice '0062: Same pre-registered and seated';
end $$;

-- ---------------------------------------------------------------------------
-- Bookkeeping + PostgREST reload.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0062', 'register_same', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
