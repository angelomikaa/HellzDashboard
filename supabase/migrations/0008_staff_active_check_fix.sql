-- NeoFoot Phase 3 fix (plan 03-02, Rule 1 deviation on CR-01): corrects the
-- infinite-recursion defect in 0007's staff policies (Postgres 42P17).
--
-- 0007 (copied verbatim from 02-REVIEW CR-01) wrote the caller-active check
-- as `exists (select 1 from members ...)` INSIDE policies on members. Any
-- SELECT on members then re-evaluates members RLS to run that subquery —
-- including the policy itself — so Postgres raised
-- "infinite recursion detected in policy for relation members" (42P17) and
-- PostgREST returned HTTP 500 on member self-reads, officer reads, staff
-- class inserts, and create_submission (its submissions policy subquery on
-- members triggered the same recursion). Live smoke matrix 2026-10-10 caught
-- it immediately after 0007 was pushed.
--
-- Canonical Supabase fix: move the caller lookup into a SECURITY DEFINER
-- function. Policy-time subqueries run as the calling user (RLS applies);
-- SECURITY DEFINER runs as the owner (postgres), which bypasses RLS — no
-- recursion. This mirrors the established 0003 record_pin_failure pattern.
--
-- Invariant delivered is UNCHANGED from CR-01 / D-14: the function checks the
-- CALLER's live active flag on every staff policy evaluation, so deactivating
-- an officer/owner revokes staff reads/writes immediately (not at token
-- expiry). 0007 stays in repo + live migration history (append-only rule):
-- this migration drops and recreates the same three policy names.
--
-- Claim contract (0006 lesson, never violate):
--   auth.jwt()->>'member_role' = 'member'|'officer'|'owner' (guild role)
--   auth.jwt()->>'role'        = 'authenticated' (PostgREST role-switch only)

create or replace function public.is_active_staff_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.id::text = auth.jwt()->>'member_id'
      and m.active
      and auth.jwt()->>'member_role' in ('officer','owner')
  );
$$;

comment on function public.is_active_staff_member() is
  'Caller is an active officer/owner (0008 fix for 0007 recursion, CR-01/D-14). SECURITY DEFINER so staff policies on members can check the caller without re-triggering members RLS (42P17).';

-- The helper is an internal policy primitive, not a client API: anon/public
-- get no execute; authenticated needs it because policies run as the caller.
revoke execute on function public.is_active_staff_member() from public, anon;
grant execute on function public.is_active_staff_member() to authenticated;

drop policy if exists staff_select_all_members on members;
create policy staff_select_all_members on members
  for select to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and public.is_active_staff_member());

drop policy if exists staff_update_characters on members;
create policy staff_update_characters on members
  for update to authenticated
  using (auth.jwt()->>'member_role' in ('officer','owner')
    and public.is_active_staff_member())
  with check (auth.jwt()->>'member_role' in ('officer','owner')
    and public.is_active_staff_member());

drop policy if exists staff_insert_classes on classes;
create policy staff_insert_classes on classes
  for insert to authenticated
  with check (auth.jwt()->>'member_role' in ('officer','owner')
    and public.is_active_staff_member());
