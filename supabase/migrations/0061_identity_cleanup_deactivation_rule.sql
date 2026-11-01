-- NeoFoot migration 0061: identity cleanup + automatic deactivation rule.
--
-- Owner 2026-11-01:
--   * A deactivated member is automatically removed from every lineup/absence.
--   * XAVENTAL is now Slader: the old duplicate member row and its old
--     registration/identity history are removed; the Emperium seat moves to
--     Slader.
--   * Hawkarim is no longer a guild member: his seat is cleared (the inactive
--     row remains only as audit).
--   * agamenom no longer exists as an identity: it is merged into the surviving
--     agamenomloko account (both lineups move, stale row deleted).
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0061_identity_cleanup_deactivation_rule.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Automatic rule: deactivation clears every lineup seat and absence.
-- ---------------------------------------------------------------------------

create or replace function public.clear_lineup_on_member_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.lineup_slots
  set member_id = null, updated_at = now()
  where member_id = new.id;

  delete from public.lineup_absences
  where member_id = new.id;

  return new;
end;
$function$;

revoke all on function public.clear_lineup_on_member_deactivation() from public, anon, authenticated;

drop trigger if exists members_clear_lineup_on_deactivate on public.members;
create trigger members_clear_lineup_on_deactivate
after update of active on public.members
for each row
when (old.active is distinct from new.active and new.active = false)
execute function public.clear_lineup_on_member_deactivation();

-- ---------------------------------------------------------------------------
-- 2. agamenom -> agamenomloko: move both seats, then delete the stale identity.
-- ---------------------------------------------------------------------------

update public.lineup_slots
set member_id = 'b79a9686-eb77-4d11-a954-9cdad05d07a9', updated_at = now()
where member_id = 'cca5dbc5-e291-4b7f-a7f7-937ebcf6be23';

delete from public.members m
where m.id = 'cca5dbc5-e291-4b7f-a7f7-937ebcf6be23'
  and not exists (select 1 from public.submissions s where s.member_id = m.id)
  and not exists (select 1 from public.member_identity_history h where h.member_id = m.id or h.created_by = m.id)
  and not exists (select 1 from public.membership_requests r where r.member_id = m.id or r.decided_by = m.id)
  and not exists (select 1 from public.identity_proofs p where p.member_id = m.id or p.reviewed_by = m.id);

-- ---------------------------------------------------------------------------
-- 3. XAVENTAL -> Slader: move the Emperium seat, remove the old duplicate row,
--    its old approved registration and its old identity history.
-- ---------------------------------------------------------------------------

update public.lineup_slots
set member_id = 'ae102591-1490-4108-98b5-316731bff0fe', updated_at = now()
where member_id = 'd49d4c02-3dc5-4b46-8c85-63eebcd1fe3b';

delete from public.membership_requests
where member_id = 'd49d4c02-3dc5-4b46-8c85-63eebcd1fe3b';

delete from public.member_identity_history
where member_id = 'd49d4c02-3dc5-4b46-8c85-63eebcd1fe3b';

delete from public.identity_proofs
where member_id = 'd49d4c02-3dc5-4b46-8c85-63eebcd1fe3b';

delete from public.members m
where m.id = 'd49d4c02-3dc5-4b46-8c85-63eebcd1fe3b'
  and not exists (select 1 from public.submissions s where s.member_id = m.id)
  and not exists (select 1 from public.member_identity_history h where h.created_by = m.id)
  and not exists (select 1 from public.membership_requests r where r.decided_by = m.id)
  and not exists (select 1 from public.identity_proofs p where p.reviewed_by = m.id);

-- ---------------------------------------------------------------------------
-- 4. One-time cleanup for already-inactive members (Hawkarim/any other).
-- ---------------------------------------------------------------------------

update public.lineup_slots s
set member_id = null, updated_at = now()
from public.members m
where s.member_id = m.id and not m.active;

delete from public.lineup_absences a
using public.members m
where a.member_id = m.id and not m.active;

-- ---------------------------------------------------------------------------
-- 5. Invariants.
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad int;
  v_agamenom int;
  v_xavental int;
  v_slader_slot int;
  v_agamenom_slots int;
  v_hawkarim_slots int;
  v_eparties int;
  v_eslots int;
  v_efilled int;
begin
  select count(*) into v_bad
  from public.lineup_slots s
  join public.members m on m.id = s.member_id
  where not m.active;
  if v_bad <> 0 then
    raise exception '0061: % inactive member(s) still seated', v_bad;
  end if;

  select count(*) into v_agamenom from public.members where id = 'cca5dbc5-e291-4b7f-a7f7-937ebcf6be23';
  if v_agamenom <> 0 then
    raise exception '0061: stale agamenom row still exists';
  end if;

  select count(*) into v_xavental from public.members where id = 'd49d4c02-3dc5-4b46-8c85-63eebcd1fe3b';
  if v_xavental <> 0 then
    raise exception '0061: stale XAVENTAL row still exists';
  end if;

  select count(*) into v_slader_slot
  from public.lineup_slots
  where war_mode = 'emperium'
    and raid_index = 3
    and party_index = 1
    and slot_index = 3
    and member_id = 'ae102591-1490-4108-98b5-316731bff0fe';
  if v_slader_slot <> 1 then
    raise exception '0061: Slader is not seated in the old XAVENTAL Emperium slot';
  end if;

  select count(*) into v_agamenom_slots
  from public.lineup_slots
  where member_id = 'b79a9686-eb77-4d11-a954-9cdad05d07a9';
  if v_agamenom_slots <> 2 then
    raise exception '0061: expected 2 agamenomloko seats, got %', v_agamenom_slots;
  end if;

  select count(*) into v_hawkarim_slots
  from public.lineup_slots
  where member_id = '5fcfb759-6ee3-4c4f-982d-e40b878589b3';
  if v_hawkarim_slots <> 0 then
    raise exception '0061: Hawkarim still seated';
  end if;

  select count(*) into v_eparties from public.lineup_parties where war_mode = 'emperium';
  select count(*) into v_eslots from public.lineup_slots where war_mode = 'emperium';
  select count(*) into v_efilled
  from public.lineup_slots
  where war_mode = 'emperium' and member_id is not null;
  if v_eparties <> 16 or v_eslots <> 80 or v_efilled > 80 then
    raise exception '0061: bad Emperium shape (% parties / % slots / % filled)', v_eparties, v_eslots, v_efilled;
  end if;

  raise notice '0061: cleanup complete; Emperium has % filled of 80 slots', v_efilled;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Bookkeeping + PostgREST reload.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0061', 'identity_cleanup_deactivation_rule', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
