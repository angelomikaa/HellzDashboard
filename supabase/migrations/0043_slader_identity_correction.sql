-- NeoFoot migration 0043: identity correction for Slader (owner decision, 2026-10-30).
--
-- Owner conference (2026-10-30): "Slader is correct - the current character ID in
-- the database appoints Slader as the current entry."
--
-- Context. Migration 0014 (D-21) makes the NEWEST member_identity_history row win
-- for display, so the Vigrid Field G2 leader was rendering as "pom":
--
--   row 1  source=request     2026-10-28 22:43  nickname xSLADE   char_id 17245
--   row 2  source=submission  2026-10-28 23:29  nickname pom      char_id 172453
--
-- The registration row also carried a truncated 5-digit char id (17245 vs
-- 172453), i.e. that first entry was a sloppy read. The owner ruled that the
-- registry identity (Slader / 172453 / Professor / mdps) is the current entry,
-- so "pom" is a bad identity value and must not drive any surface.
--
-- This migration reproduces exactly what public.correct_identity() does (it is
-- the same append-only path, run here as the sanctioned live-write mechanism
-- because no staff session token exists in this environment):
--   1. APPENDS a member_identity_history row source=correction (history is never
--      rewritten or deleted);
--   2. updates the members pointers (char_id, display_name, char_class,
--      char_function).
-- Idempotent: a re-run finds the newest row already correct and appends nothing.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0043_slader_identity_correction.sql

begin;

do $$
declare
  v_member    uuid;
  v_owner     uuid;
  v_nickname  text;
  v_char_id   text;
begin
  select id into v_member
  from public.members
  where lower(discord_handle) = 'xslade';

  if v_member is null then
    raise exception 'slader correction: no member with handle xSLADE';
  end if;

  select id into v_owner
  from public.members
  where role = 'owner' and active
  order by created_at
  limit 1;

  select h.nickname, h.char_id
    into v_nickname, v_char_id
  from public.member_identity_history h
  where h.member_id = v_member
  order by h.created_at desc
  limit 1;

  if v_nickname is distinct from 'Slader' or v_char_id is distinct from '172453' then
    -- The char id must stay unique across the registry and the history.
    if exists (select 1 from public.members m where m.char_id = '172453' and m.id <> v_member)
       or exists (select 1 from public.member_identity_history h
                  where h.char_id = '172453' and h.member_id <> v_member) then
      raise exception 'slader correction: duplicate char_id 172453';
    end if;

    insert into public.member_identity_history
      (member_id, submission_id, char_id, nickname, char_class, char_function, source, created_by)
    values
      (v_member, null, '172453', 'Slader', 'Professor', 'mdps', 'correction', v_owner);
  end if;

  update public.members
     set char_id       = '172453',
         display_name  = 'Slader',
         char_class    = 'Professor',
         char_function = 'mdps'
   where id = v_member;
end $$;

-- Invariant: the newest identity of the Raid 1 G2 leader is Slader / 172453, and
-- the registry agrees — every surface (lineup, Ranking, cards, roster) reads the
-- same name again.
do $$
declare
  v_member   uuid;
  v_registry text;
  v_latest   text;
  v_char_id  text;
begin
  select id, display_name into v_member, v_registry
  from public.members
  where lower(discord_handle) = 'xslade';

  select h.nickname, h.char_id into v_latest, v_char_id
  from public.member_identity_history h
  where h.member_id = v_member
  order by h.created_at desc
  limit 1;

  if v_registry is distinct from 'Slader'
     or v_latest is distinct from 'Slader'
     or v_char_id is distinct from '172453' then
    raise exception 'slader correction failed: registry=%, latest identity=%, char_id=%',
      v_registry, v_latest, v_char_id;
  end if;
end $$;

-- Bookkeeping + PostgREST reload (Management API never emits it — 0035 lesson).

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0043', 'slader_identity_correction', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
