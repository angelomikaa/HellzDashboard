-- NeoFoot migration 0069: the Validações badge also counts buffed submissions.
--
-- WHY: pending_validation_count returned only the three queue totals. A row
-- whose anti-cheat category is "buffed" (known Impositio/Angelus/Assumptio
-- signature) was indistinguishable from a clean pending row until an officer
-- opened the queue and expanded it — the owner's report was that notifications
-- exist but the suspicious one does not stand out.
--
-- WHAT: the same three counts + `buffed`, the number of pending submissions
-- whose server-side review category is exactly "buffed". It is a SUBSET of
-- `submissions`, never an additional queue: pendingTotal() must keep summing
-- only the three queues. The category comes from submission_anti_cheat(), so
-- the badge and the Validações chip can never disagree.
--
-- Cost: one anti-cheat evaluation per pending submission (the one-pending rule
-- caps this at one row per member). The badge polls every 30 s; with zero
-- pending rows the subquery is not evaluated.
--
-- Append-only: 0031 is not edited. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0069_pending_validation_count_buffed.sql

begin;

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
    ),
    -- 0069: subset of submissions, never an extra queue.
    'buffed', (
      select count(*)
      from submissions s
      where s.status = 'pending'
        and coalesce(
          public.submission_anti_cheat(s.id)->'review'->>'category',
          ''
        ) = 'buffed'
    )
  );
end;
$$;

comment on function public.pending_validation_count() is
  'Officer-only pending-validation counts for the Validações tab badge (0031 + 0069): {submissions, identity_proofs, requests, buffed}. The first three are queues; buffed is a SUBSET of submissions whose server-side review category is exactly buffed (known Impositio/Angelus/Assumptio signature), computed with submission_anti_cheat so the badge and the row chip can never disagree. Integers only, never payloads. Internal gate: member_role in (officer,owner) AND caller active.';

revoke execute on function public.pending_validation_count() from public, anon;
grant execute on function public.pending_validation_count() to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0069', 'pending_validation_count_buffed', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
