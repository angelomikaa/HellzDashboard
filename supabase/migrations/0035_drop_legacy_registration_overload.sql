-- 0035_drop_legacy_registration_overload.sql
-- 0034 created create_registration_request v3 (6 args, p_pin_hash) but left the
-- 0020 five-arg overload (p_proof_path required, no PIN) in place: `create or
-- replace function` only targets an EXACT signature. PostgREST resolves by
-- argument names so the 0034 Edge function never reaches the legacy one, but a
-- dead overload that still demands a print contradicts the 0034 contract and is
-- a footgun for any future caller (the retired setup-pin path was its only
-- consumer). Drop it.
--
-- The trailing NOTIFY matters: migrations are applied through the Management
-- API Run Query endpoint, which does not emit PostgREST's schema-reload
-- notification. A freshly created RPC can therefore answer
-- "Could not find the function ... in the schema cache" until the next DDL —
-- which surfaced live as first-access answering server_error for a
-- not_registered claim (owner report 2026-10-26).
--
-- Append-only: 0001-0034 are never edited in place.

drop function if exists public.create_registration_request(text, text, text, text, text);

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0035', 'drop_legacy_registration_overload', null)
on conflict (version) do nothing;
