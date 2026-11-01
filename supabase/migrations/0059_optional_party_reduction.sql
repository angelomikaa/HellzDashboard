-- NeoFoot migration 0059: optional Emperium party reduction (owner 2026-11-01).
--
-- Correction to 0058: five absences only make a reduction POSSIBLE. The officer
-- may keep all 16 parties with empty slots (e.g. parties of 4 players), or
-- deliberately empty the trailing party/parties and reduce the total. A party
-- can only be dropped when it has no seated member.
--
--   min parties = greatest(2, 16 - floor(active_absences / 5))
--   total parties may stay anywhere between min parties and 16
--
-- Marking absences never auto-drops a party. Unmarking absences only grows the
-- total when the current total can no longer hold the roster (current < min).
-- set_lineup_party_counts() accepts min..16 and refuses to drop non-empty
-- trailing parties (lineup_party_not_empty). set_lineup_raid_count() preserves
-- the current total while regrouping the raids.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0059_optional_party_reduction.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Minimum parties (renamed from _emperium_required_parties).
-- ---------------------------------------------------------------------------

create or replace function public._emperium_min_parties()
returns int
language sql
stable
security definer
set search_path = public
as $function$
  select least(16, greatest(2, 16 - (
    select (count(*)::int / 5)
    from lineup_absences a
    join members m on m.id = a.member_id
    where a.war_mode = 'emperium'
      and m.active
      and m.discord_handle not ilike 'smoke%'
      and m.discord_handle not ilike 'dummy-%'
  )))
$function$;

revoke all on function public._emperium_min_parties() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Absence write: never drop a party automatically; only grow when needed.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_absence(
  p_war_mode text,
  p_member uuid,
  p_absent boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'vigrid');
  v_min int;
  v_current int;
  v_raid_count int;
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

  if p_member is null or not exists (
    select 1 from members m
    where m.id = p_member
      and m.active
      and m.discord_handle not ilike 'smoke%'
      and m.discord_handle not ilike 'dummy-%'
  ) then
    raise exception 'invalid_lineup_member';
  end if;

  if p_absent then
    update lineup_slots
    set member_id = null, updated_at = now()
    where war_mode = v_mode and member_id = p_member;

    insert into lineup_absences (war_mode, member_id)
    values (v_mode, p_member)
    on conflict (war_mode, member_id) do nothing;
  else
    delete from lineup_absences
    where war_mode = v_mode and member_id = p_member;
  end if;

  if v_mode = 'emperium' then
    v_min := public._emperium_min_parties();
    select count(*)::int into v_current
    from lineup_parties
    where war_mode = 'emperium';

    -- Only grow: the officer keeps the current total (16 by default) unless it
    -- is now too small for the available roster. Shrinking is manual.
    if v_current < v_min then
      select least(
        coalesce((select raid_count from lineup_war_config where war_mode = 'emperium'), 3),
        v_min
      ) into v_raid_count;
      v_raid_count := greatest(2, v_raid_count);

      v_counts := public._default_emperium_party_counts(v_raid_count, v_min);
      perform public._rebuild_emperium_parties(v_counts);

      insert into lineup_war_config (war_mode, raid_count)
      values ('emperium', v_raid_count)
      on conflict (war_mode) do update
        set raid_count = excluded.raid_count, updated_at = now();
    end if;
  end if;

  return public.get_lineups_mode(v_mode);
end;
$function$;

revoke all on function public.set_lineup_absence(text, uuid, boolean) from public, anon;
grant execute on function public.set_lineup_absence(text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Distribution write: min..16, and only drop empty trailing parties.
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
  v_min int;
  v_current int;
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

  v_min := public._emperium_min_parties();
  select count(*)::int into v_current
  from lineup_parties
  where war_mode = 'emperium';

  v_len := coalesce(array_length(p_counts, 1), 0);
  if v_len < 2 or v_len > 8 then
    raise exception 'invalid_lineup_party_counts';
  end if;

  select coalesce(sum(x), 0), count(*) filter (where x < 1 or x > 8)
    into v_sum, v_bad
  from unnest(p_counts) as t(x);

  if v_sum < v_min or v_sum > 16 or v_bad <> 0 then
    raise exception 'invalid_lineup_party_counts';
  end if;

  -- Reduction is optional and only allowed when the trailing parties being
  -- dropped are empty. The officer must move their members out first.
  if v_sum < v_current and exists (
    select 1
    from (
      select p.war_mode, p.battlefield, p.party_index,
             row_number() over (order by p.raid_index, p.party_index) as rn
      from lineup_parties p
      where p.war_mode = 'emperium'
    ) ranked
    join lineup_slots s
      on s.war_mode = ranked.war_mode
     and s.battlefield = ranked.battlefield
     and s.party_index = ranked.party_index
    where ranked.rn > v_sum
      and s.member_id is not null
  ) then
    raise exception 'lineup_party_not_empty';
  end if;

  perform public._rebuild_emperium_parties(p_counts);

  insert into lineup_war_config (war_mode, raid_count)
  values ('emperium', v_len)
  on conflict (war_mode) do update
    set raid_count = excluded.raid_count, updated_at = now();

  return public.get_lineups_mode('emperium');
end;
$function$;

revoke all on function public.set_lineup_party_counts(text, int[]) from public, anon;
grant execute on function public.set_lineup_party_counts(text, int[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Raid-count write: preserve the current total while regrouping.
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
  v_min int;
  v_current int;
  v_total int;
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

  if v_mode = 'vigrid' then
    if p_raid_count <> 2 then
      raise exception 'invalid_lineup_raid_count';
    end if;
    insert into lineup_war_config (war_mode, raid_count)
    values ('vigrid', 2)
    on conflict (war_mode) do update set raid_count = 2, updated_at = now();
    return public.get_lineups_mode('vigrid');
  end if;

  v_min := public._emperium_min_parties();
  select count(*)::int into v_current
  from lineup_parties
  where war_mode = 'emperium';

  -- Changing the raid count must not change the officer's total choice; it only
  -- repairs a total that fell below the absence-adjusted minimum.
  v_total := greatest(v_min, v_current);
  if p_raid_count > v_total then
    raise exception 'invalid_lineup_raid_count';
  end if;

  v_counts := public._default_emperium_party_counts(p_raid_count, v_total);
  perform public._rebuild_emperium_parties(v_counts);

  insert into lineup_war_config (war_mode, raid_count)
  values ('emperium', p_raid_count)
  on conflict (war_mode) do update
    set raid_count = excluded.raid_count, updated_at = now();

  return public.get_lineups_mode('emperium');
end;
$function$;

revoke all on function public.set_lineup_raid_count(text, smallint) from public, anon;
grant execute on function public.set_lineup_raid_count(text, smallint) to authenticated;

-- The 0058 name is no longer used.
drop function if exists public._emperium_required_parties();

-- ---------------------------------------------------------------------------
-- 5. Bookkeeping + PostgREST reload.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0059', 'optional_party_reduction', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
