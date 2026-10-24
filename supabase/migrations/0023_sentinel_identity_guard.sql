-- 0023_sentinel_identity_guard.sql
-- 08.1-06 (D-11, D-16 replacement): retire the placeholder identity namespace.
--
-- D-16 proposed a separate `stf-`/`off-` prefix for staff handles. The live
-- registry has 8 officers + 1 owner on REAL Discord handles, so renaming was
-- rejected as impractical. What is actually dangerous is the inverse: a
-- placeholder-shaped handle (`*-handle`) that carries staff privilege or a
-- login-capable PIN. This migration closes that namespace in the database,
-- not in the UI.
--
-- Apply to LIVE: node scripts/apply-seed.mjs supabase/migrations/0023_sentinel_identity_guard.sql
--
-- Requires: SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF in the session env.

begin;

-- 1. Neutralize every sentinel-shaped row: ordinary member, inactive, no PIN.
update public.members
   set role = 'member',
       active = false,
       pin_hash = null,
       claimed_at = null
 where discord_handle ~* '-handle$'
   and (role in ('officer', 'owner') or pin_hash is not null or active);

-- 2. Clear lockout state for those identities (0020 keys attempts by member id,
--    pre-0020 rows used the handle — clear both shapes).
delete from public.pin_login_attempts
 where discord_handle in (
   select m.id::text from public.members m where m.discord_handle ~* '-handle$'
   union
   select m.discord_handle from public.members m where m.discord_handle ~* '-handle$'
 );

-- 3. Hard guard: a sentinel-shaped handle can never be staff and never hold a
--    PIN. Evaluated on every insert/update, so add_member, setup-pin's claim and
--    a raw Management API write are all covered.
alter table public.members
  drop constraint if exists members_sentinel_not_privileged;
alter table public.members
  add constraint members_sentinel_not_privileged
  check (
    not (
      discord_handle ~* '-handle$'
      and (role in ('officer', 'owner') or pin_hash is not null)
    )
  );

comment on constraint members_sentinel_not_privileged on public.members is
  'Placeholder-shaped handles (*-handle) are inert by construction: never officer/owner, never PIN-capable. Replaces the rejected stf-/off- staff-prefix namespace (08.1 D-16, migration 0023).';

commit;
