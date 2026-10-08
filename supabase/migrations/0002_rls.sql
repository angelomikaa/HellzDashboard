-- NeoFoot Phase 1 RLS: every table locked; members see own rows only; append-only submissions
alter table members enable row level security;
alter table stat_catalog enable row level security;
alter table submissions enable row level security;
alter table submission_stats enable row level security;
alter table class_key_stats enable row level security;
alter table pin_login_attempts enable row level security;

-- members: read own row only; no INSERT/UPDATE/DELETE for authenticated
-- (registration = owner via service role / seed; role changes never via API)
create policy member_select_own on members
  for select to authenticated
  using (id::text = auth.jwt()->>'member_id');

-- submissions: select + insert own rows only; NO update/delete policies (append-only)
create policy member_select_own_submissions on submissions
  for select to authenticated
  using (member_id::text = auth.jwt()->>'member_id');

create policy member_insert_own_submissions on submissions
  for insert to authenticated
  with check (member_id::text = auth.jwt()->>'member_id');

-- submission_stats: select/insert via ownership of the parent submission; NO update/delete
create policy member_select_own_submission_stats on submission_stats
  for select to authenticated
  using (exists (
    select 1 from submissions s
    where s.id = submission_id and s.member_id::text = auth.jwt()->>'member_id'
  ));

create policy member_insert_own_submission_stats on submission_stats
  for insert to authenticated
  with check (exists (
    select 1 from submissions s
    where s.id = submission_id and s.member_id::text = auth.jwt()->>'member_id'
  ));

-- stat_catalog: readable by all authenticated (submit wizard needs it); writes via service role only
create policy authenticated_read_catalog on stat_catalog
  for select to authenticated
  using (true);

-- class_key_stats: NO policies = deny-all for every client credential (RNK-02 foundation;
-- key-stat config never crosses the API boundary to members)
-- pin_login_attempts: NO policies = service-role-only (written exclusively by verify-pin)
