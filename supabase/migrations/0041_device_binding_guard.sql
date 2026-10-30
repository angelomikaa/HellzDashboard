-- NeoFoot migration 0041: device-binding guard functions (08.1-08 / SEC-04 design).
--
-- Owner decision 2026-10-30 ("New migration 0041"). The 0024 guard functions were
-- designed and documented but never created in the live project (live
-- schema_migrations row 0024 belongs to role_rank_role_filter). The lineup RPCs
-- (0040) call public.assert_device_bound() as their first statement, so without
-- these functions every officer write fails with SQLSTATE 42883 instead of a
-- device check.
--
-- This migration creates ONLY the two guard functions, with the bodies, grants
-- and comments specified in 0024_device_binding_enforcement.sql (steps 1-2):
--   request_device_fingerprint()  the X-Device-Fingerprint header of this request
--   assert_device_bound()         raises device_mismatch unless the JWT device_fp
--                                 claim is non-empty AND equals that header
--
-- It deliberately does NOT touch set_member_role, set_member_active,
-- reset_member_pin or add_member. 0024 contains stub bodies for those four
-- functions; they are NOT applied here, so the live bodies stay exactly as
-- deployed.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0041_device_binding_guard.sql

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
  'Returns the X-Device-Fingerprint header the client sent on this request (0024, created live by 0041).';
comment on function public.assert_device_bound() is
  'Raises device_mismatch unless the JWT device_fp claim equals the request header (0024, created live by 0041). A session without the device_fp claim predates binding and must re-login.';

-- 3. Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0041', 'device_binding_guard', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
