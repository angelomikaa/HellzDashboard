-- supabase/seeds/live/legacy-claim-conversion.sql
--
-- Phase 8 (08-06) legacy roster migration: every non-owner, non-dummy handle
-- that still has a PIN becomes an UNCLAIMED account. The member re-claims via
-- the "Primeiro acesso" flow (setup-pin), supplying their own PIN + identity
-- proof. Identity is intentionally NOT backfilled: each member claims their own
-- character ID on first access.
--
-- Exclusions (never touched):
--   - role = 'owner'           (owner rotated out-of-band, separately)
--   - discord_handle ilike 'dummy-%'  (test roster, kept claimed for smoke runs)
--
-- Consequences:
--   - All converted members are signed out until first access.
--   - pin_login_attempts rows for converted handles are deleted so a stale
--     lockout cannot block the first claim.
--   - Idempotent: a second run affects 0 rows and does not error.
--
-- NOT a schema migration: no schema_migrations row is written. Applied via
-- scripts/apply-seed.mjs (Management API). Dry-run census (2026-10-21):
--   role=member: 74 total, 1 already unclaimed, 73 dummies
--   role=officer: 1 total, 0 unclaimed, 0 dummies  -> 1 converted
--   role=owner:   1 total, 0 unclaimed
-- Apply requires explicit owner approval (recorded in 08-06-SUMMARY).

do $$
declare
  v_before int;
  v_after  int;
  v_attempts int;
begin
  select count(*) into v_before
  from members
  where role <> 'owner'
    and pin_hash is not null
    and discord_handle not ilike 'dummy-%';

  delete from pin_login_attempts
  where discord_handle in (
    select discord_handle from members
    where role <> 'owner'
      and discord_handle not ilike 'dummy-%'
  );
  get diagnostics v_attempts = row_count;

  update members
     set pin_hash = null,
         claimed_at = null
   where role <> 'owner'
     and pin_hash is not null
     and discord_handle not ilike 'dummy-%';

  select count(*) into v_after
  from members
  where role <> 'owner'
    and pin_hash is not null
    and discord_handle not ilike 'dummy-%';

  if v_after <> 0 then
    raise exception 'legacy conversion incomplete: % rows remain claimed', v_after;
  end if;

  raise notice 'legacy conversion: % handles converted to unclaimed, % lockout rows cleared',
    v_before, v_attempts;
end $$;

-- Post-conditions (informational; must hold after apply):
-- owner rows keep pin_hash:
select count(*) as owner_claimed from members where role = 'owner' and pin_hash is not null;
-- dummy rows keep pin_hash:
select count(*) as dummy_claimed from members where discord_handle ilike 'dummy-%' and pin_hash is not null;
-- no non-owner real row remains claimed:
select count(*) as nonowner_real_claimed from members
  where role <> 'owner' and pin_hash is not null and discord_handle not ilike 'dummy-%';
-- no lockout rows for converted (non-owner, non-dummy) handles:
select count(*) as converted_lockouts from pin_login_attempts
  where discord_handle in (select discord_handle from members where role <> 'owner' and discord_handle not ilike 'dummy-%');
