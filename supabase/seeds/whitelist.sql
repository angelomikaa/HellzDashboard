-- Whitelist seed — CREDENTIAL-FREE TEMPLATE (08.1-06; D-10, D-11).
--
-- This file must NEVER contain a real handle, a bcrypt hash or a PIN. The
-- previous revision committed the owner's live handle, its bcrypt hash and the
-- plaintext PIN in a comment; both are in git history and are treated as
-- compromised (D-11: rotate, accept history, no rewrite).
--
-- Live staff rows are provisioned out of band, in this order:
--   1. add_member(handle, display_name)            -> role member, no PIN
--   2. node scripts/set-member-pin.mjs <handle>    -> PIN chosen at a prompt
--   3. owner-only set_member_role via the panel    -> officer elevation (step-up)
--
-- The rows below are inert placeholders: role member, inactive, no PIN. They
-- exist only so this file stays a runnable no-op. `do update` touches nothing
-- but display_name, so a re-run can never clobber a live credential.
insert into members (discord_handle, display_name, pin_hash, role, active) values
  ('owner-placeholder',   'Owner Placeholder',   null, 'member', false),
  ('officer-placeholder', 'Officer Placeholder', null, 'member', false),
  ('member-placeholder',  'Member Placeholder',  null, 'member', false)
on conflict (discord_handle) do update
  set display_name = excluded.display_name;
