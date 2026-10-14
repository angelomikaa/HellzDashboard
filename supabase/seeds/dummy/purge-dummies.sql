-- NeoFoot dummy purge (plan 07-03, SEED-02): FK-safe, idempotent, sentinel-
-- scoped (dummy-%). ONE file, ONE transaction.
--
-- FK order is load-bearing: submissions BEFORE members (submissions ->
-- members has NO cascade / NO ACTION per 0001); submission_stats cascades
-- with submissions AND is deleted explicitly (belt-and-suspenders, keeps the
-- order self-documenting). pin_login_attempts first (T-07-10).
--
-- Apply to LIVE: node scripts/apply-seed.mjs supabase/seeds/dummy/purge-dummies.sql

begin;
delete from pin_login_attempts where discord_handle like 'dummy-%';
delete from submission_stats where submission_id in (
  select s.id from submissions s join members m on m.id = s.member_id
  where m.discord_handle like 'dummy-%'
);
delete from submissions where member_id in (
  select id from members where discord_handle like 'dummy-%'
);
delete from members where discord_handle like 'dummy-%';
commit;

-- Zero-dummy verification (run after the purge; MUST return four zeros).
select (select count(*) from members where discord_handle like 'dummy-%') as members,
       (select count(*) from submissions s join members m on m.id = s.member_id where m.discord_handle like 'dummy-%') as submissions,
       (select count(*) from submission_stats ss join submissions s on s.id = ss.submission_id join members m on m.id = s.member_id where m.discord_handle like 'dummy-%') as stats,
       (select count(*) from pin_login_attempts where discord_handle like 'dummy-%') as attempts;
