-- Live purge of the duplicate 'satturne' member minted by the pre-guard
-- member re-link path (UAT test 7). Applied via scripts/apply-seed.mjs.
-- Idempotent; no schema_migrations row (data seed).

do $$
declare
  v_id uuid;
  v_role text;
  v_char_id text;
begin
  select id, role, char_id into v_id, v_role, v_char_id
  from members where discord_handle = 'satturne';

  if v_id is null then
    raise notice 'satturne already purged';
    return;
  end if;

  if v_role <> 'member' then
    raise exception 'refusing: satturne role is %', v_role;
  end if;

  raise notice 'purging satturne id=% char_id=%', v_id, v_char_id;

  delete from submission_stats where submission_id in (select id from submissions where member_id = v_id);
  delete from submissions where member_id = v_id;
  delete from member_identity_history where member_id = v_id;
  delete from pin_login_attempts where discord_handle = 'satturne';
  delete from identity_proofs where member_id = v_id;
  delete from membership_request_stats where request_id in (select id from membership_requests where discord_handle = 'satturne');
  delete from membership_requests where discord_handle = 'satturne';
  delete from members where id = v_id;

  raise notice 'satturne purged';
end $$;
