-- NeoFoot Phase 1 fix (WR-02): deactivate revokes already-minted tokens.
--
-- 0001 documents "Phase 6 removal revokes access via active=false" and verify-pin
-- refuses login for inactive members — but the 0002 policies matched only on
-- member_id, so a member deactivated after login kept full data access for up to
-- 7 days (the token lifetime). These policies now check the member's current
-- active flag on every access.
--
-- Uses drop-if-exists + create so it applies cleanly to BOTH fresh databases
-- (after 0001/0002) and the already-migrated live project.
--
-- NOTE: this migration must be pushed to the live Supabase project (via the
-- Management API database/query endpoint) for the fix to take effect.

-- members: read own row only, and only while active
drop policy if exists member_select_own on members;
create policy member_select_own on members
  for select to authenticated
  using (id::text = auth.jwt()->>'member_id' and active);

-- submissions: select own rows only while active (submission_stats policies read
-- submissions via RLS in their exists subqueries, so stats access is revoked
-- transitively too)
drop policy if exists member_select_own_submissions on submissions;
create policy member_select_own_submissions on submissions
  for select to authenticated
  using (member_id::text = auth.jwt()->>'member_id'
    and exists (select 1 from members m
                where m.id = submissions.member_id and m.active));

-- submissions insert: the member must be active at insert time as well
drop policy if exists member_insert_own_submissions on submissions;
create policy member_insert_own_submissions on submissions
  for insert to authenticated
  with check (member_id::text = auth.jwt()->>'member_id'
    and exists (select 1 from members m
                where m.id = submissions.member_id and m.active));
