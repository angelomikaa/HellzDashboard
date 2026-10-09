#!/usr/bin/env node
/**
 * NeoFoot live RLS smoke matrix (plan 02-01 task 2).
 *
 * Runs against the LIVE project: logs in as the placeholder member and
 * officer (PIN 1234, supabase/seeds/whitelist.sql), then asserts the full
 * column-security / staff-policy / append-only-RPC matrix. Node-only script —
 * PowerShell 5.1 ConvertTo-Json corrupts long strings (01-01 proven failure).
 *
 * Env:
 *   SUPABASE_URL / SUPABASE_ANON_KEY       (fallback: local .env VITE_* values)
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF  (Management API cleanup —
 *   the token is a session env var ONLY: never written to any file, never
 *   committed, never echoed)
 *
 * Exits non-zero on any FAIL. Prints "RLS SMOKE PASSED" only if all pass.
 */
import { readFileSync } from 'node:fs'

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
  console.error('[smoke-rls] Missing SUPABASE_URL or SUPABASE_ANON_KEY (env or .env VITE_*)')
  process.exit(1)
}
if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF')
  process.exit(1)
}

const MEMBER_HANDLE = 'member-handle'
const OFFICER_HANDLE = 'officer-handle'
const PIN = '1234'

// ---------------------------------------------------------------------------
// Helpers
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

/**
 * PostgREST call. token === null means anon (apikey only); otherwise the
 * caller's JWT rides the Authorization header (RLS reads the claims).
 */
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
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[smoke-rls] Logging in as ${MEMBER_HANDLE} and ${OFFICER_HANDLE} (PIN placeholder)`)
  const member = await login(MEMBER_HANDLE)
  const officer = await login(OFFICER_HANDLE)
  console.log('[smoke-rls] Both logins OK')

  // 1. anon sees NO member rows. After migration 0005 revokes ALL privileges on
  //    members from anon, PostgREST answers 42501 permission denied; the pre-0005
  //    shape (200 with []) also satisfies the security intent. Either is a pass.
  const anonMembers = await rest('/members')
  const anonNoRows =
    (anonMembers.status === 200 && Array.isArray(anonMembers.json) && anonMembers.json.length === 0) ||
    anonMembers.status === 401 || anonMembers.status === 403 || anonMembers.status === 42501
  check('anon GET /members exposes no rows', anonNoRows, `HTTP ${anonMembers.status}`)

  // 2. member select=* must FAIL — pin_hash is ungranted, so the star expansion
  //    is permission-denied by design.
  const star = await rest('/members?select=*', { token: member.access_token })
  check('member GET /members?select=* denied (pin_hash ungranted)', !star.ok, `HTTP ${star.status}`)

  // 3. member safe projection: own row only, NO pin_hash key anywhere.
  const own = await rest('/members?select=id,display_name,char_class,char_function', {
    token: member.access_token,
  })
  const ownOk =
    own.status === 200 && Array.isArray(own.json) && own.json.length === 1 && !('pin_hash' in own.json[0])
  check(
    'member GET safe projection -> own row only, NO pin_hash',
    ownOk,
    ownOk ? '1 row, no pin_hash' : `HTTP ${own.status}`,
  )

  // 4. member can read the class list.
  const classes = await rest('/classes?select=class_name', { token: member.access_token })
  const classList = Array.isArray(classes.json) ? classes.json.map((r) => r.class_name) : []
  check(
    'member GET /classes -> 200 with Assassin present',
    classes.status === 200 && classList.includes('Assassin'),
    `HTTP ${classes.status}`,
  )

  // 5. member CANNOT insert a class (staff-only RLS).
  const memberClassInsert = await rest('/classes', {
    method: 'POST',
    token: member.access_token,
    body: { class_name: 'ZZSmokeTest' },
  })
  check('member POST /classes denied (RLS staff-only insert)', !memberClassInsert.ok, `HTTP ${memberClassInsert.status}`)

  // 6. officer lists ALL members via safe projection — pin_hash never appears.
  const officerMembers = await rest(
    '/members?select=id,discord_handle,display_name,role,char_class,char_function',
    { token: officer.access_token },
  )
  const rows = Array.isArray(officerMembers.json) ? officerMembers.json : []
  const noPinHash = rows.every((r) => !('pin_hash' in r))
  check(
    'officer GET /members -> >=3 rows, NO pin_hash anywhere',
    officerMembers.status === 200 && rows.length >= 3 && noPinHash,
    `HTTP ${officerMembers.status}, ${rows.length} rows`,
  )

  // 7. officer CAN insert a class.
  const officerClassInsert = await rest('/classes', {
    method: 'POST',
    token: officer.access_token,
    body: { class_name: 'ZZSmokeTest' },
  })
  check('officer POST /classes -> 201', officerClassInsert.status === 201, `HTTP ${officerClassInsert.status}`)

  // 8. officer CANNOT touch role (column not granted — privilege escalation blocked).
  const rolePatchRes = await rest(`/members?id=eq.${member.member_id}`, {
    method: 'PATCH',
    token: officer.access_token,
    body: { role: 'owner' },
  })
  check('officer PATCH member role denied (column ungranted)', !rolePatchRes.ok, `HTTP ${rolePatchRes.status}`)

  // 9. officer CAN update character fields on any member. NOTE: PostgREST
  //    answers 204 even when 0 rows matched, so a 2xx alone is NOT proof —
  //    the effect is re-read below and must show the patched values.
  const charPatch = await rest(`/members?id=eq.${member.member_id}`, {
    method: 'PATCH',
    token: officer.access_token,
    body: { char_class: 'Assassin', char_function: 'tank' },
  })
  const charVerify = await rest(
    `/members?id=eq.${member.member_id}&select=char_class,char_function`,
    { token: officer.access_token },
  )
  const charRow = Array.isArray(charVerify.json) ? charVerify.json[0] : null
  check(
    'officer PATCH member char_class/char_function applied (re-read matches)',
    charPatch.ok &&
      charVerify.status === 200 &&
      charRow &&
      charRow.char_class === 'Assassin' &&
      charRow.char_function === 'tank',
    `HTTP ${charPatch.status}, re-read: ${JSON.stringify(charRow)}`,
  )

  // 10. create_submission rejects unknown stat keys (INPT-04 server-side).
  const badRpc = await rest('/rpc/create_submission', {
    method: 'POST',
    token: member.access_token,
    body: { p_stats: [{ stat_key: 'crit', value: 16 }, { stat_key: 'nope', value: 1 }] },
  })
  const badRpcMsg = (badRpc.text || '').includes('unknown_stat_key')
  check(
    'member rpc create_submission rejects unknown_stat_key',
    !badRpc.ok && badRpcMsg,
    `HTTP ${badRpc.status}`,
  )

  // 11. create_submission accepts a valid payload and returns a uuid.
  const goodRpc = await rest('/rpc/create_submission', {
    method: 'POST',
    token: member.access_token,
    body: { p_stats: [{ stat_key: 'crit', value: 16 }] },
  })
  const uuid = typeof goodRpc.json === 'string' ? goodRpc.json : null
  check(
    'member rpc create_submission valid -> 2xx uuid',
    goodRpc.ok && uuid !== null && /^[0-9a-f-]{36}$/.test(uuid),
    `HTTP ${goodRpc.status}`,
  )

  // 12. live catalog has exactly 57 stats.
  const catalog = await rest('/stat_catalog?select=stat_key', { token: member.access_token })
  const catalogCount = Array.isArray(catalog.json) ? catalog.json.length : -1
  check('live stat_catalog has 57 rows', catalog.status === 200 && catalogCount === 57, `count ${catalogCount}`)

  // 13. Cleanup (service-level): remove smoke class + smoke submission (cascades stats).
  if (uuid) {
    await mgmtQuery(`delete from submissions where id = '${uuid}';`)
    console.log('PASS: cleanup removed smoke submission (stats cascaded)')
  }
  await mgmtQuery(`delete from classes where class_name = 'ZZSmokeTest';`)
  console.log('PASS: cleanup removed ZZSmokeTest class')

  if (failures.length === 0) {
    console.log('RLS SMOKE PASSED')
  } else {
    console.error(`RLS SMOKE FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[smoke-rls] FAILED: ${err?.message || err}`)
  process.exit(1)
})
