#!/usr/bin/env node
/**
 * NeoFoot live lifecycle smoke (plan 05-02 task 3) — proves migration 0010
 * against the LIVE project:
 *
 *   D-11  one-pending rule: a new create_submission marks the member's
 *         previous pending row 'discarded' (status mark only — never a
 *         delete; INPT-04 audit trail preserved)
 *   D-12  cohort exclusion: my_report own_value for a stat that only existed
 *         on the discarded submission becomes null; the resubmitted stat
 *         carries the NEW submission's value
 *   T-05-04/T-05-08 policy tightness (direct REST PATCH probes):
 *         - status='validated' PATCH on own row MUST fail (non-2xx)
 *         - status='discarded' PATCH on own PENDING row succeeds
 *         - a second PATCH on the ALREADY-discarded row MUST fail
 *           (only pending -> discarded, never back, never anything else)
 *
 * If create_submission does NOT discard the prior pending, migration 0010
 * has not landed live — the smoke FAILS loudly (push gate).
 *
 * Modeled on scripts/smoke-rank.mjs: same login via verify-pin (throwaway
 * member, bcrypt PIN 1234), same REST wrapper, same PASS/FAIL counter, same
 * cleanup discipline (every fixture row is new and removed in finally —
 * a second consecutive run passes with no residue; WR-06 lesson).
 *
 * Env:
 *   SUPABASE_URL / SUPABASE_ANON_KEY       (fallback: local .env VITE_* values)
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF  (Management API — session env
 *   var ONLY: never written to any file, never committed, never echoed)
 *
 * Exits non-zero on any FAIL. Prints "LIFECYCLE SMOKE PASSED n/n" only if all pass.
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
  console.error('[smoke-lifecycle] Missing SUPABASE_URL or SUPABASE_ANON_KEY (env or .env VITE_*)')
  process.exit(1)
}
if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF')
  process.exit(1)
}

const PIN = '1234'
const HANDLE = 'zz-life-a'
// Set A includes hp AND hit; set B keeps hit (new value) and OMITS hp — so
// after the discard, hp must vanish from the member's own report while hit
// must read B's value (D-12 latest-per-stat proof).
const STATS_A = [
  { stat_key: 'hp', value: 100 },
  { stat_key: 'hit', value: 10 },
]
const STATS_B = [{ stat_key: 'hit', value: 20 }]

// ---------------------------------------------------------------------------
// Helpers (same shape as scripts/smoke-rank.mjs)
// ---------------------------------------------------------------------------

const failures = []
const total = { expected: 0 }
function check(name, cond, detail = '') {
  total.expected += 1
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

async function createSubmission(token, pStats) {
  const res = await rest('/rpc/create_submission', {
    method: 'POST',
    token,
    body: { p_stats: pStats },
  })
  if (!res.ok) {
    throw new Error(`create_submission failed: HTTP ${res.status} ${res.text}`)
  }
  return res.json
}

/** Own submissions, newest first — the same select the HistoryList renders. */
async function mySubmissions(token) {
  const res = await rest('/submissions?select=id,status,submitted_at&order=submitted_at.desc', {
    token,
  })
  if (!res.ok || !Array.isArray(res.json)) {
    throw new Error(`own submissions select failed: HTTP ${res.status} ${res.text}`)
  }
  return res.json
}

// ---------------------------------------------------------------------------
// Cleanup (idempotent; runs pre-run for residue safety and in finally always).
// Order matters (FKs): submissions cascade stats; then the member itself;
// pin_login_attempts rows are written by verify-pin even on success-path
// resets (03-03 finding).
// ---------------------------------------------------------------------------

async function cleanup() {
  await mgmtQuery(`delete from submissions where member_id in (select id from members where discord_handle = '${HANDLE}');`)
  await mgmtQuery(`delete from members where discord_handle = '${HANDLE}';`)
  await mgmtQuery(`delete from pin_login_attempts where discord_handle = '${HANDLE}';`)
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

async function main() {
  console.log('[smoke-lifecycle] Pre-run cleanup (residue safety)')
  await cleanup()

  try {
    // ---- Setup: one throwaway member (classless — own_value in my_report is
    // class-independent), logged in through the deployed verify-pin.
    const pinHash = bcrypt.hashSync(PIN, 10)
    await mgmtQuery(
      `insert into members (discord_handle, display_name, pin_hash, role, active) ` +
        `values ('${HANDLE}', 'ZZ Life A', '${pinHash}', 'member', true);`,
    )
    const session = await login(HANDLE)
    console.log('[smoke-lifecycle] Throwaway member logged in via verify-pin')

    // ---- 1. First submission (set A: hp + hit) -> exactly one PENDING row.
    await createSubmission(session.access_token, STATS_A)
    let rows = await mySubmissions(session.access_token)
    check(
      'D-11 setup: first submission -> 1 row, status pending',
      rows.length === 1 && rows[0].status === 'pending',
      `rows=${JSON.stringify(rows)}`,
    )
    const row1 = rows[0]

    // ---- 2. Resubmit (set B: hit only) -> previous pending DISCARDED, new
    //         row PENDING. If this fails, migration 0010 is NOT live (push gate).
    await createSubmission(session.access_token, STATS_B)
    rows = await mySubmissions(session.access_token)
    check(
      'D-11: resubmit discards the previous pending (row1 discarded)',
      rows.length === 2 &&
        rows.some((r) => r.id === row1.id && r.status === 'discarded'),
      `rows=${JSON.stringify(rows)}`,
    )
    const row2 = rows.find((r) => r.id !== row1.id)
    check(
      'D-11: the new submission is the only pending row',
      rows.filter((r) => r.status === 'pending').length === 1 &&
        row2 && row2.status === 'pending',
      `rows=${JSON.stringify(rows)}`,
    )

    // ---- 3. D-12 cohort exclusion through the real my_report RPC:
    //         hp lived ONLY on the discarded row -> own_value null;
    //         hit was resubmitted -> own_value equals B's value.
    const report = await rest('/rpc/my_report', {
      method: 'POST',
      token: session.access_token,
      body: {},
    })
    check('my_report -> 2xx json', report.ok && report.json !== null, `HTTP ${report.status}`)
    const stats = report.json && Array.isArray(report.json.stats) ? report.json.stats : []
    const byKey = {}
    for (const s of stats) byKey[s.stat_key] = s
    check(
      'D-12: my_report hp own_value is null (discarded row left the cohort)',
      report.ok && byKey.hp && byKey.hp.own_value === null,
      `hp=${JSON.stringify(byKey.hp)}`,
    )
    check(
      'D-12: my_report hit own_value equals the resubmitted value (20)',
      report.ok && byKey.hit && Number(byKey.hit.own_value) === 20,
      `hit=${JSON.stringify(byKey.hit)}`,
    )

    // ---- 4. T-05-04/T-05-08 policy tightness: direct REST PATCH
    //         status='validated' on own PENDING row MUST fail (non-2xx) —
    //         a member can never self-validate.
    const patchValidated = await rest(`/submissions?id=eq.${row2.id}`, {
      method: 'PATCH',
      token: session.access_token,
      body: { status: 'validated' },
    })
    check(
      'T-05-04: PATCH status=validated on own pending row -> non-2xx',
      !patchValidated.ok,
      `HTTP ${patchValidated.status} ${patchValidated.text.slice(0, 120)}`,
    )

    // ---- 5. Only pending -> discarded is reachable: PATCH discarded on own
    //         PENDING row succeeds; a second PATCH on the ALREADY-discarded
    //         row (either back to pending or to re-discard) fails.
    const patchDiscardPending = await rest(`/submissions?id=eq.${row2.id}`, {
      method: 'PATCH',
      token: session.access_token,
      body: { status: 'discarded' },
    })
    check(
      'T-05-08: PATCH status=discarded on own pending row -> 2xx',
      patchDiscardPending.ok,
      `HTTP ${patchDiscardPending.status} ${patchDiscardPending.text.slice(0, 120)}`,
    )
    const patchDiscardedRow = await rest(`/submissions?id=eq.${row1.id}`, {
      method: 'PATCH',
      token: session.access_token,
      body: { status: 'discarded' },
    })
    check(
      'T-05-08: PATCH on the already-discarded row -> non-2xx (no transition back)',
      !patchDiscardedRow.ok,
      `HTTP ${patchDiscardedRow.status} ${patchDiscardedRow.text.slice(0, 120)}`,
    )
    const patchValidatedDiscarded = await rest(`/submissions?id=eq.${row1.id}`, {
      method: 'PATCH',
      token: session.access_token,
      body: { status: 'validated' },
    })
    check(
      'T-05-04: PATCH status=validated on the already-discarded row -> non-2xx',
      !patchValidatedDiscarded.ok,
      `HTTP ${patchValidatedDiscarded.status} ${patchValidatedDiscarded.text.slice(0, 120)}`,
    )

    // ---- 6. Final state sanity: both rows discarded, zero pending — the
    //         member's history is intact (append-only) with no pending left.
    rows = await mySubmissions(session.access_token)
    check(
      'INPT-04: rows never deleted — both submissions still present, none pending',
      rows.length === 2 && rows.every((r) => r.status === 'discarded'),
      `rows=${JSON.stringify(rows)}`,
    )
  } finally {
    // Guaranteed cleanup — runs even when an assertion/setup threw mid-run.
    try {
      await cleanup()
      console.log('PASS: cleanup removed submissions, member, login-attempt rows')
    } catch (err) {
      console.error(`CLEANUP FAILED (manual residue removal needed): ${err?.message || err}`)
      process.exitCode = 1
    }
  }

  if (failures.length === 0) {
    console.log(`LIFECYCLE SMOKE PASSED ${total.expected}/${total.expected}`)
  } else {
    console.error(`LIFECYCLE SMOKE FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[smoke-lifecycle] FAILED: ${err?.message || err}`)
  process.exit(1)
})
