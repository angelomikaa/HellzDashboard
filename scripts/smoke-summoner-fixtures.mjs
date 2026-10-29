#!/usr/bin/env node
/**
 * NeoFoot smoke fixtures: two Summoner / dps (Dano Físico) members, stats derived
 * from the cohort's WORST real submitter pushed 5%/10% down (owner decision 2026-10-28).
 *
 * Why: Caladoh is the guild's only Summoner/dps validated submitter (the other
 * cohort member, XAVENTAL, has no validated submission), so n=1 — OVR is
 * data-insufficient and the class never reaches the Ranking board or landing. Two
 * fixtures at or below the cohort's worst real member complete the cohort (n=3)
 * and surface the class. Every fixture's OVR therefore stays under Caladoh's.
 *
 * Stat base per fixture: per stat, the WORST value among that cohort's REAL
 * validated submitters (direction-aware: min for higher-is-better, max for
 * lower-is-better), then worsened by GAPS[i] — fixture 1 sits 5% further below
 * EVERY real player than fixture 2, both strictly under every real submitter.
 * Empty cohorts fall back to the guild worst (then Phase 7 samples). Every
 * fixture's OVR can never exceed the lowest real member's.
 *
 * Caller must create a temp table `smoke_fixtures` before calling seedSql().
 * The shared smoke-floor.mjs module owns the floor SQL, the invariant guard,
 * and the live re-check.
 *
 * Owner decision 2026-10-28: fixtures MAY STAY LIVE until second order.
 * Pre-release purge: node scripts/smoke-summoner-fixtures.mjs --purge
 */
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { FIXTURE_PIN } from './smoke-config.mjs'
import { gapsLabel, floorSql, floorCheckSql } from './smoke-floor.mjs'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CHAR_CLASS = 'Summoner'
const CHAR_FUNCTION = 'dps'
const SENTINEL = 'smoke-sum'

function loadEnvFile() {
  try {
    const raw = readFileSync('.env', 'utf8')
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2]
    }
    return env
  } catch { return {} }
}
const envFile = loadEnvFile()
const APPLY = !process.argv.includes('--purge')
const SUPABASE_URL = process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY || envFile.VITE_SUPABASE_ANON_KEY
const MGMT_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ||
  envFile.SUPABASE_ACESS_TOKEN ||
  envFile.SUPABASE_ACCESS_TOKEN
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  (SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : null)
const missing = []
if (!SUPABASE_URL) missing.push('SUPABASE_URL / VITE_SUPABASE_URL')
if (!ANON_KEY) missing.push('SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY')
if (!MGMT_TOKEN) missing.push('SUPABASE_ACCESS_TOKEN / .env SUPABASE_ACESS_TOKEN')
if (!PROJECT_REF) missing.push('SUPABASE_PROJECT_REF (or a parsable VITE_SUPABASE_URL)')
if (missing.length) {
  console.error(`[smoke-summoner-fixtures] missing env: ${missing.join(', ')}`)
  process.exit(1)
}

async function mgmtQuery(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    { method: 'POST', headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) },
  )
  if (!res.ok) throw new Error(`mgmt query failed: HTTP ${res.status} ${await res.text()}`)
  const text = await res.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}

async function login(displayName) {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' }
  for (const body of [
    JSON.stringify({ nickname: displayName, pin: FIXTURE_PIN }),
    JSON.stringify({ discord_handle: displayName, pin: FIXTURE_PIN }),
  ]) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, { method: 'POST', headers, body })
    if (res.ok) { const json = await res.json(); if (json?.session?.access_token) return json.session }
  }
  throw new Error(`login failed for fixture (both nickname and handle contracts)`)
}

async function fetchPublicPromotion() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_promotion_public`, {
    method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`get_promotion_public failed: HTTP ${res.status}`)
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

const CATALOG_COUNT_SQL = `select count(*)::int as n from stat_catalog;`

function seedSql(catalogCount) {
  return `
begin;
${CLEAN_SQL}
create temp table smoke_fixtures (handle text, display text, class_name text, char_function text, gap numeric) on commit drop;
insert into smoke_fixtures (handle, display, class_name, char_function, gap) values
  ('${SENTINEL}-01', 'Smoke Invocador Um', '${CHAR_CLASS}', '${CHAR_FUNCTION}', 0.05),
  ('${SENTINEL}-02', 'Smoke Invocador Dois', '${CHAR_CLASS}', '${CHAR_FUNCTION}', 0.1);
-- Shared FLOOR computation from smoke-floor.mjs (gaps 5% / 10% below cohort worst).
${floorSql(catalogCount)}
insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
select s.handle, s.display, '${bcrypt.hashSync(FIXTURE_PIN, 10)}', 'member', true, s.class_name, s.char_function
from smoke_fixtures s;
insert into submissions (member_id, status, submitted_at)
select m.id, 'validated', now() - interval '1 day'
from smoke_fixtures f join members m on m.discord_handle = f.handle;
insert into submission_stats (submission_id, stat_key, value)
select s.id, b.stat_key,
       case when sc.value_type = 'percentual' then round(b.base_value, 1) else round(b.base_value) end
from submissions s
join members m on m.id = s.member_id
join smoke_fixtures f on m.discord_handle = f.handle
join smoke_fixture_base b on b.handle = f.handle
join stat_catalog sc on sc.stat_key = b.stat_key
where s.status = 'validated' and m.discord_handle like '${SENTINEL}-%';
commit;
`
}

const CENSUS_SQL = `
select
  (select count(*) from members
     where char_class = '${CHAR_CLASS}' and char_function = '${CHAR_FUNCTION}' and active) as cohort_members,
  (select count(distinct s.member_id) from submissions s
     join members m on m.id = s.member_id
     where m.char_class = '${CHAR_CLASS}' and m.char_function = '${CHAR_FUNCTION}' and s.status = 'validated') as validated_submitters;
`
const KEYS_SQL = `
select stat_key, selection_order from class_key_stats
where class_name = '${CHAR_CLASS}' and char_function = '${CHAR_FUNCTION}' and selection_order <= 6
order by selection_order;
`
const FIXTURE_COUNTS_SQL = `
select m.discord_handle as handle, count(ss.*) as stats
from members m join submissions s on s.member_id = m.id and s.status = 'validated'
join submission_stats ss on ss.submission_id = s.id
where m.discord_handle like '${SENTINEL}-%' group by m.discord_handle order by m.discord_handle;
`

function printCensus(label, rows) {
  const c = (Array.isArray(rows) ? rows[0] : null) ?? {}
  console.log(`[smoke-summoner-fixtures] ${label}: cohort_members=${c.cohort_members} validated_submitters=${c.validated_submitters}`)
  return c
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[smoke-summoner-fixtures] project ${PROJECT_REF} mode=${APPLY ? 'apply' : 'purge'}`)
  await mgmtQuery('select 1 as ok')
  console.log('[smoke-summoner-fixtures] management token OK')

  if (!APPLY) {
    await mgmtQuery(CLEAN_SQL)
    console.log('[smoke-summoner-fixtures] purge complete (smoke-sum-% fixtures removed)')
    return
  }

  printCensus('cohort BEFORE', await mgmtQuery(CENSUS_SQL))
  const keys = (await mgmtQuery(KEYS_SQL)) ?? []
  console.log(
    `[smoke-summoner-fixtures] (${CHAR_CLASS}, ${CHAR_FUNCTION}) key config: ${keys.length} keys` +
      (keys.length ? ` [${keys.map((k) => k.stat_key).join(', ')}]` : ' — OVR will stay null until staff configures 6 keys'),
  )
  if (keys.length !== 6) {
    console.error(`[smoke-summoner-fixtures] key config must be exactly 6 rows with selection_order <= 6 (found ${keys.length}) — set them in Stats-Chave`)
    process.exitCode = 1
  }

  const catalogCount = ((await mgmtQuery(CATALOG_COUNT_SQL)) ?? [])[0]?.n ?? 0
  console.log(`[smoke-summoner-fixtures] gaps: ${gapsLabel()}`)
  await mgmtQuery(seedSql(catalogCount))
  console.log('[smoke-summoner-fixtures] seed applied (2 members, 2 validated submissions, full catalog stats)')

  const counts = (await mgmtQuery(FIXTURE_COUNTS_SQL)) ?? []
  for (const row of counts) console.log(`[smoke-summoner-fixtures] ${row.handle}: ${row.stats} stats`)
  const after = printCensus('cohort AFTER', await mgmtQuery(CENSUS_SQL))

  // Floor invariant re-check on stored rows (rounding included): no fixture
  // value may be above the cohort's worst real member.
  const violations = (await mgmtQuery(floorCheckSql(`${SENTINEL}-%`))) ?? []
  if (violations.length) {
    console.log(
      `[smoke-summoner-fixtures] FAIL — ${violations.length} fixture value(s) above the cohort\'s worst real member: ` +
        violations.slice(0, 8).map((r) => `${r.char_class}/${r.char_function} ${r.stat_key} ${r.value} > ${r.floor_value}`).join(', ') +
        (violations.length > 8 ? ` (+${violations.length - 8} more)` : ''),
    )
    process.exitCode = 1
  } else {
    console.log('[smoke-summoner-fixtures] floor invariant holds: every fixture is at or below the cohort\'s worst real member')
  }

  // RPC verification: each fixture's own report must be data-sufficient.
  const ovrByFixture = new Map()
  for (const fixture of ['Smoke Invocador Um', 'Smoke Invocador Dois']) {
    const session = await login(fixture)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_report`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`my_report failed for ${fixture}: HTTP ${res.status}`)
    const report = await res.json()
    const ovrOk =
      report.ovr && report.ovr.data_sufficient === true &&
      typeof report.ovr.value === 'number' && report.ovr.value >= 51
    if (ovrOk) ovrByFixture.set(fixture, report.ovr.value)
    console.log(`[smoke-summoner-fixtures] ${fixture}: ovr=${report.ovr?.value} data_sufficient=${report.ovr?.data_sufficient} -> ${ovrOk ? 'OVR RPC OK' : 'OVR RPC UNEXPECTED'}`)
    if (!ovrOk) process.exitCode = 1
  }

  // Goal + ordering rule: the PUBLIC landing payload must carry a Summoner
  // section where the cohort's worst real member tops every fixture.
  const sections = await fetchPublicPromotion()
  const summoner = sections.find((s) => s.class_name === CHAR_CLASS)
  if (!summoner) {
    console.error('[smoke-summoner-fixtures] get_promotion_public has NO Summoner section')
    process.exitCode = 1
  } else {
    const cards = summoner.cards
      .map((c) => ({ name: c.display_name, ovr: Math.round(c.ovr * 10) / 10 }))
      .sort((a, b) => b.ovr - a.ovr)
    console.log(`[smoke-summoner-fixtures] public Summoner cards: ${JSON.stringify(cards)}`)
    // Find the cohort's worst real submitter — any real HP/suporte/dps member,
    // excluding smoke fixtures. He must top every fixture card.
    const realCard = cards.find((c) => !c.name.startsWith('Smoke'))
    if (!realCard) {
      console.error('[smoke-summoner-fixtures] NO real member card found in public section — ordering rule unmet')
      process.exitCode = 1
    } else {
      if (cards[0].name !== realCard.name) {
        console.error(
          `[smoke-summoner-fixtures] ORDERING VIOLATION: top card is ${cards[0].name}, expected ${realCard.name} (fixtures must stay below the cohort's worst real member)`,
        )
        process.exitCode = 1
      }
      for (const fixture of ['Smoke Invocador Um', 'Smoke Invocador Dois']) {
        const card = cards.find((c) => c.name === fixture)
        if (!card) { console.error(`[smoke-summoner-fixtures] ${fixture} missing from public section`); process.exitCode = 1; continue }
        const worse = card.ovr < realCard.ovr
        console.log(`[smoke-summoner-fixtures] ${fixture} ovr=${card.ovr} vs ${realCard.name} ovr=${realCard.ovr} -> ${worse ? 'WORSE (as intended)' : 'NOT WORSE'}`)
        if (!worse) process.exitCode = 1
      }
    }
  }

  if (after.validated_submitters < 3) {
    console.error('[smoke-summoner-fixtures] cohort still has < 3 validated submitters — OVR data-insufficient')
    process.exitCode = 1
  }
}

main()
  .then(() => {
    if (!process.exitCode) {
      console.log('[smoke-summoner-fixtures] DONE — fixtures live (purge pre-release: node scripts/smoke-summoner-fixtures.mjs --purge)')
    }
  })
  .catch((err) => {
    console.error(`[smoke-summoner-fixtures] FAILED: ${err?.message || err}`)
    process.exit(1)
  })
