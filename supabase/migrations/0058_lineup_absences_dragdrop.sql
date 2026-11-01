-- NeoFoot migration 0058: lineup absences + non-swap assignment (owner 2026-11-01).
--
-- The 16-party invariant is now relative to absences:
--   required parties = greatest(2, 16 - floor(active_absences / 5))
-- Every 5 absent players frees one full 5-slot party. The officer marks a
-- player absent through set_lineup_absence(); the player is unseated if needed
-- and the remaining parties are rebuilt while preserving every seated member.
--
-- Assignment also stops swapping: set_lineup_slot_mode() now vacates the
-- target's previous occupant (they become available) instead of returning them
-- to the source slot. This matches the drag-and-drop model where the left
-- "Disponíveis" list is the only place an unseated player goes.
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0058_lineup_absences_dragdrop.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Absence table (one row per absent member per war mode).
-- ---------------------------------------------------------------------------

create table if not exists public.lineup_absences (
  war_mode text not null check (war_mode in ('vigrid', 'emperium')),
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (war_mode, member_id)
);

comment on table public.lineup_absences is
  'Escalação absences (0058): an officer marks an active member absent per war mode. Five active absences free one 5-slot party (Emperium). Writes only via set_lineup_absence().';

alter table public.lineup_absences enable row level security;
revoke all on public.lineup_absences from anon, authenticated;
grant select on public.lineup_absences to authenticated;

drop policy if exists active_member_select_lineup_absences on public.lineup_absences;
create policy active_member_select_lineup_absences on public.lineup_absences
  for select to authenticated
  using (exists (
    select 1 from public.members m
    where m.id::text = auth.jwt()->>'member_id' and m.active
  ));

-- ---------------------------------------------------------------------------
-- 2. Helpers: required parties + default distribution for a target total.
-- ---------------------------------------------------------------------------

create or replace function public._emperium_required_parties()
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

revoke all on function public._emperium_required_parties() from public, anon, authenticated;

drop function if exists public._default_emperium_party_counts(int);

create or replace function public._default_emperium_party_counts(p_raids int, p_total int)
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
  if p_raids < 2 or p_raids > 8 or p_total < p_raids or p_total > 16 then
    raise exception 'invalid_lineup_party_counts';
  end if;

  -- The owner's 16-party guild layout: 3 raids are 6/6/4, 2 are 8/8.
  if p_raids = 2 and p_total = 16 then
    return array[8, 8];
  end if;
  if p_raids = 3 and p_total = 16 then
    return array[6, 6, 4];
  end if;

  v_base := p_total / p_raids;
  v_rem := p_total % p_raids;
  for v_i in 1..p_raids loop
    v_counts := array_append(
      v_counts,
      v_base + case when v_i <= v_rem then 1 else 0 end
    );
  end loop;
  return v_counts;
end;
$function$;

revoke all on function public._default_emperium_party_counts(int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Generalized rebuild: same party count preserves party/slot layout; a
--    changed total (absences) repacks every seated member in global order,
--    preserving role labels for the surviving parties.
-- ---------------------------------------------------------------------------

create or replace function public._rebuild_emperium_parties(p_counts int[])
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_parties jsonb;
  v_roles jsonb;
  v_members jsonb;
  v_old_count int;
  v_new_total int;
  v_global int := 0;
  v_raid int;
  v_party int;
  v_slot int;
  v_role text;
  v_member uuid;
begin
  v_new_total := (select coalesce(sum(x), 0) from unnest(p_counts) as t(x));
  select count(*) into v_old_count
  from lineup_parties
  where war_mode = 'emperium';

  if v_old_count = 0 or v_new_total < 1 then
    raise exception 'invalid_lineup_party_count';
  end if;

  -- Exact party layout (distribution changes that keep the same total).
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

  -- Flat party-order data used when the total changes (absence repack).
  select jsonb_agg(p.role_label order by p.raid_index, p.party_index)
  into v_roles
  from lineup_parties p
  where p.war_mode = 'emperium';

  select jsonb_agg(s.member_id order by p.raid_index, p.party_index, s.slot_index)
  into v_members
  from lineup_parties p
  join lineup_slots s
    on s.war_mode = p.war_mode
   and s.battlefield = p.battlefield
   and s.party_index = p.party_index
  where p.war_mode = 'emperium'
    and s.member_id is not null;

  delete from lineup_parties where war_mode = 'emperium';

  for v_raid in 1..array_length(p_counts, 1) loop
    for v_party in 1..p_counts[v_raid] loop
      v_global := v_global + 1;

      if v_new_total = v_old_count then
        v_role := v_parties->(v_global - 1)->>'role_label';
      else
        v_role := case
          when v_global <= coalesce(jsonb_array_length(v_roles), 0)
            then v_roles->>(v_global - 1)
          else null
        end;
      end if;

      insert into lineup_parties (war_mode, battlefield, raid_index, party_index, role_label)
      values ('emperium', 'emperium_raid_' || v_raid, v_raid, v_party, v_role);

      for v_slot in 1..5 loop
        if v_new_total = v_old_count then
          v_member := nullif(v_parties->(v_global - 1)->'members'->>(v_slot - 1), '')::uuid;
        else
          v_member := null;
        end if;

        insert into lineup_slots (war_mode, battlefield, raid_index, party_index, slot_index, member_id)
        values ('emperium', 'emperium_raid_' || v_raid, v_raid, v_party, v_slot, v_member);
      end loop;
    end loop;
  end loop;

  -- Absence repack: fill the new slots in global order with every seated member.
  if v_new_total <> v_old_count and v_members is not null then
    with ranked as (
      select s.battlefield, s.party_index, s.slot_index,
             row_number() over (order by s.raid_index, s.party_index, s.slot_index) as rn
      from lineup_slots s
      where s.war_mode = 'emperium'
    )
    update lineup_slots s
    set member_id = (v_members->>(r.rn - 1))::uuid
    from ranked r
    where s.war_mode = 'emperium'
      and s.battlefield = r.battlefield
      and s.party_index = r.party_index
      and s.slot_index = r.slot_index
      and r.rn <= jsonb_array_length(v_members);
  end if;
end;
$function$;

revoke all on function public._rebuild_emperium_parties(int[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Absence write RPC.
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
  v_required int;
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
    -- An absent player cannot stay seated in this war mode.
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
    v_required := public._emperium_required_parties();
    select count(*)::int into v_current
    from lineup_parties
    where war_mode = 'emperium';

    if v_required <> v_current then
      select least(
        coalesce((select raid_count from lineup_war_config where war_mode = 'emperium'), 3),
        v_required
      ) into v_raid_count;
      v_raid_count := greatest(2, v_raid_count);

      v_counts := public._default_emperium_party_counts(v_raid_count, v_required);
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

comment on function public.set_lineup_absence(text, uuid, boolean) is
  'Officer/owner absence write (0058): device-bound; unseats the member and records/removes the absence. Emperium rebuilds to 16 - floor(active absences / 5) parties (min 2) while preserving seated members. Returns get_lineups_mode().';

revoke all on function public.set_lineup_absence(text, uuid, boolean) from public, anon;
grant execute on function public.set_lineup_absence(text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Assignment without swaps: the target's previous occupant becomes
--    available. Absent members cannot be seated.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup_slot_mode(
  p_war_mode text,
  p_battlefield text,
  p_party smallint,
  p_slot smallint,
  p_member uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'vigrid');
  v_old_bf text;
  v_old_party smallint;
  v_old_slot smallint;
  v_raid_index smallint;
  v_raid_count smallint;
  v_target_member uuid;
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

  select p.raid_index into v_raid_index
  from lineup_parties p
  where p.war_mode = v_mode
    and p.battlefield = p_battlefield
    and p.party_index = p_party;

  select c.raid_count into v_raid_count
  from lineup_war_config c
  where c.war_mode = v_mode;
  if v_raid_count is null then
    v_raid_count := case v_mode when 'vigrid' then 2 else 3 end;
  end if;

  if v_raid_index is null
     or v_raid_index > v_raid_count
     or p_slot is null
     or p_slot not between 1 and 5
     or not exists (
       select 1 from lineup_slots s
       where s.war_mode = v_mode
         and s.battlefield = p_battlefield
         and s.party_index = p_party
         and s.slot_index = p_slot
     ) then
    raise exception 'invalid_lineup_slot';
  end if;

  if p_member is not null and not exists (
    select 1 from members m
    where m.id = p_member
      and m.active
      and m.discord_handle not ilike 'smoke%'
      and m.discord_handle not ilike 'dummy-%'
  ) then
    raise exception 'invalid_lineup_member';
  end if;

  if p_member is not null and exists (
    select 1 from lineup_absences a
    where a.war_mode = v_mode and a.member_id = p_member
  ) then
    raise exception 'member_absent';
  end if;

  -- Lock the target row and the member's current row in one deterministic pass.
  perform 1
  from lineup_slots s
  where s.war_mode = v_mode
    and (
      (s.battlefield = p_battlefield and s.party_index = p_party and s.slot_index = p_slot)
      or (p_member is not null and s.member_id = p_member)
    )
  order by s.battlefield, s.party_index, s.slot_index
  for update;

  select s.member_id into v_target_member
  from lineup_slots s
  where s.war_mode = v_mode
    and s.battlefield = p_battlefield
    and s.party_index = p_party
    and s.slot_index = p_slot;

  if p_member is null then
    update lineup_slots set member_id = null, updated_at = now()
    where war_mode = v_mode
      and battlefield = p_battlefield
      and party_index = p_party
      and slot_index = p_slot;
  elsif v_target_member is not null and v_target_member = p_member then
    null; -- already in this slot: no-op
  else
    -- Vacate the source first (unique member_id), then overwrite the target.
    -- The target's previous occupant is NOT returned to the source: they become
    -- available (member_id null), matching the drag-and-drop model.
    select s.battlefield, s.party_index, s.slot_index
      into v_old_bf, v_old_party, v_old_slot
    from lineup_slots s
    where s.war_mode = v_mode and s.member_id = p_member;

    if v_old_slot is not null then
      update lineup_slots set member_id = null, updated_at = now()
      where war_mode = v_mode
        and battlefield = v_old_bf
        and party_index = v_old_party
        and slot_index = v_old_slot;
    end if;

    update lineup_slots set member_id = p_member, updated_at = now()
    where war_mode = v_mode
      and battlefield = p_battlefield
      and party_index = p_party
      and slot_index = p_slot;
  end if;

  return public.get_lineups_mode(v_mode);
end;
$function$;

comment on function public.set_lineup_slot_mode(text, text, smallint, smallint, uuid) is
  'Officer/owner slot write (0058): device-bound; absent members are refused (member_absent); assignment overwrites the target and the displaced occupant becomes available (no swaps). Returns get_lineups_mode().';

revoke all on function public.set_lineup_slot_mode(text, text, smallint, smallint, uuid) from public, anon;
grant execute on function public.set_lineup_slot_mode(text, text, smallint, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Party distribution now sums to the absence-adjusted required total.
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
  v_required int;
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

  v_required := public._emperium_required_parties();
  v_len := coalesce(array_length(p_counts, 1), 0);
  if v_len < 2 or v_len > 8 or v_len > v_required then
    raise exception 'invalid_lineup_party_counts';
  end if;

  select coalesce(sum(x), 0), count(*) filter (where x < 1 or x > 8)
    into v_sum, v_bad
  from unnest(p_counts) as t(x);

  if v_sum <> v_required or v_bad <> 0 then
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

revoke all on function public.set_lineup_party_counts(text, int[]) from public, anon;
grant execute on function public.set_lineup_party_counts(text, int[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Raid count: default distribution for the required total.
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
  v_required int;
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

  v_required := public._emperium_required_parties();
  if p_raid_count > v_required then
    raise exception 'invalid_lineup_raid_count';
  end if;

  v_counts := public._default_emperium_party_counts(p_raid_count, v_required);
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

-- ---------------------------------------------------------------------------
-- 8. Read RPC: add the active absences list to the closed payload.
-- ---------------------------------------------------------------------------

create or replace function public.get_lineups_mode(p_war_mode text default 'vigrid')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_mode text := coalesce(nullif(btrim(p_war_mode), ''), 'vigrid');
  v_member uuid;
  v_raid_count smallint;
begin
  if v_mode not in ('vigrid', 'emperium') then
    raise exception 'invalid_war_mode';
  end if;

  v_member := (auth.jwt()->>'member_id')::uuid;
  if v_member is null then
    raise exception 'no_member_claim';
  end if;
  if not exists (select 1 from members m where m.id = v_member and m.active) then
    raise exception 'forbidden';
  end if;

  select c.raid_count into v_raid_count
  from lineup_war_config c
  where c.war_mode = v_mode;
  if v_raid_count is null then
    v_raid_count := case v_mode when 'vigrid' then 2 else 3 end;
  end if;

  return (
    with roster as (
      select m.id,
             coalesce(l.nickname, m.display_name) as display_name,
             coalesce(l.char_class, m.char_class) as char_class,
             m.char_function
      from members m
      left join lateral (
        select h.nickname, h.char_class
        from member_identity_history h
        where h.member_id = m.id
        order by h.created_at desc, h.id desc
        limit 1
      ) l on true
      where m.active
        and m.discord_handle not ilike 'smoke%'
        and m.discord_handle not ilike 'dummy-%'
    ),
    slots as (
      select s.war_mode, s.battlefield, s.raid_index, s.party_index, s.slot_index,
             jsonb_build_object(
               'slot_index', s.slot_index,
               'member_id', s.member_id,
               'display_name', coalesce(l.nickname, m.display_name),
               'char_class', coalesce(l.char_class, m.char_class),
               'char_function', m.char_function
             ) as j
      from lineup_slots s
      left join members m on m.id = s.member_id
      left join lateral (
        select h.nickname, h.char_class
        from member_identity_history h
        where h.member_id = m.id
        order by h.created_at desc, h.id desc
        limit 1
      ) l on true
      where s.war_mode = v_mode
    ),
    parties as (
      select p.war_mode, p.battlefield, p.raid_index, p.party_index,
             jsonb_build_object(
               'party_index', p.party_index,
               'role_label', p.role_label,
               'filled', (
                 select count(*) from lineup_slots s
                 where s.war_mode = p.war_mode
                   and s.battlefield = p.battlefield
                   and s.party_index = p.party_index
                   and s.member_id is not null
               ),
               'slots', (
                 select coalesce(jsonb_agg(sl.j order by sl.slot_index), '[]'::jsonb)
                 from slots sl
                 where sl.war_mode = p.war_mode
                   and sl.battlefield = p.battlefield
                   and sl.party_index = p.party_index
               )
             ) as j
      from lineup_parties p
      where p.war_mode = v_mode
    ),
    grouped as (
      select pa.battlefield, pa.raid_index,
             jsonb_agg(pa.j order by pa.party_index) as parties
      from parties pa
      group by pa.battlefield, pa.raid_index
    )
    select jsonb_build_object(
      'war_mode', v_mode,
      'raid_count', v_raid_count,
      'min_raids', 2,
      'max_raids', 8,
      'battlefields', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'battlefield', g.battlefield,
            'raid_index', g.raid_index,
            'parties', g.parties
          )
          order by g.raid_index
        ), '[]'::jsonb)
        from grouped g
      ),
      'roster', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'member_id', r.id,
            'display_name', r.display_name,
            'char_class', r.char_class,
            'char_function', r.char_function
          )
          order by lower(r.display_name)
        ), '[]'::jsonb)
        from roster r
      ),
      'absences', (
        select coalesce(jsonb_agg(a.member_id order by lower(m.display_name)), '[]'::jsonb)
        from lineup_absences a
        join members m on m.id = a.member_id
        where a.war_mode = v_mode
          and m.active
          and m.discord_handle not ilike 'smoke%'
          and m.discord_handle not ilike 'dummy-%'
      )
    )
  );
end;
$function$;

revoke all on function public.get_lineups_mode(text) from public, anon;
grant execute on function public.get_lineups_mode(text) to authenticated;

-- Backward-compatible Vigrid reader for the deployed client.
create or replace function public.get_lineups()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select public.get_lineups_mode('vigrid')
$function$;

revoke all on function public.get_lineups() from public, anon;
grant execute on function public.get_lineups() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Bookkeeping + PostgREST reload.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0058', 'lineup_absences_dragdrop', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
