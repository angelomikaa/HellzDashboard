-- NeoFoot migration 0042: XAVENTAL is a stale identity of Slader (owner, 2026-10-30).
--
-- Owner disambiguation: XAVENTAL and Slader are the SAME player. XAVENTAL is a
-- stale identity — the player submitted twice instead of telling staff about his
-- nickname/class change. Evidence in the live data matches that story:
--   * xAVENTAL  (handle xAVENTAL,  login_key xavental, Summoner/dps, pin_hash null)
--     — created by an approved registration request on 2026-10-24, one identity
--       history row, ZERO submissions, no PIN (never claimed).
--   * Slader    (handle xSLADE,    login_key slader,   Professor/mdps, has PIN)
--     — the live account: 2026-10-28 validated submission (nickname "pom",
--       char_id 172453) and two identity history rows.
--
-- The Raid 1 / G2 / slot 1 seat that the owner's screenshot shows as "xAVENTAL"
-- therefore belongs to Slader. This migration:
--   1. re-seats vigrid_field G2 slot 1 from the stale row to Slader (clearing any
--      other seat Slader might hold first, so unique(member_id) can never fire);
--   2. deactivates the stale XAVENTAL row so it leaves the assignable roster and
--      can never be seated again (it has no PIN, no submissions and no proofs, so
--      nothing is lost — the row and its identity history stay in place, and the
--      submissions-are-append-only rule is untouched);
--   3. re-asserts the 0040 seed invariants (16 parties, 80 filled slots, no
--      smoke/dummy/inactive member seated) so the fix can never leave the live
--      lineup in a state the seed forbids.
--
-- Append-only: 0040 keeps its original alias mapping as history; this migration
-- carries the correction. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0042_battlefield_slader_alias.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Re-seat the owner's Raid 1 G2 slot 1 seat on the real account, then retire
--    the stale duplicate. Idempotent: a re-run finds the seat already on Slader
--    and the stale row already inactive.
-- ---------------------------------------------------------------------------

do $$
declare
  v_stale   uuid;
  v_real    uuid;
  v_current uuid;
begin
  select id into v_stale
  from public.members
  where lower(discord_handle) = 'xavental';

  select id into v_real
  from public.members
  where lower(discord_handle) = 'xslade';

  if v_real is null then
    raise exception 'slader alias: no member with handle xSLADE';
  end if;

  -- Clear any other seat the real account might hold (none expected today) so the
  -- move below can never violate unique(member_id).
  update public.lineup_slots
     set member_id = null,
         updated_at = now()
   where member_id = v_real
     and not (battlefield = 'vigrid_field' and party_index = 2 and slot_index = 1);

  if v_stale is not null then
    select member_id into v_current
    from public.lineup_slots
    where battlefield = 'vigrid_field' and party_index = 2 and slot_index = 1;

    if v_current = v_stale then
      update public.lineup_slots
         set member_id = v_real,
             updated_at = now()
       where battlefield = 'vigrid_field' and party_index = 2 and slot_index = 1;
    end if;

    -- Retire the stale identity: it leaves the assignable roster, keeps its row
    -- and history, and cannot log in (pin_hash was always null).
    update public.members
       set active = false
     where id = v_stale
       and active;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Invariants: the live lineup must still satisfy the 0040 seed contract.
-- ---------------------------------------------------------------------------

do $$
declare
  v_parties int;
  v_slots   int;
  v_empty   int;
  v_bad     int;
  v_stale   int;
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
  select count(*) into v_stale
  from public.lineup_slots s
  join public.members m on m.id = s.member_id
  where lower(m.discord_handle) = 'xavental';

  if v_parties <> 16 then
    raise exception 'lineup alias fix: expected 16 parties, got %', v_parties;
  end if;
  if v_slots <> 80 or v_empty <> 0 then
    raise exception 'lineup alias fix: expected 80 filled slots, got % slots / % empty', v_slots, v_empty;
  end if;
  if v_bad <> 0 then
    raise exception 'lineup alias fix: % seated slots hold a smoke, dummy or inactive member', v_bad;
  end if;
  if v_stale <> 0 then
    raise exception 'lineup alias fix: % slots still seat the retired XAVENTAL row', v_stale;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0042', 'battlefield_slader_alias', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
