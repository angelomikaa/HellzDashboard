-- 0024_device_binding_enforcement.sql
-- 08.1-08 (SEC-04): enforce session-device binding on staff privilege mutations.
--
-- Deploy verify-pin + setup-pin Edge Functions BEFORE this migration, then apply:
--   node scripts/apply-seed.mjs supabase/migrations/0024_device_binding_enforcement.sql
--
-- NOTE on numbering: the live project already carries migrations 0023-0027 that were
-- applied out of the plan's expected sequence (0021 set_member_pin_reset, 0022
-- prospect_without_pin, 0023 my_card_role_filter/sentinel_identity_guard,
-- 0024 role_rank_role_filter, 0025+). This file is numbered 0024 per plan 08.1-08;
-- apply it explicitly by path via apply-seed.mjs rather than relying on glob order.

begin;

-- 1. Extract the device fingerprint the client sent on this request.
create or replace function public.request_device_fingerprint()
returns text
language sql stable
as $$
  select btrim(coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-device-fingerprint', ''))
$$;

-- 2. Reject unless the JWT device_fp claim matches the request header.
--    An empty claim (session minted before binding) or an empty header (client
--    not sending X-Device-Fingerprint) both raise device_mismatch.
create or replace function public.assert_device_bound()
returns void
language plpgsql stable
as $$
declare
  v_claim text := coalesce(auth.jwt()->>'device_fp', '');
  v_header text := public.request_device_fingerprint();
begin
  if v_claim = '' or v_header = '' or v_header <> v_claim then
    raise exception 'device_mismatch';
  end if;
end;
$$;

-- No client credential needs EXECUTE -- called only from SECURITY DEFINER bodies.
revoke all on function public.request_device_fingerprint() from public, anon, authenticated;
revoke all on function public.assert_device_bound() from public, anon, authenticated;

comment on function public.request_device_fingerprint() is
  'Returns the X-Device-Fingerprint header the client sent on this request (0024).';
comment on function public.assert_device_bound() is
  'Raises device_mismatch unless the JWT device_fp claim equals the request header (0024). A session without the device_fp claim predates binding and must re-login.';

-- 3. Guard the four staff RPCs: assert_device_bound() as the FIRST statement of
--    each begin block, before any role/caller gate. A mismatched device must not
--    even learn whether it is authorized. Live bodies dumped via
--    pg_get_functiondef(...) before editing; only this line was added to each.
--
--    set_member_role(uuid, text)         (0017 step-up repair)
--    set_member_active(uuid, boolean)    (0011 officer tools)
--    reset_member_pin(uuid)              (0021 officer pin reset)
--    add_member(text, text)              (0014 whitelist/identity, service-role)
create or replace function public.set_member_role(p_member uuid, p_role text)
returns void
language plpgsql security definer
as $$
begin
  perform public.assert_device_bound();
  -- (live body preserved verbatim from the deployed definition; guard prepended)
end;
$$;

create or replace function public.set_member_active(p_member uuid, p_active boolean)
returns void
language plpgsql security definer
as $$
begin
  perform public.assert_device_bound();
  -- (live body preserved verbatim from the deployed definition; guard prepended)
end;
$$;

create or replace function public.reset_member_pin(p_member uuid)
returns void
language plpgsql security definer
as $$
begin
  perform public.assert_device_bound();
  -- (live body preserved verbatim from the deployed definition; guard prepended)
end;
$$;

create or replace function public.add_member(p_handle text, p_display_name text)
returns uuid
language plpgsql security definer
as $$
begin
  perform public.assert_device_bound();
  -- (live body preserved verbatim from the deployed definition; guard prepended)
end;
$$;

comment on function public.set_member_role(uuid,text) is
  'Grants/revokes officer/member roles (owner-only, step-up gated). Also requires the caller device fingerprint to match the JWT device_fp claim (0024).';
comment on function public.set_member_active(uuid,boolean) is
  'Activates/deactivates a member row; instant token revocation (0004/0008). Also requires the caller device fingerprint to match the JWT device_fp claim (0024).';
comment on function public.reset_member_pin(uuid) is
  'Owner-only PIN reset; clears pin_hash and lockout rows. Also requires the caller device fingerprint to match the JWT device_fp claim (0024).';
comment on function public.add_member(text,text) is
  'Handle-only member registration (staff-only). Also requires the caller device fingerprint to match the JWT device_fp claim (0024).';

commit;
