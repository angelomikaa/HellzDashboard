-- NeoFoot migration 0057: Emperium party-distribution invariant (owner 2026-11-01).
--
-- Correction to 0056: the Emperium mode must ALWAYS contain exactly 16 parties
-- across its 2..8 raids, with no raid above 8 parties. The current guild layout
-- is 3 raids with 6/6/4 parties (16 total), exactly like the owner's example.
--
-- This migration:
--   1. Replaces the Emperium seed (24 parties x 8 each from 0056) with 3 raids
--      of 6/6/4 parties = 16 parties / 80 slots, matching the guild size.
--   2. Adds a shared rebuild helper that preserves each party's role label and
--      member assignments while regrouping the 16 parties into new raid counts.
--   3. Adds set_lineup_party_counts(): officers can choose any valid distribution
--      (2..8 raids, 1..8 parties per raid, sum exactly 16).
--   4. Replaces set_lineup_raid_count(): adding/removing a raid rebalances the 16
--      parties deterministically (6/6/4 for 3 raids) and preserves members.
--      Removing a non-empty raid is now safe because the rebuild keeps all seats.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0057_emperium_party_distribution.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Private helpers (no client execute).
-- ---------------------------------------------------------------------------

create or replace function public._default_emperium_party_counts(p_raids int)
returns int[]
language plpgsql
immutable
as $function$
declare
  v_counts int[] := '{}';
  v_base int;
  v_rem int;
  v_i int;
begin
  -- The owner's current 3-raid layout is 6/6/4 (16 parties, 80 slots).
  if p_raids = 2 then
    return array[8, 8];
  end if;
  if p_raids = 3 then
    return array[6, 6, 4];
  end if;
  if p_raids < 2 or p_raids > 8 then
    raise exception 'invalid_lineup_raid_count';
  end if;

  v_base := 16 / p_raids;
  v_rem := 16 % p_raids;
  for v_i in 1..p_raids loop
    v_counts := array_append(
      v_counts,
      v_base + case when v_i <= v_rem then 1 else 0 end
    );
  end loop;
  return v_counts;
end;
$function$;

revoke all on function public._default_emperium_party_counts(int) from public, anon, authenticated;

/**
 * Regroup the current 16 Emperium parties into p_counts (raid 1..N, each 1..8,
 * sum 16). Party order is preserved, so role labels and seated members travel
 * with their party. The caller validates p_counts and the officer/device gate.
 */
create or replace function public._rebuild_emperium_parties(p_counts int[])
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_parties jsonb;
  v_old_count int;
  v_global int := 0;
  v_raid int;
  v_party int;
  v_slot int;
  v_role text;
  v_member uuid;
begin
  select count(*) into v_old_count
  from lineup_parties
  where war_mode = 'emperium';

  if v_old_count <> 16 then
    raise exception 'invalid_lineup_party_count';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'role_label', p.role_label,
      'members', (
        select jsonb_agg(s.member_id order by s.slot_index)
        from lineup_slots s
        where s.war_mode = p.war_mode
          and s.battlefield = p.battlefield
          and s.party_index = p.party_index
      )
    )
    order by p.raid_index, p.party_index
  )
  into v_parties
  from lineup_parties p
  where p.war_mode = 'emperium';

  delete from lineup_parties where war_mode = 'emperium';

  for v_raid in 1..array_length(p_counts, 1) loop
    for v_party in 1..p_counts[v_raid] loop
      v_global := v_global + 1;
      v_role := v_parties->(v_global - 1)->>'role_label';

      insert into lineup_parties (war_mode, battlefield, raid_index, party_index, role_label)
      values ('emperium', 'emperium_raid_' || v_raid, v_raid, v_party, v_role);

      for v_slot in 1..5 loop
        v_member := nullif(v_parties->(v_global - 1)->'members'->>(v_slot - 1), '')::uuid;
        insert into lineup_slots (war_mode, battlefield, raid_index, party_index, slot_index, member_id)
        values ('emperium', 'emperium_raid_' || v_raid, v_raid, v_party, v_slot, v_member);
      end loop;
    end loop;
  end loop;
end;
$function$;

revoke all on function public._rebuild_emperium_parties(int[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Officer write: any valid party distribution.
--    2..8 raids, 1..8 parties per raid, sum exactly 16.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_party_counts(
  p_war_mode text,
  p_counts int[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'emperium');
  v_len int;
  v_sum int;
  v_bad int;
begin
  if v_mode <> 'emperium' then
    raise exception 'invalid_war_mode';
  end if;

  perform public.assert_device_bound();

  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  v_len := coalesce(array_length(p_counts, 1), 0);
  if v_len < 2 or v_len > 8 then
    raise exception 'invalid_lineup_party_counts';
  end if;

  select coalesce(sum(x), 0), count(*) filter (where x < 1 or x > 8)
    into v_sum, v_bad
  from unnest(p_counts) as t(x);

  if v_sum <> 16 or v_bad <> 0 then
    raise exception 'invalid_lineup_party_counts';
  end if;

  perform public._rebuild_emperium_parties(p_counts);

  insert into lineup_war_config (war_mode, raid_count)
  values ('emperium', v_len)
  on conflict (war_mode) do update
    set raid_count = excluded.raid_count, updated_at = now();

  return public.get_lineups_mode('emperium');
end;
$function$;

comment on function public.set_lineup_party_counts(text, int[]) is
  'Officer/owner Emperium distribution write (0057): device-bound; requires 2..8 raids, 1..8 parties per raid and exactly 16 parties total. Rebuilds the grouping while preserving role labels and seated members. Returns get_lineups_mode().';

revoke all on function public.set_lineup_party_counts(text, int[]) from public, anon;
grant execute on function public.set_lineup_party_counts(text, int[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Replace the raid-count write: adding/removing a raid rebalances the 16
--    parties (6/6/4 for 3 raids) and preserves members.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_raid_count(
  p_war_mode text,
  p_raid_count smallint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'vigrid');
  v_counts int[];
begin
  if v_mode not in ('vigrid', 'emperium') then
    raise exception 'invalid_war_mode';
  end if;

  perform public.assert_device_bound();

  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_raid_count is null or p_raid_count < 2 or p_raid_count > 8 then
    raise exception 'invalid_lineup_raid_count';
  end if;

  -- Vigrid deliberately stays at its two fixed raids.
  if v_mode = 'vigrid' then
    if p_raid_count <> 2 then
      raise exception 'invalid_lineup_raid_count';
    end if;
    insert into lineup_war_config (war_mode, raid_count)
    values ('vigrid', 2)
    on conflict (war_mode) do update set raid_count = 2, updated_at = now();
    return public.get_lineups_mode('vigrid');
  end if;

  v_counts := public._default_emperium_party_counts(p_raid_count);
  perform public._rebuild_emperium_parties(v_counts);

  insert into lineup_war_config (war_mode, raid_count)
  values ('emperium', p_raid_count)
  on conflict (war_mode) do update
    set raid_count = excluded.raid_count, updated_at = now();

  return public.get_lineups_mode('emperium');
end;
$function$;

comment on function public.set_lineup_raid_count(text, smallint) is
  'Officer/owner raid-count write (0057): Emperium only, device-bound, 2..8 raids. Rebuilds the 16-party distribution (6/6/4 for 3 raids) while preserving role labels and seated members. Returns get_lineups_mode().';

revoke all on function public.set_lineup_raid_count(text, smallint) from public, anon;
grant execute on function public.set_lineup_raid_count(text, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reseed Emperium from the 0056 24-party placeholder to the 16-party
--    guild layout (3 raids: 6/6/4). Refuses silently losing a seated member.
-- ---------------------------------------------------------------------------

do $$
declare
  v_filled int;
  v_parties int;
  v_raids int;
  v_slots int;
  v_bad_raid int;
begin
  select count(*) into v_filled
  from lineup_slots
  where war_mode = 'emperium' and member_id is not null;

  if v_filled <> 0 then
    raise exception '0057: Emperium lineup has % seated member(s); refusing to reseed', v_filled;
  end if;

  delete from lineup_parties where war_mode = 'emperium';

  insert into lineup_parties (war_mode, battlefield, raid_index, party_index)
  select 'emperium', 'emperium_raid_' || c.raid_index, c.raid_index, p.party_index
  from (values (1, 6), (2, 6), (3, 4)) as c(raid_index, party_count)
  cross join lateral generate_series(1, c.party_count) as p(party_index);

  insert into lineup_slots (war_mode, battlefield, raid_index, party_index, slot_index)
  select 'emperium', p.battlefield, p.raid_index, p.party_index, s.slot_index
  from lineup_parties p
  cross join generate_series(1, 5) as s(slot_index)
  where p.war_mode = 'emperium';

  insert into lineup_war_config (war_mode, raid_count)
  values ('emperium', 3)
  on conflict (war_mode) do update set raid_count = 3, updated_at = now();

  select count(*) into v_parties from lineup_parties where war_mode = 'emperium';
  select count(distinct raid_index) into v_raids from lineup_parties where war_mode = 'emperium';
  select count(*) into v_slots from lineup_slots where war_mode = 'emperium';
  select count(*) into v_bad_raid
  from (
    select raid_index, count(*) as n
    from lineup_parties
    where war_mode = 'emperium'
    group by raid_index
  ) x
  where x.n < 1 or x.n > 8;

  if v_parties <> 16 or v_raids <> 3 or v_slots <> 80 or v_bad_raid <> 0 then
    raise exception '0057: expected 16 Emperium parties / 3 raids / 80 slots / max 8 per raid, got % / % / % / % bad',
      v_parties, v_raids, v_slots, v_bad_raid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Bookkeeping + PostgREST reload.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0057', 'emperium_party_distribution', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
