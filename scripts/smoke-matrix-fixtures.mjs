#!/usr/bin/env node
/**
 * NeoFoot smoke fixtures: TWO cohort primers per (class, function) combo that
 * has key stats configured — owner request 2026-10-28.
 *
 * Why: an OVR needs n >= 3 submitters per (class, function) cohort. Real data
 * only exists in a handful of cohorts, so a real player who signs in for any
 * other combo gets a data-insufficient card (no overall). Two primers raise an
 * empty cohort to n=2, so the FIRST real player who submits reaches n=3 and
 * immediately sees their own OVR. Combos that already have >= 3 validated
 * submitters are skipped (already primed by their own dedicated fixtures) —
 * pass --all to include them anyway.
 *
 * Owner decisions (2026-10-28):
 *   - exactly TWO primers per target combo (the third member is meant to be a
 *     REAL player);
 *   - primers are the "worse" half of the ladder (factors 0.950 / 0.900), so a
 *     real submitter lands on top of their own cohort;
 *   - combos without key stats are out of scope for now.
 *
 * Stat base per combo (never invented per class):
 *   - ANCHORED combo (real validated submitters exist): the per-stat MINIMUM
 *     over those submitters' latest validated values, scaled by the factor — a
 *     primer therefore never outranks a real player (for lower-is-better stats
 *     the minimum is the best value and the factor scales it toward worse);
 *   - EMPTY combo: the generic LIVE reference profile — per stat, the median
 *     over every active member's latest validated value; when that median is 0
 *     the median of the NON-ZERO values is used instead (so key stats keep a
 *     real, non-zero denominator); stats that are zero in every live sample
 *     fall back to the Phase 7 owner samples (crit_dmg 155, fixed_ct -90,
 *     variable_ct -35, SEED-NOTES.md).
 *
 * What it creates (LIVE, smoke-mtx-% sentinel namespace):
 *   - 2 members per target combo, e.g. smoke-mtx-assassin-cross-dps-01/02,
 *     display 'Smoke Algoz Físico Um' / '... Dois', role member, active,
 *     char_class/char_function = the combo;
 *   - 1 VALIDATED submission each (now() - 1 day => fresh-data state) holding
 *     ALL catalog stats, percentual rounded to 1 decimal, flat to integer;
 *   - pin_hash = bcrypt(FIXTURE_PIN, shared smoke-config) — never printed.
 *
 * Verification built in: key-config census, per-fixture stat counts, a guard
 * that every KEY stat base is > 0 (a 0 denominator would keep every OVR null
 * forever), cohort census before/after, OVR reads for the anchored cohorts, and
 * ONE self-cleaning probe on an empty cohort that proves the claim behind the
 * whole script: with a third submitter present the cohort becomes
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
const FACTORS = [0.95, 0.9]
const SUFFIXES = ['Um', 'Dois']

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

// Combos that have exactly six usable keys, plus their live census and the
// real anchor (newest validated submitter) when one exists.
//
// Two different filters matter here:
//   - the SKIP count ignores this script's own namespace (smoke-mtx-%) so a
//     re-run never mistakes a previous primer for real coverage, while still
//     honouring the dedicated per-class fixture scripts (smoke-bio-, smoke-hp-,
//     smoke-sum-) as coverage;
//   - the ANCHOR ignores every smoke fixture (smoke%) — a primer must always be
//     derived from a REAL player's submission, never from another primer.
const TARGETS_SQL = `
with combo as (
  select ks.class_name, ks.char_function
  from class_key_stats ks
  group by 1, 2
  having count(*) filter (where ks.selection_order <= 6) = 6
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
       anchor_id, anchor_display
from census
order by class_name, char_function;
`

const CATALOG_COUNT_SQL = `select count(*)::int as n from stat_catalog;`

const statsNotNull = `
create temp table mtx_live (member_id uuid, stat_key text, value numeric) on commit drop;
insert into mtx_live
select distinct on (sub.member_id, ss.stat_key) sub.member_id, ss.stat_key, ss.value
from submission_stats ss
join submissions sub on sub.id = ss.submission_id
join members m on m.id = sub.member_id and m.active
where sub.status not in ('rejected', 'discarded')
  -- Real data only: never let a previous fixture run contaminate the generic
  -- reference profile (re-runs stay deterministic).
  and m.discord_handle not like 'smoke-%'
order by sub.member_id, ss.stat_key, sub.submitted_at desc;

create temp table mtx_generic_base (stat_key text primary key, base_value numeric) on commit drop;
insert into mtx_generic_base (stat_key, base_value)
select sc.stat_key,
       coalesce(
         case when b.median_all is null or b.median_all = 0 then b.median_nonzero else b.median_all end,
         f.fallback_value,
         0
       )
from (
  select sc.stat_key,
         percentile_cont(0.5) within group (order by l.value) as median_all,
         percentile_cont(0.5) within group (order by l.value) filter (where l.value <> 0) as median_nonzero
  from stat_catalog sc
  left join mtx_live l on l.stat_key = sc.stat_key
  group by sc.stat_key
) b
join stat_catalog sc on sc.stat_key = b.stat_key
left join (values ('crit_dmg', 155::numeric), ('fixed_ct', -90::numeric), ('variable_ct', -35::numeric))
  as f(stat_key, fallback_value) on f.stat_key = b.stat_key;
`

function fixtureRowsSql(fixtures) {
  return fixtures
    .map((f) => {
      const anchor = f.anchorId ? `'${f.anchorId}'::uuid` : 'null::uuid'
      return `  ('${f.handle}', '${f.display.replace(/'/g, "''")}', '${f.className}', '${f.charFunction}', ${f.factor.toFixed(3)}, ${anchor})`
    })
    .join(',\n')
}

function seedSql(fixtures, catalogCount) {
  return `
begin;
${CLEAN_SQL}

${statsNotNull}

create temp table mtx_fixtures (handle text, display text, class_name text, char_function text, factor numeric, anchor_id uuid) on commit drop;
insert into mtx_fixtures (handle, display, class_name, char_function, factor, anchor_id) values
${fixtureRowsSql(fixtures)};

-- Per-fixture stat base: on a combo that has REAL submitters, the per-stat
-- MINIMUM over those submitters' latest validated values (never this script's
-- own namespace) — so no primer can outrank a real player, in either stat
-- direction (for lower-is-better stats the minimum is the best value and the
-- factor scales it back toward worse). A real zero carries no information and
-- is skipped; combos without real data fall back to the generic profile.
create temp table mtx_fixture_base (handle text, stat_key text, base_value numeric) on commit drop;
insert into mtx_fixture_base (handle, stat_key, base_value)
select f.handle, sc.stat_key,
       coalesce(ab.value, gb.base_value)
from mtx_fixtures f
cross join stat_catalog sc
join mtx_generic_base gb on gb.stat_key = sc.stat_key
left join lateral (
  select min(l.value) as value
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
  where l.value <> 0
) ab on f.anchor_id is not null;

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
  -- A zero (or negative) key-stat base would divide by zero in every OVR
  -- formula, leaving the whole cohort data-insufficient forever.
  if exists (
    select 1
    from mtx_fixtures f
    join class_key_stats ks
      on ks.class_name = f.class_name
     and ks.char_function = f.char_function
     and ks.selection_order <= 6
    join mtx_fixture_base b on b.handle = f.handle and b.stat_key = ks.stat_key
    where b.base_value <= 0
  ) then
    raise exception 'every KEY stat base must be > 0 (a zero denominator keeps OVR null)';
  end if;
  if exists (select 1 from mtx_fixtures where factor >= 1) then
    raise exception 'fixture factors must be < 1 (primers sit below a real submitter)';
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

insert into submission_stats (submission_id, stat_key, value)
select s.id, b.stat_key,
       case when sc.value_type = 'percentual'
            then round(b.base_value * f.factor, 1)
            else round(b.base_value * f.factor) end
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
create temp table mtx_fixtures (handle text, display text, class_name text, char_function text, factor numeric, anchor_id uuid) on commit drop;
insert into mtx_fixtures values
  ('${probe.handle}', '${probe.display}', '${probe.className}', '${probe.charFunction}', 1.000, null::uuid);
create temp table mtx_fixture_base (handle text, stat_key text, base_value numeric) on commit drop;
insert into mtx_fixture_base (handle, stat_key, base_value)
select f.handle, gb.stat_key, gb.base_value from mtx_fixtures f cross join mtx_generic_base gb;
insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
select handle, display, '${bcrypt.hashSync(FIXTURE_PIN, 10)}', 'member', true, class_name, char_function
from mtx_fixtures;
insert into submissions (member_id, status, submitted_at)
select m.id, 'validated', now() - interval '1 hour'
from mtx_fixtures f join members m on m.discord_handle = f.handle;
insert into submission_stats (submission_id, stat_key, value)
select s.id, b.stat_key,
       case when sc.value_type = 'percentual' then round(b.base_value * f.factor, 1)
            else round(b.base_value * f.factor) end
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

  const targets = (await mgmtQuery(TARGETS_SQL)) ?? []
  if (targets.length === 0) throw new Error('no (class, function) combo has 6 key stats configured')
  console.log(`[smoke-matrix] keyed combos: ${targets.length}`)

  const skipped = targets.filter((t) => Number(t.validators) >= 3 && !INCLUDE_PRIMED)
  const selected = targets.filter((t) => Number(t.validators) < 3 || INCLUDE_PRIMED)
  if (skipped.length) {
    console.log(
      `[smoke-matrix] skipping ${skipped.length} already-primed combo(s) (>= 3 validated submitters): ` +
        skipped.map((s) => `${s.class_name}/${s.char_function} (n=${s.validators})`).join(', ') +
        ' — pass --all to include them',
    )
  }

  const fixtures = []
  for (const t of selected) {
    for (let i = 0; i < FACTORS.length; i += 1) {
      fixtures.push({
        handle: `${SENTINEL}-${classSlug(t.class_name)}-${t.char_function}-0${i + 1}`,
        display: `Smoke ${classLabel(t.class_name)} ${FUNCTION_LABELS[t.char_function]} ${SUFFIXES[i]}`,
        className: t.class_name,
        charFunction: t.char_function,
        factor: FACTORS[i],
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
      `${anchored} anchored on a real submitter, ${selected.length - anchored} on the generic profile`,
  )

  // Census before: the coverage that persists between runs (this script's own
  // primers excluded) — the same number the skip rule uses.
  const validatorsBefore = (t) => Number(t.validators ?? 0)

  if (DRY_RUN) {
    // Rehearsal: the same transaction, rolled back — proves the SQL and the
    // guards (catalog coverage, non-zero key bases, factor < 1) without a
    // single live write.
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

  // Empty combos: prove the objective with one self-cleaning third submitter.
  const emptyCombo = selected.find((t) => !t.anchor_id)
  if (emptyCombo) {
    const comboKey = `${emptyCombo.class_name}/${emptyCombo.char_function}`
    const probe = {
      handle: `${PROBE_HANDLE}-01`,
      display: `Smoke ${classLabel(emptyCombo.class_name)} ${FUNCTION_LABELS[emptyCombo.char_function]} Probe`,
      className: emptyCombo.class_name,
      charFunction: emptyCombo.char_function,
    }
    try {
      await mgmtQuery(probeSql(probe))
      const report = await myReport(await login(probe.display))
      const ok =
        report?.ovr?.data_sufficient === true &&
        typeof report.ovr.value === 'number' &&
        report.ovr.value >= 51
      console.log(
        `[smoke-matrix] completion probe on ${comboKey} (3rd submitter): ovr=${report?.ovr?.value} ` +
          `data_sufficient=${report?.ovr?.data_sufficient} -> ${ok ? 'THIRD SUBMITTER UNLOCKS THE OVR' : 'PROBE FAILED'}`,
      )
      if (!ok) process.exitCode = 1
    } finally {
      await mgmtQuery(PROBE_PURGE_SQL)
      console.log('[smoke-matrix] completion probe purged (zero residue)')
    }
  }

  console.log(
    `[smoke-matrix] combos data-sufficient now: ${sufficient}/${selected.length} ` +
      `(the rest need one real submitter each)`,
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
