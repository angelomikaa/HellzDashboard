-- NeoFoot Phase 8 (plan 08-01): whitelist lifecycle, self-request whitelisting,
-- first-login PIN claim and per-submission character identity.
-- Append-only: 0001–0013 are NEVER edited in place (0008/0011/0013 precedent);
-- this file only ADDS columns/tables/functions and ships full byte-faithful
-- `create or replace` copies for every function it supersedes.
--
-- Requirements implemented here:
--   WHIT-01..07  unclaimed handles (members.pin_hash IS NULL), handle-only
--                member creation, owner PIN reset, reactivation with history.
--   WHIT-08..10  membership_requests + membership_request_stats (RPC-only,
--                RLS enabled with NO policies), approve/reject/status path.
--   IDEN-01..03  identity columns on submissions, append-only
--                member_identity_history, cross-table unique char_id, latest
--                identity supplies display names on the read payloads.
--
-- DEPLOY ORDER (non-negotiable): 0014 -> verify-pin/setup-pin/request-access
-- Edge Functions -> client build. `pin_hash` is nullable from the moment this
-- migration lands; the CURRENT verify-pin does not yet handle a NULL hash, so
-- the Edge patch (08-02) must ship before unclaimed handles are advertised.
--
-- SCOPE GUARD: my_report() and class_top5() are deliberately NOT rewritten —
-- Phase 9 owns the rank-RPC rewrite. Only the display-name sourcing of
-- role_rank/get_promotion/officer_queue is touched, with every CTE, cohort,
-- OVR and points expression copied byte-identically.
--
-- Claim contract (0006 lesson, never violate):
--   auth.jwt()->>'member_role' = 'member'|'officer'|'owner' (guild role)
--   auth.jwt()->>'role'        = 'authenticated' (PostgREST role-switch only)

-- ---------------------------------------------------------------------------
-- 1. Members: unclaimed representation + identity pointer.
--    `pin_hash is null` ⇔ unclaimed is the ONLY representation (no flag).
--    char_id/claimed_at stay RPC-only: the 0005 column grants are unchanged,
--    so no client credential can read or write them directly.
-- ---------------------------------------------------------------------------

alter table members alter column pin_hash drop not null;
alter table members
  add column if not exists char_id text,
  add column if not exists claimed_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_char_id_format') then
    alter table members add constraint members_char_id_format
      check (char_id is null or char_id ~ '^[0-9]{1,12}$');
  end if;
end $$;

create unique index if not exists members_char_id_key
  on members (char_id) where char_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Identity captured per submission + append-only identity history.
--    History is the source of truth for display names (newest row wins,
--    D-21). No UPDATE/DELETE path exists: corrections append.
-- ---------------------------------------------------------------------------

alter table submissions
  add column if not exists char_id text,
  add column if not exists nickname text,
  add column if not exists char_class text references classes(class_name),
  add column if not exists char_function text check (char_function in ('dps','mdps','suporte'));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'submissions_char_id_format') then
    alter table submissions add constraint submissions_char_id_format
      check (char_id is null or char_id ~ '^[0-9]{1,12}$');
  end if;
end $$;

create table if not exists member_identity_history (
  id bigserial primary key,
  member_id uuid not null references members(id),
  submission_id uuid references submissions(id),
  char_id text not null check (char_id ~ '^[0-9]{1,12}$'),
  nickname text not null check (char_length(nickname) between 1 and 80),
  char_class text references classes(class_name),
  char_function text check (char_function in ('dps','mdps','suporte')),
  source text not null check (source in ('submission','correction','claim','request')),
  created_at timestamptz not null default now(),
  created_by uuid references members(id)
);

create index if not exists idx_identity_history_member
  on member_identity_history (member_id, created_at desc);

alter table member_identity_history enable row level security; -- no policies: RPC-only

-- ---------------------------------------------------------------------------
-- 3. Membership requests (WHIT-08/09/10). A pending request is NEVER a member
--    row and grants zero data access: both tables are RLS-enabled with NO
--    policies, so only the service role and the gated definer RPCs touch them.
--    Append-only history: supersede/reject keep the row (only proof_path is
--    cleared so the client can purge the object, D-11/D-15).
-- ---------------------------------------------------------------------------

create table if not exists membership_requests (
  id uuid primary key default gen_random_uuid(),
  discord_handle text not null check (char_length(discord_handle) <= 64),
  pin_hash text not null,
  request_type text not null check (request_type in ('member','prospect')),
  char_id text not null check (char_id ~ '^[0-9]{1,12}$'),
  nickname text not null check (char_length(nickname) between 1 and 80),
  char_class text not null references classes(class_name),
  char_function text not null check (char_function in ('dps','mdps','suporte')),
  proof_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references members(id),
  member_id uuid references members(id)
);

create unique index if not exists membership_requests_one_pending_handle
  on membership_requests (lower(discord_handle)) where status = 'pending';
create unique index if not exists membership_requests_one_pending_id
  on membership_requests (char_id) where status = 'pending';
create index if not exists idx_membership_requests_status
  on membership_requests (status, created_at);

create table if not exists membership_request_stats (
  request_id uuid not null references membership_requests(id) on delete cascade,
  stat_key text not null references stat_catalog(stat_key),
  value numeric not null,
  primary key (request_id, stat_key)
);

alter table membership_requests enable row level security;       -- no policies
alter table membership_request_stats enable row level security;  -- no policies

-- ---------------------------------------------------------------------------
-- 4. Identity proofs (D-05/D-15): claim-time screenshots queued for staff
--    review. RLS enabled, NO policies — the bucket policies
--    (seeds/live/identity-proofs-storage.sql) gate the binary and these tables
--    are only reachable through the staff RPCs.
-- ---------------------------------------------------------------------------

create table if not exists identity_proofs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  storage_path text not null,
  char_id text not null,
  nickname text not null,
  char_class text references classes(class_name),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references members(id)
);

alter table identity_proofs enable row level security; -- no policies

-- ---------------------------------------------------------------------------
-- 5. Helpers (internal definer primitives — no client grants).
-- ---------------------------------------------------------------------------

-- Newest identity nickname, falling back to the denormalized members.display_name.
-- Returns NULL only when the member itself is missing.
create or replace function public.identity_display_name(p_member uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select h.nickname
       from member_identity_history h
      where h.member_id = p_member
      order by h.created_at desc, h.id desc
      limit 1),
    (select m.display_name from members m where m.id = p_member)
  );
$$;

comment on function public.identity_display_name(uuid) is
  'Internal helper (no client EXECUTE): newest member_identity_history.nickname for a member, falling back to members.display_name (D-21 — the newest identity record wins for display). Used by role_rank/get_promotion inside SECURITY DEFINER bodies only.';

-- Newest identity char_id, falling back to the denormalized members.char_id.
create or replace function public.identity_char_id(p_member uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select h.char_id
       from member_identity_history h
      where h.member_id = p_member
      order by h.created_at desc, h.id desc
      limit 1),
    (select m.char_id from members m where m.id = p_member)
  );
$$;

comment on function public.identity_char_id(uuid) is
  'Internal helper (no client EXECUTE): newest member_identity_history.char_id for a member, falling back to members.char_id. Read payloads use it so Ranking shows the validated identity immediately (D-21/D-23).';

-- Cross-table uniqueness: a raw index cannot span members / open requests /
-- pending submissions, so every write path calls this guard. Exception:
-- duplicate_char_id.
create or replace function public.assert_char_id_available(
  p_char_id text,
  p_member uuid default null,
  p_request uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from members m
    where m.char_id = p_char_id
      and (p_member is null or m.id <> p_member)
  ) then
    raise exception 'duplicate_char_id';
  end if;

  if exists (
    select 1 from membership_requests r
    where r.char_id = p_char_id
      and r.status = 'pending'
      and (p_request is null or r.id <> p_request)
  ) then
    raise exception 'duplicate_char_id';
  end if;

  if exists (
    select 1 from submissions s
    where s.char_id = p_char_id
      and s.status = 'pending'
      and (p_member is null or s.member_id <> p_member)
  ) then
    raise exception 'duplicate_char_id';
  end if;
end;
$$;

comment on function public.assert_char_id_available(text, uuid, uuid) is
  'Internal uniqueness guard (no client EXECUTE). Raises duplicate_char_id when the character ID is already held by another member, another PENDING membership request, or another member''s PENDING submission. p_member/p_request exclude the caller''s own row where applicable. Called from claim_pin, create_membership_request, approve_request, create_submission, set_submission_status and correct_identity (T-08-05).';

-- Dummy sentinel namespace (seed-dummies.sql): case-insensitive `dummy-%`.
create or replace function public.is_dummy_handle(p_handle text)
returns boolean
language sql
immutable
security definer
set search_path = public
as $$
  select lower(coalesce(p_handle, '')) like 'dummy-%';
$$;

comment on function public.is_dummy_handle(text) is
  'Internal helper (no client EXECUTE): case-insensitive dummy-% sentinel test (Phase 7 seed namespace). add_member and create_membership_request raise dummy_handle for these handles so test fixtures can never be whitelisted as real players.';

-- ---------------------------------------------------------------------------
-- 6. Lifecycle RPCs.
-- ---------------------------------------------------------------------------

-- 6.1 add_member — staff creates a handle-only member (no PIN). Reactivates
--     an inactive handle WITHOUT touching submission history.
create or replace function public.add_member(p_handle text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text := btrim(coalesce(p_handle, ''));
  v_name text := btrim(coalesce(p_display_name, ''));
  v_existing members%rowtype;
  v_id uuid;
begin
  -- Staff gate verbatim (0011:75-81).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if char_length(v_handle) = 0 or char_length(v_handle) > 64 then
    raise exception 'invalid_handle';
  end if;
  if char_length(v_name) = 0 or char_length(v_name) > 80 then
    raise exception 'invalid_display_name';
  end if;
  if public.is_dummy_handle(v_handle) then
    raise exception 'dummy_handle';
  end if;

  select * into v_existing from members where discord_handle = v_handle;

  if v_existing.id is not null and v_existing.active then
    raise exception 'already_member';
  end if;

  if v_existing.id is not null then
    -- WHIT-07: reactivation keeps pin_hash/role/identity and every submission.
    update members
       set active = true,
           display_name = v_name
     where id = v_existing.id;
    return v_existing.id;
  end if;

  insert into members (discord_handle, display_name, pin_hash, role, active)
  values (v_handle, v_name, null, 'member', true)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.add_member(text, text) is
  'Staff-only handle-only member creation (WHIT-01/06/07). Inserts role=member, active=true, pin_hash NULL (unclaimed). Exceptions: forbidden/invalid_handle/invalid_display_name/dummy_handle/already_member. An inactive handle is reactivated in place (same id, role/pin/identity and submission history preserved). Internal gate: member_role in (officer,owner) AND caller active.';

-- 6.2 reset_member_pin — OWNER only; clears the claim and the lockout rows so
--     the member can re-claim through Primeiro acesso (D-16/D-17).
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

  -- D-16: the handle's lockout rows are cleared with the claim, so the player
  -- can immediately use the first-access flow (same counter, never a second).
  delete from pin_login_attempts where discord_handle = v_handle;
end;
$$;

comment on function public.reset_member_pin(uuid) is
  'OWNER-only PIN reset (WHIT-06, D-16/D-17). Nulls pin_hash + claimed_at (the member re-claims via Primeiro acesso) and deletes that handle''s pin_login_attempts rows. Refuses owner targets (D-08) and missing rows with forbidden. Does NOT revoke outstanding stateless JWTs (accepted, documented D-17) — deactivation remains the immediate kill switch. Internal gate: member_role=owner AND is_active_owner().';

-- 6.3 claim_pin — service-role only (the setup-pin Edge Function is the only
--     caller). The claim is a single conditional UPDATE: no read-then-write.
create or replace function public.claim_pin(
  p_handle text,
  p_pin_hash text,
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
  v_pin_hash text := coalesce(p_pin_hash, '');
  v_char_id text := btrim(coalesce(p_char_id, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_class text := btrim(coalesce(p_char_class, ''));
  v_proof text := coalesce(p_proof_path, '');
  v_member members%rowtype;
  v_count int;
begin
  if char_length(v_handle) = 0 or char_length(v_handle) > 64 then
    raise exception 'invalid';
  end if;
  if char_length(v_pin_hash) = 0 or char_length(v_pin_hash) > 200 then
    raise exception 'invalid_pin';
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

  -- Row lock: the conditional UPDATE below is the atomic gate; the lock only
  -- serializes concurrent claims for the same handle so the loser sees
  -- already_set instead of a lost-update anomaly (T-08-02).
  select * into v_member from members where discord_handle = v_handle for update;

  if v_member.id is null or not v_member.active then
    raise exception 'invalid';
  end if;
  if v_member.pin_hash is not null then
    raise exception 'already_set';
  end if;

  perform public.assert_char_id_available(v_char_id, v_member.id, null);

  update members
     set pin_hash = v_pin_hash,
         claimed_at = now(),
         char_id = v_char_id,
         display_name = v_nickname,
         char_class = v_class
   where id = v_member.id
     and pin_hash is null;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'already_set';
  end if;

  insert into member_identity_history
    (member_id, submission_id, char_id, nickname, char_class, char_function, source, created_by)
  values
    (v_member.id, null, v_char_id, v_nickname, v_class, null, 'claim', null);

  -- D-05: the screenshot enters the staff-only Identidade review queue.
  insert into identity_proofs (member_id, storage_path, char_id, nickname, char_class)
  values (v_member.id, v_proof, v_char_id, v_nickname, v_class);

  delete from pin_login_attempts where discord_handle = v_handle;

  return jsonb_build_object(
    'member_id', v_member.id,
    'display_name', v_nickname,
    'role', v_member.role,
    'char_class', v_class
  );
end;
$$;

comment on function public.claim_pin(text, text, text, text, text, text) is
  'Service-role-only atomic first-access claim (WHIT-02/03, D-04, T-08-02). Sets pin_hash/claimed_at/char_id/display_name/char_class with a single conditional UPDATE (where pin_hash is null) — a second claim raises already_set, never last-writer-wins. Appends member_identity_history source=claim and queues a pending identity_proofs row; clears the handle''s lockout rows. Exceptions: invalid/already_set/duplicate_char_id/dummy not applicable. No caller gate by design — grant is service_role only (the setup-pin Edge Function).';

-- 6.4 create_membership_request — service-role only (request-access Edge
--     Function). Validates everything, supersedes ONLY with the pending
--     request id (the Edge proves PIN ownership), returns the old proof path
--     so the client can purge the image (D-11/D-15).
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
  'Service-role-only membership application write (WHIT-08/09/10, D-06/D-08/D-11). Validates handle/PIN/identity(class+function)/proof and stats (prospect: >=56 known unique numeric keys; member: none). Supersedes the handle''s pending request ONLY when p_supersede_request matches its id (the Edge proved PIN ownership) — the superseded row and stats are retained, only proof_path is cleared and returned so the client can purge the image. Exceptions: invalid_handle/dummy_handle/invalid_pin/invalid_request_type/invalid_identity/unknown_class/invalid_function/invalid_proof/invalid_stats/request_pending/duplicate_char_id. No caller gate by design — grant is service_role only.';

-- 6.5 staff_members — roster payload with PIN state (never the hash) and the
--     latest identity (D-18/D-22).
create or replace function public.staff_members()
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
        'id', m.id,
        'discord_handle', m.discord_handle,
        'display_name', m.display_name,
        'role', m.role,
        'active', m.active,
        'char_class', m.char_class,
        'char_function', m.char_function,
        'char_id', m.char_id,
        'pin_set', (m.pin_hash is not null),
        'claimed_at', m.claimed_at,
        'has_pending_proof', exists (
          select 1 from identity_proofs p
          where p.member_id = m.id and p.status = 'pending'
        ),
        'identity', case when ih.id is null then null else jsonb_build_object(
          'id', ih.id,
          'created_at', ih.created_at,
          'char_id', ih.char_id,
          'nickname', ih.nickname,
          'char_class', ih.char_class,
          'char_function', ih.char_function,
          'source', ih.source
        ) end
      )
      order by m.display_name
    )
    from members m
    left join lateral (
      select * from member_identity_history h
      where h.member_id = m.id
      order by h.created_at desc, h.id desc
      limit 1
    ) ih on true
  ), '[]'::jsonb);
end;
$$;

comment on function public.staff_members() is
  'Staff-only member roster (WHIT-05, D-18/D-22). One row per member ordered by display_name with pin_set (pin_hash is not null — the hash itself is NEVER serialised), char_id, claimed_at, has_pending_proof and the latest identity history row (or null). No SELECT policy was added to members — this definer RPC is the staff read surface. Internal gate: member_role in (officer,owner) AND caller active.';

-- 6.6 staff_identity_queue — pending proof screenshots for the Identidade block.
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

-- 6.7 review_identity — Confirmar / Não confere (D-05/D-15). Rejection
--     deactivates and clears the claim so the handle is unclaimed again.
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
    -- clears the claim so the handle is unclaimed again. Owner rows are never
    -- touched. Identity history is preserved (append-only).
    update members
       set active = false,
           pin_hash = null,
           claimed_at = null,
           char_id = null
     where id = v_proof.member_id
       and role <> 'owner';

    select m.discord_handle into v_handle from members m where m.id = v_proof.member_id;
    if v_handle is not null then
      delete from pin_login_attempts where discord_handle = v_handle;
    end if;
  end if;
end;
$$;

comment on function public.review_identity(uuid, boolean) is
  'Staff-only identity-proof decision (D-05/D-15, IDEN-03). Confirm -> confirmed; reject -> rejected + member deactivated, pin/claim/char_id pointers cleared and lockout rows deleted (handle becomes claimable again). Every decision clears storage_path so the client can purge the object. Exceptions: forbidden/not_pending. Internal gate: member_role in (officer,owner) AND caller active.';

-- 6.8 staff_requests — Solicitations board (D-14). Applicant OVR is computed
--     against the live class+function cohort; applicant stats NEVER join it.
create or replace function public.staff_requests()
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
    with latest as (
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    cohort as (
      select l.member_id, l.stat_key, l.value, m.char_class, m.char_function
      from latest l
      join members m on m.id = l.member_id
      where m.active and m.char_class is not null
    ),
    agg as (
      select char_class, char_function, stat_key, count(*) as n
      from cohort
      group by char_class, char_function, stat_key
    )
    select jsonb_agg(
      jsonb_build_object(
        'request_id', r.id,
        'discord_handle', r.discord_handle,
        'request_type', r.request_type,
        'char_id', r.char_id,
        'nickname', r.nickname,
        'char_class', r.char_class,
        'char_function', r.char_function,
        'proof_path', r.proof_path,
        'created_at', r.created_at,
        'member_id', r.member_id,
        'ovr', o.ovr,
        'data_sufficient', (o.ovr is not null),
        'stats', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'stat_key', sc.stat_key,
              'label', sc.label,
              'label_short', sc.label_short,
              'value_type', sc.value_type,
              'group_name', sc.group_name,
              'value', rs.value
            )
            order by sc.group_name, sc.label
          ), '[]'::jsonb)
          from stat_catalog sc
          left join membership_request_stats rs
            on rs.request_id = r.id and rs.stat_key = sc.stat_key
        )
      )
      order by r.created_at desc
    )
    from membership_requests r
    cross join lateral (
      -- 0009/0013 OVR semantics: exactly-6 key stats, the applicant holds all
      -- 6, each cohort n >= 3. Cohort = ACTIVE members of the SAME
      -- class+function; the applicant's own stats never join it (D-14).
      select case
        when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
      end as ovr
      from (
        select case
          when coalesce(a.n, 0) >= 3 and rq.value is not null then
            (
              (select count(*) from cohort cb
                where cb.stat_key = ks.stat_key
                  and cb.char_class = r.char_class
                  and cb.char_function = r.char_function
                  and cb.value < rq.value)
              + ((select count(*) from cohort ct
                    where ct.stat_key = ks.stat_key
                      and ct.char_class = r.char_class
                      and ct.char_function = r.char_function
                      and ct.value = rq.value) - 1)::numeric / 2
            ) / (a.n - 1) * 99
        end as p
        from class_key_stats ks
        left join membership_request_stats rq
          on rq.request_id = r.id and rq.stat_key = ks.stat_key
        left join agg a
          on a.stat_key = ks.stat_key
         and a.char_class = r.char_class
         and a.char_function = r.char_function
        where ks.class_name = r.char_class
      ) kp
    ) o
    where r.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

comment on function public.staff_requests() is
  'Staff-only Solicitations board (WHIT-09, D-14). Pending requests newest-first with identity, proof_path, full stats and a server-computed applicant OVR + data_sufficient. OVR uses the live same-class+function ACTIVE cohort (exactly-6 key stats, applicant holds all 6, n>=3 per stat, floor-51 rescale) — applicant data NEVER joins the cohort. Internal gate: member_role in (officer,owner) AND caller active.';

-- 6.9 approve_request — the ONLY role-assignment point for self-requesters
--     (D-09/T-08-06). Prospect stats become the first validated submission.
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
  'Staff-only membership approval (WHIT-09/10, D-09, T-08-06). p_function (dps|mdps|suporte) is the officer-confirmed build role and the only role-assignment point for self-requesters. Creates or reactivates the member with the request PIN active, clears lockout rows, appends identity history source=request, and for prospects inserts the first VALIDATED submission + stats. Member-type requests create no submission. Exceptions: forbidden/invalid_function/not_pending/already_member/duplicate_char_id. Internal gate: member_role in (officer,owner) AND caller active.';

-- 6.10 reject_request — status-only decision; no reason is stored (D-10).
create or replace function public.reject_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (auth.jwt()->>'member_id')::uuid;
  v_count int;
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  update membership_requests
     set status = 'rejected',
         decided_at = now(),
         decided_by = v_caller,
         proof_path = null
   where id = p_request
     and status = 'pending';

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'not_pending';
  end if;
end;
$$;

comment on function public.reject_request(uuid) is
  'Staff-only request rejection (WHIT-10, D-10). Pending-only (not_pending on races); records decided_at/by, clears proof_path so the client can purge the image, and creates NO member row. Exceptions: forbidden/not_pending. Internal gate: member_role in (officer,owner) AND caller active.';

-- 6.11 request_status — the ONLY anon-reachable request surface. Four keys,
--      nothing else: no PII, no PIN, no stats (T-08-03).
create or replace function public.request_status(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_handle text := btrim(coalesce(p_handle, ''));
  v_row jsonb;
begin
  if char_length(v_handle) = 0 or char_length(v_handle) > 64 then
    return null;
  end if;

  select jsonb_build_object(
    'status', r.status,
    'request_type', r.request_type,
    'created_at', r.created_at,
    'decided_at', r.decided_at
  )
  into v_row
  from membership_requests r
  where lower(r.discord_handle) = lower(v_handle)
    and r.status <> 'superseded'
  order by r.created_at desc
  limit 1;

  return v_row;
end;
$$;

comment on function public.request_status(text) is
  'Anon+authenticated request status lookup (WHIT-10, D-10, T-08-03). Returns ONLY {status,request_type,created_at,decided_at} for the latest non-superseded request of a handle, or null. No PII, no PIN, no stats, no member data. No staff gate by design — grant to anon, authenticated.';

-- 6.12 correct_identity — staff correction appends, never overwrites (D-21).
create or replace function public.correct_identity(
  p_member uuid,
  p_char_id text,
  p_nickname text,
  p_char_class text,
  p_char_function text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := (auth.jwt()->>'member_id')::uuid;
  v_char_id text := btrim(coalesce(p_char_id, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_class text := btrim(coalesce(p_char_class, ''));
  v_function text := coalesce(p_char_function, '');
begin
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from members m where m.id = p_member) then
    raise exception 'forbidden';
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

  perform public.assert_char_id_available(v_char_id, p_member, null);

  insert into member_identity_history
    (member_id, submission_id, char_id, nickname, char_class, char_function, source, created_by)
  values
    (p_member, null, v_char_id, v_nickname, v_class, v_function, 'correction', v_caller);

  -- D-20: char_function is staff-only — this correction is one of the only
  -- places it is applied to the registry.
  update members
     set char_id = v_char_id,
         display_name = v_nickname,
         char_class = v_class,
         char_function = v_function
   where id = p_member;
end;
$$;

comment on function public.correct_identity(uuid, text, text, text, text) is
  'Staff-only identity correction (IDEN-03, D-21/D-22). APPENDS a member_identity_history row source=correction (never overwrites) and updates the member pointers incl. char_function (staff-only apply, D-20). Exceptions: forbidden/invalid_identity/unknown_class/invalid_function/duplicate_char_id. Internal gate: member_role in (officer,owner) AND caller active.';

-- 6.13 staff_identity_history — Personagens row expansion (D-22).
create or replace function public.staff_identity_history(p_member uuid)
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
        'id', h.id,
        'created_at', h.created_at,
        'char_id', h.char_id,
        'nickname', h.nickname,
        'char_class', h.char_class,
        'char_function', h.char_function,
        'source', h.source,
        'created_by', h.created_by
      )
      order by h.created_at desc, h.id desc
    )
    from member_identity_history h
    where h.member_id = p_member
  ), '[]'::jsonb);
end;
$$;

comment on function public.staff_identity_history(uuid) is
  'Staff-only member identity history (IDEN-03, D-22): newest-first {id,created_at,char_id,nickname,char_class,char_function,source,created_by}. Append-only — corrections are new rows. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 7. Submission identity + promotion.
-- ---------------------------------------------------------------------------

-- 7.1 create_submission v3 — full copy of 0010:75-109 plus the optional
--     identity payload. The 1-arg signature is DROPPED so PostgREST never has
--     to choose between two candidates: the 2-arg function's default keeps the
--     old client call working unchanged during deploy.
--     SECURITY DEFINER (deviation from 0010's invoker rights): the identity
--     branch calls the internal assert_char_id_available guard, and an invoker
--     body cannot execute a function whose EXECUTE was revoked from
--     authenticated (live 403 on the first apply). The JWT member_id claim is
--     still the only trusted identity, the active-member check replaces the
--     0004 insert policy, and every write is scoped to the caller's own rows.
drop function if exists public.create_submission(jsonb);

create or replace function public.create_submission(p_stats jsonb, p_identity jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_submission uuid;
  v_char_id text;
  v_nickname text;
  v_char_class text;
  v_char_function text;
begin
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  -- SECURITY DEFINER (needed to call the internal assert_char_id_available
  -- guard): the 0004 insert policy's active-member check is enforced here
  -- explicitly instead of row-by-row by RLS.
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
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

  -- IDEN-01/02: optional identity payload (old clients send nothing).
  if p_identity is not null and p_identity <> 'null'::jsonb then
    if jsonb_typeof(p_identity) <> 'object' then
      raise exception 'invalid_identity';
    end if;
    v_char_id := nullif(btrim(p_identity->>'char_id'), '');
    v_nickname := nullif(btrim(p_identity->>'nickname'), '');
    v_char_class := nullif(btrim(p_identity->>'char_class'), '');
    v_char_function := nullif(btrim(p_identity->>'char_function'), '');

    if v_char_id is null or v_char_id !~ '^[0-9]{1,12}$' then
      raise exception 'invalid_identity';
    end if;
    if v_nickname is null or char_length(v_nickname) > 80 then
      raise exception 'invalid_identity';
    end if;
    if v_char_class is null
       or not exists (select 1 from classes where class_name = v_char_class) then
      raise exception 'unknown_class';
    end if;
    if v_char_function is null or v_char_function not in ('dps', 'mdps', 'suporte') then
      raise exception 'invalid_function';
    end if;

    perform public.assert_char_id_available(v_char_id, v_member, null);
  end if;

  -- D-11 one-pending rule: a new submission discards the player's previous
  -- pending row (status mark only — never a delete, INPT-04). Scoped to the
  -- caller's own rows: the old invoker-rights update relied on
  -- submissions_discard_own_pending; this definer body has to scope it itself.
  update submissions set status = 'discarded'
  where member_id = v_member and status = 'pending';
  insert into submissions (member_id, char_id, nickname, char_class, char_function)
  values (v_member, v_char_id, v_nickname, v_char_class, v_char_function)
  returning id into v_submission;
  insert into submission_stats (submission_id, stat_key, value)
  select v_submission, e->>'stat_key', (e->>'value')::numeric
  from jsonb_array_elements(p_stats) e;
  return v_submission;
end;
$$;

comment on function public.create_submission(jsonb, jsonb) is
  'Member-invocable atomic submission (INPT-04, IDEN-01/02). Full 0010 body (one-pending discard + stats insert) plus an OPTIONAL identity object {char_id,nickname,char_class,char_function}: validated (numeric ID, nickname 1..80, existing class, build-role whitelist), cross-table uniqueness checked, and STORED ON THE SUBMISSION (promoted only at validation). p_identity defaults null so the old client call keeps working (the 1-arg overload is dropped to keep PostgREST resolution unambiguous). Exceptions: no_member_claim/forbidden/empty_stats/unknown_stat_key/invalid_identity/unknown_class/invalid_function/duplicate_char_id. SECURITY DEFINER because the identity branch must call the internal assert_char_id_available guard (no client EXECUTE); the caller is pinned to the JWT member_id claim, an active-member check replaces the 0004 insert policy, and the one-pending discard is scoped to the caller''s own rows.';

-- 7.2 set_submission_status v2 — full copy of 0011:131-163 plus identity
--     promotion on validation. members.char_function is NEVER auto-applied
--     (D-20); the validated class/nickname/char_id update the registry.
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
           char_class = coalesce(v_char_class, char_class)
     where id = v_member;
  end if;

  return v_count;
end;
$$;

comment on function public.set_submission_status(uuid, text) is
  'Officer validate/reject (AUTH-05, IDEN-02). Full 0011 body: p_status whitelisted, pending-only (not_pending on races), status mark only. On validated with submission identity: cross-table ID guard, APPEND to member_identity_history source=submission, and update members.char_id/display_name/char_class (D-20 class auto-applies; char_function is NEVER auto-applied — staff-only). Exceptions: forbidden/invalid_status/not_pending/duplicate_char_id. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 8. Read-payload patches (full copies, minimal change only).
-- ---------------------------------------------------------------------------

-- 8.1 officer_queue — 0011:66-115 verbatim + submission identity fields so
--     officers see ID/nickname/class/role of the row being validated.
create or replace function public.officer_queue()
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

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'submission_id', s.id,
        'submitted_at', s.submitted_at,
        'display_name', m.display_name,
        'discord_handle', m.discord_handle,
        'char_id', s.char_id,
        'nickname', s.nickname,
        'char_class', coalesce(s.char_class, m.char_class),
        'char_function', coalesce(s.char_function, m.char_function),
        'stats', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'stat_key', sc.stat_key,
              'label', sc.label,
              'group_name', sc.group_name,
              'value_type', sc.value_type,
              'value', ss.value
            )
            order by sc.group_name, sc.label
          ), '[]'::jsonb)
          from submission_stats ss
          join stat_catalog sc on sc.stat_key = ss.stat_key
          where ss.submission_id = s.id
        )
      )
      order by s.submitted_at desc
    )
    from submissions s
    join members m on m.id = s.member_id
    where s.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

comment on function public.officer_queue() is
  'Staff-only validation queue (AUTH-05; 08-01 identity patch): ALL pending submissions newest-first with submitter identity, the submission''s captured identity (char_id/nickname + coalesced class/function) and the full 57-stat payload ordered group_name+label. Read-only; validation flips happen via set_submission_status. Empty queue returns [] (never null). Internal gate: member_role in (officer,owner) AND caller active.';

-- 8.2 role_rank — 0013:426-582 full copy with display names sourced from the
--     newest identity history and rows gaining char_id (D-21/D-23). Every
--     CTE/cohort/OVR/points expression is byte-identical.
create or replace function public.role_rank(p_function text, p_class text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Staff gate FIRST (0009:62-68 shape): officer/owner claim AND the
  -- caller's live active flag.
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  -- Whitelist check BEFORE everything else except the gate.
  if p_function not in ('dps', 'mdps', 'suporte') then
    raise exception 'invalid_function';
  end if;

  -- '' and NULL both mean "all classes" (default board state, D-18).
  if p_class = '' then
    p_class := null;
  end if;

  if p_class is not null
     and not exists (select 1 from classes where class_name = p_class) then
    raise exception 'unknown_class';
  end if;

  return (
    with latest as (
      -- 0011 latest verbatim: latest value per (member, stat) over
      -- non-rejected, non-discarded submissions.
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    role_members as (
      -- D-18: role-primary board — active members with the requested build
      -- role and a non-null class, optionally narrowed to one class.
      -- 08-01: display_name/char_id come from the newest identity history
      -- (D-21 — the latest validated identity wins for display).
      select m.id,
             public.identity_display_name(m.id) as display_name,
             public.identity_char_id(m.id) as char_id,
             m.char_class,
             m.char_function
      from members m
      where m.char_function = p_function
        and m.active
        and m.char_class is not null
        and (p_class is null or m.char_class = p_class)
    ),
    cohort as (
      -- 0011 cohort shape + char_class carried so cross-class boards keep
      -- per-class cohorts (D-18: OVR is the cross-role sort key, each
      -- member still ranks inside their own class+function cohort).
      select l.member_id, l.stat_key, l.value, rm.char_function, rm.char_class
      from latest l
      join role_members rm on rm.id = l.member_id
    ),
    cmp as (
      -- 0011 cmp shape + class equality added to the join: per (member,
      -- stat), n = members of the SAME class AND function holding the stat
      -- (OVR semantics identical to my_report); below/ties include the member.
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b
        on b.stat_key = a.stat_key
       and b.char_function = a.char_function
       and b.char_class = a.char_class
      group by a.member_id, a.stat_key
    ),
    agg as (
      -- Per (class, stat) cohort aggregate: n for the points gate and
      -- class_average for the D-20 context column (member's own class
      -- +function cohort — the same cohort the points are computed in).
      select char_class, stat_key, count(*) as n, avg(value) as avg_v
      from cohort
      group by char_class, stat_key
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'member_id', rr.id,
        'display_name', rr.display_name,
        'char_id', rr.char_id,
        'char_class', rr.char_class,
        'char_function', rr.char_function,
        'ovr', rr.ovr,
        'stats', rr.stats
      )
      order by rr.ovr desc nulls last, rr.display_name
    ), '[]'::jsonb)
    from (
      select rm.id, rm.display_name, rm.char_id, rm.char_class, rm.char_function, o.ovr,
             (
               -- All 57 catalog entries per member (D-19 detail shape):
               -- closed field list {stat_key,label,label_short,value_type,
               -- value,points,class_average}. Points = the 0009 formula
               -- within the member's class+function cohort (n>=3 only).
               select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'stat_key', sc.stat_key,
                   'label', sc.label,
                   'label_short', sc.label_short,
                   'value_type', sc.value_type,
                   'value', lt.value,
                   'points', case
                     when coalesce(ag.n, 0) >= 3 and lt.value is not null then
                       round(
                         (
                           (select count(*) from cohort cb
                             where cb.stat_key = sc.stat_key
                               and cb.char_class = rm.char_class
                               and cb.value < lt.value)
                           + ((select count(*) from cohort ct
                                 where ct.stat_key = sc.stat_key
                                   and ct.char_class = rm.char_class
                                   and ct.value = lt.value) - 1)::numeric / 2
                         ) / (ag.n - 1) * 99, 2)
                   end,
                   'class_average', ag.avg_v
                 )
                 order by sc.group_name, sc.label
               ), '[]'::jsonb)
               from stat_catalog sc
               left join latest lt
                 on lt.stat_key = sc.stat_key and lt.member_id = rm.id
               left join agg ag
                 on ag.stat_key = sc.stat_key and ag.char_class = rm.char_class
             ) as stats
      from role_members rm
      cross join lateral (
        -- 0009 OVR lateral verbatim (exactly-6 key stats, member holds
        -- all 6, each with n >= 3, floor-51 rescale) — scoped to the
        -- member's own class.
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when c.n >= 3 then
              (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99
          end as p
          from class_key_stats ks
          join cmp c on c.member_id = rm.id and c.stat_key = ks.stat_key
          where ks.class_name = rm.char_class
        ) kp
      ) o
    ) rr
  );
end;
$$;

comment on function public.role_rank(text, text) is
  'Staff-only officials rank view (07.2 RANK-02 + 08-01 identity patch): one row per active member of the requested build role (dps|mdps|suporte; else invalid_function), optionally narrowed to one class (else unknown_class), ranked by OVR within the role (each member''s OVR inside their OWN class+function cohort). Rows now carry char_id and display_name/char_id source from the newest member_identity_history (D-21/D-23); every cohort/OVR/points expression is byte-identical to 0013. Server-ordered ovr desc nulls last, display_name. Internal gate: member_role in (officer,owner) AND caller active. Exceptions: forbidden/invalid_function/unknown_class.';

-- 8.3 get_promotion — FULL copy of the LIVE supersession
--     (seeds/live/promotion-rating-unification.sql, which already carries
--     photo_path and the class+function rating unification) with EXACTLY the
--     display-name swap: class_members selects identity_display_name(m.id).
--     Copying 0013 verbatim here would regress photo_path and rating parity.
create or replace function public.get_promotion()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  -- Member gate (0010:135-141 shape): identity from the JWT only.
  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  return (
    with latest as (
      -- 0010:265-273 verbatim: latest value per (member, stat) over
      -- non-rejected, non-discarded submissions.
      select distinct on (sub.member_id, ss.stat_key)
             sub.member_id, ss.stat_key, ss.value
      from submission_stats ss
      join submissions sub on sub.id = ss.submission_id
      where sub.status not in ('rejected','discarded')
      order by sub.member_id, ss.stat_key, sub.submitted_at desc
    ),
    class_members as (
      -- 0010:274-281 shape + D-07 (active only) + 08-01 D-21: the newest
      -- identity history nickname is the card name (members.display_name is
      -- only the fallback — identity_display_name handles both).
      select m.id,
             public.identity_display_name(m.id) as display_name,
             m.char_function,
             m.char_class
      from members m
      where m.char_class is not null and m.active
    ),
    cohort as (
      -- 0010:282-286 shape + 07.2-05 ROUND 8 UNIFICATION: char_class rides
      -- the cohort so every rank below is computed inside the member's OWN
      -- class+function cohort — the my_card basis.
      select l.member_id, l.stat_key, l.value, cm.char_function, cm.char_class
      from latest l
      join class_members cm on cm.id = l.member_id
    ),
    cmp as (
      -- 0010:287-297 shape + 07.2-05 ROUND 8 UNIFICATION: per (member,
      -- stat), n = members of the SAME class AND function holding the stat;
      -- below/ties include the member. THE ONE cohort basis for points AND
      -- OVR — identical numbers to my_card for the same member.
      select a.member_id, a.stat_key,
             count(*) as n,
             count(*) filter (where b.value < a.value) as below,
             count(*) filter (where b.value = a.value) as ties
      from cohort a
      join cohort b
        on b.stat_key = a.stat_key
       and b.char_function = a.char_function
       and b.char_class = a.char_class
      group by a.member_id, a.stat_key
    ),
    ovr_rows as (
      -- 0010:308-326 OVR lateral verbatim (exactly-6 key stats, member holds
      -- all 6, each with n >= 3, floor-51 rescale) across ALL classes.
      select cm.char_class, cm.id, cm.display_name, cm.char_function, o.ovr
      from class_members cm
      cross join lateral (
        select case
          when count(*) = 6 and count(p) = 6 then 51 + avg(p) * 48.0/99
        end as ovr
        from (
          select case
            when c.n >= 3 then
              (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99
          end as p
          from class_key_stats ks
          join cmp c on c.member_id = cm.id and c.stat_key = ks.stat_key
          where ks.class_name = cm.char_class
        ) kp
      ) o
    ),
    top5 as (
      -- 0010:305/327-329 semantics: ovr desc nulls last, display_name.
      -- Classes with no OVR-capable member produce no rows (D-13: omitted
      -- SERVER-SIDE — the client adds no empty sections).
      select char_class, id, display_name, char_function, ovr,
             row_number() over (
               partition by char_class
               order by ovr desc nulls last, display_name
             ) as rn
      from ovr_rows
      where ovr is not null
    ),
    hl as (
      -- 07.2 D-13 SUPERSESSION (kept): every card's highlights are the
      -- class's key stats, ordered by sc.label (stable) — the SANCTIONED key
      -- reveal with the closed field list
      -- {stat_key,label,label_short,value_type,value,points}. Points stay
      -- null when the stat's cohort has n < 3. 07.2-05 ROUND 8
      -- UNIFICATION: points adopt my_card's EXACT rounded expression.
      select t.id, hl.h as highlights
      from top5 t
      cross join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stat_key', sc.stat_key,
            'label', sc.label,
            'label_short', sc.label_short,
            'value_type', sc.value_type,
            'value', lt.value,
            'points', sp.points
          )
          order by sc.label
        ), '[]'::jsonb) as h
        from class_key_stats ks
        join stat_catalog sc on sc.stat_key = ks.stat_key
        left join latest lt on lt.stat_key = ks.stat_key and lt.member_id = t.id
        left join (
          select c.member_id, c.stat_key,
                 round(
                   (c.below + (c.ties - 1)::numeric / 2) / (c.n - 1) * 99, 2
                 ) as points
          from cmp c
          where c.member_id = t.id and c.n >= 3
        ) sp on sp.stat_key = ks.stat_key
        where ks.class_name = t.char_class
      ) hl
    )
    select coalesce(jsonb_agg(
      jsonb_build_object('class_name', cards.char_class, 'cards', cards.cards)
      order by cards.char_class
    ), '[]'::jsonb)
    from (
      select t.char_class,
             jsonb_agg(
               jsonb_build_object(
                 'display_name', t.display_name,
                 'char_function', t.char_function,
                 'ovr', t.ovr,
                 -- 07.2-05 round 7 (kept): the member's card-photos storage
                 -- object path — server-composed from the member id.
                 'photo_path', 'card-photos/' || t.id::text || '/card.jpg',
                 'highlights', hl.highlights
               )
               order by t.ovr desc, t.display_name
             ) as cards
      from top5 t
      join hl on hl.id = t.id
      where t.rn <= 5
      group by t.char_class
    ) cards
  );
end;
$$;

comment on function public.get_promotion() is
  'Member-invocable promotion payload (SHWC-02; 07.2-05 round 8 unification KEPT + 08-01 identity patch): per class, top-5-by-OVR cards whose highlights are the class''s KEY STATS with the closed field list {stat_key,label,label_short,value_type,value,points}. Points/OVR use the member''s CLASS+FUNCTION cohort (my_card parity) and points stay round(...,2). Card rows carry photo_path (card-photos storage path). 08-01: display_name comes from the newest member_identity_history (D-21); everything else byte-identical to the live supersession. Key-stat CONFIG is never serialised. Internal gate: JWT member_id claim AND caller active. Exceptions: no_member_claim/forbidden.';

-- ---------------------------------------------------------------------------
-- 9. Public catalog labels for the session-less prospect wizard (WHIT-08).
--    stat_catalog currently has an authenticated-only read policy (0002:40),
--    but the prospect application has no session. Grant ONLY the public label
--    projection; class_key_stats (the key-stat config) stays untouched.
-- ---------------------------------------------------------------------------

grant select (stat_key, label, label_short, group_name, value_type) on stat_catalog to anon;

drop policy if exists anon_read_catalog on stat_catalog;
create policy anon_read_catalog on stat_catalog
  for select to anon
  using (true);

-- ---------------------------------------------------------------------------
-- 10. EXECUTE hygiene (WR-02 lesson) + comments. Postgres grants function
--     EXECUTE to PUBLIC at creation: every new/replaced function is revoked
--     from public/anon and granted explicitly below.
-- ---------------------------------------------------------------------------

-- Internal definer-only helpers: no client grant.
revoke execute on function public.identity_display_name(uuid) from public, anon, authenticated;
revoke execute on function public.identity_char_id(uuid) from public, anon, authenticated;
revoke execute on function public.assert_char_id_available(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_dummy_handle(text) from public, anon, authenticated;

-- Service-role-only writers (Edge Functions).
revoke execute on function public.claim_pin(text, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.claim_pin(text, text, text, text, text, text) to service_role;

revoke execute on function public.create_membership_request(text, text, text, text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.create_membership_request(text, text, text, text, text, text, text, text, jsonb, uuid) to service_role;

-- Anon status lookup.
revoke execute on function public.request_status(text) from public;
grant  execute on function public.request_status(text) to anon, authenticated;

-- Staff lifecycle/read RPCs.
revoke execute on function public.add_member(text, text) from public, anon;
grant  execute on function public.add_member(text, text) to authenticated;

revoke execute on function public.reset_member_pin(uuid) from public, anon;
grant  execute on function public.reset_member_pin(uuid) to authenticated;

revoke execute on function public.staff_members() from public, anon;
grant  execute on function public.staff_members() to authenticated;

revoke execute on function public.staff_identity_queue() from public, anon;
grant  execute on function public.staff_identity_queue() to authenticated;

revoke execute on function public.review_identity(uuid, boolean) from public, anon;
grant  execute on function public.review_identity(uuid, boolean) to authenticated;

revoke execute on function public.staff_requests() from public, anon;
grant  execute on function public.staff_requests() to authenticated;

revoke execute on function public.approve_request(uuid, text) from public, anon;
grant  execute on function public.approve_request(uuid, text) to authenticated;

revoke execute on function public.reject_request(uuid) from public, anon;
grant  execute on function public.reject_request(uuid) to authenticated;

revoke execute on function public.correct_identity(uuid, text, text, text, text) from public, anon;
grant  execute on function public.correct_identity(uuid, text, text, text, text) to authenticated;

revoke execute on function public.staff_identity_history(uuid) from public, anon;
grant  execute on function public.staff_identity_history(uuid) to authenticated;

-- Submission surfaces.
revoke execute on function public.create_submission(jsonb, jsonb) from public, anon;
grant  execute on function public.create_submission(jsonb, jsonb) to authenticated;

revoke execute on function public.set_submission_status(uuid, text) from public, anon;
grant  execute on function public.set_submission_status(uuid, text) to authenticated;

-- Read payloads.
revoke execute on function public.officer_queue() from public, anon;
grant  execute on function public.officer_queue() to authenticated;

revoke execute on function public.role_rank(text, text) from public, anon;
grant  execute on function public.role_rank(text, text) to authenticated;

revoke execute on function public.get_promotion() from public, anon;
grant  execute on function public.get_promotion() to authenticated;
