-- NeoFoot Phase 2 (plan 02-01): classes registry, member character columns,
-- column-level security on members, staff RLS, atomic create_submission RPC.
--
-- NOTE: the plan drafted this as "0003_registry_catalog.sql", but the repo
-- already contains 0003_lockout_rpc.sql + 0004_rls_active.sql (Phase 1 review
-- fixes, unpushed when this plan was written) — the Supabase CLI rejects
-- duplicate version numbers, so this file is 0005_registry_catalog.sql.

-- Phase 2: classes registry (REG-02)
create table classes (
  class_name text primary key,
  created_at timestamptz not null default now()
);
alter table classes enable row level security;
grant select, insert on classes to authenticated;  -- no update/delete to any client credential

create policy authenticated_read_classes on classes
  for select to authenticated using (true);
create policy staff_insert_classes on classes
  for insert to authenticated
  with check (auth.jwt()->>'role' in ('officer','owner'));

-- Character registry on members (REG-01; D-02: 1 handle = 1 character)
alter table members
  add column char_class text references classes(class_name),
  add column char_function text not null default 'dps' check (char_function in ('tank','dps'));

-- Column-level security: pin_hash and role unreachable by ANY client credential.
-- Closes Phase 1 gap (member_select_own could return pin_hash) + enables officer admin.
revoke select, insert, update, delete on members from anon, authenticated;
grant select (id, discord_handle, display_name, role, active, char_class, char_function, created_at)
  on members to authenticated;
grant update (display_name, char_class, char_function) on members to authenticated;

create policy staff_select_all_members on members
  for select to authenticated
  using (auth.jwt()->>'role' in ('officer','owner'));

create policy staff_update_characters on members
  for update to authenticated
  using (auth.jwt()->>'role' in ('officer','owner'))
  with check (auth.jwt()->>'role' in ('officer','owner'));

-- Atomic append-only submission (INPT-04). security invoker = default, so the
-- 0002 RLS insert policies (own-rows-only) still apply row by row.
create or replace function create_submission(p_stats jsonb)
returns uuid
language plpgsql
as $$
declare
  v_member uuid;
  v_submission uuid;
begin
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) = 0 then
    raise exception 'empty_stats';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_stats) e
    where not exists (
      select 1 from stat_catalog c where c.stat_key = e->>'stat_key'
    )
  ) then
    raise exception 'unknown_stat_key';
  end if;
  insert into submissions (member_id) values (v_member) returning id into v_submission;
  insert into submission_stats (submission_id, stat_key, value)
  select v_submission, e->>'stat_key', (e->>'value')::numeric
  from jsonb_array_elements(p_stats) e;
  return v_submission;
end;
$$;
revoke execute on function create_submission(jsonb) from anon;
