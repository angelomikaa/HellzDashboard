-- 0030_pending_validation_count.sql
-- Phase 10 round 9 (owner 2026-10-25): "we need a quick notification system
-- to ping officers when validations are necessary, currently they need to
-- blindly check the tab to see if something new arrived".
--
-- A lightweight COUNT for the Validações tab badge. The two queue RPCs
-- (officer_queue 0014:1322, staff_identity_queue 0014:659) return FULL
-- payloads (the 57-stat array per submission, proof metadata per proof) —
-- polling either just to count would drag megabytes through the officers'
-- sessions. This RPC returns two integers and nothing else.
--
-- The counts mirror the queue RPCs EXACTLY (same tables, same joins, same
-- status filters) so the badge can never disagree with the tab:
--   submissions   = officer_queue's cohort  (submissions s join members m, s.status='pending')
--   identity_proofs = staff_identity_queue's cohort (identity_proofs p join members m, p.status='pending')
-- The staff gate is verbatim (0009:62-68 pattern): member_role claim in
-- (officer, owner) AND a live active member row. Append-only; touches no
-- table, no policy, no existing function.

create or replace function public.pending_validation_count()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Staff gate verbatim (0009:62-68): officer/owner claim AND live active row.
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  return jsonb_build_object(
    'submissions', (
      select count(*)
      from submissions s
      join members m on m.id = s.member_id
      where s.status = 'pending'
    ),
    'identity_proofs', (
      select count(*)
      from identity_proofs p
      join members m on m.id = p.member_id
      where p.status = 'pending'
    )
  );
end;
$$;

comment on function public.pending_validation_count() is
  'Officer-only pending-validation counts for the Validações tab badge (round 9): {submissions, identity_proofs} mirroring officer_queue and staff_identity_queue cohorts exactly. Two integers, never payloads. Internal gate: member_role in (officer,owner) AND caller active.';

revoke execute on function public.pending_validation_count() from public, anon;
grant execute on function public.pending_validation_count() to authenticated;
