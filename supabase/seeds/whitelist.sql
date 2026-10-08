-- Whitelist seed (D-05): owner generates hashes with `node scripts/hash-pin.mjs <pin>`
-- and replaces the example handles/hashes below. Re-runnable via upsert.
insert into members (discord_handle, display_name, pin_hash, role, active) values
  ('owner-handle', 'Owner Nickname', '<bcrypt hash from scripts/hash-pin.mjs>', 'owner', true),
  ('officer-handle', 'Officer Nickname', '<bcrypt hash from scripts/hash-pin.mjs>', 'officer', true),
  ('member-handle', 'Member Nickname', '<bcrypt hash from scripts/hash-pin.mjs>', 'member', true)
on conflict (discord_handle) do update
  set display_name = excluded.display_name,
      pin_hash = excluded.pin_hash,
      role = excluded.role,
      active = excluded.active;
