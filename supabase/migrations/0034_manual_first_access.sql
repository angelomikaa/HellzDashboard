-- 0034_manual_first_access.sql
-- Owner decision 2026-10-26 (evolves 0033): Primeiro acesso drops the PRINT
-- entirely. The player TYPES the identity (handle, nick, char ID, class) and
-- chooses the PIN in one form; with no print and no OCR there is nothing that
-- verifies identity at the boundary, so EVERY first access becomes an
-- OFFICER-VALIDATED request — the check responsibility sits fully with the
-- admins until the Phase 11 Discord OAuth link replaces it.
--
--   * CLAIM (registry row exists, unclaimed): the lookup still answers 'ready',
--     but it now means "send the claim REQUEST". create_claim_request stores a
--     membership_requests row of type 'claim' linked to the row (member_id)
--     carrying the player-chosen PIN; approve_request's new claim branch
--     ACTIVATES that PIN on the existing row. No member row is created.
--   * REGISTRATION (unknown character): unchanged 0033 one-go flow, minus the
--     print — p_proof_path is now optional (null), the officer judges from the
--     typed identity (roster, Discord, the game).
--   * The auto-claim Edge function (setup-pin) and its RPCs
--     (claim_pin/claim_pin_by_nickname) are retired: no print, no auto-claim.
--     The 0020-era machinery lives in git history.
--
-- Manual validation that stays on: the officer approval IS the identity check
-- (claim requests show the typed handle next to the REGISTRY row it targets;
-- registrations are checked against the guild roster). Post-claim identity
-- proofs no longer exist (there is no print); Identidades keeps reviewing any
-- legacy pending proofs.
--
-- Deploy order (non-negotiable): 0034 -> deploy first-access + DELETE
-- setup-pin (supabase functions delete setup-pin) -> client bundle.
-- NOTE: scripts/smoke-identity.mjs probes setup-pin/claim_pin directly and
-- needs a rework pass against this contract (flagged in STATE.md).
-- Append-only: 0001-0033 are never edited in place.

-- ---------------------------------------------------------------------------
-- 1. Request vocabulary: 'claim' joins member/prospect/registration.
-- ---------------------------------------------------------------------------
alter table membership_requests
  drop constraint if exists membership_requests_request_type_check;
alter table membership_requests
  add constraint membership_requests_request_type_check
  check (request_type in ('member', 'prospect', 'registration', 'claim'));

-- ---------------------------------------------------------------------------
-- 2. create_claim_request — service-role only (the first-access Edge Function
--    'claim' action). Resolves the UNCLAIMED registry row by the typed
--    nickname, links the request to it and stores the player-chosen PIN for
--    the officer to activate.
-- ---------------------------------------------------------------------------
create or replace function public.create_claim_request(
  p_handle text,
  p_char_id text,
  p_nickname text,
  p_char_class text,
  p_pin_hash text
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
  v_key text := lower(btrim(coalesce(p_nickname, '')));
  v_pin_hash text := coalesce(p_pin_hash, '');
  v_member members%rowtype;
  v_count int;
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
  -- 0034: the PIN is the point of the claim request — it is stored here and
  -- the officer approval activates it (D-09).
  if char_length(v_pin_hash) = 0 or char_length(v_pin_hash) > 200 then
    raise exception 'invalid_pin';
  end if;

  -- The same row lock the old auto-claim used: an officer decision cannot
  -- interleave with a request write for the same row.
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
  -- Claimed meanwhile (another path): the officer can only reset it.
  if v_member.pin_hash is not null then
    raise exception 'already_set';
  end if;
  -- The typed identity must describe the SAME character the registry holds.
  if v_member.char_id is not null and v_member.char_id <> v_char_id then
    raise exception 'identity_mismatch';
  end if;

  -- 0020 owner rule, scoped to OTHER rows: a Discord handle that already
  -- belongs to another ACTIVE account refuses the PIN system entirely. The
  -- row being claimed may legitimately own the typed handle.
  if exists (
    select 1 from members m
    where m.active
      and m.id <> v_member.id
      and lower(btrim(m.discord_handle)) = lower(v_handle)
  ) then
    raise exception 'already_member';
  end if;

  -- One pending request per person/character (0020 idempotency contract).
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
     char_function, member_id)
  values
    (v_handle, v_pin_hash, 'claim', v_char_id, v_nickname, v_class,
     'dps', v_member.id)
  returning id into v_request;

  return jsonb_build_object(
    'request_id', v_request,
    'status', 'pending',
    'duplicate', false
  );
end;
$$;

comment on function public.create_claim_request(text, text, text, text, text) is
  'Service-role-only first-access CLAIM request (0034 manual first access). Resolves the unclaimed registry row by the typed nickname under a row lock, refuses already_set/identity_mismatch/ambiguous_identity/not_registered and handles owned by other ACTIVE rows (already_member), then stores a pending membership_requests row of type claim LINKED to the row (member_id) carrying the player-chosen PIN hash for the officer to activate. Idempotent per pending handle/char_id (returns duplicate=true). No print, no proof: the officer approval is the identity check. Exceptions: invalid_handle/dummy_handle/invalid_identity/invalid_pin/unknown_class/not_registered/ambiguous_identity/already_set/identity_mismatch/already_member. No caller gate by design - grant is service_role only (first-access Edge Function).';

-- ---------------------------------------------------------------------------
-- 3. create_registration_request v3 — the print is gone: p_proof_path becomes
--    optional (null = manual-fill request). Everything else is the 0033 body.
--    Existing unclaimed rows still refuse here (already_member): they go
--    through create_claim_request instead.
-- ---------------------------------------------------------------------------
create or replace function public.create_registration_request(
  p_handle text,
  p_char_id text,
  p_nickname text,
  p_char_class text,
  p_proof_path text,
  p_pin_hash text default null
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
  v_pin_hash text := coalesce(p_pin_hash, '');
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
  -- 0034: manual first access — a proof path is no longer required (null is
  -- the designed value; a legacy/cached client sending one is ignored below).
  if v_pin_hash is not null and char_length(v_pin_hash) > 200 then
    raise exception 'invalid_pin';
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
    (v_handle, nullif(v_pin_hash, ''), 'registration', v_char_id, v_nickname,
     v_class, 'dps', nullif(v_proof, ''))
  returning id into v_request;

  return jsonb_build_object(
    'request_id', v_request,
    'status', 'pending',
    'duplicate', false
  );
end;
$$;

comment on function public.create_registration_request(text, text, text, text, text, text) is
  'Service-role-only first-access registration write (Phase 10; 0033 one-go; 0034 manual fill). Stores handle + TYPED identity + the OPTIONAL player-chosen PIN hash as a pending registration request with NO proof (p_proof_path optional/null since 0034 — the officer judges from the typed identity). With a PIN the officer approval creates the member ALREADY CLAIMED (D-09) so the player logs in immediately; without one (cached pre-0033 client) the member stays unclaimed and claims through a claim request. Idempotent per pending handle/char_id. Refuses rows the registry already holds, including BY HANDLE (owner rule 2026-10-23) — existing unclaimed rows must use create_claim_request. Exceptions: invalid_handle/dummy_handle/invalid_identity/invalid_pin/unknown_class/already_member. No caller gate by design - grant is service_role only (the first-access Edge Function).';

-- ---------------------------------------------------------------------------
-- 4. approve_request v5 — the claim branch: the approval ACTIVATES the
--    player-chosen PIN on the linked unclaimed registry row. No member row is
--    created; the officer IS the identity check (manual validation until the
--    Phase 11 Discord link).
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
  v_claim members%rowtype;
  v_existing members%rowtype;
  v_member uuid;
  v_submission uuid;
  v_claimed_at timestamptz;
  v_count int;
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

  -- 0034 first-access CLAIM: activate the PIN on the linked unclaimed row.
  -- Branches BEFORE the by-handle already_member guard (the request handle may
  -- legitimately equal the row's own registry handle).
  if v_req.request_type = 'claim' then
    if v_req.member_id is null then
      raise exception 'invalid_request';
    end if;

    select * into v_claim from members where id = v_req.member_id for update;
    if v_claim.id is null or not v_claim.active then
      raise exception 'not_registered';
    end if;
    -- Claimed through another path meanwhile: refuse, never overwrite.
    if v_claim.pin_hash is not null then
      raise exception 'already_set';
    end if;
    if v_claim.char_id is not null and v_claim.char_id <> v_req.char_id then
      raise exception 'identity_mismatch';
    end if;
    -- 0020: the nickname is the login key, so two ACTIVE rows may not share it.
    if exists (
      select 1 from members m
      where m.login_key = lower(btrim(v_req.nickname))
        and m.active
        and m.id <> v_claim.id
    ) then
      raise exception 'duplicate_nickname';
    end if;
    perform public.assert_char_id_available(v_req.char_id, v_claim.id, p_request);

    -- The registry display_name is NEVER overwritten with the typed value (the
    -- officer fixes names through Personagens); class/function/char_id come
    -- from the request the officer just reviewed.
    update members
       set pin_hash = v_req.pin_hash,
           claimed_at = now(),
           char_class = v_req.char_class,
           char_function = p_function,
           char_id = v_req.char_id
     where id = v_claim.id
       and pin_hash is null;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception 'already_set';
    end if;
    v_member := v_claim.id;

    -- D-09/D-16: the approval makes the request PIN immediately usable.
    delete from pin_login_attempts
    where discord_handle in (v_req.discord_handle, v_member::text);

    insert into member_identity_history
      (member_id, submission_id, char_id, nickname, char_class, char_function, source, created_by)
    values
      (v_member, null, v_req.char_id, v_req.nickname, v_req.char_class, p_function, 'claim', v_caller);

    update membership_requests
       set status = 'approved',
           decided_at = now(),
           decided_by = v_caller,
           member_id = v_member,
           proof_path = null
     where id = v_req.id;

    return v_member;
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
  -- unclaimed (next first-access attempt sets the PIN). 0033: a registration
  -- WITH a PIN is claimed here (D-09) so the player logs in immediately.
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

  -- D-09: a request PIN (member/prospect/0033 registration) is immediately
  -- usable; an approval clears any stale lockout for the account and its handle.
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
  'Staff-only request approval (WHIT-09/10, D-09, T-08-06; Phase 10; 0034). p_function (dps|mdps|suporte) is the officer-confirmed build role. claim: activates the request PIN on the LINKED unclaimed registry row (never overwrites a claim, never creates a row, never overwrites the registry display_name) and appends identity history source=claim — the officer approval IS the identity check. registration: creates/reactivates the member; with a PIN (0033) it is created CLAIMED (immediately usable login), without one it stays unclaimed for a claim request. member/prospect branches unchanged (prospect inserts the first VALIDATED submission + stats). Every decision clears proof_path. Exceptions: forbidden/invalid_function/not_pending/invalid_request/not_registered/already_set/identity_mismatch/duplicate_nickname/duplicate_char_id/already_member/not_member. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 5. Retire the auto-claim path: no print, no auto-claim. The Edge function
--    setup-pin is deleted at deploy time; these RPCs have no other caller.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_pin_by_nickname(text, text, text, text, text);
drop function if exists public.claim_pin(text, text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- 6. EXECUTE hygiene.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_claim_request(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_claim_request(text, text, text, text, text)
  to service_role;

revoke execute on function public.create_registration_request(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_registration_request(text, text, text, text, text, text)
  to service_role;

revoke execute on function public.approve_request(uuid, text) from public, anon;
grant execute on function public.approve_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Bookkeeping (0028/0029 pattern).
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0034', 'manual_first_access', null)
on conflict (version) do nothing;
