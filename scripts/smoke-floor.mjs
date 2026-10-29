#!/usr/bin/env node
/**
 * NeoFoot smoke fixtures: the shared FLOOR rule (owner decision 2026-10-28).
 *
 * "they must now be lower than the lowest member of the cohort, as they are just
 *  a basis and are not meant to be 'competitive' to the point of overtaking real
 *  players in terms of stats"
 *
 * Every fixture script (smoke-matrix-, smoke-bio-, smoke-hp-, smoke-summoner-)
 * derives its stat values from the same place, so there is exactly one definition
 * of "low enough" in the repo:
 *
 *   1. per stat, the WORST value among the cohort's REAL validated submitters,
 *      in that stat's own worse direction (higher-is-better -> min,
 *      lower-is-better -> max) — so a fixture is below EVERY real player of the
 *      cohort on that stat, not merely below one named anchor;
 *   2. pushed a further GAPS[i] below that floor, which keeps the pair ordered
 *      (primer 1 above primer 2) and leaves daylight under the weakest player;
 *   3. an EMPTY cohort falls back to the same rule at guild scope (the worst value
 *      anybody in the guild reported), then to the Phase 7 owner samples for
 *      stats nobody reports at all.
 *
 * Because the fixture sits at or below the worst real value on EVERY stat, its
 * per-stat points — and therefore its OVR — can never exceed the lowest real
 * member's. That is the invariant `floorCheckSql` re-proves on the stored rows.
 *
 * Stat rows come out rounded exactly once (percentual 1 decimal, flat integer):
 * the base IS the final value, never a factor applied on top of another factor.
 *
 * Callers must create a temp table before calling `floorSql` and insert the
 * fixture rows into it:
 *   create temp table <fixture_table> (
 *     handle text, display text, class_name text, char_function text, gap numeric
 *   );
 * ...and then read `<fixture_base_table> (handle, stat_key, base_value)` (same
 *   table created inside floorSql).
 *
 * Fixtures are always assumed to live in the `smoke%` handle namespace; that is
 * what keeps "real data" real and re-runs deterministic.
 */

// Distance BELOW the cohort's worst real value, as a fraction of that value.
// First fixture 5% further down, second 10%: an ordered pair that stays strictly
// under every real player — a basis, not a competitor.
const GAPS = [0.05, 0.1]

// Phase 7 owner samples (SEED-NOTES.md): only used when NO live sample exists for
// the stat at all, so the floor still has a magnitude to work from.
const FALLBACK_STATS = `('crit_dmg', 155::numeric), ('fixed_ct', -90::numeric), ('variable_ct', -35::numeric)`

/**
 * Full SQL block: reads `<fixtureTable>`, writes `smoke_fixture_base`, and
 * enforces the guards (catalog coverage, gap range, floor invariant).
 *
 * @param {number} catalogCount rows in public.stat_catalog
 * @param {string} fixtureTable name of the caller-created temp fixture table
 */
function floorSql(catalogCount, fixtureTable = 'smoke_fixtures') {
  const F = fixtureTable
  return `
-- Latest validated value per REAL (member, stat). The smoke% exclusion keeps a
-- re-run deterministic and stops fixtures from feeding on their own output.
create temp table smoke_live (member_id uuid, stat_key text, value numeric) on commit drop;
insert into smoke_live
select distinct on (sub.member_id, ss.stat_key) sub.member_id, ss.stat_key, ss.value
from submission_stats ss
join submissions sub on sub.id = ss.submission_id
join members m on m.id = sub.member_id and m.active
where sub.status not in ('rejected', 'discarded')
  and m.discord_handle not like 'smoke-%'
order by sub.member_id, ss.stat_key, sub.submitted_at desc;

-- Guild-wide worst per stat, direction-aware: the floor for cohorts that have no
-- real submitter yet (nobody in the guild is worse, so any real player who
-- submits lands above the fixture).
create temp table smoke_global_worst (stat_key text primary key, worst_value numeric) on commit drop;
insert into smoke_global_worst (stat_key, worst_value)
select sc.stat_key,
       case sc.stat_direction when 'lower' then max(l.value) else min(l.value) end
from stat_catalog sc
join smoke_live l on l.stat_key = sc.stat_key
group by sc.stat_key, sc.stat_direction;

create temp table smoke_worst (handle text, stat_key text, worst_value numeric) on commit drop;
insert into smoke_worst (handle, stat_key, worst_value)
select f.handle, sc.stat_key,
       coalesce(cw.worst_value, gw.worst_value, fb.fallback_value, 0)
from smoke_fixtures f
cross join stat_catalog sc
left join smoke_global_worst gw on gw.stat_key = sc.stat_key
left join (values ${FALLBACK_STATS}) as fb(stat_key, fallback_value)
  on fb.stat_key = sc.stat_key
left join lateral (
  -- The cohort's OWN worst real submitter, direction-aware. 'and m.active' and
  -- the smoke% exclusion keep this honest: a fixture is derived from real
  -- players of the same cohort, never from another fixture.
  select case sc.stat_direction when 'lower' then max(l.value) else min(l.value) end as worst_value
  from (
    select distinct on (s.member_id, ss.stat_key) ss.value
    from submission_stats ss
    join submissions s on s.id = ss.submission_id
    where s.member_id in (
      select m.id from members m
      where m.char_class = f.class_name
        and m.char_function = f.char_function
        and m.active
        and m.discord_handle not like 'smoke%'
    )
      and s.status = 'validated'
      and ss.stat_key = sc.stat_key
    order by s.member_id, ss.stat_key, s.submitted_at desc
  ) l
) cw on true;

-- Push the floor further down in the stat's WORSE direction. Works for positive,
-- negative and zero values: higher-is-better -> v - |v|*gap (clamped at 0 when
-- v >= 0, since a non-negative stat cannot go below zero), lower-is-better ->
-- v + |v|*gap.
create temp table smoke_fixture_base (handle text, stat_key text, base_value numeric) on commit drop;
insert into smoke_fixture_base (handle, stat_key, base_value)
select w.handle, w.stat_key,
       case
         when sc.stat_direction = 'lower'
           then w.worst_value + abs(w.worst_value) * f.gap
         when w.worst_value < 0
           then w.worst_value - abs(w.worst_value) * f.gap
         else greatest(w.worst_value * (1 - f.gap), 0)
       end
from smoke_worst w
join smoke_fixtures f on f.handle = w.handle
join stat_catalog sc on sc.stat_key = w.stat_key;

do $$ begin
  if exists (
    select 1 from smoke_fixtures f
    where (select count(*) from smoke_fixture_base b where b.handle = f.handle) <> ${Number(catalogCount)}
  ) then
    raise exception 'every fixture must carry exactly ${Number(catalogCount)} catalog stats';
  end if;
  if exists (
    select 1 from smoke_fixture_base b
    where not exists (select 1 from stat_catalog sc where sc.stat_key = b.stat_key)
  ) then
    raise exception 'fixture base carries unknown stat keys';
  end if;
  if exists (select 1 from smoke_fixtures where gap < 0 or gap >= 1) then
    raise exception 'fixture gaps must be in [0, 1) (0 = exactly on the floor, else below it)';
  end if;
  -- FLOOR INVARIANT (owner 2026-10-28): a fixture is a basis, never a
  -- competitor. Every value must sit at or below the worst real value it was
  -- derived from, in that stat's own worse direction — which is what makes its
  -- per-stat points (and its OVR) unable to exceed the lowest real member's.
  if exists (
    select 1
    from smoke_fixture_base b
    join smoke_worst w on w.handle = b.handle and w.stat_key = b.stat_key
    join stat_catalog sc on sc.stat_key = b.stat_key
    where case sc.stat_direction
            when 'lower' then b.base_value < w.worst_value
            else b.base_value > w.worst_value
          end
  ) then
    raise exception 'a fixture value is above the worst real value it was derived from';
  end if;
end $$;
`
}

/**
 * Live re-check of the floor invariant AFTER the rows are stored (rounding
 * included): no fixture value may be above the worst real value it descends
 * from. Empty result = every fixture is at or below the cohort's (or guild's)
 * worst. `handleLike` is a SQL LIKE pattern, e.g. 'smoke-bio-%'.
 */
function floorCheckSql(handleLike) {
  return `
with latest as (
  select distinct on (sub.member_id, ss.stat_key) sub.member_id, ss.stat_key, ss.value
  from submission_stats ss
  join submissions sub on sub.id = ss.submission_id
  join members m on m.id = sub.member_id and m.active
  where sub.status not in ('rejected','discarded') and m.discord_handle not like 'smoke-%'
  order by sub.member_id, ss.stat_key, sub.submitted_at desc
),
global_worst as (
  select sc.stat_key,
         case sc.stat_direction when 'lower' then max(l.value) else min(l.value) end as worst_value
  from stat_catalog sc
  join latest l on l.stat_key = sc.stat_key
  group by sc.stat_key, sc.stat_direction
),
cohort_worst as (
  select m.char_class, m.char_function, l.stat_key,
         case sc.stat_direction when 'lower' then max(l.value) else min(l.value) end as worst_value
  from latest l
  join members m on m.id = l.member_id
  join stat_catalog sc on sc.stat_key = l.stat_key
  group by m.char_class, m.char_function, l.stat_key, sc.stat_direction
),
fixture_latest as (
  select distinct on (sub.member_id, ss.stat_key) sub.member_id, ss.stat_key, ss.value
  from submission_stats ss
  join submissions sub on sub.id = ss.submission_id
  where sub.status not in ('rejected','discarded')
  order by sub.member_id, ss.stat_key, sub.submitted_at desc
)
select m.discord_handle, m.char_class, m.char_function, p.stat_key, p.value,
       coalesce(cw.worst_value, gw.worst_value) as floor_value
from members m
join fixture_latest p on p.member_id = m.id
join stat_catalog sc on sc.stat_key = p.stat_key
left join cohort_worst cw
  on cw.char_class = m.char_class and cw.char_function = m.char_function and cw.stat_key = p.stat_key
left join global_worst gw on gw.stat_key = p.stat_key
where m.discord_handle like '${handleLike}'
  and coalesce(cw.worst_value, gw.worst_value) is not null
  and case sc.stat_direction
        when 'lower' then p.value < coalesce(cw.worst_value, gw.worst_value)
        else p.value > coalesce(cw.worst_value, gw.worst_value)
      end
order by 1, 4;
`
}

/**
 * The real players a cohort's floor is derived from (read-only, for the run log):
 * one row per real validated submitter, so the operator can see WHOSE worst
 * stats the fixtures were based on.
 */
function floorBasisSql(className, charFunction) {
  return `
select m.discord_handle, m.display_name, count(l.stat_key) as stats
from members m
join latest l on l.member_id = m.id
where m.char_class = '${className}' and m.char_function = '${charFunction}' and m.active
  and m.discord_handle not like 'smoke%'
group by 1, 2
order by 2;
`
}

/** Human-readable one-liner for a script banner. */
function gapsLabel() {
  return `${GAPS.map((g) => `${(g * 100).toFixed(0)}%`).join(' / ')} below the floor`
}

export { GAPS, floorSql, floorCheckSql, floorBasisSql, gapsLabel }
