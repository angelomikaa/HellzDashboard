-- 0032_claim_authorization.sql
-- Stopgap (owner report 2026-10-26): the print is PUBLIC data.
--
-- A Basic-screen screenshot is posted in Discord every day, and the nickname +
-- char ID it shows are public too. "The print matches the registry row" never
-- proved the person owns the character — it only proved they had a picture of
-- it. So anyone holding a stolen card could open Primeiro acesso and set the
-- PIN before the owner did, taking over the account.
--
-- Until Discord OAuth + a verified Discord<->character link lands, an UNCLAIMED
-- registry row is no longer claimable on the print alone:
--
--   1. the first-access lookup answers 'claim_review' (unclaimed, no officer
--      authorization yet) or 'claim_pending' (print already sent) — never
--      'ready';
--   2. the player sends the print (create_claim_proof) and an officer sees it
--      in the Identidades board together with the REGISTRY Discord handle;
--   3. the officer confirms with that person on Discord, then "Confirmar"
--      authorizes the claim (members.claim_authorized_at/by);
--   4. only then does the lookup answer 'ready' and claim_pin_by_nickname mint
--      the PIN.
--
-- Two paths stay frictionless because a human already vouched for the identity:
--   * an officer approving a registration request sets claim_authorized_at (the
--     officer just reviewed that print + handle);
--   * a member who already claimed keeps claim_authorized_at forever, so a
--     staff PIN reset still reopens the claim immediately (owner decision
--     2026-10-23: reset = the player asked staff for it).
--
-- Rejecting a CLAIM proof only refuses the claim: the registry row stays
-- active. Rejecting a post-claim identity proof keeps the D-05 behaviour
-- (deactivate + clear the claim). A hijack attempt must never destroy the real
-- player's registry row.
--
-- Append-only: 0001-0031 are never edited in place; every function this file
-- changes ships a full byte-faithful `create or replace` copy.
-- reset_member_pin is deliberately NOT rewritten here (0024 prepended
-- assert_device_bound() to the live body out-of-band): the authorization set at
-- first claim is never cleared, so the reset path already reopens the claim.

-- ---------------------------------------------------------------------------
-- 1. The authorization stamp on the registry row.
-- ---------------------------------------------------------------------------
alter table members
  add column if not exists claim_authorized_at timestamptz,
  add column if not exists claim_authorized_by uuid references members(id);

comment on column members.claim_authorized_at is
  'Set when an officer/owner (or a registration approval) vouched for this character identity; an unclaimed row is only claimable (Primeiro acesso PIN setter) when this is not null. 0032 stopgap against print-only takeovers.';
comment on column members.claim_authorized_by is
  'Staff member who authorized the first-access claim (members.id).';

-- ---------------------------------------------------------------------------
-- 2. create_claim_proof — service-role only (the first-access Edge Function).
--    Queues the pre-claim print for officer review. One pending proof per
--    member: a re-send replaces the pending row (the caller purges the replaced
--    object with the returned replaced_path).
-- ---------------------------------------------------------------------------
create or replace function public.create_claim_proof(
  p_nickname text,
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
  v_proof text := coalesce(p_proof_path, '');
  v_member members%rowtype;
  v_pending identity_proofs%rowtype;
  v_proof_id uuid;
begin
  if char_length(v_nickname) = 0 or char_length(v_nickname) > 80 then
    raise exception 'invalid_identity';
  end if;
  if v_char_id !~ '^[0-9]{1,12}$' then
    raise exception 'invalid_identity';
  end if;
  if not exists (select 1 from classes where class_name = v_class) then
    raise exception 'unknown_class';
  end if;
  if char_length(v_proof) = 0 then
    raise exception 'invalid_proof';
  end if;

  -- Same row lock the claim uses: an officer decision cannot interleave with a
  -- pending print write for the same member.
  select * into v_member
  from members m
  where m.login_key = v_key and m.active
  for update;

  if v_member.id is null then
    raise exception 'not_registered';
  end if;
  -- A claimed row never re-enters first access (only a staff reset reopens it).
  if v_member.pin_hash is not null then
    raise exception 'already_set';
  end if;
  -- The print must describe the SAME character the registry holds.
  if v_member.char_id is not null and v_member.char_id <> v_char_id then
    raise exception 'identity_mismatch';
  end if;
  -- Already authorized: the page must re-run the lookup and open the PIN setter.
  if v_member.claim_authorized_at is not null then
    raise exception 'already_authorized';
  end if;

  select * into v_pending
  from identity_proofs p
  where p.member_id = v_member.id
    and p.status = 'pending'
  order by p.created_at desc, p.id desc
  limit 1
  for update;

  if v_pending.id is not null then
    update identity_proofs
       set storage_path = v_proof,
           char_id = v_char_id,
           nickname = v_nickname,
           char_class = v_class,
           created_at = now()
     where id = v_pending.id;

    return jsonb_build_object(
      'proof_id', v_pending.id,
      'duplicate', true,
      'replaced_path', v_pending.storage_path
    );
  end if;

  insert into identity_proofs (member_id, storage_path, char_id, nickname, char_class)
  values (v_member.id, v_proof, v_char_id, v_nickname, v_class)
  returning id into v_proof_id;

  return jsonb_build_object(
    'proof_id', v_proof_id,
    'duplicate', false,
    'replaced_path', null
  );
end;
$$;

comment on function public.create_claim_proof(text, text, text, text) is
  'Service-role-only pre-claim print queue (0032 stopgap). Resolves the unclaimed registry row by login_key under a row lock and inserts/refreshes ONE pending identity_proofs row for officer review. Refuses already_set (claimed), already_authorized (officer already vouched), identity_mismatch (print char_id differs), not_registered, unknown_class, invalid_identity/invalid_proof. Returns {proof_id, duplicate, replaced_path}: the caller must purge replaced_path. No caller gate by design - grant is service_role only (first-access Edge Function).';

-- ---------------------------------------------------------------------------
-- 3. claim_pin_by_nickname v2 — the choke point: no officer authorization, no
--    PIN. Everything else is the 0020 body verbatim.
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
  -- 0032 stopgap: the print is public data, so an unclaimed row is only
  -- claimable after an officer/owner authorized THIS character identity.
  if v_member.claim_authorized_at is null then
    raise exception 'claim_not_authorized';
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
  'Service-role-only first-access claim by character NICKNAME (Phase 10; 0032). Resolves members.login_key (lower(btrim(display_name))), refuses not_registered/ambiguous_identity/already_set/claim_not_authorized (no officer authorization on the row)/identity_mismatch, then delegates to public.claim_pin (single conditional UPDATE, pin_hash IS NULL gate, identity history + identity_proofs). Clears the legacy handle lockout key and the member-id login lockout key. No caller gate by design - grant is service_role only (setup-pin Edge Function).';

-- ---------------------------------------------------------------------------
-- 4. approve_request v4 — an officer approval IS an identity authorization:
--    the registration branch creates the row UNCLAIMED but already authorized,
--    so the player's next attempt lands on 'ready' without a second review.
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
           char_function = p_function,
           -- 0032: the approving officer just reviewed this print + handle.
           claim_authorized_at = now(),
           claim_authorized_by = v_caller
     where id = v_existing.id;
    v_member := v_existing.id;
  else
    if v_req.request_type = 'member' then
      raise exception 'not_member';
    end if;
    insert into members
      (discord_handle, display_name, pin_hash, role, active, char_class,
       char_function, char_id, claimed_at, claim_authorized_at,
       claim_authorized_by)
    values
      (v_req.discord_handle, v_req.nickname, v_req.pin_hash, 'member', true,
       v_req.char_class, p_function, v_req.char_id, v_claimed_at, now(),
       v_caller)
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
  'Staff-only membership approval (WHIT-09/10, D-09, T-08-06; Phase 10 registration; 0032). p_function (dps|mdps|suporte) is the officer-confirmed build role. Creates or reactivates the member, clears lockout rows, appends identity history source=request, and for prospects inserts the first VALIDATED submission + stats. Registration rows create the member UNCLAIMED (pin_hash NULL, claimed_at NULL) but CLAIM-AUTHORIZED (claim_authorized_at/by = the approving officer), so the next first-access attempt opens the PIN setter without a second review. Registration/member rows create no submission; member-type requests still need an existing row (not_member). Exceptions: forbidden/invalid_function/not_pending/already_member/not_member/duplicate_char_id/duplicate_nickname. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 5. review_identity v3 — Confirmar on an UNCLAIMED member authorizes the first
--    access (0032). Nao confere on an unclaimed member refuses the claim but
--    keeps the registry row; the claimed-member behaviour (D-05 deactivation)
--    is unchanged.
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
  v_claimed boolean;
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

  -- Read the claim state under the same transaction: a claimed member's proof
  -- is an identity check; an unclaimed member's proof is a first-access request.
  select m.pin_hash is not null into v_claimed
  from members m
  where m.id = v_proof.member_id;

  if p_confirm then
    update identity_proofs
       set status = 'confirmed',
           reviewed_at = now(),
           reviewed_by = v_caller,
           storage_path = null
     where id = p_proof;

    -- 0032: an officer confirming the print of an UNCLAIMED row authorizes the
    -- claim (the lookup then answers 'ready' and the PIN setter opens).
    if v_claimed is not true then
      update members
         set claim_authorized_at = now(),
             claim_authorized_by = v_caller
       where id = v_proof.member_id;
    end if;
  else
    update identity_proofs
       set status = 'rejected',
           reviewed_at = now(),
           reviewed_by = v_caller,
           storage_path = null
     where id = p_proof;

    if v_claimed is not true then
      -- 0032: refusing a first access only refuses the claim. The registry row
      -- stays active — a hijack attempt must not delete the real player's row.
      update members
         set claim_authorized_at = null,
             claim_authorized_by = null
       where id = v_proof.member_id;
    else
      -- D-05: "Não confere" deactivates the member through the existing path
      -- and clears the claim so the character is unclaimed again. Owner rows are
      -- never touched. Identity history is preserved (append-only).
      update members
         set active = false,
             pin_hash = null,
             claimed_at = null,
             char_id = null,
             claim_authorized_at = null,
             claim_authorized_by = null
       where id = v_proof.member_id
         and role <> 'owner';

      select m.discord_handle into v_handle from members m where m.id = v_proof.member_id;
      delete from pin_login_attempts
      where discord_handle in (v_handle, v_proof.member_id::text);
    end if;
  end if;
end;
$$;

comment on function public.review_identity(uuid, boolean) is
  'Staff-only identity-proof decision (D-05/D-15, IDEN-03; Phase 10; 0032). Unclaimed member: Confirmar -> confirmed + claim_authorized_at/by set (the first-access PIN setter opens); Nao confere -> rejected, claim authorization cleared, registry row left ACTIVE (a hijack attempt must not deactivate the real player). Claimed member: Confirmar -> confirmed; Nao confere -> rejected + member deactivated, pin/claim/char_id pointers cleared and lockout rows (member id + legacy handle) deleted, so the character is claimable again. Every decision clears storage_path so the client can purge the object. Exceptions: forbidden/not_pending. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 6. staff_identity_queue v2 — the board must say WHICH decision it is asking
--    for: pin_set=false rows are first-access authorizations (contact the
--    registry handle on Discord first), pin_set=true rows are identity checks.
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
        'created_at', p.created_at,
        'pin_set', m.pin_hash is not null,
        'claim_authorized', m.claim_authorized_at is not null
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
  'Staff-only pending identity-proof queue (D-05, IDEN-03; 0032): newest-first proofs with member handle/name, the storage proof_path and the claim state (pin_set=false => first-access authorization: confirm the registry Discord handle with the player before confirming). Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 7. A EXECUTE hygiene.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_claim_proof(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_claim_proof(text, text, text, text)
  to service_role;

revoke execute on function public.claim_pin_by_nickname(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_pin_by_nickname(text, text, text, text, text)
  to service_role;

revoke execute on function public.approve_request(uuid, text) from public, anon;
grant execute on function public.approve_request(uuid, text) to authenticated;

revoke execute on function public.review_identity(uuid, boolean) from public, anon;
grant execute on function public.review_identity(uuid, boolean) to authenticated;

revoke execute on function public.staff_identity_queue() from public, anon;
grant execute on function public.staff_identity_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Bookkeeping (0028/0029 pattern): recorded so a future CLI push never
--    re-runs this migration against the live project.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0032', 'claim_authorization', null)
on conflict (version) do nothing;
