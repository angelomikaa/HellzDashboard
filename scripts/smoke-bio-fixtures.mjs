#!/usr/bin/env node
/**
 * NeoFoot smoke fixtures: two Biochemist / suporte members with stats based
 * on the REAL player SoldierHellz (Phase 10 round-6 support, owner request
 * 2026-10-25).
 *
 * Why: the round-6 showcase rotates ONE Impecável class at a time, but live
 * data has a single Impecável section (High Priest) — the rotation chrome
 * (‹ n/N › stepper, pause toggle, drain bar) never renders for visitors.
 * SoldierHellz is a real Biochemist/suporte with a validated submission, but
 * his cohort has n=1, so his OVR is data-insufficient and his class never
 * reaches the landing. Two smokes based on HIS stats complete the cohort
 * (n=3) and surface a second section.
 *
 * Owner decision 2026-10-25: these fixtures MAY STAY LIVE until second order
 * (until the owner says otherwise). The pre-release gate still purges them:
 *   node scripts/smoke-bio-fixtures.mjs --purge
 *   (scripts/smoke-cleanup.mjs --apply also covers the whole smoke% namespace)
 *
 * What it creates (LIVE, smoke-bio-% sentinel namespace):
 *   - 2 members: smoke-bio-01 / smoke-bio-02, display 'Smoke Criador Um' /
 *     'Smoke Criador Dois', role member, active, Biochemist + suporte
 *   - 1 VALIDATED submission each (now() - 1 day => fresh-data state)
 *   - ALL catalog stats per submission, value = SoldierHellz's LATEST
 *     VALIDATED submission value x member factor (1.000 / 0.900), percentual
 *     rounded to 1 decimal, flat to integer — "based on his stats", pulled
 *     live at run time (a re-run after he re-submits rebases the smokes)
 *   - pin_hash = bcrypt(FIXTURE_PIN, shared smoke-config) so the owner can
 *     log in as a fixture; never printed or committed
 *
 * Verification built in: cohort census before/after, class_key_stats config
 * for (Biochemist, suporte), per-member stat counts, a real RPC pass (login
 * via verify-pin then my_report must return ovr.data_sufficient true), and
 * the actual goal: get_promotion_public must answer a Biochemist section
 * with at least one OVR >= 85 (platinum — the landing's display filter).
 *
 * Env: SUPABASE_ACCESS_TOKEN (or .env SUPABASE_ACESS_TOKEN — repo spelling),
 *      SUPABASE_PROJECT_REF (fallback: parsed from the VITE_SUPABASE_URL host),
 *      SUPABASE_URL / SUPABASE_ANON_KEY (fallback: .env VITE_*).
 */
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { FIXTURE_PIN } from './smoke-config.mjs'

// ---------------------------------------------------------------------------
// Config (self-contained like smoke-hp-fixtures.mjs; never prints a value)
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
// NOTE: SUPABASE_ACESS_TOKEN (single S) is this repo's historical .env key.
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
  console.error(`[smoke-bio-fixtures] missing env: ${missing.join(', ')}`)
  process.exit(1)
}

// The real player the smokes are based on (owner-named anchor).
const ANCHOR_DISPLAY = 'SoldierHellz'
const CHAR_CLASS = 'Biochemist'
const CHAR_FUNCTION = 'suporte'

// ---------------------------------------------------------------------------
// Helpers (smoke-hp-fixtures.mjs shapes)
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

async function fetchPublicPromotion() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_promotion_public`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`get_promotion_public failed: HTTP ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// SQL — one transaction, temp tables, invariant guards (seed-dummies.sql idiom)
// ---------------------------------------------------------------------------

const CLEAN_SQL = `
delete from pin_login_attempts
  where discord_handle like 'smoke-bio-%'
     or discord_handle in (select id::text from members where discord_handle like 'smoke-bio-%');
delete from step_up_tokens where member_id in (select id from members where discord_handle like 'smoke-bio-%');
delete from member_identity_history where member_id in (select id from members where discord_handle like 'smoke-bio-%');
delete from submission_stats where submission_id in (
  select s.id from submissions s join members m on m.id = s.member_id
  where m.discord_handle like 'smoke-bio-%'
);
delete from submissions where member_id in (select id from members where discord_handle like 'smoke-bio-%');
delete from members where discord_handle like 'smoke-bio-%';
`

function seedSql(baseValuesSql) {
  return `
begin;
${CLEAN_SQL}

create temp table smoke_bio_members (handle text, display text, factor numeric) on commit drop;
insert into smoke_bio_members (handle, display, factor) values
  ('smoke-bio-01', 'Smoke Criador Um',  1.000),
  ('smoke-bio-02', 'Smoke Criador Dois', 0.900);

create temp table smoke_stat_base (stat_key text, base_value numeric) on commit drop;
insert into smoke_stat_base (stat_key, base_value) values
${baseValuesSql};

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
select s.handle, s.display, '${bcrypt.hashSync(FIXTURE_PIN, 10)}', 'member', true, '${CHAR_CLASS}', '${CHAR_FUNCTION}'
from smoke_bio_members s;

-- Fresh validated submissions (1 day old => the no-banner fresh-data state).
insert into submissions (member_id, status, submitted_at)
select m.id, 'validated', now() - interval '1 day'
from smoke_bio_members s join members m on m.discord_handle = s.handle;

insert into submission_stats (submission_id, stat_key, value)
select sub.id, b.stat_key,
       case when sc.value_type = 'percentual'
            then round(b.base_value * s.factor, 1)
            else round(b.base_value * s.factor) end
from submissions sub
join members m on m.id = sub.member_id
join smoke_bio_members s on m.discord_handle = s.handle
cross join smoke_stat_base b
join stat_catalog sc on sc.stat_key = b.stat_key
where m.discord_handle like 'smoke-bio-%' and sub.status = 'validated';
commit;
`
}

// ---------------------------------------------------------------------------
// Read-only diagnostics
// ---------------------------------------------------------------------------

const ANCHOR_SQL = `
select id, display_name, char_class, char_function, active
from members
where display_name = '${ANCHOR_DISPLAY}' and char_class = '${CHAR_CLASS}' and char_function = '${CHAR_FUNCTION}' and active;
`

const ANCHOR_STATS_SQL = `
select ss.stat_key, ss.value
from submission_stats ss
join submissions s on s.id = ss.submission_id
where s.member_id = (select id from members where display_name = '${ANCHOR_DISPLAY}')
  and s.status = 'validated'
order by s.submitted_at desc, ss.stat_key;
`

const CENSUS_SQL = `
select
  (select count(*) from members
     where char_class = '${CHAR_CLASS}' and char_function = '${CHAR_FUNCTION}' and active) as cohort_members,
  (select count(distinct s.member_id) from submissions s
     join members m on m.id = s.member_id
     where m.char_class = '${CHAR_CLASS}' and m.char_function = '${CHAR_FUNCTION}'
       and s.status = 'validated') as validated_submitters;
`

const KEYS_SQL = `
select stat_key, selection_order from class_key_stats
where class_name = '${CHAR_CLASS}' and char_function = '${CHAR_FUNCTION}'
order by selection_order;
`

const FIXTURE_COUNTS_SQL = `
select m.discord_handle as handle, count(ss.*) as stats
from members m
join submissions s on s.member_id = m.id and s.status = 'validated'
join submission_stats ss on ss.submission_id = s.id
where m.discord_handle like 'smoke-bio-%'
group by m.discord_handle
order by m.discord_handle;
`

function printCensus(label, rows) {
  const c = (Array.isArray(rows) ? rows[0] : null) ?? {}
  console.log(
    `[smoke-bio-fixtures] ${label}: cohort_members=${c.cohort_members} validated_submitters=${c.validated_submitters}`,
  )
  return c
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[smoke-bio-fixtures] project ${PROJECT_REF} mode=${APPLY ? 'apply' : 'purge'}`)

  // Token sanity (read-only, cheap).
  await mgmtQuery('select 1 as ok')
  console.log('[smoke-bio-fixtures] management token OK')

  if (!APPLY) {
    await mgmtQuery(CLEAN_SQL)
    console.log('[smoke-bio-fixtures] purge complete (smoke-bio-% fixtures removed)')
    return
  }

  // The anchor must exist, be active and match the expected cohort.
  const anchor = await mgmtQuery(ANCHOR_SQL)
  if (!anchor || anchor.length === 0) {
    throw new Error(`anchor member not found: ${ANCHOR_DISPLAY} (${CHAR_CLASS}/${CHAR_FUNCTION}, active)`)
  }
  console.log(`[smoke-bio-fixtures] anchor: ${anchor[0].display_name} (${anchor[0].char_class}/${anchor[0].char_function})`)

  // His latest validated submission IS the stat base ("based on his stats").
  const anchorStats = await mgmtQuery(ANCHOR_STATS_SQL)
  if (!anchorStats || anchorStats.length === 0) {
    throw new Error(`anchor has no validated submission to base the fixtures on`)
  }
  // submission_stats rows of ONE submission: dedupe by stat_key ( paranoia —
  // the join above is per-submission but the order clause keeps it readable).
  const base = new Map()
  for (const row of anchorStats) {
    const value = Number(row.value)
    if (!Number.isFinite(value)) {
      throw new Error(`anchor stat ${row.stat_key} is not numeric: ${row.value}`)
    }
    base.set(row.stat_key, value)
  }
  // The seed SQL's do $$ guard re-checks exact catalog coverage server-side;
  // this JS check fails fast with a clearer message.
  const catalog = await mgmtQuery('select stat_key from stat_catalog')
  const catalogKeys = new Set((catalog ?? []).map((r) => r.stat_key))
  const missingKeys = [...catalogKeys].filter((k) => !base.has(k))
  if (missingKeys.length) {
    throw new Error(`anchor submission is missing catalog stats: ${missingKeys.join(', ')}`)
  }
  const extraKeys = [...base.keys()].filter((k) => !catalogKeys.has(k))
  if (extraKeys.length) {
    throw new Error(`anchor submission has unknown stat keys: ${extraKeys.join(', ')}`)
  }
  console.log(`[smoke-bio-fixtures] stat base: ${base.size} stats from ${ANCHOR_DISPLAY}'s latest validated submission`)

  printCensus('cohort BEFORE', await mgmtQuery(CENSUS_SQL))
  const keys = (await mgmtQuery(KEYS_SQL)) ?? []
  console.log(
    `[smoke-bio-fixtures] (${CHAR_CLASS}, ${CHAR_FUNCTION}) key config: ${keys.length} keys` +
      (keys.length ? ` [${keys.map((k) => k.stat_key).join(', ')}]` : ' — OVR will stay null until staff configures 6 keys'),
  )

  const baseValuesSql = [...base.entries()]
    .map(([k, v]) => `  ('${k}', ${v})`)
    .join(',\n')
  await mgmtQuery(seedSql(baseValuesSql))
  console.log('[smoke-bio-fixtures] seed applied (2 members, 2 validated submissions, full catalog stats)')

  const counts = (await mgmtQuery(FIXTURE_COUNTS_SQL)) ?? []
  for (const row of counts) {
    console.log(`[smoke-bio-fixtures] ${row.handle}: ${row.stats} stats on validated submission`)
  }
  const after = printCensus('cohort AFTER', await mgmtQuery(CENSUS_SQL))

  // RPC verification: a fixture's own report must now be data-sufficient.
  for (const fixture of ['Smoke Criador Um', 'Smoke Criador Dois']) {
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
    const ovrOk =
      report.ovr &&
      report.ovr.data_sufficient === true &&
      typeof report.ovr.value === 'number' &&
      report.ovr.value >= 51
    console.log(
      `[smoke-bio-fixtures] ${fixture}: ovr=${report.ovr?.value} data_sufficient=${report.ovr?.data_sufficient} -> ${ovrOk ? 'OVR RPC OK' : 'OVR RPC UNEXPECTED'}`,
    )
    if (!ovrOk) process.exitCode = 1
  }

  // The actual goal: the PUBLIC landing payload must now carry a Biochemist
  // section with at least one platinum (>= 85) card for the display filter.
  const sections = await fetchPublicPromotion()
  const bio = sections.find((s) => s.class_name === CHAR_CLASS)
  if (!bio) {
    console.error('[smoke-bio-fixtures] get_promotion_public has NO Biochemist section — rotation stays invisible')
    process.exitCode = 1
  } else {
    const ovrs = bio.cards.map((c) => ({ name: c.display_name, ovr: Math.round(c.ovr) }))
    const platinum = ovrs.filter((c) => c.ovr >= 85)
    console.log(`[smoke-bio-fixtures] public Biochemist cards: ${JSON.stringify(ovrs)}`)
    console.log(
      `[smoke-bio-fixtures] platinum (>= 85, visible on the landing): ${platinum.length} -> ${platinum.length ? 'ROTATION VISIBLE' : 'ROTATION STILL INVISIBLE'}`,
    )
    if (platinum.length === 0) process.exitCode = 1
  }
  console.log(
    `[smoke-bio-fixtures] public sections now: ${sections.map((s) => s.class_name).join(', ')}`,
  )

  if (after.validated_submitters < 3) {
    console.error(
      '[smoke-bio-fixtures] cohort still has < 3 validated submitters — OVR stays data-insufficient',
    )
    process.exitCode = 1
  }
}

main()
  .then(() => {
    if (!process.exitCode) {
      console.log('[smoke-bio-fixtures] DONE — fixtures live (owner: may stay until second order; purge pre-release: node scripts/smoke-bio-fixtures.mjs --purge)')
    }
  })
  .catch((err) => {
    console.error(`[smoke-bio-fixtures] FAILED: ${err?.message || err}`)
    process.exit(1)
  })
