-- NeoFoot Phase 2 fix (plan 02-01, Rule 1): staff policies read the WRONG JWT claim.
--
-- 0005_registry_catalog.sql authored its staff policies against the plan's
-- interface note claiming the verify-pin JWT carries the guild role in a
-- `role` claim. The DEPLOYED contract (supabase/functions/verify-pin/index.ts,
-- live-proven 01-02) is:
--   role        = 'authenticated'   (PostgREST role-switch claim)
--   member_role = 'member'|'officer'|'owner'  (the actual guild role)
-- so `auth.jwt()->>'role'` always returns 'authenticated' and every staff
-- policy silently matched nothing (officer saw only their own row; officer
-- class inserts were RLS-denied). The live smoke matrix caught it.
--
-- Drop + recreate the three staff policies reading `member_role`.
-- (0005 is already applied live — corrections must ship as a new version.)

drop policy if exists staff_select_all_members on members;
create policy staff_select_all_members on members
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner'));

drop policy if exists staff_insert_classes on classes;
create policy staff_insert_classes on classes
  for insert to authenticated
  with check (auth.jwt()->>'member_role' in ('officer','owner'));

drop policy if exists staff_update_characters on members;
create policy staff_update_characters on members
  for update to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner'))
  with check (auth.jwt()->>'member_role' in ('officer','owner'));
