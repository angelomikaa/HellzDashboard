-- Whitelist seed (D-05): re-runnable upsert. Owner replaces the placeholder
-- rows below with real members before launch:
--   1. node scripts/hash-pin.mjs <pin>   -> bcrypt hash
--   2. Replace discord_handle / display_name / pin_hash (keep roles per member)
-- PLACEHOLDER ROWS (approved by owner 2026-10-08). Hashes only — plaintext PINs
-- are intentionally NOT committed to the repo. Treat these hashes as compromised
-- once the repo is shared or made public: rotate handles/PINs before sharing
-- access with real members (WR-06).
insert into members (discord_handle, display_name, pin_hash, role, active) values
  ('owner-handle', 'Owner Nickname', '$2b$10$krLr0JopssxLgM8f7wkrJehkf6uxXCJtpIpvtbCkGZbZN9RbZ5BGW', 'owner', true),
  ('officer-handle', 'Officer Nickname', '$2b$10$Y.1gE1wPyzRc6oD2nwXzGuFMQ11U1IBERz.Khva4/Gohoto4mkWN.', 'officer', true),
  ('member-handle', 'Member Nickname', '$2b$10$qOMWJ1lrQA8Rsl9.9C2IgezqGUl02zWxgO7WSf9cGlF16GiOG.IsS', 'member', true)
on conflict (discord_handle) do update
  set display_name = excluded.display_name,
      pin_hash = excluded.pin_hash,
      role = excluded.role,
      active = excluded.active;
