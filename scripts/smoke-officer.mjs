#!/usr/bin/env node
/**
 * NeoFoot live officer-tools smoke matrix (plan 06-02 task 1) — proves
 * migration 0011's officer surfaces against the LIVE project:
 *
 *   T-06-01  officer_queue(): anon denied, member denied ('forbidden'),
 *            officer allowed — rows newest-first with the FULL 57-stat payload
 *   T-06-02  set_submission_status(): member can never self-validate,
 *            p_status whitelisted ('invalid_status'), stale pending rows raise
 *            'not_pending' (two-officer race), validate/reject feed the
 *            compute-on-read cohort (D-05)
 *   T-06-03  set_member_role(): officer denied, owner-only grant/revoke,
 *            role effective at NEXT login (D-10, JWT member_role claim),
 *            owner rows immutable (D-08)
 *   T-06-04  set_member_active(): deactivation instantly kills the minted
 *            token (0004/0008 active checks) and verify-pin refuses inactive
 *            rows; target rules — officers touch member rows only, owner rows
 *            untouchable, self-deactivation blocked
 *   D-07     cohort shift: a deactivated member leaves class_top5's cohort
 *            instantly and returns on reactivation (compute-on-read)
 *   Probe 9  regression: scripts/smoke-lifecycle.mjs still green afterwards
 *            (own-row discard policy untouched)
 *
 * Modeled on scripts/smoke-lifecycle.mjs / smoke-rank.mjs: same env gate,
 * check() counter, login() via verify-pin (throwaway fixtures, bcrypt PIN
 * 1234), same rest()/mgmtQuery() helpers, same cleanup discipline (every
 * fixture row is new and removed in finally — a second consecutive run
 * passes with no residue; WR-06 lesson).
 *
 * Env:
 *   SUPABASE_URL / SUPABASE_ANON_KEY       (fallback: local .env VITE_* values)
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF  (Management API — session env
 *   var ONLY: never written to any file, never committed, never echoed)
 *
 * Exits non-zero on any FAIL. Prints "OFFICER SMOKE PASSED n/n" only if all pass.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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
  console.error('[smoke-officer] Missing SUPABASE_URL or SUPABASE_ANON_KEY (env or .env VITE_*)')
  process.exit(1)
}
if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF')
  process.exit(1)
}

const PIN = '1234'
const CLASS = 'smoke_cls'
const HANDLES = {
  owner: 'smoke_owner',
  officer: 'smoke_officer',
  a: 'smoke_member_a',
  b: 'smoke_member_b',
  c: 'smoke_member_c',
}
const ALL_HANDLES = Object.values(HANDLES)
const DISPLAY = {
  [HANDLES.owner]: 'SMOKE Owner',
  [HANDLES.officer]: 'SMOKE Officer',
  [HANDLES.a]: 'SMOKE Member A',
  [HANDLES.b]: 'SMOKE Member B',
  [HANDLES.c]: 'SMOKE Member C',
}
// Roles: staff (owner/officer) suporte, ordinary members dps — same class, so
// the dps trio a/b/c forms an n>=3 cohort for my_report points (probe 6)
// while staff rows never join the dps cohort.
const ROLES = {
  [HANDLES.owner]: ['owner', 'suporte'],
  [HANDLES.officer]: ['officer', 'suporte'],
  [HANDLES.a]: ['member', 'dps'],
  [HANDLES.b]: ['member', 'dps'],
  [HANDLES.c]: ['member', 'dps'],
}

// ---------------------------------------------------------------------------
// Helpers (same shape as scripts/smoke-lifecycle.mjs)
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

/** Non-throwing login probe — for refusal assertions (inactive member, D-04). */
async function loginProbe(handle) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ discord_handle: handle, pin: PIN }),
    })
    const text = await res.text()
    return { status: res.status, ok: res.ok, text }
  } catch (err) {
    return { status: 0, ok: false, text: String(err) }
  }
}

/** Decode a JWT payload without verifying (the verify-pin signature is
 *  server-side; here we only read the member_role claim D-10 mints). */
function jwtClaim(token, claim) {
  const part = token.split('.')[1]
  const payload = JSON.parse(Buffer.from(part, 'base64').toString('utf8'))
  return payload ? payload[claim] : undefined
}

/** PostgREST call. token === null means anon (apikey only). */
async function rest(path, { method = 'GET', token = null, body = null, extraHeaders = {} } = {}) {
  const headers = { apikey: ANON_KEY, ...extraHeaders }
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

/** Step-up re-PIN (0017): exchange the member session + PIN for a single-use
 *  token that set_member_role requires in the X-Step-Up header. */
async function stepUp(session, pin = PIN) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/step-up`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pin }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`step-up failed: HTTP ${res.status} ${text}`)
  const json = JSON.parse(text)
  if (!json?.token) throw new Error('step-up returned no token')
  return json.token
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Cleanup (idempotent; runs pre-run for residue safety and in finally always).
// Order matters (FKs): submissions cascade stats; then the members themselves;
// the fixture class; pin_login_attempts rows are written by verify-pin on
// every login (03-03 finding). Role grants on fixture members die with the
// member rows — no residue either way.
// ---------------------------------------------------------------------------

async function cleanup() {
  await mgmtQuery(
    `delete from submissions where member_id in ` +
      `(select id from members where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')}));`,
  )
  await mgmtQuery(
    `delete from members where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')});`,
  )
  await mgmtQuery(`delete from classes where class_name = '${CLASS}';`)
  await mgmtQuery(
    `delete from pin_login_attempts where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')});`,
  )
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

async function main() {
  console.log('[smoke-officer] Pre-run cleanup (residue safety)')
  await cleanup()

  try {
    // ---- Setup: throwaway class + 5 members + 3 pending submissions ------
    await mgmtQuery(`insert into classes (class_name) values ('${CLASS}');`)
    const pinHash = bcrypt.hashSync(PIN, 10)
    for (const h of ALL_HANDLES) {
      const [role, fn] = ROLES[h]
      await mgmtQuery(
        `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function) ` +
          `values ('${h}', '${DISPLAY[h]}', '${pinHash}', '${role}', true, '${CLASS}', '${fn}');`,
      )
    }

    const sessions = {}
    for (const h of ALL_HANDLES) {
      sessions[h] = await login(h)
    }
    console.log('[smoke-officer] owner/officer/3 members logged in via verify-pin')

    // Full 57-stat catalog for the pending payloads (live catalog, 02-01).
    const catalog = await rest('/stat_catalog?select=stat_key&order=stat_key.asc', {
      token: sessions[HANDLES.a].access_token,
    })
    const statKeys = Array.isArray(catalog.json) ? catalog.json.map((r) => r.stat_key) : []
    if (statKeys.length !== 57) {
      throw new Error(`live stat_catalog returned ${statKeys.length} rows, expected 57`)
    }

    // Pending submissions for member_a/b/c — full 57 values each, staggered
    // submitted_at so officer_queue's newest-first ordering is assertable.
    const fixtures = [
      { key: 'a', base: 100 },
      { key: 'b', base: 200 },
      { key: 'c', base: 300 },
    ]
    for (const f of fixtures) {
      await createSubmission(
        sessions[HANDLES[f.key]].access_token,
        statKeys.map((stat_key, i) => ({ stat_key, value: f.base + i })),
      )
      await sleep(25)
    }
    console.log('[smoke-officer] 3 pending 57-stat submissions created via the real RPC')

    // Member ids for the role/removal probes (own safe projection).
    const memberIds = {}
    for (const h of ALL_HANDLES) {
      const row = await rest(`/members?select=id,discord_handle&discord_handle=eq.${h}`, {
        token: sessions[h].access_token,
      })
      if (!row.ok || !Array.isArray(row.json) || row.json.length !== 1) {
        throw new Error(`own-row select failed for ${h}: HTTP ${row.status} ${row.text}`)
      }
      memberIds[h] = row.json[0].id
    }

    // ---- Probe 1 (T-06-01): anon officer_queue denied --------------------
    const anonQueue = await rest('/rpc/officer_queue', { method: 'POST', body: {} })
    check('1. anon POST /rpc/officer_queue -> non-2xx', !anonQueue.ok, `HTTP ${anonQueue.status}`)

    // ---- Probe 2 (T-06-01): member officer_queue denied ------------------
    const memberQueue = await rest('/rpc/officer_queue', {
      method: 'POST',
      token: sessions[HANDLES.a].access_token,
      body: {},
    })
    check(
      '2. member POST /rpc/officer_queue -> non-2xx forbidden',
      !memberQueue.ok && memberQueue.text.includes('forbidden'),
      `HTTP ${memberQueue.status}`,
    )

    // ---- Probe 3 (T-06-01): officer queue — full payload, newest-first ---
    const officerQueue = await rest('/rpc/officer_queue', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: {},
    })
    const queueRows = Array.isArray(officerQueue.json) ? officerQueue.json : []
    const rowA = queueRows.find((r) => r.discord_handle === HANDLES.a)
    const rowB = queueRows.find((r) => r.discord_handle === HANDLES.b)
    const rowC = queueRows.find((r) => r.discord_handle === HANDLES.c)
    check(
      '3a. officer POST /rpc/officer_queue -> 2xx jsonb array',
      officerQueue.ok && Array.isArray(officerQueue.json),
      `HTTP ${officerQueue.status}, ${queueRows.length} rows`,
    )
    check(
      '3b. queue includes all 3 fixture pending rows',
      !!rowA && !!rowB && !!rowC,
      `a=${!!rowA} b=${!!rowB} c=${!!rowC}`,
    )
    check(
      "3c. member_a row: display_name/char_class/char_function + stats length 57",
      !!rowA &&
        rowA.display_name === DISPLAY[HANDLES.a] &&
        rowA.char_class === CLASS &&
        rowA.char_function === 'dps' &&
        Array.isArray(rowA.stats) &&
        rowA.stats.length === 57,
      rowA ? `stats=${rowA.stats ? rowA.stats.length : 'n/a'}` : 'row missing',
    )
    check(
      '3d. queue ordered submitted_at desc (member_b newest, before member_a)',
      !!rowA && !!rowB && queueRows.indexOf(rowB) < queueRows.indexOf(rowA),
      rowA && rowB ? `b@${queueRows.indexOf(rowB)} < a@${queueRows.indexOf(rowA)}` : 'rows missing',
    )
    const ourRows = [rowA, rowB, rowC].filter(Boolean)
    check(
      '3e. every fixture row carries the full 57-stat payload',
      ourRows.length === 3 && ourRows.every((r) => Array.isArray(r.stats) && r.stats.length === 57),
      `rows=${ourRows.length}`,
    )

    // ---- Probe 4 (T-06-02): member can never self-validate ---------------
    const selfValidate = await rest('/rpc/set_submission_status', {
      method: 'POST',
      token: sessions[HANDLES.a].access_token,
      body: { p_submission: rowA.submission_id, p_status: 'validated' },
    })
    check(
      "4. member_a set_submission_status(own row, 'validated') -> non-2xx forbidden",
      !selfValidate.ok && selfValidate.text.includes('forbidden'),
      `HTTP ${selfValidate.status}`,
    )

    // ---- Probe 5 (T-06-02): status whitelist ------------------------------
    const bogus = await rest('/rpc/set_submission_status', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_submission: rowA.submission_id, p_status: 'bogus' },
    })
    check(
      "5. officer set_submission_status('bogus') -> non-2xx invalid_status",
      !bogus.ok && bogus.text.includes('invalid_status'),
      `HTTP ${bogus.status}`,
    )

    // ---- Probe 6 (T-06-02/D-05): validate feeds the compute-on-read cohort
    const validateA = await rest('/rpc/set_submission_status', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_submission: rowA.submission_id, p_status: 'validated' },
    })
    check(
      "6a. officer validates member_a's row -> 2xx returns 1",
      validateA.ok && Number(validateA.json) === 1,
      `HTTP ${validateA.status} body=${validateA.text}`,
    )
    // Cohort for a's dps stats: a (validated) + b (pending) + c (pending) = n 3.
    const reportA = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions[HANDLES.a].access_token,
      body: {},
    })
    const statsA = reportA.json && Array.isArray(reportA.json.stats) ? reportA.json.stats : []
    check(
      '6b. member_a my_report: all 57 stats data_sufficient with non-null points (n=3 cohort)',
      reportA.ok && statsA.length === 57 && statsA.every((s) => s.data_sufficient === true && s.points !== null),
      `stats=${statsA.length}`,
    )

    // ---- Probe 7 (Pitfall 9): stale pending row raises not_pending -------
    const revalidateA = await rest('/rpc/set_submission_status', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_submission: rowA.submission_id, p_status: 'validated' },
    })
    check(
      "7. officer re-validates the now-validated row -> non-2xx not_pending",
      !revalidateA.ok && revalidateA.text.includes('not_pending'),
      `HTTP ${revalidateA.status}`,
    )

    // ---- Probe 8 (T-06-02/D-05): reject removes the row from the cohort --
    const rejectB = await rest('/rpc/set_submission_status', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_submission: rowB.submission_id, p_status: 'rejected' },
    })
    check(
      "8a. officer rejects member_b's row -> 2xx returns 1",
      rejectB.ok && Number(rejectB.json) === 1,
      `HTTP ${rejectB.status} body=${rejectB.text}`,
    )
    const reportB = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions[HANDLES.b].access_token,
      body: {},
    })
    const statsB = reportB.json && Array.isArray(reportB.json.stats) ? reportB.json.stats : []
    check(
      '8b. member_b my_report after reject: own values gone (own_value null) — rejected row left latest',
      reportB.ok && statsB.length === 57 && statsB.every((s) => s.own_value === null),
      `stats=${statsB.length}`,
    )
    const reportA2 = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions[HANDLES.a].access_token,
      body: {},
    })
    const statsA2 = reportA2.json && Array.isArray(reportA2.json.stats) ? reportA2.json.stats : []
    check(
      '8c. member_a my_report after reject: cohort n dropped to 2 -> every points null (D-05)',
      reportA2.ok && statsA2.length === 57 && statsA2.every((s) => s.points === null),
      `stats=${statsA2.length}`,
    )
    const ownRowsB = await rest('/submissions?select=id,status&order=submitted_at.desc', {
      token: sessions[HANDLES.b].access_token,
    })
    check(
      '8d. member_b history intact (append-only): row still present with status rejected',
      ownRowsB.ok &&
        Array.isArray(ownRowsB.json) &&
        ownRowsB.json.length === 1 &&
        ownRowsB.json[0].status === 'rejected' &&
        ownRowsB.json[0].id === rowB.submission_id,
      `rows=${JSON.stringify(ownRowsB.json)}`,
    )

    // ---- Probe 9: lifecycle regression (own-row discard policy untouched)
    const lifecycle = spawnSync('node', ['scripts/smoke-lifecycle.mjs'], {
      stdio: 'inherit',
      env: process.env,
    })
    check(
      '9. regression: node scripts/smoke-lifecycle.mjs exits 0',
      lifecycle.status === 0,
      `exit=${lifecycle.status}`,
    )

    // ---- Probe 10 (T-06-03/D-08/D-10): set_member_role -------------------
    const officerGrant = await rest('/rpc/set_member_role', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_member: memberIds[HANDLES.a], p_role: 'officer' },
    })
    check(
      '10a. officer set_member_role -> non-2xx forbidden (owner-only)',
      !officerGrant.ok && officerGrant.text.includes('forbidden'),
      `HTTP ${officerGrant.status}`,
    )
    const ownerNoToken = await rest('/rpc/set_member_role', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      body: { p_member: memberIds[HANDLES.a], p_role: 'officer' },
    })
    check(
      '10h. owner set_member_role WITHOUT X-Step-Up -> non-2xx step_up_required (D-14/D-15)',
      !ownerNoToken.ok && ownerNoToken.text.includes('step_up_required'),
      `HTTP ${ownerNoToken.status}`,
    )
    const ownerStepUp1 = await stepUp(sessions[HANDLES.owner])
    const ownerGrant = await rest('/rpc/set_member_role', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      extraHeaders: { 'X-Step-Up': ownerStepUp1 },
      body: { p_member: memberIds[HANDLES.a], p_role: 'officer' },
    })
    check(
      "10b. owner grants 'officer' on member_a with a step-up token -> 2xx",
      ownerGrant.ok,
      `HTTP ${ownerGrant.status}`,
    )
    // Single-use: replaying the same token must be refused.
    const ownerReplay = await rest('/rpc/set_member_role', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      extraHeaders: { 'X-Step-Up': ownerStepUp1 },
      body: { p_member: memberIds[HANDLES.b], p_role: 'officer' },
    })
    check(
      '10i. replayed step-up token -> non-2xx step_up_required (single-use)',
      !ownerReplay.ok && ownerReplay.text.includes('step_up_required'),
      `HTTP ${ownerReplay.status}`,
    )
    const reloginA1 = await login(HANDLES.a)
    check(
      "10c. member_a re-login: fresh session + JWT member_role claim = 'officer' (D-10 next login)",
      reloginA1.member_role === 'officer' && jwtClaim(reloginA1.access_token, 'member_role') === 'officer',
      `session=${reloginA1.member_role}, jwt=${jwtClaim(reloginA1.access_token, 'member_role')}`,
    )
    const ownerStepUp2 = await stepUp(sessions[HANDLES.owner])
    const ownerRevoke = await rest('/rpc/set_member_role', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      extraHeaders: { 'X-Step-Up': ownerStepUp2 },
      body: { p_member: memberIds[HANDLES.a], p_role: 'member' },
    })
    check(
      "10d. owner revokes member_a back to 'member' with a fresh step-up token -> 2xx",
      ownerRevoke.ok,
      `HTTP ${ownerRevoke.status}`,
    )
    const reloginA2 = await login(HANDLES.a)
    check(
      "10e. member_a re-login: JWT member_role claim back to 'member'",
      reloginA2.member_role === 'member' && jwtClaim(reloginA2.access_token, 'member_role') === 'member',
      `session=${reloginA2.member_role}, jwt=${jwtClaim(reloginA2.access_token, 'member_role')}`,
    )
    const ownerStepUp3 = await stepUp(sessions[HANDLES.owner])
    const ownerTarget = await rest('/rpc/set_member_role', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      extraHeaders: { 'X-Step-Up': ownerStepUp3 },
      body: { p_member: memberIds[HANDLES.owner], p_role: 'member' },
    })
    check(
      '10f. set_member_role on an owner row -> non-2xx forbidden (D-08 owner rows immutable)',
      !ownerTarget.ok && ownerTarget.text.includes('forbidden'),
      `HTTP ${ownerTarget.status}`,
    )
    // The token stays unspent: target validation runs BEFORE consumption, so
    // the rejected call must not burn the owner's re-PIN.
    const grantOwnerRole = await rest('/rpc/set_member_role', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      extraHeaders: { 'X-Step-Up': ownerStepUp3 },
      body: { p_member: memberIds[HANDLES.b], p_role: 'owner' },
    })
    check(
      "10g. no path grants 'owner' (p_role='owner') -> non-2xx invalid_role; rejected call keeps the step-up token usable",
      !grantOwnerRole.ok && grantOwnerRole.text.includes('invalid_role'),
      `HTTP ${grantOwnerRole.status}`,
    )

    // ---- Probe 11 (T-06-03): covered by 10f/10g (owner rows immutable, no
    //      path to owner). Kept as an explicit label for the matrix tally.

    // ---- Probe 12 (T-06-04): deactivation kills the minted token --------
    const deactivateC = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_member: memberIds[HANDLES.c], p_active: false },
    })
    check(
      "12a. officer deactivates member_c (member row) -> 2xx",
      deactivateC.ok,
      `HTTP ${deactivateC.status}`,
    )
    // The EXISTING 7-day token must die NOW (0004/0008 active checks):
    // own-row select filters to 0 rows (check-13 shape) and the RPC gate
    // refuses the RPC call outright.
    const deadTokenSelect = await rest('/members?select=id,display_name', {
      token: sessions[HANDLES.c].access_token,
    })
    const deadTokenDenied =
      (deadTokenSelect.status === 200 && Array.isArray(deadTokenSelect.json) && deadTokenSelect.json.length === 0) ||
      deadTokenSelect.status === 401 ||
      deadTokenSelect.status === 403 ||
      deadTokenSelect.status === 42501
    check(
      '12b. member_c EXISTING token: own-row select -> 0 rows / denied (instant revocation)',
      deadTokenDenied,
      `HTTP ${deadTokenSelect.status}`,
    )
    const deadTokenReport = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions[HANDLES.c].access_token,
      body: {},
    })
    check(
      '12c. member_c EXISTING token: my_report -> non-2xx forbidden (RPC active gate)',
      !deadTokenReport.ok && deadTokenReport.text.includes('forbidden'),
      `HTTP ${deadTokenReport.status}`,
    )
    const refusedLogin = await loginProbe(HANDLES.c)
    check(
      '12d. verify-pin login for member_c refused while inactive',
      !refusedLogin.ok,
      `HTTP ${refusedLogin.status}`,
    )
    const reactivateC = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      body: { p_member: memberIds[HANDLES.c], p_active: true },
    })
    check(
      '12e. owner reactivates member_c -> 2xx',
      reactivateC.ok,
      `HTTP ${reactivateC.status}`,
    )
    const revivedSession = await login(HANDLES.c)
    check(
      '12f. member_c login works again after reactivation',
      !!revivedSession.access_token,
      'session minted',
    )

    // ---- Probe 13 (T-06-04): target rules --------------------------------
    const officerToOfficer = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_member: memberIds[HANDLES.officer], p_active: false },
    })
    check(
      '13a. officer targets an OFFICER row -> non-2xx forbidden',
      !officerToOfficer.ok && officerToOfficer.text.includes('forbidden'),
      `HTTP ${officerToOfficer.status}`,
    )
    const officerToOwner = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_member: memberIds[HANDLES.owner], p_active: false },
    })
    check(
      '13b. officer targets an OWNER row -> non-2xx forbidden (D-08)',
      !officerToOwner.ok && officerToOwner.text.includes('forbidden'),
      `HTTP ${officerToOwner.status}`,
    )
    const ownerDeactivateOfficer = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      body: { p_member: memberIds[HANDLES.officer], p_active: false },
    })
    check(
      '13c. owner deactivates the officer row -> 2xx (owner touches officer rows)',
      ownerDeactivateOfficer.ok,
      `HTTP ${ownerDeactivateOfficer.status}`,
    )
    const ownerReactivateOfficer = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      body: { p_member: memberIds[HANDLES.officer], p_active: true },
    })
    check(
      '13d. owner reactivates the officer row -> 2xx',
      ownerReactivateOfficer.ok,
      `HTTP ${ownerReactivateOfficer.status}`,
    )
    const selfTarget = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_member: memberIds[HANDLES.officer], p_active: false },
    })
    check(
      '13e. officer self-target -> non-2xx forbidden (self-deactivation guard)',
      !selfTarget.ok && selfTarget.text.includes('forbidden'),
      `HTTP ${selfTarget.status}`,
    )

    // ---- Probe 14 (D-07): deactivated member leaves the cohort instantly -
    const deactivateC2 = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_member: memberIds[HANDLES.c], p_active: false },
    })
    check(
      '14a. officer deactivates member_c again -> 2xx',
      deactivateC2.ok,
      `HTTP ${deactivateC2.status}`,
    )
    const top5During = await rest('/rpc/class_top5', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_class: CLASS },
    })
    const top5DuringRows = Array.isArray(top5During.json) ? top5During.json : []
    check(
      "14b. class_top5 while deactivated: member_c's row EXCLUDED, member_a still present (D-07 compute-on-read)",
      top5During.ok &&
        !top5DuringRows.some((r) => r.display_name === DISPLAY[HANDLES.c]) &&
        top5DuringRows.some((r) => r.display_name === DISPLAY[HANDLES.a]),
      `rows=${JSON.stringify(top5DuringRows.map((r) => r.display_name))}`,
    )
    const reactivateC2 = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: sessions[HANDLES.owner].access_token,
      body: { p_member: memberIds[HANDLES.c], p_active: true },
    })
    check('14c. owner reactivates member_c -> 2xx', reactivateC2.ok, `HTTP ${reactivateC2.status}`)
    const top5After = await rest('/rpc/class_top5', {
      method: 'POST',
      token: sessions[HANDLES.officer].access_token,
      body: { p_class: CLASS },
    })
    const top5AfterRows = Array.isArray(top5After.json) ? top5After.json : []
    check(
      "14d. class_top5 after reactivation: member_c's row RETURNS (no data migration)",
      top5After.ok && top5AfterRows.some((r) => r.display_name === DISPLAY[HANDLES.c]),
      `rows=${JSON.stringify(top5AfterRows.map((r) => r.display_name))}`,
    )
  } finally {
    // Guaranteed cleanup — runs even when an assertion/setup threw mid-run.
    try {
      await cleanup()
      console.log('PASS: cleanup removed submissions, members, class, login-attempt rows')
    } catch (err) {
      console.error(`CLEANUP FAILED (manual residue removal needed): ${err?.message || err}`)
      process.exitCode = 1
    }
  }

  if (failures.length === 0) {
    console.log(`OFFICER SMOKE PASSED ${total.expected}/${total.expected}`)
  } else {
    console.error(`OFFICER SMOKE FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[smoke-officer] FAILED: ${err?.message || err}`)
  process.exit(1)
})
