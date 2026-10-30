#!/usr/bin/env node
/**
 * NeoFoot smoke fixtures: TWO cohort primers per META (class, function) combo —
 * owner decision 2026-10-28.
 *
 * Which combos: the persisted split in public.class_cohorts (migration 0037) is
 * the ONE authority. `meta = true` = a currently playable build (23 combos) and
 * the only ones this script seeds; `meta = false` = keyed-but-non-viable builds
 * the owner forgot "until second order" — they get no primers and their existing
 * primers are wiped by the namespace clean at the top of every run. A meta combo
 * also needs its 6 usable keys (selection_order <= 6) or its OVR could never
 * compute, so that stays a hard requirement.
 *
 * Why: an OVR needs n >= 3 submitters per (class, function) cohort. Real data
 * only exists in a handful of cohorts, so a real player who signs in for any
 * other meta combo gets a data-insufficient card (no overall). Two primers raise
 * an empty cohort to n=2, so the FIRST real player who submits reaches n=3 and
 * immediately sees their own OVR. Combos that already have >= 3 validated
 * submitters are skipped (already primed by their own dedicated fixtures or by
 * real players) — pass --all to include them anyway.
 *
 * Owner decisions:
 *   - 2026-10-28: TWO primers per target combo where real players exist (the
 *     third member is meant to be a REAL player);
 *   - 2026-10-29 ("you can create smokes for cohorts that are meta but have no
 *     members registered yet"): a meta cohort with NO real member — the census
 *     of 2026-10-29 found ten of them (Assassin Cross dps/mdps, Biochemist dps,
 *     Champion dps, High Wizard suporte, Lord Knight dps, Mastersmith dps,
 *     Paladin suporte, Stalker dps, Summoner suporte — all sitting at n=2 with
 *     nothing but primers) — gets a THIRD primer, so the cohort reaches n=3 on
 *     its own: a real OVR, a tier, and its own row on the Início showcase
 *     (383/0037: one carousel per meta build). It deliberately does NOT touch a
 *     cohort that has real members registered-but-not-yet-submitting (Bard
 *     suporte, Biochemist mdps, Professor suporte) — those players are the
 *     intended third.
 *   - primers are a BASIS, never competitors: each primer must sit at or BELOW
 *     the cohort's WORST real player on every stat, pushed a further 5% / 10% /
 *     15% down (owner 2026-10-28: "they must now be lower than the lowest member
 *     of the cohort, as they are just a basis and are not meant to be
 *     competitive");
 *   - non-meta combos are out of scope (no keys and/or not viable).
 *
 * Stat base per combo (never invented per class):
 *   - ANCHORED combo (real validated submitters exist): per stat, the WORST
 *     value among that cohort's REAL submitters (direction-aware: the minimum
 *     for higher-is-better, the maximum for lower-is-better), then worsened by
 *     the gap — so a primer is below EVERY real player on that stat, not merely
 *     below the anchor;
 *   - EMPTY combo: the same rule at guild scope — the worst value observed in
 *     the whole guild for that stat (nobody is worse than it, so any real
 *     submitter lands above the primer). Stats with no live sample at all fall
 *     back to the Phase 7 owner samples (crit_dmg 155, fixed_ct -90,
 *     variable_ct -35, SEED-NOTES.md).
 *   The worsen step moves away from zero in the stat's "worse" direction, so it
 *   holds for positive, negative and zero values: higher-is-better -> v -
 *   |v|*gap (clamped at 0 when v >= 0, because you cannot be below zero on a
 *   non-negative stat), lower-is-better -> v + |v|*gap. Because the primer is at
 *   or below the worst real value on EVERY stat, its per-stat points (and
 *   therefore its OVR) can never exceed the lowest real member's.
 *
 * What it creates (LIVE, smoke-mtx-% sentinel namespace):
 *   - 2 members per target combo, e.g. smoke-mtx-assassin-cross-dps-01/02,
 *     display 'Smoke Algoz Físico Um' / '... Dois', role member, active,
 *     char_class/char_function = the combo;
 *   - 1 VALIDATED submission each (now() - 1 day => fresh-data state) holding
 *     ALL catalog stats, percentual rounded to 1 decimal, flat to integer;
 *   - pin_hash = bcrypt(FIXTURE_PIN, shared smoke-config) — never printed.
 *
 * Verification built in: the meta split read back from class_cohorts, key-config
 * census, per-fixture stat counts, an in-transaction guard that every primer
 * value is at or below the worst real value it was derived from (the floor
 * invariant that keeps primers non-competitive), a live post-seed re-check of
 * the same floor against the stored rows, cohort census before/after, OVR reads,
 * and ONE self-cleaning probe on an empty cohort that proves the claim behind
 * the whole script: with a third submitter present the cohort becomes
 * data-sufficient and the report carries a real OVR.
 *
 * Owner: fixtures MAY STAY LIVE until second order. Pre-release purge:
 *   node scripts/smoke-matrix-fixtures.mjs --purge
 *   (scripts/smoke-cleanup.mjs --apply covers the whole smoke% namespace)
 *
 * Env: SUPABASE_ACCESS_TOKEN (or .env SUPABASE_ACESS_TOKEN — repo spelling),
 *      SUPABASE_PROJECT_REF (fallback: parsed from the VITE_SUPABASE_URL host),
 *      SUPABASE_URL / SUPABASE_ANON_KEY (fallback: .env VITE_*).
 */
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { FIXTURE_PIN } from './smoke-config.mjs'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnvFile() {
  try {
    const raw = readFileSync('.env', 'utf8')
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2]
    }
    return env
  } catch {
    return {}
  }
}

const envFile = loadEnvFile()
const APPLY = !process.argv.includes('--purge')
const INCLUDE_PRIMED = process.argv.includes('--all')
const DRY_RUN = process.argv.includes('--dry-run')

const SUPABASE_URL = process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY || envFile.VITE_SUPABASE_ANON_KEY
const MGMT_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ||
  envFile.SUPABASE_ACCESS_TOKEN ||
  envFile.SUPABASE_ACESS_TOKEN
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  (SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : null)

const missing = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL / VITE_SUPABASE_URL')
if (!ANON_KEY) missing.push('SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY')
if (!MGMT_TOKEN) missing.push('SUPABASE_ACCESS_TOKEN / .env SUPABASE_ACESS_TOKEN')
if (!PROJECT_REF) missing.push('SUPABASE_PROJECT_REF (or a parsable VITE_SUPABASE_URL)')
if (missing.length) {
  console.error(`[smoke-matrix] missing env: ${missing.join(', ')}`)
  process.exit(1)
}

const SENTINEL = 'smoke-mtx'
const PROBE_HANDLE = 'smoke-mtx-probe'
let applied = false

// pt-BR display labels (mirror of src/lib/classLabels.ts — display only; the
// catalog keys stay canonical English everywhere).
const CLASS_LABELS = {
  'Assassin Cross': 'Algoz',
  'Lord Knight': 'Lorde',
  'High Wizard': 'Arquimago',
  Sniper: 'Atirador de Elite',
  'High Priest': 'Sumo Sacerdote',
  Mastersmith: 'Mestre-Ferreiro',
  Paladin: 'Paladino',
  Professor: 'Professor',
  Stalker: 'Desordeiro',
  Biochemist: 'Criador',
  Champion: 'Mestre',
  Bard: 'Menestrel',
  Gypsy: 'Cigana',
  Summoner: 'Invocador',
  Rebellion: 'Insurgente',
}
const FUNCTION_LABELS = { dps: 'Físico', mdps: 'Mágico', suporte: 'Suporte' }
// Distance BELOW the cohort's worst real value, as a fraction of that value.
// Primer 1 sits 5% further down, primer 2 10%, primer 3 (owner 2026-10-29, only
// for a cohort with NO real member) 15% — so the trio is ordered and every one
// of them stays strictly under every real player (owner 2026-10-28: primers are
// a basis, not competitors).
const GAPS = [0.05, 0.1, 0.15]
const SUFFIXES = ['Um', 'Dois', 'Três']

function classLabel(name) {
  return CLASS_LABELS[name] ?? name
}

function classSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`mgmt query failed: HTTP ${res.status} ${await res.text()}`)
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Login via the deployed verify-pin (nickname contract first, legacy handle fallback). */
async function login(displayName) {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' }
  for (const body of [
    JSON.stringify({ nickname: displayName, pin: FIXTURE_PIN }),
    JSON.stringify({ discord_handle: displayName, pin: FIXTURE_PIN }),
  ]) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, { method: 'POST', headers, body })
    if (res.ok) {
      const json = await res.json()
      if (json?.session?.access_token) return json.session
    }
  }
  throw new Error(`login failed for ${displayName} (both nickname and handle contracts)`)
}

async function myReport(session) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_report`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`my_report failed: HTTP ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const CLEAN_SQL = `
delete from pin_login_attempts
  where discord_handle like '${SENTINEL}-%'
     or discord_handle in (select id::text from members where discord_handle like '${SENTINEL}-%');
delete from step_up_tokens where member_id in (select id from members where discord_handle like '${SENTINEL}-%');
delete from member_identity_history where member_id in (select id from members where discord_handle like '${SENTINEL}-%');
delete from submission_stats where submission_id in (
  select s.id from submissions s join members m on m.id = s.member_id
  where m.discord_handle like '${SENTINEL}-%'
);
delete from submissions where member_id in (select id from members where discord_handle like '${SENTINEL}-%');
delete from members where discord_handle like '${SENTINEL}-%';
`

// META combos (class_cohorts.meta = true, migration 0037) that also have
// exactly six usable keys, plus their live census and the real anchor (newest
// validated submitter) when one exists.
//
// Three different filters matter here, and they answer three different
// questions:
//   - the SKIP count ignores this script's own namespace (smoke-mtx-%) so a
//     re-run never mistakes a previous primer for real coverage, while still
//     honouring the dedicated per-class fixture scripts (smoke-bio-, smoke-hp-,
//     smoke-sum-) as coverage;
//   - the ANCHOR ignores every smoke fixture (smoke%) — a primer must always be
//     derived from a REAL player's submission, never from another primer;
//   - real_members (owner 2026-10-29) counts active members of the cohort that
//     are NOT any kind of smoke fixture: 0 means the cohort has no member
//     registered yet, which is what earns the combo a THIRD primer.
const TARGETS_SQL = `
with combo as (
  select cc.class_name, cc.char_function
  from class_cohorts cc
  where cc.meta
    and exists (
      select 1 from class_key_stats ks
      where ks.class_name = cc.class_name
        and ks.char_function = cc.char_function
        and ks.selection_order <= 6
      group by ks.class_name, ks.char_function
      having count(*) = 6
    )
),
census as (
  select c.class_name, c.char_function,
         (select count(distinct s.member_id)
            from submissions s
            join members m on m.id = s.member_id
           where m.char_class = c.class_name
             and m.char_function = c.char_function
             and m.active
             and s.status = 'validated'
             and m.discord_handle not like '${SENTINEL}-%') as validators,
         (select count(distinct m.id)
            from members m
           where m.char_class = c.class_name
             and m.char_function = c.char_function
             and m.active
             and m.discord_handle not like 'smoke%') as real_members,
         a.anchor_id, a.anchor_display
  from combo c
  left join lateral (
    select m.id as anchor_id, m.display_name as anchor_display
    from members m
    join submissions s on s.member_id = m.id and s.status = 'validated'
    where m.char_class = c.class_name and m.char_function = c.char_function and m.active
      and m.discord_handle not like 'smoke%'
    group by m.id, m.display_name
    order by max(s.submitted_at) desc
    limit 1
  ) a on true
)
select class_name, char_function, coalesce(validators, 0) as validators,
       coalesce(real_members, 0) as real_members,
       anchor_id, anchor_display
from census
order by class_name, char_function;
`

const CATALOG_COUNT_SQL = `select count(*)::int as n from stat_catalog;`

const statsNotNull = `
-- Latest validated value per (real member, stat). Smoke fixtures are excluded
-- so a re-run is deterministic and never feeds on its own output.
create temp table mtx_live (member_id uuid, stat_key text, value numeric) on commit drop;
insert into mtx_live
select distinct on (sub.member_id, ss.stat_key) sub.member_id, ss.stat_key, ss.value
from submission_stats ss
join submissions sub on sub.id = ss.submission_id
join members m on m.id = sub.member_id and m.active
where sub.status not in ('rejected', 'discarded')
  and m.discord_handle not like 'smoke-%'
order by sub.member_id, ss.stat_key, sub.submitted_at desc;

-- WORST real value per stat across the whole guild, in the stat's own "worse"
-- direction (higher-is-better -> minimum, lower-is-better -> maximum). This is
-- the floor for combos that have no real submitter yet: nobody in the guild is
-- worse on that stat, so any real player who submits lands above the primer.
create temp table mtx_global_worst (stat_key text primary key, worst_value numeric) on commit drop;
insert into mtx_global_worst (stat_key, worst_value)
select sc.stat_key,
       case sc.stat_direction when 'lower' then max(l.value) else min(l.value) end
from stat_catalog sc
join mtx_live l on l.stat_key = sc.stat_key
group by sc.stat_key, sc.stat_direction;
`

function fixtureRowsSql(fixtures) {
  return fixtures
    .map((f) => {
      const anchor = f.anchorId ? `'${f.anchorId}'::uuid` : 'null::uuid'
      return `  ('${f.handle}', '${f.display.replace(/'/g, "''")}', '${f.className}', '${f.charFunction}', ${f.gap.toFixed(3)}, ${anchor})`
    })
    .join(',\n')
}

// Worst REAL value per (fixture, stat) + the derived floor. Shared by the seed
// and by the completion probe (gap 0 = "a player who just arrived under the
// floor", i.e. the worst case the primers must not block).
const worstAndBaseSql = `
create temp table mtx_worst (handle text, stat_key text, worst_value numeric) on commit drop;
insert into mtx_worst (handle, stat_key, worst_value)
select f.handle, sc.stat_key,
       coalesce(cw.worst_value, gw.worst_value, fb.fallback_value, 0)
from mtx_fixtures f
cross join stat_catalog sc
left join mtx_global_worst gw on gw.stat_key = sc.stat_key
left join (values ('crit_dmg', 155::numeric), ('fixed_ct', -90::numeric), ('variable_ct', -35::numeric))
  as fb(stat_key, fallback_value) on fb.stat_key = sc.stat_key
left join lateral (
  -- The combo's OWN worst real submitter, direction-aware. 'and m.active' plus
  -- the smoke% exclusion keep this honest: a primer must be derived from a real
  -- player of the same cohort, never from another fixture.
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
-- v + |v|*gap. gap = 0 for the probe (it must sit exactly ON the floor).
create temp table mtx_fixture_base (handle text, stat_key text, base_value numeric) on commit drop;
insert into mtx_fixture_base (handle, stat_key, base_value)
select w.handle, w.stat_key,
       case
         when sc.stat_direction = 'lower'
           then w.worst_value + abs(w.worst_value) * f.gap
         when w.worst_value < 0
           then w.worst_value - abs(w.worst_value) * f.gap
         else greatest(w.worst_value * (1 - f.gap), 0)
       end
from mtx_worst w
join mtx_fixtures f on f.handle = w.handle
join stat_catalog sc on sc.stat_key = w.stat_key;
`

function seedSql(fixtures, catalogCount) {
  return `
begin;
${CLEAN_SQL}

${statsNotNull}

create temp table mtx_fixtures (handle text, display text, class_name text, char_function text, gap numeric, anchor_id uuid) on commit drop;
insert into mtx_fixtures (handle, display, class_name, char_function, gap, anchor_id) values
${fixtureRowsSql(fixtures)};

${worstAndBaseSql}

-- Invariant: one base per catalog stat per fixture, no gaps, no unknown keys.
do $$ begin
  if exists (
    select 1 from mtx_fixtures f
    where (select count(*) from mtx_fixture_base b where b.handle = f.handle) <> ${catalogCount}
  ) then
    raise exception 'every fixture must carry exactly ${catalogCount} catalog stats';
  end if;
  if exists (
    select 1 from mtx_fixture_base b
    where not exists (select 1 from stat_catalog sc where sc.stat_key = b.stat_key)
  ) then
    raise exception 'fixture base carries unknown stat keys';
  end if;
  -- FLOOR INVARIANT (owner 2026-10-28): a primer is a basis, never a
  -- competitor. Every value must sit at or below the worst real value it was
  -- derived from, in that stat's own worse direction — which is what makes its
  -- per-stat points (and its OVR) unable to exceed the lowest real member's.
  if exists (
    select 1
    from mtx_fixture_base b
    join mtx_worst w on w.handle = b.handle and w.stat_key = b.stat_key
    join stat_catalog sc on sc.stat_key = b.stat_key
    where case sc.stat_direction
            when 'lower' then b.base_value < w.worst_value
            else b.base_value > w.worst_value
          end
  ) then
    raise exception 'a primer value is above the worst real value it was derived from';
  end if;
  if exists (select 1 from mtx_fixtures where gap < 0 or gap >= 1) then
    raise exception 'fixture gaps must be in [0, 1) (0 = exactly on the floor, else below it)';
  end if;
end $$;

insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
select handle, display, '${bcrypt.hashSync(FIXTURE_PIN, 10)}', 'member', true, class_name, char_function
from mtx_fixtures;

-- Fresh validated submissions (1 day old => the no-banner fresh-data state).
insert into submissions (member_id, status, submitted_at)
select m.id, 'validated', now() - interval '1 day'
from mtx_fixtures f
join members m on m.discord_handle = f.handle;

-- The base already IS the final value (worsening happened above): percentual
-- rounds to 1 decimal, flat to integer — never a factor applied twice.
insert into submission_stats (submission_id, stat_key, value)
select s.id, b.stat_key,
       case when sc.value_type = 'percentual' then round(b.base_value, 1)
            else round(b.base_value) end
from mtx_fixtures f
join members m on m.discord_handle = f.handle
join submissions s on s.member_id = m.id and s.status = 'validated'
join mtx_fixture_base b on b.handle = f.handle
join stat_catalog sc on sc.stat_key = b.stat_key;

commit;
`
}

const FIXTURE_COUNTS_SQL = `
select m.discord_handle as handle, m.char_class, m.char_function, count(ss.*)::int as stats
from members m
join submissions s on s.member_id = m.id and s.status = 'validated'
join submission_stats ss on ss.submission_id = s.id
where m.discord_handle like '${SENTINEL}-%'
group by 1, 2, 3
order by 1;
`

const META_SPLIT_SQL = `
select count(*) filter (where meta)::int as meta,
       count(*) filter (where not meta)::int as dark
from class_cohorts;
`

// After a run, every primer must belong to a META cohort: the namespace clean
// at the top of each seed removes the old set, so a non-meta row here means a
// target list and a seed disagree — a real regression, not a warning.
const NON_META_PRIMERS_SQL = `
select m.discord_handle, m.char_class, m.char_function
from members m
left join class_cohorts cc
  on cc.class_name = m.char_class and cc.char_function = m.char_function
where m.discord_handle like '${SENTINEL}-%'
  and coalesce(cc.meta, false) = false
order by 1;
`

// Live re-check of the floor invariant AFTER the rows are stored (rounding
// included): no primer value may be above the worst real value it descends from.
// Empty rows = primers are all at or below the cohort's (or guild's) worst.
const FLOOR_CHECK_SQL = `
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
primer_latest as (
  select distinct on (sub.member_id, ss.stat_key) sub.member_id, ss.stat_key, ss.value
  from submission_stats ss
  join submissions sub on sub.id = ss.submission_id
  where sub.status not in ('rejected','discarded')
  order by sub.member_id, ss.stat_key, sub.submitted_at desc
)
select m.discord_handle, m.char_class, m.char_function, p.stat_key, p.value,
       coalesce(cw.worst_value, gw.worst_value) as floor_value
from members m
join primer_latest p on p.member_id = m.id
join stat_catalog sc on sc.stat_key = p.stat_key
left join cohort_worst cw
  on cw.char_class = m.char_class and cw.char_function = m.char_function and cw.stat_key = p.stat_key
left join global_worst gw on gw.stat_key = p.stat_key
where m.discord_handle like '${SENTINEL}-%'
  and coalesce(cw.worst_value, gw.worst_value) is not null
  and case sc.stat_direction
        when 'lower' then p.value < coalesce(cw.worst_value, gw.worst_value)
        else p.value > coalesce(cw.worst_value, gw.worst_value)
      end
order by 1, 4;
`

// Key stats that floor at 0: the value-proportional OVR divides by the cohort
// max (higher-is-better) / min (lower-is-better), so if EVERYBODY reports 0 the
// denominator is 0 and the cohort's OVR stays null until a non-zero report. A
// primer is never inflated to dodge that — it is a basis, not a competitor.
const ZERO_FLOOR_KEY_SQL = `
select distinct m.char_class, m.char_function, ss.stat_key
from members m
join submissions s on s.member_id = m.id and s.status = 'validated'
join submission_stats ss on ss.submission_id = s.id
join class_key_stats ks
  on ks.class_name = m.char_class
 and ks.char_function = m.char_function
 and ks.selection_order <= 6
 and ks.stat_key = ss.stat_key
where m.discord_handle like '${SENTINEL}-%'
  and ss.value = 0
order by 1, 2, 3;
`

const CENSUS_SQL = `
select m.char_class as class_name, m.char_function,
       count(distinct m.id) filter (where m.active) as active_members,
       count(distinct s.member_id) filter (where s.status = 'validated' and m.active) as validators
from members m
left join submissions s on s.member_id = m.id
where m.char_class is not null
group by 1, 2
order by 1, 2;
`

// The probe proves the objective: a third submitter completes an empty cohort.
// It must NOT touch the matrix fixtures, so it only purges its own namespace.
function probeSql(probe) {
  return `
begin;
${PROBE_PURGE_SQL}
${statsNotNull}
create temp table mtx_fixtures (handle text, display text, class_name text, char_function text, gap numeric, anchor_id uuid) on commit drop;
-- gap = 0: the probe sits exactly ON the guild floor, i.e. the weakest possible
-- "just arrived" submitter. If even that unlocks a real OVR, any real player
-- does — that is the claim this probe makes.
insert into mtx_fixtures values
  ('${probe.handle}', '${probe.display}', '${probe.className}', '${probe.charFunction}', 0.000, null::uuid);
${worstAndBaseSql}
insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
select handle, display, '${bcrypt.hashSync(FIXTURE_PIN, 10)}', 'member', true, class_name, char_function
from mtx_fixtures;
insert into submissions (member_id, status, submitted_at)
select m.id, 'validated', now() - interval '1 hour'
from mtx_fixtures f join members m on m.discord_handle = f.handle;
insert into submission_stats (submission_id, stat_key, value)
select s.id, b.stat_key,
       case when sc.value_type = 'percentual' then round(b.base_value, 1)
            else round(b.base_value) end
from mtx_fixtures f
join members m on m.discord_handle = f.handle
join submissions s on s.member_id = m.id and s.status = 'validated'
join mtx_fixture_base b on b.handle = f.handle
join stat_catalog sc on sc.stat_key = b.stat_key;
commit;
`
}

const PROBE_PURGE_SQL = `
delete from pin_login_attempts where discord_handle like '${PROBE_HANDLE}%'
   or discord_handle in (select id::text from members where discord_handle like '${PROBE_HANDLE}%');
delete from submission_stats where submission_id in (
  select s.id from submissions s join members m on m.id = s.member_id
  where m.discord_handle like '${PROBE_HANDLE}%');
delete from submissions where member_id in (select id from members where discord_handle like '${PROBE_HANDLE}%');
delete from members where discord_handle like '${PROBE_HANDLE}%';
`

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[smoke-matrix] project ${PROJECT_REF} mode=${APPLY ? 'apply' : 'purge'}`)
  await mgmtQuery('select 1 as ok')
  console.log('[smoke-matrix] management token OK')

  if (!APPLY) {
    await mgmtQuery(CLEAN_SQL)
    console.log(`[smoke-matrix] purge complete (${SENTINEL}-% fixtures removed)`)
    return
  }

  const catalogCount = Number((await mgmtQuery(CATALOG_COUNT_SQL))[0].n)
  console.log(`[smoke-matrix] catalog: ${catalogCount} stats`)

  const split = (await mgmtQuery(META_SPLIT_SQL))[0]
  console.log(
    `[smoke-matrix] class_cohorts split: ${split.meta} meta / ${split.dark} non-viable ` +
      `(only meta combos are primed)`,
  )

  const targets = (await mgmtQuery(TARGETS_SQL)) ?? []
  if (targets.length === 0) throw new Error('no meta (class, function) combo has 6 key stats configured')
  console.log(`[smoke-matrix] meta combos with 6 usable keys: ${targets.length}`)

  const skipped = targets.filter((t) => Number(t.validators) >= 3 && !INCLUDE_PRIMED)
  const selected = targets.filter((t) => Number(t.validators) < 3 || INCLUDE_PRIMED)
  if (skipped.length) {
    console.log(
      `[smoke-matrix] skipping ${skipped.length} already-primed combo(s) (>= 3 validated submitters): ` +
        skipped.map((s) => `${s.class_name}/${s.char_function} (n=${s.validators})`).join(', ') +
        ' — pass --all to include them',
    )
  }

  // Owner 2026-10-29: a cohort with no real member registered yet earns a THIRD
  // primer (n=3 on its own → a real OVR → its own Início row). Cohorts that
  // DO have real members keep TWO — the third slot stays reserved for a real
  // player (registered-but-not-submitting players already cover it semantically).
  const primerCount = (t) => (Number(t.real_members) === 0 ? GAPS.length : GAPS.length - 1)
  const empty = selected.filter((t) => Number(t.real_members) === 0)

  const fixtures = []
  for (const t of selected) {
    const count = primerCount(t)
    for (let i = 0; i < count; i += 1) {
      fixtures.push({
        handle: `${SENTINEL}-${classSlug(t.class_name)}-${t.char_function}-0${i + 1}`,
        display: `Smoke ${classLabel(t.class_name)} ${FUNCTION_LABELS[t.char_function]} ${SUFFIXES[i]}`,
        className: t.class_name,
        charFunction: t.char_function,
        gap: GAPS[i],
        anchorId: t.anchor_id ?? null,
        anchorDisplay: t.anchor_display ?? null,
      })
    }
  }
  if (fixtures.length === 0) {
    console.log('[smoke-matrix] nothing to seed')
    return
  }
  const anchored = selected.filter((t) => t.anchor_id).length
  console.log(
    `[smoke-matrix] seeding ${fixtures.length} fixtures across ${selected.length} combo(s): ` +
      `${anchored} under a real cohort's worst member, ${selected.length - anchored} under the guild floor ` +
      `(gaps ${GAPS.map((g) => `${(g * 100).toFixed(0)}%`).join(' / ')} below the floor)`,
  )
  if (empty.length) {
    console.log(
      `[smoke-matrix] no real member registered yet → THIRD primer for ${empty.length} combo(s): ` +
        empty.map((t) => `${t.class_name}/${t.char_function}`).join(', '),
    )
  }

  // Census before: the coverage that persists between runs (this script's own
  // primers excluded) — the same number the skip rule uses.
  const validatorsBefore = (t) => Number(t.validators ?? 0)

  if (DRY_RUN) {
    // Rehearsal: the same transaction, rolled back — proves the SQL and the
    // guards (catalog coverage, floor invariant, gap in [0,1)) without a single
    // live write.
    await mgmtQuery(seedSql(fixtures, catalogCount).replace(/commit;\s*$/, 'rollback;'))
    console.log('[smoke-matrix] DRY RUN — transaction rolled back, zero writes')
    return
  }

  await mgmtQuery(seedSql(fixtures, catalogCount))
  applied = true
  console.log('[smoke-matrix] seed applied (members, validated submissions, full catalog stats)')

  // --- checks -------------------------------------------------------------
  const counts = (await mgmtQuery(FIXTURE_COUNTS_SQL)) ?? []
  const wrong = counts.filter((r) => r.stats !== catalogCount)
  console.log(
    `[smoke-matrix] fixtures on disk: ${counts.length}/${fixtures.length}, ` +
      `stat rows: ${counts.length ? counts[0].stats : 0}/${catalogCount}` +
      (wrong.length ? ` — ${wrong.length} with a wrong stat count` : ''),
  )
  if (counts.length !== fixtures.length || wrong.length) process.exitCode = 1

  const offMeta = (await mgmtQuery(NON_META_PRIMERS_SQL)) ?? []
  if (offMeta.length) {
    console.log(
      `[smoke-matrix] FAIL — ${offMeta.length} primer(s) outside the meta split: ` +
        offMeta.map((r) => `${r.char_class}/${r.char_function}`).join(', '),
    )
    process.exitCode = 1
  } else {
    console.log('[smoke-matrix] every primer sits in a meta cohort (and only meta was seeded)')
  }

  // Floor invariant, re-checked on the stored rows (rounding included).
  const aboveFloor = (await mgmtQuery(FLOOR_CHECK_SQL)) ?? []
  if (aboveFloor.length) {
    console.log(
      `[smoke-matrix] FAIL — ${aboveFloor.length} primer value(s) above the worst real value: ` +
        aboveFloor
          .slice(0, 8)
          .map((r) => `${r.char_class}/${r.char_function} ${r.stat_key} ${r.value} > ${r.floor_value}`)
          .join(', ') +
        (aboveFloor.length > 8 ? ` (+${aboveFloor.length - 8} more)` : ''),
    )
    process.exitCode = 1
  } else {
    console.log(
      '[smoke-matrix] floor invariant holds on live rows: every primer value is at or below the ' +
        "cohort's worst real member (guild floor when the cohort is empty)",
    )
  }

  const zeroKeys = (await mgmtQuery(ZERO_FLOOR_KEY_SQL)) ?? []
  if (zeroKeys.length) {
    console.log(
      '[smoke-matrix] note — key stats that floor at 0 (a cohort where every report is 0 keeps its ' +
        'OVR null until a non-zero report arrives; primers are never inflated to dodge that): ' +
        [...new Set(zeroKeys.map((r) => `${r.char_class}/${r.char_function}:${r.stat_key}`))].join(', '),
    )
  }

  const after = new Map(
    ((await mgmtQuery(CENSUS_SQL)) ?? []).map((r) => [`${r.class_name}/${r.char_function}`, r]),
  )
  let sufficient = 0
  for (const t of selected) {
    const key = `${t.class_name}/${t.char_function}`
    const now = Number(after.get(key)?.validators ?? 0)
    const beforeN = validatorsBefore(t)
    const note = now >= 3 ? 'data-sufficient' : `n=${now} — one real submitter away from an OVR`
    if (now >= 3) sufficient += 1
    console.log(`[smoke-matrix] ${key}: validators ${beforeN} -> ${now} (${note})`)
  }

  // Anchored combos reach n >= 3 immediately: read one fixture's own report.
  const anchoredCombo = selected.find((t) => t.anchor_id)
  if (anchoredCombo) {
    const fixture = fixtures.find(
      (f) => f.className === anchoredCombo.class_name && f.charFunction === anchoredCombo.char_function,
    )
    const report = await myReport(await login(fixture.display))
    const ok =
      report?.ovr?.data_sufficient === true &&
      typeof report.ovr.value === 'number' &&
      report.ovr.value >= 51
    console.log(
      `[smoke-matrix] anchored probe ${fixture.display}: ovr=${report?.ovr?.value} ` +
        `data_sufficient=${report?.ovr?.data_sufficient} -> ${ok ? 'OVR RPC OK' : 'OVR RPC UNEXPECTED'}`,
    )
    if (!ok) process.exitCode = 1
  }

  // Owner 2026-10-29 objective, proved on the ROWS THAT ARE NOW LIVE: a cohort
  // that had no member registered yet must answer a real OVR by itself, because
  // it now carries its third primer. The old self-cleaning "third submitter"
  // probe is gone — that state is now permanent and verified, not simulated.
  const emptyCombo = empty.find((t) => selected.includes(t))
  if (emptyCombo) {
    const comboKey = `${emptyCombo.class_name}/${emptyCombo.char_function}`
    const fixture = fixtures.find(
      (f) => f.className === emptyCombo.class_name && f.charFunction === emptyCombo.char_function,
    )
    const report = await myReport(await login(fixture.display))
    const ok =
      report?.ovr?.data_sufficient === true &&
      typeof report.ovr.value === 'number' &&
      report.ovr.value >= 51
    console.log(
      `[smoke-matrix] third-primer probe ${comboKey} (${fixture.display}): ovr=${report?.ovr?.value} ` +
        `data_sufficient=${report?.ovr?.data_sufficient} -> ${ok ? 'NO-MEMBER COHORT ANSWERS ITS OWN OVR' : 'PROBE FAILED'}`,
    )
    if (!ok) process.exitCode = 1
  }

  console.log(
    `[smoke-matrix] combos data-sufficient now: ${sufficient}/${selected.length} ` +
      `(${empty.length} of them answered by their own third primer; the rest need one real submitter each)`,
  )
}

main()
  .then(() => {
    if (!process.exitCode && applied) {
      console.log(
        `[smoke-matrix] DONE — fixtures live (owner: may stay until second order; purge pre-release: node scripts/smoke-matrix-fixtures.mjs --purge)`,
      )
    }
  })
  .catch((err) => {
    console.error(`[smoke-matrix] FAILED: ${err?.message || err}`)
    process.exit(1)
  })
