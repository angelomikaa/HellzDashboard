-- NeoFoot Phase 7 (plan 07-01): class catalog alignment + build-role vocabulary
-- widen, shipped as an append-only corrective migration -- 0001-0011 are NEVER
-- edited in place (0008/0011 precedent).
--
--   ROLE-12 (D-01/D-02): catalog moves to transcendent (2nd-advanced, "final-
--            form") class names -- the currently-RELEASED in-game top job per
--            line. Verified against the official job-tree API on 2026-10-13
--            (https://rooc-official-am-api.joymaker.com/api/rooc/job-intro,
--            the JSON the official site renders). Unreleased jobs get NO
--            catalog entries: all `third_transfer` (3rd) jobs are site-hidden
--            -- e.g. every line's 3rd job (Mechanic, Warlock, ...) -- exactly like
--            the owner already treats Grand Summoner / Night Watch (TBA, no
--            calendar date).
--   D-02 CORRECTION (live-API verified 2026-10-13): the Archer line's released
--            top job is **Sniper** (second_advanced_transfer, id 52); its
--            third_transfer job (id 55) is unreleased by the same rule.
--            D-02's own tie-break "currently-released job wins" resolves
--            Hunter -> 'Sniper'. Per plan acceptance, this file must never
--            contain the Archer 3rd-job name string at all.
--   D-03:    renames preserve OVR continuity -- class_key_stats rows are moved
--            in LOCKSTEP (no FK from class_key_stats to classes, 0001:34-38)
--            and members.char_class is re-pointed before the old class rows
--            are deleted (members.char_class FK = NO ACTION, 0005:25).
--   D-04/D-05 (schema half): char_function widens to exactly-one-of
--            dps/mdps/suporte; existing 'tank' rows rename to 'suporte'.
--            Rank RPCs are untouched (Phase 9 owns all rank math).
--
-- Rename mechanics (each pair, exact sub-order -- FK NO ACTION demands children
-- exist/point first):
--   (1) insert the new class name (on conflict do nothing -- also protects
--     against a pre-existing target added earlier via the admin UI);
--   (2) move class_key_stats rows old->new (only where the (new, stat_key) target
--     is free -- merge guard);
--   (3) delete any old class_key_stats rows that merged into a pre-existing
--     target (only reachable if staff had already added the new name);
--   (4) update members.char_class old->new;
--   (5) delete the old class row (now unreferenced).
--
-- Removals (Dancer, Super Novice): delete ONLY if no member references them.
-- If any real member still carries Dancer/Super Novice, the row intentionally
-- REMAINS (append-only discipline -- staff reassigns via Personagens; do not
-- force). Super Novice does not exist in the official job-tree API at all
-- (verified 2026-10-13) -- removed as an unreleased-job entry (D-01).

-- ---------------------------------------------------------------------------
-- 1. char_function widen/rename (D-04/D-05). Order is load-bearing: the
--    UPDATE must run BETWEEN dropping and re-adding the CHECK -- updating
--    before dropping would violate the old ('tank','dps') CHECK.
-- ---------------------------------------------------------------------------
alter table members drop constraint members_char_function_check;
update members set char_function = 'suporte' where char_function = 'tank';
alter table members add constraint members_char_function_check
  check (char_function in ('dps','mdps','suporte'));

-- ---------------------------------------------------------------------------
-- 2. Class renames (11 pairs, verbatim -- Sniper per the D-02 live-API
--    correction; the Archer 3rd-job name never appears in this file).
-- ---------------------------------------------------------------------------

-- Assassin -> Assassin Cross
insert into classes (class_name) values ('Assassin Cross') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Assassin Cross' where k.class_name = 'Assassin' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Assassin Cross' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Assassin';
update members set char_class = 'Assassin Cross' where char_class = 'Assassin';
delete from classes where class_name = 'Assassin';

-- Knight -> Lord Knight
insert into classes (class_name) values ('Lord Knight') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Lord Knight' where k.class_name = 'Knight' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Lord Knight' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Knight';
update members set char_class = 'Lord Knight' where char_class = 'Knight';
delete from classes where class_name = 'Knight';

-- Wizard -> High Wizard
insert into classes (class_name) values ('High Wizard') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'High Wizard' where k.class_name = 'Wizard' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'High Wizard' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Wizard';
update members set char_class = 'High Wizard' where char_class = 'Wizard';
delete from classes where class_name = 'Wizard';

-- Hunter -> Sniper (D-02 correction: released-job rule; the Archer line's
--   third_transfer job is unreleased)
insert into classes (class_name) values ('Sniper') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Sniper' where k.class_name = 'Hunter' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Sniper' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Hunter';
update members set char_class = 'Sniper' where char_class = 'Hunter';
delete from classes where class_name = 'Hunter';

-- Priest -> High Priest
insert into classes (class_name) values ('High Priest') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'High Priest' where k.class_name = 'Priest' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'High Priest' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Priest';
update members set char_class = 'High Priest' where char_class = 'Priest';
delete from classes where class_name = 'Priest';

-- Blacksmith -> Mastersmith
insert into classes (class_name) values ('Mastersmith') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Mastersmith' where k.class_name = 'Blacksmith' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Mastersmith' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Blacksmith';
update members set char_class = 'Mastersmith' where char_class = 'Blacksmith';
delete from classes where class_name = 'Blacksmith';

-- Crusader -> Paladin
insert into classes (class_name) values ('Paladin') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Paladin' where k.class_name = 'Crusader' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Paladin' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Crusader';
update members set char_class = 'Paladin' where char_class = 'Crusader';
delete from classes where class_name = 'Crusader';

-- Sage -> Professor
insert into classes (class_name) values ('Professor') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Professor' where k.class_name = 'Sage' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Professor' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Sage';
update members set char_class = 'Professor' where char_class = 'Sage';
delete from classes where class_name = 'Sage';

-- Rogue -> Stalker
insert into classes (class_name) values ('Stalker') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Stalker' where k.class_name = 'Rogue' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Stalker' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Rogue';
update members set char_class = 'Stalker' where char_class = 'Rogue';
delete from classes where class_name = 'Rogue';

-- Alchemist -> Biochemist
insert into classes (class_name) values ('Biochemist') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Biochemist' where k.class_name = 'Alchemist' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Biochemist' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Alchemist';
update members set char_class = 'Biochemist' where char_class = 'Alchemist';
delete from classes where class_name = 'Alchemist';

-- Monk -> Champion
insert into classes (class_name) values ('Champion') on conflict (class_name) do nothing;
update class_key_stats k set class_name = 'Champion' where k.class_name = 'Monk' and not exists (select 1 from class_key_stats k2 where k2.class_name = 'Champion' and k2.stat_key = k.stat_key);
delete from class_key_stats where class_name = 'Monk';
update members set char_class = 'Champion' where char_class = 'Monk';
delete from classes where class_name = 'Monk';

-- ---------------------------------------------------------------------------
-- 3. Removals (Dancer, Super Novice) -- ONLY if unreferenced. If a real member
--    still carries one of these, the row intentionally REMAINS (append-only
--    discipline -- staff reassigns via Personagens; do not force).
-- ---------------------------------------------------------------------------
delete from class_key_stats k
  where k.class_name in ('Dancer','Super Novice')
    and not exists (select 1 from members m where m.char_class = k.class_name);
delete from classes c
  where c.class_name in ('Dancer','Super Novice')
    and not exists (select 1 from members m where m.char_class = c.class_name);

-- ---------------------------------------------------------------------------
-- 4. Additions -- 'Sniper' already comes from the Hunter rename pair above;
--    Summoner (Doram line, current released top job) and Rebellion
--    (Gunslinger line) get their own plain inserts. Grand Summoner /
--    Nightwatch are third_transfer TBA jobs (no calendar date) -- no entries
--    now; pivot later if/when they release (D-01/D-02).
-- ---------------------------------------------------------------------------
insert into classes (class_name) values ('Summoner'), ('Rebellion')
  on conflict (class_name) do nothing;
