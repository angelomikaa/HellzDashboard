-- 0033_one_go_registration.sql
-- Owner decision 2026-10-26 (same day as 0032, reverses its pre-claim gate):
-- registration must be ONE GO for the player, and the officer stays in the
-- loop as the manual validator:
--
--   * CLAIM path (registry row exists, unclaimed): the 0032 pre-claim print
--     confirmation is REMOVED. The lookup answers 'ready' again and the PIN
--     setter opens in the same visit. The claim still queues a pending
--     identity_proofs row (D-05) — the Identidades review is the manual
--     validation that stays on, and "Nao confere" still deactivates the
--     member. This knowingly re-opens the stolen-print takeover window until
--     the Phase 11 Discord OAuth link replaces it (owner: "for the time
--     being").
--
--   * REGISTRATION path (unknown character): the request now carries the
--     player-chosen PIN. create_registration_request v2 accepts p_pin_hash, so
--     the officer approval creates the member ALREADY CLAIMED (0020's
--     approve_request already does this for member/prospect PINs — D-09) and
--     the player logs in with nickname + PIN right after the approval — no
--     second visit to a PIN setter.
--
-- Supersedes 0032 completely:
--   * drops members.claim_authorized_at/by and create_claim_proof;
--   * claim_pin_by_nickname returns to the 0020 body (no claim_not_authorized
--     gate);
--   * approve_request / review_identity / staff_identity_queue return to their
--     pre-0032 bodies (0020 / 0020 / 0014).
--
-- This file is written to converge from EITHER live state:
--   * 0032 applied -> run this to revert it;
--   * 0032 never applied -> run ONLY this (its create or replace bodies fully
--     define the end state; the 0032 bookkeeping row is still recorded so a
--     future CLI push can never replay the 0032 gate after these bodies).
-- Append-only: 0001-0032 are never edited in place.

-- ---------------------------------------------------------------------------
-- 1. Remove the 0032 objects.
-- ---------------------------------------------------------------------------
drop function if exists public.create_claim_proof(text, text, text, text);

alter table members
  drop column if exists claim_authorized_at,
  drop column if exists claim_authorized_by;

-- ---------------------------------------------------------------------------
-- 2. claim_pin_by_nickname v3 — the 0020 body verbatim (0032's gate removed).
--    The print alone opens the PIN setter again; the post-claim D-05 identity
--    review is the manual validation that remains.
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
  'Service-role-only first-access claim by character NICKNAME (Phase 10; 0033 restores the 0020 one-go contract: no officer pre-authorization). Resolves members.login_key (lower(btrim(display_name))), refuses not_registered/ambiguous_identity/already_set/identity_mismatch, then delegates to public.claim_pin (single conditional UPDATE, pin_hash IS NULL gate, identity history + identity_proofs — the pending proof is the post-claim D-05 manual validation). Clears the legacy handle lockout key and the member-id login lockout key. No caller gate by design - grant is service_role only (setup-pin Edge Function).';

-- ---------------------------------------------------------------------------
-- 3. create_registration_request v2 — new signature (p_pin_hash appended).
--    The 0020 body verbatim plus: a non-empty hash is stored (registration
--     approval creates the member CLAIMED, D-09); a null/empty hash keeps the
--     0020 behaviour (unclaimed member, PIN set later at first access) so a
--     cached pre-0033 client bundle still works.
-- ---------------------------------------------------------------------------
drop function if exists public.create_registration_request(text, text, text, text, text);

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
  if char_length(v_proof) = 0 then
    raise exception 'invalid_proof';
  end if;
  -- 0033: the hash is minted by the Edge Function (bcryptjs, same as the
  -- claim); only its shape is re-checked here. Empty = no PIN (cached client).
  if char_length(v_pin_hash) > 200 then
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
     v_class, 'dps', v_proof)
  returning id into v_request;

  return jsonb_build_object(
    'request_id', v_request,
    'status', 'pending',
    'duplicate', false
  );
end;
$$;

comment on function public.create_registration_request(text, text, text, text, text, text) is
  'Service-role-only first-access registration write (Phase 10; 0033 one-go). Stores handle + print identity + proof + the OPTIONAL player-chosen PIN hash as a pending registration request. With a PIN the officer approval creates the member ALREADY CLAIMED (D-09: immediately usable login) so the player never returns to a PIN setter; without one (cached pre-0033 client) the 0020 behaviour stands (member unclaimed, PIN set at the next first access). Idempotent per pending handle/char_id (returns duplicate=true — the ORIGINAL request and its PIN stand). Refuses rows the registry already holds, including BY HANDLE: a Discord handle that belongs to an ACTIVE member refuses the PIN/registration system entirely (owner rule 2026-10-23). Exceptions: invalid_handle/dummy_handle/invalid_identity/invalid_pin/unknown_class/invalid_proof/already_member. No caller gate by design - grant is service_role only (the first-access Edge Function).';

-- ---------------------------------------------------------------------------
-- 4. approve_request — the 0020 v3 body verbatim (0032 stamping removed; the
--    columns are gone). Registration rows WITH a PIN now approve to a CLAIMED
--    member through the existing D-09 branch — no second review, one go.
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
  'Staff-only membership approval (WHIT-09/10, D-09, T-08-06; Phase 10 registration; 0033 one-go). p_function (dps|mdps|suporte) is the officer-confirmed build role. Creates or reactivates the member, clears lockout rows, appends identity history source=request, and for prospects inserts the first VALIDATED submission + stats. A registration carrying a PIN (0033) creates the member CLAIMED so the player logs in immediately after the approval — the manual validation IS this approval; a PIN-less registration (cached client) keeps the 0020 behaviour (member unclaimed, PIN set at first access). Registration/member rows create no submission; member-type requests still need an existing row (not_member). Exceptions: forbidden/invalid_function/not_pending/already_member/not_member/duplicate_char_id/duplicate_nickname. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 5. review_identity — the 0020 v2 body verbatim (0033: one review semantics
--    again — every pending proof belongs to a member who CLAIMED, so rejection
--    keeps the D-05 deactivate-and-unclaim teeth; this is the manual
--    validation that stays on).
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
  'Staff-only identity-proof decision (D-05/D-15, IDEN-03; Phase 10; 0033 restores the uniform 0020 semantics). Confirm -> confirmed; reject -> rejected + member deactivated, pin/claim/char_id pointers cleared and lockout rows (member id + legacy handle) deleted, so the character is claimable again. Every decision clears storage_path so the client can purge the object. Exceptions: forbidden/not_pending. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 6. staff_identity_queue — the 0014 v1 body verbatim (0032's pin_set/
--    claim_authorized keys removed; every pending proof is a post-claim
--    identity check again).
-- ---------------------------------------------------------------------------
create or replace function public.staff_identity_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'proof_id', p.id,
        'member_id', p.member_id,
        'discord_handle', m.discord_handle,
        'display_name', m.display_name,
        'char_id', p.char_id,
        'nickname', p.nickname,
        'char_class', p.char_class,
        'proof_path', p.storage_path,
        'created_at', p.created_at
      )
      order by p.created_at desc
    )
    from identity_proofs p
    join members m on m.id = p.member_id
    where p.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

comment on function public.staff_identity_queue() is
  'Staff-only pending identity-proof queue (D-05, IDEN-03): newest-first proofs with member handle/name and the storage proof_path. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 7. EXECUTE hygiene.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_pin_by_nickname(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_pin_by_nickname(text, text, text, text, text)
  to service_role;

revoke execute on function public.create_registration_request(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_registration_request(text, text, text, text, text, text)
  to service_role;

revoke execute on function public.approve_request(uuid, text) from public, anon;
grant execute on function public.approve_request(uuid, text) to authenticated;

revoke execute on function public.review_identity(uuid, boolean) from public, anon;
grant execute on function public.review_identity(uuid, boolean) to authenticated;

revoke execute on function public.staff_identity_queue() from public, anon;
grant execute on function public.staff_identity_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Bookkeeping (0028/0029 pattern). 0032's row is recorded too, even when it
--    was never applied live: this file supersedes it, and a future CLI push
--    must never replay the 0032 gate on top of these bodies.
--    Deploy order (non-negotiable): 0033 -> first-access + setup-pin functions
--    -> client bundle.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0032', 'claim_authorization', null)
on conflict (version) do nothing;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0033', 'one_go_registration', null)
on conflict (version) do nothing;
