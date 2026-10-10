-- NeoFoot Phase 3 fix (plan 03-02, CR-01 / 03-CONTEXT D-14): staff policies gain
-- the active check — deactivate revokes staff access immediately.
--
-- 0004_rls_active.sql established the invariant that deactivating a member
-- (active=false) revokes already-minted tokens for MEMBER-facing policies, but
-- the three staff policies shipped in 0005 and rewritten in 0006 (member_role
-- claim fix) match only on auth.jwt()->>'member_role' in ('officer','owner')
-- with no active check on the caller. The JWT claim is frozen at login for 7
-- days (D-06), so a removed officer kept: reading every member's row, mutating
-- any member's character fields, and inserting classes — until token expiry.
--
-- This corrective migration mirrors the 0004 pattern (drop-if-exists + create,
-- so it applies cleanly to fresh databases and the already-migrated live
-- project). Do NOT edit 0005/0006 in place — migrations are append-only.
--
-- Claim contract (0006 lesson, never violate):
--   auth.jwt()->>'member_role' = 'member'|'officer'|'owner' (guild role)
--   auth.jwt()->>'role'        = 'authenticated' (PostgREST role-switch only)

drop policy if exists staff_select_all_members on members;
create policy staff_select_all_members on members
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

drop policy if exists staff_update_characters on members;
create policy staff_update_characters on members
  for update to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active))
  with check (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));

drop policy if exists staff_insert_classes on classes;
create policy staff_insert_classes on classes
  for insert to authenticated
  with check (auth.jwt()->>'member_role' in ('officer','owner')
    and exists (select 1 from members m
                where m.id::text = auth.jwt()->>'member_id' and m.active));
