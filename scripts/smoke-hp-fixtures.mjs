#!/usr/bin/env node
/**
 * NeoFoot smoke fixtures: two High Priest / suporte members with placeholder
 * validated stats (Phase 10 UAT support, owner request 2026-10-24).
 *
 * Why: the OVR calculation needs >= 3 validated submitters in the same
 * (class, char_function) cohort. The live roster had exactly ONE Sumo
 * Sacerdote suporte, so the Início OVR card rendered the data-insufficient
 * state and Phase 10 UAT could not verify the populated card.
 *
 * What it creates (LIVE, smoke-hp-% sentinel namespace):
 *   - 2 members: smoke-hp-01 / smoke-hp-02, display 'Smoke Sumo Um' /
 *     'Smoke Sumo Dois', role member, active, High Priest + suporte
 *   - 1 VALIDATED submission each (now() - 1 day => fresh-data state)
 *   - ALL catalog stats per submission (59 after Phase 9.1), value =
 *     live-median base x member factor (1.000 / 0.850), percentual rounded
 *     to 1 decimal, flat to integer — the proven seed-dummies.sql pattern
 *   - pin_hash = bcrypt(SMOKE_FIXTURE_PIN or random per-run PIN) so the
 *     owner can log in as a fixture; the PIN is NEVER printed or committed
 *     (re-run with SMOKE_FIXTURE_PIN set to choose a known one — idempotent)
 *
 * Verification built in: cohort census before/after, class_key_stats config
 * for (High Priest, suporte), per-member stat counts, and a real RPC pass —
 * login via verify-pin then my_report must return ovr.data_sufficient true
 * with a numeric OVR >= 51.
 *
 * Purge (pre-release gate — these are fake members polluting percentiles):
 *   node scripts/smoke-hp-fixtures.mjs --purge
 *   (or scripts/smoke-cleanup.mjs --apply, which covers the whole smoke%
 *   namespace)
 *
 * Env: SUPABASE_ACCESS_TOKEN (or .env SUPABASE_ACESS_TOKEN — repo spelling),
 *      SUPABASE_PROJECT_REF (fallback: parsed from the VITE_SUPABASE_URL host),
 *      SUPABASE_URL / SUPABASE_ANON_KEY (fallback: .env VITE_*),
 *      SMOKE_FIXTURE_PIN (optional — owner-chosen 4-digit fixture PIN).
 */
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { FIXTURE_PIN } from './smoke-config.mjs'

// ---------------------------------------------------------------------------
// Config (self-contained like smoke-cleanup.mjs; never prints a value)
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

const SUPABASE_URL = process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY || envFile.VITE_SUPABASE_ANON_KEY
// NOTE: SUPABASE_ACESS_TOKEN (single S) is this repo's historical .env key —
// smoke-cleanup.mjs reads the same fallback (08.1-09).
const MGMT_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN || envFile.SUPABASE_ACESS_TOKEN
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  (SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : null)

const missing = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL / VITE_SUPABASE_URL')
if (!ANON_KEY) missing.push('SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY')
if (!MGMT_TOKEN) missing.push('SUPABASE_ACCESS_TOKEN / .env SUPABASE_ACESS_TOKEN')
if (!PROJECT_REF) missing.push('SUPABASE_PROJECT_REF (or a parsable VITE_SUPABASE_URL)')
if (missing.length) {
  console.error(`[smoke-hp-fixtures] missing env: ${missing.join(', ')}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Helpers (smoke-lifecycle.mjs shapes)
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
  throw new Error(`login failed for fixture (both nickname and handle contracts)`)
}

// ---------------------------------------------------------------------------
// Placeholder stat bases — the owner-approved live-median set from
// seeds/dummy/seed-dummies.sql (57) + the two Phase 9.1 raw defenses.
// ---------------------------------------------------------------------------

const STAT_BASES = [
  ['hp', 100670], ['sp', 1008], ['patk', 2933], ['pdef', 4605],
  ['matk', 5839], ['mdef', 1664], ['refine_patk', 623], ['refine_pdef', 200],
  ['refine_matk', 887], ['refine_mdef', 280], ['hp_recover', 530],
  ['sp_recover', 73], ['hit', 264], ['flee', 148], ['combat_power', 288216],
  ['aspd', 110], ['mspd', 155],
  ['variable_ct', -35], ['fixed_ct', -90], ['healing_done', 32],
  ['healing_taken', 32], ['crit', 40], ['crit_res', 140], ['pdmg', 34],
  ['pdmg_bonus', 245], ['mdmg', 40], ['mdmg_bonus', 735], ['ignore_pdef', 843],
  ['ignore_mdef', 190], ['pve_dmg_reduction', 1219], ['pve_dmg_bonus', 673],
  ['pvp_dmg_reduction', 1730], ['pvp_dmg_bonus', 1300],
  ['crit_dmg_res', 14.0], ['pdmg_r', 154.5], ['mdmg_r', 94.1],
  ['fixed_ct_pct', -49.4], ['variable_ct_pct', -60.0], ['global_cd_pct', -10.0],
  ['ignore_pdef_pct', 0.0], ['ignore_mdef_pct', 0.0], ['crit_dmg', 155.0],
  ['max_sp_pct', 21.2], ['equip_patk_pct', 19.4], ['equip_matk_pct', 69.9],
  ['equip_pdef_pct', 25.4], ['equip_mdef_pct', 13.4],
  ['dmg_vs_small', 2.0], ['dmg_vs_medium', 4.0], ['dmg_vs_large', 4.0],
  ['dmg_vs_brute', 1.0], ['dmg_vs_demi_human', 0.0],
  ['dmg_reduction_vs_small', 4.0], ['dmg_reduction_vs_medium', 17.0],
  ['dmg_reduction_vs_large', 4.0], ['dmg_reduction_vs_brute', 2.0],
  ['dmg_reduction_vs_demi_human', 4.0],
  // Phase 9.1 (0019): hidden raw defenses (Equipment DEF / (1 + DEF%)) —
  // placeholder magnitudes proportional to the pdef/mdef bases above.
  ['rpdef', 3900], ['rmdef', 1400],
]

// ---------------------------------------------------------------------------
// SQL — one transaction, temp tables, invariant guards (seed-dummies.sql idiom)
// ---------------------------------------------------------------------------

const BASE_VALUES_SQL = STAT_BASES.map(([k, v]) => `  ('${k}', ${v})`).join(',\n')

const CLEAN_SQL = `
delete from pin_login_attempts
  where discord_handle like 'smoke-hp-%'
     or discord_handle in (select id::text from members where discord_handle like 'smoke-hp-%');
delete from step_up_tokens where member_id in (select id from members where discord_handle like 'smoke-hp-%');
delete from member_identity_history where member_id in (select id from members where discord_handle like 'smoke-hp-%');
delete from submission_stats where submission_id in (
  select s.id from submissions s join members m on m.id = s.member_id
  where m.discord_handle like 'smoke-hp-%'
);
delete from submissions where member_id in (select id from members where discord_handle like 'smoke-hp-%');
delete from members where discord_handle like 'smoke-hp-%';
`

const SEED_SQL = `
begin;
${CLEAN_SQL}

create temp table smoke_hp_members (handle text, display text, factor numeric) on commit drop;
insert into smoke_hp_members (handle, display, factor) values
  ('smoke-hp-01', 'Smoke Sumo Um',  1.000),
  ('smoke-hp-02', 'Smoke Sumo Dois', 0.850);

create temp table smoke_stat_base (stat_key text, base_value numeric) on commit drop;
insert into smoke_stat_base (stat_key, base_value) values
${BASE_VALUES_SQL};

-- Invariant: one base per catalog stat, no gaps, no unknown keys.
do $$ begin
  if (select count(*) from smoke_stat_base) <> (select count(*) from stat_catalog) then
    raise exception 'smoke_stat_base must have one row per catalog stat (% vs %)',
      (select count(*) from smoke_stat_base), (select count(*) from stat_catalog);
  end if;
  if exists (select 1 from stat_catalog sc where not exists (
       select 1 from smoke_stat_base b where b.stat_key = sc.stat_key))
  or exists (select 1 from smoke_stat_base b where not exists (
       select 1 from stat_catalog sc where sc.stat_key = b.stat_key)) then
    raise exception 'smoke_stat_base must cover stat_catalog exactly';
  end if;
end $$;

insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
select s.handle, s.display, '${bcrypt.hashSync(FIXTURE_PIN, 10)}', 'member', true, 'High Priest', 'suporte'
from smoke_hp_members s;

-- Fresh validated submissions (1 day old => the no-banner fresh-data state).
insert into submissions (member_id, status, submitted_at)
select m.id, 'validated', now() - interval '1 day'
from smoke_hp_members s join members m on m.discord_handle = s.handle;

insert into submission_stats (submission_id, stat_key, value)
select sub.id, b.stat_key,
       case when sc.value_type = 'percentual'
            then round(b.base_value * s.factor, 1)
            else round(b.base_value * s.factor) end
from submissions sub
join members m on m.id = sub.member_id
join smoke_hp_members s on m.discord_handle = s.handle
cross join smoke_stat_base b
join stat_catalog sc on sc.stat_key = b.stat_key
where m.discord_handle like 'smoke-hp-%' and sub.status = 'validated';
commit;
`

// ---------------------------------------------------------------------------
// Read-only diagnostics
// ---------------------------------------------------------------------------

const CENSUS_SQL = `
select
  (select count(*) from members
     where char_class = 'High Priest' and char_function = 'suporte' and active) as cohort_members,
  (select count(distinct s.member_id) from submissions s
     join members m on m.id = s.member_id
     where m.char_class = 'High Priest' and m.char_function = 'suporte'
       and s.status = 'validated') as validated_submitters;
`

const KEYS_SQL = `
select stat_key, selection_order from class_key_stats
where class_name = 'High Priest' and char_function = 'suporte'
order by selection_order;
`

const FIXTURE_COUNTS_SQL = `
select m.discord_handle as handle, count(ss.*) as stats
from members m
join submissions s on s.member_id = m.id and s.status = 'validated'
join submission_stats ss on ss.submission_id = s.id
where m.discord_handle like 'smoke-hp-%'
group by m.discord_handle
order by m.discord_handle;
`

function printCensus(label, rows) {
  const c = (Array.isArray(rows) ? rows[0] : null) ?? {}
  console.log(
    `[smoke-hp-fixtures] ${label}: cohort_members=${c.cohort_members} validated_submitters=${c.validated_submitters}`,
  )
  return c
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[smoke-hp-fixtures] project ${PROJECT_REF} mode=${APPLY ? 'apply' : 'purge'}`)

  // Token sanity (read-only, cheap).
  await mgmtQuery('select 1 as ok')
  console.log('[smoke-hp-fixtures] management token OK')

  if (!APPLY) {
    await mgmtQuery(CLEAN_SQL)
    console.log('[smoke-hp-fixtures] purge complete (smoke-hp-% fixtures removed)')
    return
  }

  printCensus('cohort BEFORE', await mgmtQuery(CENSUS_SQL))
  const keys = (await mgmtQuery(KEYS_SQL)) ?? []
  console.log(
    `[smoke-hp-fixtures] (High Priest, suporte) key config: ${keys.length} keys` +
      (keys.length ? ` [${keys.map((k) => k.stat_key).join(', ')}]` : ' — OVR will stay null until staff configures 6 keys'),
  )

  await mgmtQuery(SEED_SQL)
  console.log('[smoke-hp-fixtures] seed applied (2 members, 2 validated submissions, full catalog stats)')

  const counts = (await mgmtQuery(FIXTURE_COUNTS_SQL)) ?? []
  for (const row of counts) {
    console.log(`[smoke-hp-fixtures] ${row.handle}: ${row.stats} stats on validated submission`)
  }
  const after = printCensus('cohort AFTER', await mgmtQuery(CENSUS_SQL))

  // RPC verification: a fixture's own report must now be data-sufficient.
  for (const fixture of ['Smoke Sumo Um', 'Smoke Sumo Dois']) {
    const session = await login(fixture)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_report`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`my_report failed for ${fixture}: HTTP ${res.status}`)
    const report = await res.json()
    const withPoints = report.stats.filter((s) => s.points !== null).length
    const ovrOk =
      report.ovr &&
      report.ovr.data_sufficient === true &&
      typeof report.ovr.value === 'number' &&
      report.ovr.value >= 51
    console.log(
      `[smoke-hp-fixtures] ${fixture}: ovr=${report.ovr?.value} data_sufficient=${report.ovr?.data_sufficient}` +
        ` stats_with_points=${withPoints}/${report.stats.length} -> ${ovrOk ? 'OVR RPC OK' : 'OVR RPC UNEXPECTED'}`,
    )
    if (!ovrOk) process.exitCode = 1
  }

  if (after.validated_submitters < 3) {
    console.error(
      '[smoke-hp-fixtures] cohort still has < 3 validated submitters — OVR stays data-insufficient',
    )
    process.exitCode = 1
  }
}

main()
  .then(() => {
    if (!process.exitCode) {
      console.log('[smoke-hp-fixtures] DONE — fixtures live; purge before release: node scripts/smoke-hp-fixtures.mjs --purge')
    }
  })
  .catch((err) => {
    console.error(`[smoke-hp-fixtures] FAILED: ${err?.message || err}`)
    process.exit(1)
  })
