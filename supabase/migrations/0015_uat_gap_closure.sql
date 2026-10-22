-- 0015_uat_gap_closure.sql
-- Phase 8 UAT gap closure (owner decisions 2026-10-22; 08-UAT.md tests 3/4/7).
-- =========================================================================
-- A  (08-07)  not_member intake guard + prospect-only INSERT
-- =========================================================================

create or replace function public.create_membership_request(
  p_handle text,
  p_pin_hash text,
  p_request_type text,
  p_char_id text,
  p_nickname text,
  p_char_class text,
  p_char_function text,
  p_proof_path text,
  p_stats jsonb default null,
  p_supersede_request uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text := btrim(coalesce(p_handle, ''));
  v_pin_hash text := coalesce(p_pin_hash, '');
  v_type text := coalesce(p_request_type, '');
  v_char_id text := btrim(coalesce(p_char_id, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_class text := btrim(coalesce(p_char_class, ''));
  v_function text := coalesce(p_char_function, '');
  v_proof text := coalesce(p_proof_path, '');
  v_current membership_requests%rowtype;
  v_old_proof text;
  v_request uuid;
begin
  if char_length(v_handle) = 0 or char_length(v_handle) > 64 then
    raise exception 'invalid_handle';
  end if;
  if public.is_dummy_handle(v_handle) then
    raise exception 'dummy_handle';
  end if;
  if char_length(v_pin_hash) = 0 or char_length(v_pin_hash) > 200 then
    raise exception 'invalid_pin';
  end if;
  if v_type not in ('member', 'prospect') then
    raise exception 'invalid_request_type';
  end if;
  -- UAT test 7 (owner, 2026-10-22): Identificacao is a re-link loop for
  -- EXISTING handles only. Unknown handles must use Recrutamento.
  if v_type = 'member'
     and not exists (select 1 from members m where m.discord_handle = v_handle) then
    raise exception 'not_member';
  end if;
  if v_char_id !~ '^[0-9]{1,12}$' then
    raise exception 'invalid_identity';
  end if;
  if char_length(v_nickname) = 0 or char_length(v_nickname) > 80 then
    raise exception 'invalid_identity';
  end if;
  if not exists (select 1 from classes where class_name = v_class) then
    raise exception 'unknown_class';
  end if;
  if v_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'invalid_function';
  end if;
  if char_length(v_proof) = 0 then
    raise exception 'invalid_proof';
  end if;

  -- Stats shape: prospects must carry a full application (>= 56 known unique
  -- keys, every value numeric); member-type requests carry none (D-06/D-08).
  if v_type = 'prospect' then
    if p_stats is null
       or jsonb_typeof(p_stats) <> 'array'
       or jsonb_array_length(p_stats) < 56 then
      raise exception 'invalid_stats';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_stats) e
      where jsonb_typeof(e -> 'value') <> 'number'
         or not exists (select 1 from stat_catalog c where c.stat_key = e ->> 'stat_key')
    ) then
      raise exception 'invalid_stats';
    end if;
    if (select count(distinct e ->> 'stat_key') from jsonb_array_elements(p_stats) e)
       <> jsonb_array_length(p_stats) then
      raise exception 'invalid_stats';
    end if;
  else
    if p_stats is not null
       and jsonb_typeof(p_stats) = 'array'
       and jsonb_array_length(p_stats) > 0 then
      raise exception 'invalid_stats';
    end if;
  end if;

  -- D-11: exactly one current request per handle. A still-pending request can
  -- only be overwritten when the caller supplies its id (the Edge Function
  -- proved PIN ownership); any other attempt raises request_pending.
  select * into v_current
  from membership_requests r
  where lower(r.discord_handle) = lower(v_handle)
    and r.status = 'pending'
  for update;

  if v_current.id is not null then
    if p_supersede_request is null or p_supersede_request <> v_current.id then
      raise exception 'request_pending';
    end if;
    v_old_proof := v_current.proof_path;
    update membership_requests
       set status = 'superseded',
           decided_at = now(),
           proof_path = null
     where id = v_current.id
       and status = 'pending';
  end if;

  -- Cross-table ID uniqueness. Exclude the requesting handle's own member row
  -- (an inactive legacy member may re-request with their own ID) and the
  -- request just superseded (its char_id becomes reusable).
  perform public.assert_char_id_available(
    v_char_id,
    (select m.id from members m where m.discord_handle = v_handle),
    p_supersede_request
  );

  insert into membership_requests
    (discord_handle, pin_hash, request_type, char_id, nickname, char_class, char_function, proof_path)
  values
    (v_handle, v_pin_hash, v_type, v_char_id, v_nickname, v_class, v_function, v_proof)
  returning id into v_request;

  if v_type = 'prospect' then
    insert into membership_request_stats (request_id, stat_key, value)
    select v_request, e ->> 'stat_key', (e ->> 'value')::numeric
    from jsonb_array_elements(p_stats) e;
  end if;

  return jsonb_build_object(
    'request_id', v_request,
    'superseded_proof_path', v_old_proof
  );
end;
$$;

comment on function public.create_membership_request(text, text, text, text, text, text, text, text, jsonb, uuid) is
  'Service-role-only membership application write (WHIT-08/09/10, D-06/D-08/D-11). Validates handle/PIN/identity(class+function)/proof and stats (prospect: >=56 known unique numeric keys; member: none). Supersedes the handle''s pending request ONLY when p_supersede_request matches its id (the Edge proved PIN ownership) — the superseded row and stats are retained, only proof_path is cleared and returned so the client can purge the image. Exceptions: invalid_handle/dummy_handle/invalid_pin/invalid_request_type/not_member/invalid_identity/unknown_class/invalid_function/invalid_proof/invalid_stats/request_pending/duplicate_char_id. No caller gate by design — grant is service_role only. Superseding owner decision (UAT test 7, 2026-10-22): member-type requests are re-links for EXISTING handles only; unknown handles use Recrutamento (not_member).';

create or replace function public.approve_request(p_request uuid, p_function text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (auth.jwt()->>'member_id')::uuid;
  v_req membership_requests%rowtype;
  v_existing members%rowtype;
  v_member uuid;
  v_submission uuid;
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'invalid_function';
  end if;

  select * into v_req from membership_requests where id = p_request for update;
  if v_req.id is null or v_req.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  select * into v_existing from members where discord_handle = v_req.discord_handle;
  if v_existing.id is not null and v_existing.active then
    raise exception 'already_member';
  end if;

  -- The request being approved is itself a pending row: exclude it from the
  -- cross-table check (the plan's intent — only OTHER owners of the ID block).
  perform public.assert_char_id_available(v_req.char_id, v_existing.id, p_request);

  if v_existing.id is not null then
    -- WHIT-07: reactivate the same row; submissions/history are untouched.
    update members
       set active = true,
           role = 'member',
           pin_hash = v_req.pin_hash,
           claimed_at = now(),
           display_name = v_req.nickname,
           char_class = v_req.char_class,
           char_id = v_req.char_id,
           char_function = p_function
     where id = v_existing.id;
    v_member := v_existing.id;
  else
    if v_req.request_type = 'member' then
      raise exception 'not_member';
    end if;
    insert into members
      (discord_handle, display_name, pin_hash, role, active, char_class, char_function, char_id, claimed_at)
    values
      (v_req.discord_handle, v_req.nickname, v_req.pin_hash, 'member', true,
       v_req.char_class, p_function, v_req.char_id, now())
    returning id into v_member;
  end if;

  -- D-09: the request PIN is immediately usable.
  delete from pin_login_attempts where discord_handle = v_req.discord_handle;

  -- D-08: prospect stats arrive as the member's first VALIDATED submission.
  if v_req.request_type = 'prospect' then
    insert into submissions (member_id, status, char_id, nickname, char_class, char_function, submitted_at)
    values (v_member, 'validated', v_req.char_id, v_req.nickname, v_req.char_class, p_function, now())
    returning id into v_submission;

    insert into submission_stats (submission_id, stat_key, value)
    select v_submission, s.stat_key, s.value
    from membership_request_stats s
    where s.request_id = v_req.id;
  end if;

  insert into member_identity_history
    (member_id, submission_id, char_id, nickname, char_class, char_function, source, created_by)
  values
    (v_member, v_submission, v_req.char_id, v_req.nickname, v_req.char_class, p_function, 'request', v_caller);

  update membership_requests
     set status = 'approved',
         decided_at = now(),
         decided_by = v_caller,
         member_id = v_member,
         proof_path = null
   where id = v_req.id;

  return v_member;
end;
$$;

comment on function public.approve_request(uuid, text) is
  'Staff-only membership approval (WHIT-09/10, D-09, T-08-06). p_function (dps|mdps|suporte) is the officer-confirmed build role and the only role-assignment point for self-requesters. Creates or reactivates the member with the request PIN active, clears lockout rows, appends identity history source=request, and for prospects inserts the first VALIDATED submission + stats. Member-type requests create no submission. Exceptions: forbidden/invalid_function/not_pending/already_member/not_member/duplicate_char_id. Internal gate: member_role in (officer,owner) AND caller active. Superseding owner decision (UAT test 7, 2026-10-22): the INSERT branch is prospect-only; a member-type request with no existing row raises not_member (defense-in-depth).';

-- A EXECUTE hygiene (re-stated idempotently)
revoke execute on function public.create_membership_request(text, text, text, text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.create_membership_request(text, text, text, text, text, text, text, text, jsonb, uuid) to service_role;
revoke execute on function public.approve_request(uuid, text) from public, anon;
grant  execute on function public.approve_request(uuid, text) to authenticated;

-- =========================================================================
-- B  (08-08)  my_identity() coalesced self-read RPC
-- =========================================================================

create or replace function public.my_identity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid := (auth.jwt()->>'member_id')::uuid;
begin
  if v_member is null
     or not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'display_name', public.identity_display_name(v_member),
    'char_id', public.identity_char_id(v_member),
    'char_class', coalesce(
      (select h.char_class from member_identity_history h
        where h.member_id = v_member and h.char_class is not null
        order by h.created_at desc, h.id desc limit 1),
      (select m.char_class from members m where m.id = v_member)),
    'char_function', (select m.char_function from members m where m.id = v_member)
  );
end;
$$;

comment on function public.my_identity() is
  'Member-invocable coalesced self-identity (UAT test 4, D-21 EXTENDED, owner 2026-10-22). Returns the caller current identity via the D-21 coalesce (newest history first, registry fallback): display_name, char_id, char_class, char_function. Closed 4-field payload; caller-pinned to JWT member_id + active gate; anon refused. Supersedes the unpatched member self-read (fetchMe) that 0014 scope guard left on the stale registry row.';

revoke execute on function public.my_identity() from public, anon;
grant  execute on function public.my_identity() to authenticated;

-- =========================================================================
-- C  (08-09)  set_submission_status v3 promotes char_function (D-20 revised)
-- =========================================================================

create or replace function public.set_submission_status(p_submission uuid, p_status text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_member uuid;
  v_char_id text;
  v_nickname text;
  v_char_class text;
  v_char_function text;
begin
  -- Staff gate verbatim (0009:62-68).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_status not in ('validated', 'rejected') then
    raise exception 'invalid_status';
  end if;

  update submissions set status = p_status
  where id = p_submission and status = 'pending'
  returning member_id, char_id, nickname, char_class, char_function
  into v_member, v_char_id, v_nickname, v_char_class, v_char_function;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'not_pending';
  end if;

  -- IDEN-02/D-20: a validated identity is promoted to the append-only history
  -- and becomes the member's identity pointer. char_function stays staff-only.
  if p_status = 'validated' and v_char_id is not null and v_nickname is not null then
    perform public.assert_char_id_available(v_char_id, v_member, null);

    insert into member_identity_history
      (member_id, submission_id, char_id, nickname, char_class, char_function, source, created_by)
    values
      (v_member, p_submission, v_char_id, v_nickname, v_char_class, v_char_function, 'submission',
       (auth.jwt()->>'member_id')::uuid);

    update members
       set char_id = v_char_id,
           display_name = v_nickname,
           char_class = coalesce(v_char_class, char_class),
           char_function = coalesce(v_char_function, char_function)
     where id = v_member;
  end if;

  return v_count;
end;
$$;

comment on function public.set_submission_status(uuid, text) is
  'Officer validate/reject (AUTH-05, IDEN-02). Full 0011 body: p_status whitelisted, pending-only (not_pending on races), status mark only. On validated with submission identity: cross-table ID guard, APPEND to member_identity_history source=submission, and update members.char_id/display_name/char_class (D-20 class auto-applies; char_function is NEVER auto-applied — staff-only). Exceptions: forbidden/invalid_status/not_pending/duplicate_char_id. Internal gate: member_role in (officer,owner) AND caller active.';

-- C EXECUTE hygiene (re-stated idempotently)
revoke execute on function public.set_submission_status(uuid, text) from public, anon;
grant  execute on function public.set_submission_status(uuid, text) to authenticated;
