-- 0017_step_up_repair.sql
-- Repairs the 08.1-05 step-up implementation. UAT found that promoting or
-- demoting a member always failed with the generic save copy; three defects
-- were stacked in migration 0016:
--
--   1. set_member_role wrote `auth.jwt()->>'member_id'::uuid`. `::` binds
--      tighter than `->>`, so Postgres parsed it as `->> ('member_id'::uuid)`
--      and raised 22P02 (invalid input syntax for type uuid: "member_id") on
--      EVERY call, before the token check could run.
--   2. The RPC never read the X-Step-Up token the client sends: it accepted
--      ANY unconsumed, unexpired token for the caller. The token is now
--      matched by id, caller, device and expiry, then consumed.
--   3. request_step_up validated the PIN with pgcrypto `crypt()`. pgcrypto
--      cannot verify bcryptjs '$2b$' hashes (it treats the prefix as a DES
--      salt and silently returns a non-matching hash), and it is not on the
--      function's search_path (pgcrypto lives in `extensions`). PIN checks
--      stay in the Edge layer with bcryptjs — the same library verify-pin
--      uses — so the RPC is dropped and the new `step-up` Edge Function owns
--      issuance (service role insert into step_up_tokens).
--
-- Apply to LIVE: node scripts/apply-seed.mjs supabase/migrations/0017_step_up_repair.sql
-- and deploy the function: supabase functions deploy step-up

drop function if exists public.request_step_up(uuid, text);

-- HARDENING (0016 shipped this table with RLS disabled and Supabase's default
-- full grants to anon/authenticated, i.e. any visitor could insert/read/delete
-- step-up rows directly and sidestep the PIN check). RPC-only by construction:
-- enable RLS with no policies and take the table grants away. The Edge Function
-- uses the service role and the SECURITY DEFINER RPC runs as the table owner,
-- so both keep working.
alter table public.step_up_tokens enable row level security;
revoke all on table public.step_up_tokens from anon, authenticated;

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
  v_caller_id text;
  v_token text;
  v_step_up_id uuid;
  v_target_role text;
begin
  -- Owner gate (verbatim from 0011): only the owner changes roles.
  v_caller_role := coalesce(auth.jwt()->>'member_role', '');
  if v_caller_role <> 'owner' or not public.is_active_owner() then
    raise exception 'forbidden';
  end if;

  v_caller_id := auth.jwt()->>'member_id';

  -- D-14/D-15: the single-use token issued by the step-up Edge Function,
  -- presented in the X-Step-Up header. PostgREST exposes request headers as a
  -- JSON object in request.headers. Text comparison on id/member_id keeps a
  -- junk header from raising a cast error (it is simply step_up_required).
  v_token := btrim(coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb->>'x-step-up',
    ''
  ));
  if v_token = '' then
    raise exception 'step_up_required';
  end if;

  select t.id
    into v_step_up_id
    from public.step_up_tokens t
   where t.id::text = v_token
     and t.member_id::text = v_caller_id
     and t.device_fp = coalesce(auth.jwt()->>'device_fp', '')
     and not t.used
     and t.expires_at > now()
   limit 1;

  if v_step_up_id is null then
    raise exception 'step_up_required';
  end if;

  -- Validate the target BEFORE consuming the token: a rejected role must not
  -- burn a re-PIN.
  select role into v_target_role from public.members where id = p_member;
  if not found then
    raise exception 'invalid_member';
  end if;
  if v_target_role = 'owner' then
    raise exception 'forbidden';
  end if;
  if p_role is null or p_role not in ('member', 'officer') then
    raise exception 'invalid_role';
  end if;

  -- Single use: consume before the write.
  update public.step_up_tokens set used = true where id = v_step_up_id;

  update public.members set role = p_role where id = p_member;
end;
$$;

comment on function public.set_member_role(uuid, text) is
  'Owner-only role change with step-up enforcement (0016 repaired by 0017). Requires the X-Step-Up token id issued by the step-up Edge Function: single-use, device-bound to the caller''s JWT device_fp, valid 10 minutes. Owner targets immutable; p_role limited to member|officer. Exceptions: forbidden/invalid_member/invalid_role/step_up_required.';

revoke all on function public.set_member_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;

-- Lookup path for the token check (id + caller + device + unused + fresh).
create index if not exists idx_step_up_tokens_lookup
  on public.step_up_tokens (member_id, device_fp, expires_at)
  where not used;
