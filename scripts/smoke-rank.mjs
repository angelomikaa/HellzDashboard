#!/usr/bin/env node
/**
 * NeoFoot live rank smoke matrix (plan 03-03 task 2).
 *
 * Runs against the LIVE project: creates a throwaway class ZZRankSquad with 3
 * throwaway members (bcrypt PIN 1234), drives real submissions through the
 * deployed create_submission RPC, configures key stats through the REAL
 * set_key_stat RPC, then asserts the full rank contract with EXACT-VALUE
 * assertions against the 03-01 spec (src/lib/rankMath.test.ts):
 *
 *   percentile points: 74.25 (tie at top of 3), 49.5 (mid of 3 / all-tied), 99, 0
 *   OVR = 51 + mean(6 key-stat points) * 48/99:  a=61, b=77, c=87
 *   MIN_COHORT_SIZE = 3 (n=2 -> points null + data_sufficient false, values kept)
 *
 * FIXTURE DEVIATION (Rule 1, see 03-03-SUMMARY.md): the plan's sp row
 * {a:50, b:50, c:80} (tie at BOTTOM) contradicts its own expected values — a
 * bottom tie yields 24.75, while the plan's OVR cross-checks require the
 * locked tie-at-TOP value 74.25 (a's OVR-61 vector [0,74.25,0,49.5,0,0] and
 * b's OVR-77 mean 53.625 both need sp=74.25). The locked 03-01 spec is
 * authoritative, so sp is {a:80, b:80, c:50} (a/b tie at top, c below) and
 * c's OVR is 87 (mean 74.25 -> 51+36), not the plan's 95 — a/b/c joint
 * realizability of {74.25, 74.25, 99} on one stat is mathematically impossible.
 *
 * Every fixture row is NEW and removed in cleanup (finally-style, WR-06
 * lesson: never permanently mutate live data; second run must also pass).
 *
 * Env:
 *   SUPABASE_URL / SUPABASE_ANON_KEY       (fallback: local .env VITE_* values)
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF  (Management API — session env
 *   var ONLY: never written to any file, never committed, never echoed)
 *
 * Exits non-zero on any FAIL. Prints "RANK SMOKE PASSED" only if all pass.
 */
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'

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
const SUPABASE_URL = process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY || envFile.VITE_SUPABASE_ANON_KEY
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('[smoke-rank] Missing SUPABASE_URL or SUPABASE_ANON_KEY (env or .env VITE_*)')
  process.exit(1)
}
if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF')
  process.exit(1)
}

const OFFICER_HANDLE = 'officer-handle'
const PIN = '1234'
const CLASS = 'ZZRankSquad'
const HANDLES = ['zz-rank-a', 'zz-rank-b', 'zz-rank-c']
const KEY_STATS = ['hp', 'sp', 'patk', 'pdef', 'matk', 'mdef']

// One submission per member via the real create_submission RPC (values are
// the 03-01 worked-example fixtures; c has NO hit row -> n=2 insufficiency).
const FIXTURES = {
  'zz-rank-a': { hp: 100, sp: 80, patk: 10, pdef: 7, matk: 100, mdef: 50, hit: 10 },
  'zz-rank-b': { hp: 200, sp: 80, patk: 20, pdef: 7, matk: 200, mdef: 60, hit: 20 },
  'zz-rank-c': { hp: 300, sp: 50, patk: 30, pdef: 7, matk: 300, mdef: 70 }, // hit absent (D-13/D-07)
}

// ---------------------------------------------------------------------------
// Helpers (same shape as scripts/smoke-rls.mjs)
// ---------------------------------------------------------------------------

const failures = []
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS: ${name}${detail ? ` (${detail})` : ''}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` (${detail})` : ''}`)
    failures.push(name)
  }
}

/** Login via the deployed verify-pin function; both gateway headers required (01-02). */
async function login(handle) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ discord_handle: handle, pin: PIN }),
  })
  if (!res.ok) {
    throw new Error(`login failed for ${handle}: HTTP ${res.status} ${await res.text()}`)
  }
  const body = await res.json()
  if (!body.session || !body.session.access_token) {
    throw new Error(`login for ${handle} returned no session`)
  }
  return body.session
}

/** PostgREST call. token === null means anon (apikey only). */
async function rest(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = { apikey: ANON_KEY }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== null) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text === '' ? null : JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, ok: res.ok, json, text }
}

/** Service-level Management API Run Query (legacy /v1 endpoint, 01-01 proven). */
async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
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

/** Tolerance-free numeric equality after Number() conversion (77.0 === 77). */
function numEq(actual, expected) {
  if (actual === null || actual === undefined) return false
  return Number(actual) === expected
}

// ---------------------------------------------------------------------------
// Cleanup (idempotent; runs pre-run for residue safety and in finally always).
// Order matters (FKs): submissions cascade stats; class_key_stats has no FK
// to classes but must go to leave no residue; pin_login_attempts rows are
// written by verify-pin even on SUCCESS-path resets (03-03 finding).
// ---------------------------------------------------------------------------

async function cleanup() {
  await mgmtQuery(
    `delete from submissions where member_id in (select id from members where discord_handle in ('zz-rank-a','zz-rank-b','zz-rank-c'));`,
  )
  await mgmtQuery(`delete from members where discord_handle in ('zz-rank-a','zz-rank-b','zz-rank-c');`)
  await mgmtQuery(`delete from class_key_stats where class_name = '${CLASS}';`)
  await mgmtQuery(`delete from classes where class_name = '${CLASS}';`)
  await mgmtQuery(`delete from pin_login_attempts where discord_handle in ('zz-rank-a','zz-rank-b','zz-rank-c');`)
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[smoke-rank] Logging in as ${OFFICER_HANDLE} (PIN placeholder)`)
  const officer = await login(OFFICER_HANDLE)

  // Defensive pre-clean: a previously crashed run must not break this one
  // (unique handles / class PK) — also proves the second consecutive run works.
  await cleanup()

  try {
    // ---- Setup ------------------------------------------------------------
    await mgmtQuery(`insert into classes (class_name) values ('${CLASS}');`)

    const pinHash = bcrypt.hashSync(PIN, 10)
    for (const h of HANDLES) {
      await mgmtQuery(
        `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function) ` +
          `values ('${h}', 'ZZ Rank ${h.slice(-1).toUpperCase()}', '${pinHash}', 'member', true, '${CLASS}', 'dps');`,
      )
    }

    const sessions = {}
    for (const h of HANDLES) {
      sessions[h] = await login(h)
    }
    console.log('[smoke-rank] Officer + 3 zz-rank members logged in')

    for (const h of HANDLES) {
      const pStats = Object.entries(FIXTURES[h]).map(([stat_key, value]) => ({ stat_key, value }))
      const res = await rest('/rpc/create_submission', {
        method: 'POST',
        token: sessions[h].access_token,
        body: { p_stats: pStats },
      })
      if (!res.ok) {
        throw new Error(`create_submission failed for ${h}: HTTP ${res.status} ${res.text}`)
      }
    }
    console.log('[smoke-rank] 3 fixture submissions created via the real RPC')

    // Key-stat config through the RPC under test: counts must be 1..6 in order.
    let n = 0
    for (const k of KEY_STATS) {
      n += 1
      const res = await rest('/rpc/set_key_stat', {
        method: 'POST',
        token: officer.access_token,
        body: { p_class: CLASS, p_stat_key: k, p_enabled: true },
      })
      check(
        `officer set_key_stat(${k}) -> count ${n}`,
        res.ok && numEq(res.json, n),
        `HTTP ${res.status} body=${res.text}`,
      )
    }

    // ---- Assertions -------------------------------------------------------

    // 1. Block-at-7 (D-02): enabling a 7th key stat is rejected server-side.
    const block7 = await rest('/rpc/set_key_stat', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS, p_stat_key: 'hit', p_enabled: true },
    })
    check(
      'set_key_stat block-at-7 rejected with key_stat_limit',
      !block7.ok && block7.text.includes('key_stat_limit'),
      `HTTP ${block7.status} ${block7.text.slice(0, 120)}`,
    )

    // 2. Member-denied write (D-03): members can never configure key stats.
    const memberSet = await rest('/rpc/set_key_stat', {
      method: 'POST',
      token: sessions['zz-rank-a'].access_token,
      body: { p_class: CLASS, p_stat_key: 'hit', p_enabled: true },
    })
    check(
      'member set_key_stat -> forbidden',
      !memberSet.ok && memberSet.text.includes('forbidden'),
      `HTTP ${memberSet.status}`,
    )

    // 3. class_key_stats member-leak probe (RNK-02): 200 [] or a deny status.
    const leak = await rest('/class_key_stats?select=stat_key', {
      token: sessions['zz-rank-a'].access_token,
    })
    const leakDenied =
      (leak.status === 200 && Array.isArray(leak.json) && leak.json.length === 0) ||
      leak.status === 401 ||
      leak.status === 403 ||
      leak.status === 42501
    check('member GET /class_key_stats -> NO rows (RNK-02)', leakDenied, `HTTP ${leak.status}`)

    // 4. Officer CAN read the class's key stats (RNK-01 read side).
    const officerRead = await rest(`/class_key_stats?class_name=eq.${CLASS}&select=stat_key`, {
      token: officer.access_token,
    })
    const ksRows = Array.isArray(officerRead.json) ? officerRead.json.map((r) => r.stat_key).sort() : []
    check(
      'officer GET /class_key_stats -> exactly the 6 configured stats',
      officerRead.ok && ksRows.length === 6 && JSON.stringify(ksRows) === JSON.stringify([...KEY_STATS].sort()),
      `HTTP ${officerRead.status} rows=${JSON.stringify(ksRows)}`,
    )

    // 5. class_top5 member-denied (D-05): never member-invocable.
    const memberTop5 = await rest('/rpc/class_top5', {
      method: 'POST',
      token: sessions['zz-rank-a'].access_token,
      body: { p_class: CLASS },
    })
    check(
      'member class_top5 -> forbidden',
      !memberTop5.ok && memberTop5.text.includes('forbidden'),
      `HTTP ${memberTop5.status}`,
    )

    // 6. Officer top-5 preview: exact OVR values, sorted desc.
    const top5 = await rest('/rpc/class_top5', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS },
    })
    const top5rows = Array.isArray(top5.json) ? top5.json : []
    const top5ovrs = top5rows.map((r) => Number(r.ovr))
    check(
      'officer class_top5 -> 3 rows [c 87, b 77, a 61] desc',
      top5.ok &&
        top5rows.length === 3 &&
        JSON.stringify(top5ovrs) === JSON.stringify([87, 77, 61]) &&
        top5rows[0].display_name === 'ZZ Rank C' &&
        top5rows[1].display_name === 'ZZ Rank B' &&
        top5rows[2].display_name === 'ZZ Rank A',
      `HTTP ${top5.status} ${top5.text.slice(0, 160)}`,
    )

    // 7. anon my_report denied (T-03-11): apikey only, no member claim.
    const anonReport = await rest('/rpc/my_report', { method: 'POST', body: {} })
    check('anon rpc my_report denied', !anonReport.ok, `HTTP ${anonReport.status}`)

    // 8. my_report for zz-rank-b — the core exact-value formula proof.
    const reportB = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions['zz-rank-b'].access_token,
      body: {},
    })
    check('my_report(b) -> 2xx json', reportB.ok && reportB.json !== null, `HTTP ${reportB.status}`)
    const statsB = reportB.json && Array.isArray(reportB.json.stats) ? reportB.json.stats : []
    check('my_report(b): stats array has 57 entries (full catalog)', statsB.length === 57, `len=${statsB.length}`)

    const groupRank = { general: 0, quasi: 1, special: 2 }
    let groupOrdered = statsB.length > 0
    for (let i = 1; i < statsB.length; i += 1) {
      if (groupRank[statsB[i].group_name] < groupRank[statsB[i - 1].group_name]) groupOrdered = false
    }
    check('my_report(b): stats ordered general -> quasi -> special', groupOrdered)

    const byKeyB = {}
    for (const s of statsB) byKeyB[s.stat_key] = s

    check(
      'my_report(b) hp: own 200 avg 200 best 300 points 49.5 ds true (middle of 3)',
      numEq(byKeyB.hp.own_value, 200) &&
        numEq(byKeyB.hp.class_average, 200) &&
        numEq(byKeyB.hp.best, 300) &&
        numEq(byKeyB.hp.points, 49.5) &&
        byKeyB.hp.data_sufficient === true,
      JSON.stringify(byKeyB.hp),
    )
    check(
      'my_report(b) sp: own 80 avg 70 best 80 points 74.25 (tie at top: (1+0.5)/2x99)',
      numEq(byKeyB.sp.own_value, 80) &&
        numEq(byKeyB.sp.class_average, 70) &&
        numEq(byKeyB.sp.best, 80) &&
        numEq(byKeyB.sp.points, 74.25) &&
        byKeyB.sp.data_sufficient === true,
      JSON.stringify(byKeyB.sp),
    )
    check(
      'my_report(b) pdef: own 7 avg 7 best 7 points 49.5 (all tied)',
      numEq(byKeyB.pdef.own_value, 7) &&
        numEq(byKeyB.pdef.class_average, 7) &&
        numEq(byKeyB.pdef.best, 7) &&
        numEq(byKeyB.pdef.points, 49.5) &&
        byKeyB.pdef.data_sufficient === true,
      JSON.stringify(byKeyB.pdef),
    )
    check(
      'my_report(b) hit (n=2): own 20 avg 15 best 20 points NULL ds false (D-13)',
      numEq(byKeyB.hit.own_value, 20) &&
        numEq(byKeyB.hit.class_average, 15) &&
        numEq(byKeyB.hit.best, 20) &&
        byKeyB.hit.points === null &&
        byKeyB.hit.data_sufficient === false,
      JSON.stringify(byKeyB.hit),
    )
    check(
      'my_report(b) ovr: value 77 data_sufficient true (mean 53.625 -> 51+26)',
      reportB.json &&
        numEq(reportB.json.ovr.value, 77) &&
        reportB.json.ovr.data_sufficient === true,
      JSON.stringify(reportB.json && reportB.json.ovr),
    )

    // 9. my_report for zz-rank-c: best gets exactly 99; worst-tie sp 0; OVR 87.
    const reportC = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions['zz-rank-c'].access_token,
      body: {},
    })
    const byKeyC = {}
    if (reportC.json && Array.isArray(reportC.json.stats)) {
      for (const s of reportC.json.stats) byKeyC[s.stat_key] = s
    }
    check(
      'my_report(c) hp: points 99 (best gets exactly 99)',
      reportC.ok && numEq(byKeyC.hp.points, 99),
      JSON.stringify(byKeyC.hp),
    )
    check(
      'my_report(c) sp: points 0 (worst gets exactly 0)',
      reportC.ok && numEq(byKeyC.sp.points, 0),
      JSON.stringify(byKeyC.sp),
    )
    check(
      'my_report(c) ovr: value 87 (mean 74.25 -> 51+36)',
      reportC.ok && numEq(reportC.json.ovr.value, 87) && reportC.json.ovr.data_sufficient === true,
      JSON.stringify(reportC.json && reportC.json.ovr),
    )

    // 10. my_report for zz-rank-a: worst hp 0; OVR 61 (locked vector [0,74.25,0,49.5,0,0]).
    const reportA = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions['zz-rank-a'].access_token,
      body: {},
    })
    const byKeyA = {}
    if (reportA.json && Array.isArray(reportA.json.stats)) {
      for (const s of reportA.json.stats) byKeyA[s.stat_key] = s
    }
    check(
      'my_report(a) hp: points 0 (worst gets exactly 0)',
      reportA.ok && numEq(byKeyA.hp.points, 0),
      JSON.stringify(byKeyA.hp),
    )
    check(
      'my_report(a) ovr: value 61 (mean 20.625 -> 51+10)',
      reportA.ok && numEq(reportA.json.ovr.value, 61) && reportA.json.ovr.data_sufficient === true,
      JSON.stringify(reportA.json && reportA.json.ovr),
    )

    // 11. RNK-02 payload leak-probe: the raw response text carries no key-stat
    // markers, and per-stat objects have EXACTLY the documented fields.
    const rawB = reportB.text
    check(
      'RNK-02 leak-probe: raw my_report contains no key_stat/is_key marker',
      !rawB.includes('key_stat') && !rawB.includes('is_key'),
      `len=${rawB.length}`,
    )
    const DOC_FIELDS = [
      'stat_key', 'label', 'group_name', 'value_type',
      'own_value', 'class_average', 'best', 'points', 'data_sufficient',
    ].sort()
    const onlyDocFields = statsB.every(
      (s) => JSON.stringify(Object.keys(s).sort()) === JSON.stringify(DOC_FIELDS),
    )
    check('RNK-02 leak-probe: per-stat objects carry exactly the documented fields', onlyDocFields)

    // 12. Incomplete-config OVR (D-02) + 13. compute-on-read proof.
    const disable = await rest('/rpc/set_key_stat', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS, p_stat_key: 'mdef', p_enabled: false },
    })
    check('officer disables mdef -> count 5', disable.ok && numEq(disable.json, 5), `HTTP ${disable.status}`)

    const reportA2 = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions['zz-rank-a'].access_token,
      body: {},
    })
    check(
      'D-02: incomplete config (5 key stats) -> ovr null + data_sufficient false',
      reportA2.ok &&
        reportA2.json.ovr.value === null &&
        reportA2.json.ovr.data_sufficient === false,
      JSON.stringify(reportA2.json && reportA2.json.ovr),
    )
    const hpA2 = reportA2.json.stats.find((s) => s.stat_key === 'hp')
    const spA2 = reportA2.json.stats.find((s) => s.stat_key === 'sp')
    check(
      'D-11: per-stat points still present while OVR insufficient',
      reportA2.ok && numEq(hpA2.points, 0) && numEq(spA2.points, 74.25),
      `hp=${JSON.stringify(hpA2)} sp=${JSON.stringify(spA2)}`,
    )

    const reenable = await rest('/rpc/set_key_stat', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS, p_stat_key: 'mdef', p_enabled: true },
    })
    check('officer re-enables mdef -> count 6', reenable.ok && numEq(reenable.json, 6), `HTTP ${reenable.status}`)

    const reportA3 = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions['zz-rank-a'].access_token,
      body: {},
    })
    check(
      'compute-on-read: ovr 61 returns instantly after re-toggle (no backfill)',
      reportA3.ok && numEq(reportA3.json.ovr.value, 61) && reportA3.json.ovr.data_sufficient === true,
      JSON.stringify(reportA3.json && reportA3.json.ovr),
    )
  } finally {
    // 14. Guaranteed cleanup — runs even when an assertion/setup threw mid-run.
    try {
      await cleanup()
      console.log('PASS: cleanup removed submissions, members, class_key_stats, classes, login-attempt rows')
    } catch (err) {
      console.error(`CLEANUP FAILED (manual residue removal needed): ${err?.message || err}`)
      process.exitCode = 1
    }
  }

  if (failures.length === 0) {
    console.log('RANK SMOKE PASSED')
  } else {
    console.error(`RANK SMOKE FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[smoke-rank] FAILED: ${err?.message || err}`)
  process.exit(1)
})
