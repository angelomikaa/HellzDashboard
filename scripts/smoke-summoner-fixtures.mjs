#!/usr/bin/env node
/**
 * NeoFoot smoke fixtures: two Summoner / dps (Dano Físico) members with stats
 * based on the REAL player Caladoh (owner request 2026-10-28).
 *
 * Why: Caladoh is the guild's only Summoner/dps validated submitter (the other
 * member of the cohort, XAVENTAL, has no validated submission), so the class
 * cohort sits at n=1 — OVR is data-insufficient and Summoner never reaches the
 * Ranking board or the landing showcase. The owner then configured the six
 * Summoner/dps key stats (2026-10-28) — the missing half of the OVR gate. Two
 * smokes based on HIS stats complete the cohort (n=3) and surface the class.
 *
 * Owner decision 2026-10-28: both copies are deliberately A BIT WORSE than
 * Caladoh (factors 0.950 / 0.900). This is on purpose — Caladoh must stay the
 * cohort's top card, so the fixtures can never outrank the real player.
 *
 * Owner decision 2026-10-28: these fixtures MAY STAY LIVE until second order.
 * The pre-release gate still purges them:
 *   node scripts/smoke-summoner-fixtures.mjs --purge
 *   (scripts/smoke-cleanup.mjs --apply also covers the whole smoke% namespace)
 *
 * What it creates (LIVE, smoke-sum-% sentinel namespace):
 *   - 2 members: smoke-sum-01 / smoke-sum-02, display 'Smoke Invocador Um' /
 *     'Smoke Invocador Dois', role member, active, Summoner + dps
 *   - 1 VALIDATED submission each (now() - 1 day => fresh-data state)
 *   - ALL catalog stats per submission, value = Caladoh's LATEST VALIDATED
 *     submission value x member factor (0.950 / 0.900), percentual rounded to
 *     1 decimal, flat to integer — "based on his stats", pulled live at run
 *     time (a re-run after he re-submits rebases the smokes)
 *   - pin_hash = bcrypt(FIXTURE_PIN, shared smoke-config) so the owner can
 *     log in as a fixture; never printed or committed
 *
 * Verification built in: cohort census before/after, the six Summoner/dps key
 * stats, per-member stat counts, a real RPC pass (login via verify-pin then
 * my_report must return ovr.data_sufficient true), and the owner's ordering
 * rule: each fixture's OVR must be strictly LOWER than Caladoh's, while the
 * class section appears on the PUBLIC landing payload.
 *
 * Env: SUPABASE_ACCESS_TOKEN (or .env SUPABASE_ACESS_TOKEN — repo spelling),
 *      SUPABASE_PROJECT_REF (fallback: parsed from the VITE_SUPABASE_URL host),
 *      SUPABASE_URL / SUPABASE_ANON_KEY (fallback: .env VITE_*).
 */
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { FIXTURE_PIN } from './smoke-config.mjs'

// ---------------------------------------------------------------------------
// Config (self-contained like smoke-bio-fixtures.mjs; never prints a value)
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
// kept as a fallback next to today's correct spelling.
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
  console.error(`[smoke-summoner-fixtures] missing env: ${missing.join(', ')}`)
  process.exit(1)
}

// The real player the smokes are based on (owner-named anchor).
const ANCHOR_DISPLAY = 'Caladoh'
const CHAR_CLASS = 'Summoner'
const CHAR_FUNCTION = 'dps'

// Owner decision 2026-10-28: both copies A BIT WORSE than the anchor, on
// purpose — Caladoh keeps the top card of the cohort.
const FIXTURES = [
  { handle: 'smoke-sum-01', display: 'Smoke Invocador Um', factor: 0.950 },
  { handle: 'smoke-sum-02', display: 'Smoke Invocador Dois', factor: 0.900 },
]

// ---------------------------------------------------------------------------
// Helpers (smoke-bio-fixtures.mjs shapes)
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
  where discord_handle like 'smoke-sum-%'
     or discord_handle in (select id::text from members where discord_handle like 'smoke-sum-%');
delete from step_up_tokens where member_id in (select id from members where discord_handle like 'smoke-sum-%');
delete from member_identity_history where member_id in (select id from members where discord_handle like 'smoke-sum-%');
delete from submission_stats where submission_id in (
  select s.id from submissions s join members m on m.id = s.member_id
  where m.discord_handle like 'smoke-sum-%'
);
delete from submissions where member_id in (select id from members where discord_handle like 'smoke-sum-%');
delete from members where discord_handle like 'smoke-sum-%';
`

function seedSql(baseValuesSql) {
  const memberValuesSql = FIXTURES.map(
    (f) => `  ('${f.handle}', '${f.display}', ${f.factor.toFixed(3)})`,
  ).join(',\n')

  return `
begin;
${CLEAN_SQL}

create temp table smoke_sum_members (handle text, display text, factor numeric) on commit drop;
insert into smoke_sum_members (handle, display, factor) values
${memberValuesSql};

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
  -- Owner rule 2026-10-28: the copies are strictly worse than the anchor.
  if exists (select 1 from smoke_sum_members where factor >= 1) then
    raise exception 'smoke_sum_members factors must be < 1 (copies must stay below the anchor)';
  end if;
end $$;

insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
select s.handle, s.display, '${bcrypt.hashSync(FIXTURE_PIN, 10)}', 'member', true, '${CHAR_CLASS}', '${CHAR_FUNCTION}'
from smoke_sum_members s;

-- Fresh validated submissions (1 day old => the no-banner fresh-data state).
insert into submissions (member_id, status, submitted_at)
select m.id, 'validated', now() - interval '1 day'
from smoke_sum_members s join members m on m.discord_handle = s.handle;

insert into submission_stats (submission_id, stat_key, value)
select sub.id, b.stat_key,
       case when sc.value_type = 'percentual'
            then round(b.base_value * s.factor, 1)
            else round(b.base_value * s.factor) end
from submissions sub
join members m on m.id = sub.member_id
join smoke_sum_members s on m.discord_handle = s.handle
cross join smoke_stat_base b
join stat_catalog sc on sc.stat_key = b.stat_key
where m.discord_handle like 'smoke-sum-%' and sub.status = 'validated';
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

// The anchor's LATEST validated submission only — one value per stat_key.
const ANCHOR_STATS_SQL = `
select distinct on (ss.stat_key) ss.stat_key, ss.value
from submission_stats ss
join submissions s on s.id = ss.submission_id
where s.member_id = (select id from members where display_name = '${ANCHOR_DISPLAY}')
  and s.status = 'validated'
order by ss.stat_key, s.submitted_at desc;
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
where class_name = '${CHAR_CLASS}' and char_function = '${CHAR_FUNCTION}' and selection_order <= 6
order by selection_order;
`

const FIXTURE_COUNTS_SQL = `
select m.discord_handle as handle, count(ss.*) as stats
from members m
join submissions s on s.member_id = m.id and s.status = 'validated'
join submission_stats ss on ss.submission_id = s.id
where m.discord_handle like 'smoke-sum-%'
group by m.discord_handle
order by m.discord_handle;
`

function printCensus(label, rows) {
  const c = (Array.isArray(rows) ? rows[0] : null) ?? {}
  console.log(
    `[smoke-summoner-fixtures] ${label}: cohort_members=${c.cohort_members} validated_submitters=${c.validated_submitters}`,
  )
  return c
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[smoke-summoner-fixtures] project ${PROJECT_REF} mode=${APPLY ? 'apply' : 'purge'}`)

  // Token sanity (read-only, cheap).
  await mgmtQuery('select 1 as ok')
  console.log('[smoke-summoner-fixtures] management token OK')

  if (!APPLY) {
    await mgmtQuery(CLEAN_SQL)
    console.log('[smoke-summoner-fixtures] purge complete (smoke-sum-% fixtures removed)')
    return
  }

  // The anchor must exist, be active and match the expected cohort.
  const anchor = await mgmtQuery(ANCHOR_SQL)
  if (!anchor || anchor.length === 0) {
    throw new Error(`anchor member not found: ${ANCHOR_DISPLAY} (${CHAR_CLASS}/${CHAR_FUNCTION}, active)`)
  }
  console.log(`[smoke-summoner-fixtures] anchor: ${anchor[0].display_name} (${anchor[0].char_class}/${anchor[0].char_function})`)

  // His latest validated submission IS the stat base ("based on his stats").
  const anchorStats = await mgmtQuery(ANCHOR_STATS_SQL)
  if (!anchorStats || anchorStats.length === 0) {
    throw new Error(`anchor has no validated submission to base the fixtures on`)
  }
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
  console.log(
    `[smoke-summoner-fixtures] stat base: ${base.size} stats from ${ANCHOR_DISPLAY}'s latest validated submission` +
      ` (factors ${FIXTURES.map((f) => f.factor.toFixed(3)).join(' / ')} — copies deliberately worse)`,
  )

  printCensus('cohort BEFORE', await mgmtQuery(CENSUS_SQL))
  const keys = (await mgmtQuery(KEYS_SQL)) ?? []
  console.log(
    `[smoke-summoner-fixtures] (${CHAR_CLASS}, ${CHAR_FUNCTION}) key config: ${keys.length} keys` +
      (keys.length ? ` [${keys.map((k) => k.stat_key).join(', ')}]` : ' — OVR will stay null until staff configures 6 keys'),
  )
  if (keys.length !== 6) {
    console.error(
      `[smoke-summoner-fixtures] key config must be exactly 6 rows with selection_order <= 6 (found ${keys.length}) — set them in Stats-Chave`,
    )
    process.exitCode = 1
  }

  const baseValuesSql = [...base.entries()]
    .map(([k, v]) => `  ('${k}', ${v})`)
    .join(',\n')
  await mgmtQuery(seedSql(baseValuesSql))
  console.log('[smoke-summoner-fixtures] seed applied (2 members, 2 validated submissions, full catalog stats)')

  const counts = (await mgmtQuery(FIXTURE_COUNTS_SQL)) ?? []
  for (const row of counts) {
    console.log(`[smoke-summoner-fixtures] ${row.handle}: ${row.stats} stats on validated submission`)
    if (row.stats !== base.size) process.exitCode = 1
  }
  const after = printCensus('cohort AFTER', await mgmtQuery(CENSUS_SQL))

  // RPC verification: each fixture's own report must now be data-sufficient.
  const ovrByFixture = new Map()
  for (const fixture of FIXTURES) {
    const session = await login(fixture.display)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_report`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`my_report failed for ${fixture.display}: HTTP ${res.status}`)
    const report = await res.json()
    const ovrOk =
      report.ovr &&
      report.ovr.data_sufficient === true &&
      typeof report.ovr.value === 'number' &&
      report.ovr.value >= 51
    if (ovrOk) ovrByFixture.set(fixture.display, report.ovr.value)
    console.log(
      `[smoke-summoner-fixtures] ${fixture.display}: ovr=${report.ovr?.value} data_sufficient=${report.ovr?.data_sufficient} -> ${ovrOk ? 'OVR RPC OK' : 'OVR RPC UNEXPECTED'}`,
    )
    if (!ovrOk) process.exitCode = 1
  }

  // The goal + the owner's ordering rule: the PUBLIC landing payload must
  // carry a Summoner section where the anchor tops every fixture.
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
    const anchorCard = cards.find((c) => c.name === ANCHOR_DISPLAY)
    if (!anchorCard) {
      console.error(`[smoke-summoner-fixtures] ${ANCHOR_DISPLAY} missing from the public Summoner section`)
      process.exitCode = 1
    } else {
      if (cards[0].name !== ANCHOR_DISPLAY) {
        console.error(
          `[smoke-summoner-fixtures] ORDERING VIOLATION: top card is ${cards[0].name}, expected ${ANCHOR_DISPLAY} (copies must stay worse)`,
        )
        process.exitCode = 1
      }
      for (const fixture of FIXTURES) {
        const card = cards.find((c) => c.name === fixture.display)
        if (!card) {
          console.error(`[smoke-summoner-fixtures] ${fixture.display} missing from the public Summoner section`)
          process.exitCode = 1
          continue
        }
        const worse = card.ovr < anchorCard.ovr
        console.log(
          `[smoke-summoner-fixtures] ${fixture.display} ovr=${card.ovr} vs ${ANCHOR_DISPLAY} ovr=${anchorCard.ovr} -> ${worse ? 'WORSE (as intended)' : 'NOT WORSE — ordering rule broken'}`,
        )
        if (!worse) process.exitCode = 1
      }
    }
  }
  console.log(
    `[smoke-summoner-fixtures] public sections now: ${sections.map((s) => s.class_name).join(', ')}`,
  )

  if (after.validated_submitters < 3) {
    console.error(
      '[smoke-summoner-fixtures] cohort still has < 3 validated submitters — OVR stays data-insufficient',
    )
    process.exitCode = 1
  }
}

main()
  .then(() => {
    if (!process.exitCode) {
      console.log('[smoke-summoner-fixtures] DONE — fixtures live (owner: may stay until second order; purge pre-release: node scripts/smoke-summoner-fixtures.mjs --purge)')
    }
  })
  .catch((err) => {
    console.error(`[smoke-summoner-fixtures] FAILED: ${err?.message || err}`)
    process.exit(1)
  })
