-- Migration 0020 - First access by print, login by nickname (Phase 10)
--
-- Owner decisions (2026-10-23), superseding the handle-first claim of 08-03:
--
--   * "Primeiro acesso" starts with the Discord handle + the Basic print. The
--     print is read client-side (char_id / nickname / class) and matched
--     against the guild registry by NICKNAME.
--   * A match whose character has NO PIN unlocks the PIN setter. A character
--     that already has a PIN never re-enters this flow - only an officer/owner
--     reset reopens it (reset_member_pin).
--   * No match: the handle + print + read identity become a 'registration'
--     request. An officer approves it in the Solicitations board, which
--     registers the character (nickname, char_id, class) WITHOUT a PIN; on the
--     next attempt the lookup matches and the PIN setter opens.
--   * Login itself is by character NICKNAME + PIN from now on. The Discord
--     handle stays a staff-facing contact field and the request key.
--   * Function/role definition stays internal: the public registration request
--     carries no build role (the officer confirms it on approval, exactly like
--     the existing request flow).
--
-- The handle was the login key in 0001-0019 (members.discord_handle UNIQUE).
-- Nicknames were already the roster identity (members.display_name); this
-- migration adds the normalized lookup key and the SQL that trusts it.

-- ---------------------------------------------------------------------------
-- 1. Login/lookup key: trimmed, lowercased nickname. Generated so every
--    display_name write (claim, officer edit, approval) stays in sync.
-- ---------------------------------------------------------------------------
alter table members
  add column if not exists login_key text
  generated always as (lower(btrim(display_name))) stored;

create index if not exists members_login_key_idx on members (login_key);

-- ---------------------------------------------------------------------------
-- 2. Registration requests. A first access with no registry match carries no
--    PIN (the PIN is set after the officer approval), so pin_hash becomes
--    nullable and request_type gains 'registration'.
-- ---------------------------------------------------------------------------
alter table membership_requests alter column pin_hash drop not null;

alter table membership_requests
  drop constraint if exists membership_requests_request_type_check;
alter table membership_requests
  add constraint membership_requests_request_type_check
  check (request_type in ('member', 'prospect', 'registration'));

-- ---------------------------------------------------------------------------
-- 3. create_registration_request - service-role only (the first-access Edge
--    Function). Validates the handle + read identity + proof, refuses anything
--    that is already registered (the Edge lookup said "unknown", so a hit here
--    means the state moved), and is idempotent for a pending handle/character:
--    a retry returns the same request instead of raising request_pending.
-- ---------------------------------------------------------------------------
create or replace function public.create_registration_request(
  p_handle text,
  p_char_id text,
  p_nickname text,
  p_char_class text,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text := btrim(coalesce(p_handle, ''));
  v_char_id text := btrim(coalesce(p_char_id, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_class text := btrim(coalesce(p_char_class, ''));
  v_proof text := coalesce(p_proof_path, '');
  v_key text := lower(btrim(coalesce(p_nickname, '')));
  v_member uuid;
  v_existing membership_requests%rowtype;
  v_request uuid;
begin
  if char_length(v_handle) = 0 or char_length(v_handle) > 64 then
    raise exception 'invalid_handle';
  end if;
  if public.is_dummy_handle(v_handle) then
    raise exception 'dummy_handle';
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
  if char_length(v_proof) = 0 then
    raise exception 'invalid_proof';
  end if;

  -- The registry moved between the Edge lookup and this write (a claim, an
  -- approval): the caller must redo the lookup instead of queueing a duplicate.
  select m.id into v_member
  from members m
  where m.active
    and (m.login_key = v_key or m.char_id = v_char_id)
  limit 1;
  if v_member is not null then
    raise exception 'already_member';
  end if;

  -- 0020 owner rule (2026-10-23): a handle that already belongs to an ACTIVE
  -- account refuses the PIN/registration system entirely. A claimed handle logs
  -- in; an unclaimed one is matched by nickname or fixed by an officer.
  select m.id into v_member
  from members m
  where m.active
    and lower(btrim(m.discord_handle)) = lower(v_handle)
  limit 1;
  if v_member is not null then
    raise exception 'already_member';
  end if;

  select * into v_existing
  from membership_requests r
  where r.status = 'pending'
    and (lower(btrim(r.discord_handle)) = lower(v_handle) or r.char_id = v_char_id)
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'request_id', v_existing.id,
      'status', 'pending',
      'duplicate', true
    );
  end if;

  insert into membership_requests
    (discord_handle, pin_hash, request_type, char_id, nickname, char_class,
     char_function, proof_path)
  values
    (v_handle, null, 'registration', v_char_id, v_nickname, v_class,
     'dps', v_proof)
  returning id into v_request;

  return jsonb_build_object(
    'request_id', v_request,
    'status', 'pending',
    'duplicate', false
  );
end;
$$;

comment on function public.create_registration_request(text, text, text, text, text) is
  'Service-role-only first-access registration write (Phase 10). Stores handle + print identity + proof as a pending registration request with NO PIN (pin_hash NULL) - the PIN is set after the officer approval. Idempotent per pending handle/char_id (returns duplicate=true). Refuses rows the registry already holds, including BY HANDLE: a Discord handle that belongs to an ACTIVE member refuses the PIN/registration system entirely (owner rule 2026-10-23). Exceptions: invalid_handle/dummy_handle/invalid_identity/unknown_class/invalid_proof/already_member. No caller gate by design - grant is service_role only (the first-access Edge Function).';

-- ---------------------------------------------------------------------------
-- 4. claim_pin_by_nickname - service-role only (setup-pin Edge Function).
--    Resolves the registry row by the normalized NICKNAME (the login key),
--    refuses claimed/ambiguous/mismatched rows, then delegates the atomic
--    single-UPDATE claim to 0014's claim_pin so both paths share one contract.
-- ---------------------------------------------------------------------------
create or replace function public.claim_pin_by_nickname(
  p_nickname text,
  p_pin_hash text,
  p_char_id text,
  p_char_class text,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_key text := lower(btrim(coalesce(p_nickname, '')));
  v_char_id text := btrim(coalesce(p_char_id, ''));
  v_class text := btrim(coalesce(p_char_class, ''));
  v_pin_hash text := coalesce(p_pin_hash, '');
  v_member members%rowtype;
  v_count int;
  v_result jsonb;
begin
  if char_length(v_nickname) = 0 or char_length(v_nickname) > 80 then
    raise exception 'invalid_identity';
  end if;
  if char_length(v_pin_hash) = 0 or char_length(v_pin_hash) > 200 then
    raise exception 'invalid_pin';
  end if;
  if v_char_id !~ '^[0-9]{1,12}$' then
    raise exception 'invalid_identity';
  end if;
  if char_length(v_class) = 0 or char_length(v_class) > 40 then
    raise exception 'invalid_identity';
  end if;

  select count(*) into v_count from members m where m.login_key = v_key and m.active;
  if v_count = 0 then
    raise exception 'not_registered';
  end if;
  if v_count > 1 then
    raise exception 'ambiguous_identity';
  end if;

  select * into v_member from members m where m.login_key = v_key and m.active for update;
  if v_member.id is null then
    raise exception 'not_registered';
  end if;
  if v_member.pin_hash is not null then
    raise exception 'already_set';
  end if;
  -- A reset reopens the claim only for the SAME character: a print showing a
  -- different char_id is either a typo or a takeover attempt.
  if v_member.char_id is not null and v_member.char_id <> v_char_id then
    raise exception 'identity_mismatch';
  end if;

  v_result := public.claim_pin(
    v_member.discord_handle,
    v_pin_hash,
    v_char_id,
    v_nickname,
    v_class,
    p_proof_path
  );

  -- 0020: login lockout rows are keyed by member id (verify-pin), so the claim
  -- clears both the legacy handle key and the account key.
  delete from pin_login_attempts
  where discord_handle in (v_member.discord_handle, v_member.id::text);

  return v_result;
end;
$$;

comment on function public.claim_pin_by_nickname(text, text, text, text, text) is
  'Service-role-only first-access claim by character NICKNAME (Phase 10). Resolves members.login_key (lower(btrim(display_name))), refuses not_registered/ambiguous_identity/already_set/identity_mismatch, then delegates to public.claim_pin (single conditional UPDATE, pin_hash IS NULL gate, identity history + identity_proofs). Clears the legacy handle lockout key and the member-id login lockout key. No caller gate by design - grant is service_role only (setup-pin Edge Function).';

-- ---------------------------------------------------------------------------
-- 5. approve_request v3 - adds the 'registration' branch: the approval creates
--    the registry row with NO PIN (pin_hash stays NULL, claimed_at NULL), so
--    the player's next first-access attempt finds the match and sets the PIN.
--    Registration approvals also require the nickname to be free, since it is
--    the login key from 0020 on.
-- ---------------------------------------------------------------------------
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
  v_claimed_at timestamptz;
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
  -- cross-table check (only OTHER owners of the ID block).
  perform public.assert_char_id_available(v_req.char_id, v_existing.id, p_request);

  -- 0020: the nickname is the login key, so two ACTIVE rows may not share it.
  if exists (
    select 1 from members m
    where m.login_key = lower(btrim(v_req.nickname))
      and m.active
      and m.id is distinct from v_existing.id
  ) then
    raise exception 'duplicate_nickname';
  end if;

  -- 0020: registration rows carry no PIN by design -> the approved member stays
  -- unclaimed (next first-access attempt sets the PIN).
  v_claimed_at := case when v_req.pin_hash is null then null else now() end;

  if v_existing.id is not null then
    -- WHIT-07: reactivate the same row; submissions/history are untouched.
    update members
       set active = true,
           role = 'member',
           pin_hash = v_req.pin_hash,
           claimed_at = v_claimed_at,
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
      (discord_handle, display_name, pin_hash, role, active, char_class,
       char_function, char_id, claimed_at)
    values
      (v_req.discord_handle, v_req.nickname, v_req.pin_hash, 'member', true,
       v_req.char_class, p_function, v_req.char_id, v_claimed_at)
    returning id into v_member;
  end if;

  -- D-09: a request PIN (member/prospect) is immediately usable; a registration
  -- approval clears any stale lockout for the account and its handle.
  delete from pin_login_attempts
  where discord_handle in (v_req.discord_handle, v_member::text);

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
  'Staff-only membership approval (WHIT-09/10, D-09, T-08-06; Phase 10 registration). p_function (dps|mdps|suporte) is the officer-confirmed build role. Creates or reactivates the member, clears lockout rows, appends identity history source=request, and for prospects inserts the first VALIDATED submission + stats. Registration rows create the member UNCLAIMED (pin_hash NULL, claimed_at NULL) so the next first-access attempt sets the PIN. Registration/member rows create no submission; member-type requests still need an existing row (not_member). Exceptions: forbidden/invalid_function/not_pending/already_member/not_member/duplicate_char_id/duplicate_nickname. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 6. reset_member_pin v2 - also clears the member-id login lockout key.
-- ---------------------------------------------------------------------------
create or replace function public.reset_member_pin(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_handle text;
begin
  -- Owner gate verbatim (0011:188-191 / is_active_owner 0011:36-49).
  if coalesce(auth.jwt()->>'member_role', '') <> 'owner'
     or not public.is_active_owner() then
    raise exception 'forbidden';
  end if;

  select m.role, m.discord_handle into v_role, v_handle
  from members m where m.id = p_member;

  -- Missing target and owner targets are equally forbidden (D-08 precedent).
  if v_role is null or v_role = 'owner' then
    raise exception 'forbidden';
  end if;

  update members set pin_hash = null, claimed_at = null where id = p_member;

  -- D-16: the lockout rows are cleared with the claim, so the player can
  -- immediately use the first-access flow. 0020 keys login attempts by member
  -- id; the handle key is cleared too for rows written before 0020.
  delete from pin_login_attempts
  where discord_handle in (v_handle, p_member::text);
end;
$$;

comment on function public.reset_member_pin(uuid) is
  'OWNER-only PIN reset (WHIT-06, D-16/D-17; Phase 10). Nulls pin_hash + claimed_at (the member re-claims through Primeiro acesso by nickname) and deletes the account''s pin_login_attempts rows (member id + legacy handle key). Refuses owner targets (D-08) and missing rows with forbidden. Does NOT revoke outstanding stateless JWTs (accepted, documented D-17) - deactivation remains the immediate kill switch. Internal gate: member_role=owner AND is_active_owner().';

-- ---------------------------------------------------------------------------
-- 7. review_identity v2 - rejection also clears the member-id lockout key.
-- ---------------------------------------------------------------------------
create or replace function public.review_identity(p_proof uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (auth.jwt()->>'member_id')::uuid;
  v_proof identity_proofs%rowtype;
  v_handle text;
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  select * into v_proof from identity_proofs where id = p_proof for update;
  if v_proof.id is null or v_proof.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  if p_confirm then
    update identity_proofs
       set status = 'confirmed',
           reviewed_at = now(),
           reviewed_by = v_caller,
           storage_path = null
     where id = p_proof;
  else
    update identity_proofs
       set status = 'rejected',
           reviewed_at = now(),
           reviewed_by = v_caller,
           storage_path = null
     where id = p_proof;

    -- D-05: "Não confere" deactivates the member through the existing path and
    -- clears the claim so the character is unclaimed again. Owner rows are
    -- never touched. Identity history is preserved (append-only).
    update members
       set active = false,
           pin_hash = null,
           claimed_at = null,
           char_id = null
     where id = v_proof.member_id
       and role <> 'owner';

    select m.discord_handle into v_handle from members m where m.id = v_proof.member_id;
    delete from pin_login_attempts
    where discord_handle in (v_handle, v_proof.member_id::text);
  end if;
end;
$$;

comment on function public.review_identity(uuid, boolean) is
  'Staff-only identity-proof decision (D-05/D-15, IDEN-03; Phase 10). Confirm -> confirmed; reject -> rejected + member deactivated, pin/claim/char_id pointers cleared and lockout rows (member id + legacy handle) deleted, so the character is claimable again. Every decision clears storage_path so the client can purge the object. Exceptions: forbidden/not_pending. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 8. A EXECUTE hygiene.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_registration_request(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_registration_request(text, text, text, text, text)
  to service_role;

revoke execute on function public.claim_pin_by_nickname(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_pin_by_nickname(text, text, text, text, text)
  to service_role;

revoke execute on function public.approve_request(uuid, text) from public, anon;
grant execute on function public.approve_request(uuid, text) to authenticated;

revoke execute on function public.reset_member_pin(uuid) from public, anon;
grant execute on function public.reset_member_pin(uuid) to authenticated;

revoke execute on function public.review_identity(uuid, boolean) from public, anon;
grant execute on function public.review_identity(uuid, boolean) to authenticated;
