-- 0031_pending_validation_count_requests.sql
-- Round 9 follow-up (owner report 2026-10-25: "no notifications have appeared
-- despite submissions being made"). The Validações tab adjudicates THREE
-- queues — Envios (submissions), Solicitações (membership_requests),
-- Identidades (identity_proofs) — but 0030's badge count covered only two:
-- a pending membership request could never light the badge.
--
-- Supersedes 0030's body (append-only discipline: the file stays, the
-- function is replaced): same staff gate verbatim, same cohort mirroring —
-- membership_requests now mirrors staff_requests (0014:765) exactly
-- (status='pending'). Three integers, never payloads.

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
    ),
    'requests', (
      select count(*)
      from membership_requests r
      where r.status = 'pending'
    )
  );
end;
$$;

comment on function public.pending_validation_count() is
  'Officer-only pending-validation counts for the Validações tab badge (round 9 + 0031): {submissions, identity_proofs, requests} mirroring officer_queue, staff_identity_queue and staff_requests cohorts exactly. Three integers, never payloads. Internal gate: member_role in (officer,owner) AND caller active.';

revoke execute on function public.pending_validation_count() from public, anon;
grant execute on function public.pending_validation_count() to authenticated;
