-- NeoFoot step-up (re-PIN) authentication (Phase 08.1, plan 08.1-05; D-14/D-15).
-- Step-up re-PIN is required for HANDLING actions only — role changes / hierarchy
-- system actions (set_member_role). Ordinary member flows are NOT stepped up.
-- Only the OWNER has universal power over the hierarchy system (owner gate
-- verbatim from migration 0011). A short-lived step-up token is issued after
-- successful re-PIN and presented on the handling RPC call.
--
-- Apply to LIVE: node scripts/apply-seed.mjs supabase/migrations/0016_stepup_pin.sql
-- (uses the Management API /database/query endpoint — the sanctioned live-write path)

-- 1) step-up token table — short-lived (10 min), single-use, device-bound.
--    RPC-only writes: no RLS policies (RPC gates all access).
create table if not exists step_up_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  device_fp text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used boolean not null default false
);
create index idx_step_up_tokens_member on step_up_tokens(member_id, created_at desc);

comment on table step_up_tokens is 'Short-lived (10 min), single-use, device-bound step-up tokens issued after re-PIN validation; consumed by set_member_role.';

-- 2) re-PIN RPC — request_step_up(p_member uuid, p_pin text) returns uuid.
--    Caller gate: member_id claim == p_member, or owner acting on behalf.
--    Validates target member exists and active; bcrypt.compareSync(p_pin, pin_hash)
--    on wrong PIN raises invalid_pin and records via record_pin_failure (existing
--    lockout machinery, no second counter); missing/inactive target raises
--    invalid_member; on success inserts a step_up_tokens row (device_fp from the
--    JWT custom claim if present, else null), marks prior tokens for that member
--    used, returns the new token id. PIN never logged or returned.
create or replace function public.request_step_up(
  p_member uuid,
  p_pin text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_target_id uuid;
  v_target_role text;
  v_target_active boolean;
  v_target_pin_hash text;
  v_device_fp text;
  v_token_id uuid;
  v_match boolean;
begin
  -- Identity of the caller from the JWT.
  select auth.jwt()->>'member_id', auth.jwt()->>'member_role'
    into v_caller_id, v_caller_role;

  -- Owner acting on behalf: owner can request step-up for any member.
  -- Non-owner: can only request for themselves.
  if v_caller_role <> 'owner' then
    if p_member is null or p_member::text <> v_caller_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Target member must exist and be active.
  select id, role, active, pin_hash
    into v_target_id, v_target_role, v_target_active, v_target_pin_hash
    from members
    where id = p_member;

  if not found then
    raise exception 'invalid_member';
  end if;

  if not v_target_active then
    raise exception 'invalid_member';
  end if;

  -- Device fingerprint from the JWT custom claim (if present).
  select auth.jwt()->>'device_fp' into v_device_fp;

  -- Validate PIN.
  begin
    v_match := crypt(p_pin, v_target_pin_hash) = v_target_pin_hash;
  exception when others then
    v_match := false;
  end;

  if not v_match then
    -- Record the failure through the existing lockout machinery (no second counter).
    perform public.record_pin_failure(p_handle := (select discord_handle from members where id = p_member));
    raise exception 'invalid_pin';
  end if;

  -- Invalidate prior step-up tokens for this member (single-use).
  update step_up_tokens
    set used = true
    where member_id = p_member and not used;

  -- Issue a new short-lived step-up token.
  insert into step_up_tokens (member_id, device_fp)
    values (p_member, coalesce(v_device_fp, ''))
    returning id into v_token_id;

  return v_token_id;
end;
$$;

comment on function public.request_step_up(uuid, text) is 'Re-PIN step-up issuance: validates PIN, returns a short-lived (10 min), single-use, device-bound step-up token id. PIN never logged or returned.';

-- Revoke from public/anon/authenticated; grant to authenticated only (caller
-- gate inside the function enforces self-or-owner).
revoke all on function public.request_step_up(uuid, text) from public, anon, authenticated;
grant execute on function public.request_step_up(uuid, text) to authenticated;

-- 3) Patch set_member_role — full byte-faithful copy of the 0011 body PLUS
--    step-up enforcement at the top (after the owner gate).
create or replace function public.set_member_role(
  p_member uuid,
  p_role text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_target_role text;
  v_target_active boolean;
  v_is_owner boolean;
  v_step_up_id uuid;
begin
  -- Owner gate (verbatim from migration 0011): only the owner can change roles.
  v_caller_role := coalesce(auth.jwt()->>'member_role', '');
  v_is_owner := v_caller_role = 'owner' and public.is_active_owner();
  if not v_is_owner then
    raise exception 'forbidden';
  end if;

  -- D-14/D-15: step-up enforcement — require a valid unconsumed step-up token.
  select id
    into v_step_up_id
    from step_up_tokens
    where member_id = auth.jwt()->>'member_id'::uuid
      and device_fp = coalesce(auth.jwt()->>'device_fp', '')
      and not used
      and expires_at > now()
    limit 1;

  if not found then
    raise exception 'step_up_required';
  end if;

  -- Mark the token consumed (single-use).
  update step_up_tokens set used = true where id = v_step_up_id;

  -- p_role in ('member','officer') else invalid_role; owner targets immutable.
  select role into v_target_role from members where id = p_member;
  if not found then
    raise exception 'invalid_member';
  end if;

  if v_target_role = 'owner' then
    raise exception 'forbidden';
  end if;

  if p_role not in ('member', 'officer') then
    raise exception 'invalid_role';
  end if;

  update members set role = p_role where id = p_member;
end;
$$;

comment on function public.set_member_role(uuid, text) is 'Owner-only role change with step-up re-PIN enforcement. Requires a valid unconsumed step-up token (device-bound, 10 min). Owner targets immutable.';

-- Revoke from public/anon/authenticated; grant to authenticated only (owner gate
-- inside the function enforces authorization).
revoke all on function public.set_member_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
