-- Whitelist seed (D-05): re-runnable upsert. Owner replaces the placeholder
-- rows below with real members before launch:
--   1. node scripts/hash-pin.mjs <pin>   -> bcrypt hash
--   2. Replace discord_handle / display_name / pin_hash (keep roles per member)
-- PLACEHOLDER ROWS (approved by owner 2026-10-08). Hashes only — plaintext PINs
-- are intentionally NOT committed to the repo. Treat these hashes as compromised
-- once the repo is shared or made public: rotate handles/PINs before sharing
-- access with real members (WR-06).
--
-- 08.1-02: owner handle rotated to real handle 'satturne' (PIN 0192, hash
-- applied out-of-band via apply-seed.mjs). Officer and member placeholder
-- rows kept as smoke-test fixtures (real officers already exist in DB; no
-- real members yet). Old committed hash remains in git history (D-11 accepted
-- risk; no history rewrite).
insert into members (discord_handle, display_name, pin_hash, role, active) values
  ('satturne', 'Owner', '$2b$10$PuVXMC21m5qsfswI12bha.WcSNNs.o/Or4Vg5hQCjKY1as0oJDyFW', 'owner', true),
  ('officer-handle', 'Officer Nickname', '$2b$10$Y.1gE1wPyzRc6oD2nwXzGuFMQ11U1IBERz.Khva4/Gohoto4mkWN.', 'officer', true),
  ('member-handle', 'Member Nickname', '$2b$10$qOMWJ1lrQA8Rsl9.9C2IgezqGUl02zWxgO7WSf9cGlF16GiOG.IsS', 'member', true)
on conflict (discord_handle) do update
  set display_name = excluded.display_name,
      pin_hash = excluded.pin_hash,
      role = excluded.role,
      active = excluded.active;
