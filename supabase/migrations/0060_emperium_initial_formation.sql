-- NeoFoot migration 0060: Emperium initial formation from the owner's image.
--
-- One-time initial state for the Guerra do Emperium board. The current 3-raid
-- structure is 6/6/4 (16 parties); this seeds the 80 slots shown in the owner's
-- screenshot. Subsequent edits are ordinary RPC writes and remain the stored
-- default (the app never re-seeds on load).
--
-- Matching is by case-insensitive discord_handle. "Same" has no member row in
-- the live roster, so Raid 2 G1 slot 4 is intentionally left vacant. Hawkarim
-- and XAVENTAL are currently inactive but are seated as shown; they are not in
-- the assignable roster, so the officer can clear/replace them later.
--
-- The seed is skipped if the Emperium board is no longer the untouched 6/6/4
-- empty initial state (for example if an officer already edited it).
--
-- Append-only. Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0060_emperium_initial_formation.sql

begin;

do $$
declare
  v_filled int;
  v_counts int[];
begin
  select count(*) into v_filled
  from lineup_slots
  where war_mode = 'emperium' and member_id is not null;

  select array_agg(n order by raid_index)
    into v_counts
  from (
    select raid_index, count(*)::int as n
    from lineup_parties
    where war_mode = 'emperium'
    group by raid_index
  ) x;

  if v_filled > 0 then
    raise notice '0060: Emperium board already has seats; skipping initial formation';
    return;
  end if;
  if v_counts is distinct from array[6, 6, 4] then
    raise notice '0060: Emperium structure is %, not 6/6/4; skipping initial formation', v_counts;
    return;
  end if;

  update lineup_slots s
  set member_id = m.id, updated_at = now()
  from (values
    -- Raid 1 (6 parties)
    (1, 1, 1, 'pedromachado.pm'), (1, 1, 2, 'Txxx'), (1, 1, 3, 'lanaya'),
    (1, 1, 4, 'mentos'), (1, 1, 5, 'tifa'),
    (1, 2, 1, 'rioot'), (1, 2, 2, 'mirage'), (1, 2, 3, 'agamenom'),
    (1, 2, 4, 'slink'), (1, 2, 5, 'rn1x'),
    (1, 3, 1, 'kiom'), (1, 3, 2, 'yoshiyavi'), (1, 3, 3, 'Deviling'),
    (1, 3, 4, 'demongorgon'), (1, 3, 5, 'whantedy_67548'),
    (1, 4, 1, 'starkz'), (1, 4, 2, 'Awx1_'), (1, 4, 3, 'arkshim'),
    (1, 4, 4, 'alexandresimoes9176'), (1, 4, 5, 'KATYBaby'),
    (1, 5, 1, 'arturbrosa'), (1, 5, 2, 'sylveon'), (1, 5, 3, 'grilaum'),
    (1, 5, 4, 'patifa'), (1, 5, 5, 'xsamlx'),
    (1, 6, 1, 'barukrocha'), (1, 6, 2, 'MaxX1'), (1, 6, 3, 'nomercybr3167'),
    (1, 6, 4, 'mafi'), (1, 6, 5, 'satturne'),
    -- Raid 2 (6 parties). 'Same' is intentionally absent: no member row.
    (2, 1, 1, '.lieno'), (2, 1, 2, 'ChaOz'), (2, 1, 3, 'zsereno'),
    (2, 1, 5, 'revozord'),
    (2, 2, 1, 'naito'), (2, 2, 2, 'lavanda'), (2, 2, 3, 'quezzu'),
    (2, 2, 4, 'beca'), (2, 2, 5, 'pai_de_menina'),
    (2, 3, 1, 'capah'), (2, 3, 2, 'jauregui'), (2, 3, 3, 'hawkarim'),
    (2, 3, 4, 'alear'), (2, 3, 5, 'Karlamayara'),
    (2, 4, 1, 'hyxo'), (2, 4, 2, 'jonys'), (2, 4, 3, 'daskefps'),
    (2, 4, 4, 'Notturnna'), (2, 4, 5, '.s1lva7'),
    (2, 5, 1, 'panutexx'), (2, 5, 2, 'oden'), (2, 5, 3, 'YuriJr'),
    (2, 5, 4, 'sunatzu'), (2, 5, 5, 'magicuzinho'),
    (2, 6, 1, 'smash'), (2, 6, 2, 'batatinha'), (2, 6, 3, 'Umbreon'),
    (2, 6, 4, 'tiowelden'), (2, 6, 5, 'toka'),
    -- Raid 3 (4 parties)
    (3, 1, 1, 'soldier8828'), (3, 1, 2, 'Dandelion'), (3, 1, 3, 'xAVENTAL'),
    (3, 1, 4, 'synyster0515'), (3, 1, 5, '0gohan1'),
    (3, 2, 1, 'punch77'), (3, 2, 2, 'hard'), (3, 2, 3, 'Outsider'),
    (3, 2, 4, 'upyr_drakul'), (3, 2, 5, 'yummytumm1'),
    (3, 3, 1, 'Atillos'), (3, 3, 2, 'karyu'), (3, 3, 3, 'oninik'),
    (3, 3, 4, 'Banzo'), (3, 3, 5, 'alael'),
    (3, 4, 1, 'arthurcn3'), (3, 4, 2, 'marcoslessa'), (3, 4, 3, 'lucasscr'),
    (3, 4, 4, 'honorsoriginal'), (3, 4, 5, 'dmo9362')
  ) as v(raid_index, party_index, slot_index, handle)
  join public.members m on lower(m.discord_handle) = lower(v.handle)
  where s.war_mode = 'emperium'
    and s.raid_index = v.raid_index
    and s.party_index = v.party_index
    and s.slot_index = v.slot_index
    and s.member_id is null;

  select count(*) into v_filled
  from lineup_slots
  where war_mode = 'emperium' and member_id is not null;

  raise notice '0060: Emperium initial formation seated % of 80 slots', v_filled;
end $$;

-- ---------------------------------------------------------------------------
-- Bookkeeping + PostgREST reload.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0060', 'emperium_initial_formation', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
