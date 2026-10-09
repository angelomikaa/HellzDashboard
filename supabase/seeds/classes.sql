-- Starter class list (REG-02): re-runnable. The owner extends this via the
-- admin UI (officer/owner-only RLS insert) — this seed just bootstraps it.
insert into classes (class_name) values
  ('Assassin'), ('Knight'), ('Wizard'), ('Hunter'), ('Priest'), ('Blacksmith'),
  ('Crusader'), ('Sage'), ('Rogue'), ('Alchemist'), ('Bard'), ('Dancer'),
  ('Gypsy'), ('Monk'), ('Super Novice')
on conflict (class_name) do nothing;
