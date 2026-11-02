-- NeoFoot migration 0064: real bodies for the four staff RPCs + device binding.
--
-- WHY: 0024_device_binding_enforcement.sql shipped STUB bodies
--   begin
--     perform public.assert_device_bound();
--     -- (live body preserved verbatim from the deployed definition; guard prepended)
--   end;
-- If the repo were replayed from scratch those four RPCs would become no-ops.
-- Worse, the live definitions were found WITHOUT the guard (verified
-- 2026-11-02 via pg_get_functiondef: device=false, search_path=true), so SEC-04
-- was recorded complete while the control did not exist.
--
-- WHAT: this migration installs the LIVE bodies byte-for-byte and prepends the
-- 0024 guard to each one. Every body already carries SET search_path = public
-- (the 0024 stubs did not), so the definer functions stay search_path-safe.
--
-- Call paths (all client restFetch, which sends X-Device-Fingerprint on every
-- request): addMember, resetMemberPin, setMemberRole (plus X-Step-Up),
-- setMemberActive. No Edge Function or trigger calls these internally, so the
-- guard cannot break an unheadered server-side path.
--
-- Append-only: 0024 is not edited; this is the single definition to apply.
--
-- Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0064_staff_rpc_bodies_and_device_guard.sql

begin;


-- set_member_role(p_member uuid, p_role text)
CREATE OR REPLACE FUNCTION public.set_member_role(p_member uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_role text;
  v_caller_id text;
  v_token text;
  v_step_up_id uuid;
  v_target_role text;
begin
  -- 0064: device binding restored (0024 intent). First statement, before
  -- any role gate, so a mismatched device cannot even probe authorization.
  perform public.assert_device_bound();
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
$function$;


-- set_member_active(p_member uuid, p_active boolean)
CREATE OR REPLACE FUNCTION public.set_member_active(p_member uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_role text;
begin
  -- 0064: device binding restored (0024 intent). First statement, before
  -- any role gate, so a mismatched device cannot even probe authorization.
  perform public.assert_device_bound();
  -- Staff gate verbatim (0009:62-68).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  -- (a) Self-deactivation lockout guard: never let a staff member flip
  -- their own active flag (a deactivated self would lock everyone out of
  -- reactivating them through the UI).
  if p_member::text = auth.jwt()->>'member_id' then
    raise exception 'forbidden';
  end if;

  -- (b) Target must exist (missing row -> forbidden, never a silent no-op).
  select m.role into v_target_role
  from members m
  where m.id = p_member;
  if v_target_role is null then
    raise exception 'forbidden';
  end if;

  -- (c) Owner rows are untouchable (D-08).
  if v_target_role = 'owner' then
    raise exception 'forbidden';
  end if;

  -- (d) Officers touch only ordinary member rows; the owner also touches
  -- officer rows (role-differentiated removal, AUTH-04).
  if coalesce(auth.jwt()->>'member_role', '') = 'officer'
     and v_target_role <> 'member' then
    raise exception 'forbidden';
  end if;

  update members set active = p_active where id = p_member;
end;
$function$;


-- reset_member_pin(p_member uuid)
CREATE OR REPLACE FUNCTION public.reset_member_pin(p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_role text := coalesce(auth.jwt()->>'member_role', '');
  v_caller_id text := coalesce(auth.jwt()->>'member_id', '');
  v_caller_active boolean;
  v_target_role text;
  v_handle text;
begin
  -- 0064: device binding restored (0024 intent). First statement, before
  -- any role gate, so a mismatched device cannot even probe authorization.
  perform public.assert_device_bound();
  -- Active staff caller (officer or owner). A stale/deleted caller is refused.
  select m.active into v_caller_active
  from members m
  where m.id::text = v_caller_id;

  if v_caller_role not in ('officer', 'owner') or v_caller_active is not true then
    raise exception 'forbidden';
  end if;

  select m.role, m.discord_handle into v_target_role, v_handle
  from members m where m.id = p_member;

  -- Missing target and owner targets are equally forbidden (D-08 precedent).
  if v_target_role is null or v_target_role = 'owner' then
    raise exception 'forbidden';
  end if;

  -- Officers reset MEMBERS only; an officer is reset by the owner.
  if v_caller_role = 'officer' and v_target_role <> 'member' then
    raise exception 'forbidden';
  end if;

  update members set pin_hash = null, claimed_at = null where id = p_member;

  -- D-16: the lockout rows are cleared with the claim, so the player can
  -- immediately use the first-access flow. 0020 keys login attempts by member
  -- id; the handle key is cleared too for rows written before 0020.
  delete from pin_login_attempts
  where discord_handle in (v_handle, p_member::text);
end;
$function$;


-- add_member(p_handle text, p_display_name text)
CREATE OR REPLACE FUNCTION public.add_member(p_handle text, p_display_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_handle text := btrim(coalesce(p_handle, ''));
  v_name text := btrim(coalesce(p_display_name, ''));
  v_existing members%rowtype;
  v_id uuid;
begin
  -- 0064: device binding restored (0024 intent). First statement, before
  -- any role gate, so a mismatched device cannot even probe authorization.
  perform public.assert_device_bound();
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
$function$;


comment on function public.set_member_role(uuid, text) is
  'Owner-only role grant/revoke (AUTH-03) with step-up re-PIN (0017) and device binding (0024 intent, 0064). Effective at next login; owner rows are immutable.';
comment on function public.set_member_active(uuid, boolean) is
  'Staff activate/deactivate (AUTH-04) with role-differentiated targets and device binding (0064). Deactivation is the instant kill-switch.';
comment on function public.reset_member_pin(uuid) is
  'Staff PIN reset (0021) with role-differentiated targets, lockout clearing and device binding (0064).';
comment on function public.add_member(text, text) is
  'Handle-only member creation/reactivation (WHIT-01/06/07) with device binding (0064). role=member, pin_hash NULL (unclaimed).';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0064', 'staff_rpc_bodies_and_device_guard', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
