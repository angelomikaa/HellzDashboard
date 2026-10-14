-- Class catalog (REG-02 + ROLE-12): re-runnable. The owner extends this via
-- the admin UI (owner-only RLS insert) -- this seed just bootstraps it.
--
-- 15 transcendent (currently-released top-job) names, verified against the
-- official job-tree API on 2026-10-13
-- (https://rooc-official-am-api.joymaker.com/api/rooc/job-intro):
--   Renames: Assassin->Assassin Cross, Knight->Lord Knight, Wizard->High Wizard,
--   Hunter->Sniper (released-job rule: Ranger is a site-hidden 3rd job, TBA
--   like Grand Summoner/Nightwatch), Priest->High Priest,
--   Blacksmith->Mastersmith, Crusader->Paladin, Sage->Professor, Rogue->Stalker,
--   Alchemist->Biochemist, Monk->Champion.
--   Kept: Bard, Gypsy (gender-split entries preserved). Removed: Dancer
--   (base name), Super Novice (unreleased -- absent from the API entirely).
--   Added: Summoner, Rebellion.
-- Migration 0012 aligns existing rows/members; this seed matches the
-- post-migration catalog and stays re-runnable.
insert into classes (class_name) values
  ('Assassin Cross'), ('Lord Knight'), ('High Wizard'), ('Sniper'), ('High Priest'),
  ('Mastersmith'), ('Paladin'), ('Professor'), ('Stalker'), ('Biochemist'),
  ('Champion'), ('Bard'), ('Gypsy'), ('Summoner'), ('Rebellion')
on conflict (class_name) do nothing;
