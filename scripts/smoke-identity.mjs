#!/usr/bin/env node
/**
 * NeoFoot Phase 8 live identity/whitelist smoke matrix (plan 08-01 task 2,
 * extended by 08-02 task 4 with the Edge Function HTTP surface).
 *
 * Server-level probes prove migration 0014 + seeds/live/identity-proofs-storage.sql
 * against the LIVE project; Edge probes prove the deployed verify-pin/setup-pin/
 * request-access contract end to end:
 *
 *   shape      members.pin_hash nullable; the four new tables exist; RLS on
 *              membership_requests/membership_request_stats/identity_proofs
 *              with ZERO policies
 *   WHIT-01    add_member: handle-only row (pin_hash null, role member), dummy
 *              sentinel rejected, duplicate active -> already_member,
 *              deactivate+re-add -> same id with submissions preserved
 *   WHIT-06    reset_member_pin: officer forbidden, owner clears hash/claim and
 *              the handle's lockout rows, owner targets refused
 *   WHIT-02/03 claim_pin: atomic claim (hash/claimed_at/identity), identity
 *              history + pending proof, second claim already_set, inactive
 *              invalid, duplicate char_id refused
 *   WHIT-10    request_status: anon sees EXACTLY four keys; anon direct reads
 *              of the request tables return no rows
 *   WHIT-09    staff_requests applicant OVR; approve_request creates a member
 *              with the request PIN + validated submission (prospect) / no
 *              submission (member); member requests and inactive re-requests;
 *              reject_request; supersede only with the pending request id
 *   IDEN-01/02 create_submission identity + set_submission_status promotion;
 *              char_function NEVER auto-applied; correct_identity appends;
 *              duplicate char_id across pending submissions refused
 *   IDEN-03    staff_identity_history newest-first; member JWT -> staff RPCs
 *              forbidden
 *   reads      officer_queue identity, role_rank char_id/nickname,
 *              get_promotion identity display name
 *   storage    anon upload denied, member read denied, staff read allowed
 *   catalog    anon can read the five label columns; class_key_stats stays
 *              hidden from anon
 *   edge       08-02: verify-pin unclaimed 409 (single key, one lockout burn),
 *              setup-pin validation + happy claim + replay orphan check, post-
 *              claim lockout, request-access member (previous_pin + supersede +
 *              proof purge) and prospect (56 stats, zero members, approval),
 *              method handling and intake guards
 *
 * Credentials: SUPABASE_URL/ANON_KEY from env or the gitignored .env VITE_*
 * values; SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF STRICTLY from session
 * env (never written/echoed/committed). The service_role key is requested from
 * the Management API at runtime (owner token) and kept in memory only — it is
 * needed for the service-role-only claim/request RPCs and the storage probes.
 * An optional SUPABASE_SERVICE_ROLE_KEY session env short-circuits that fetch.
 *
 * Modeled on scripts/smoke-card.mjs / smoke-officer.mjs: check() counter,
 * throwaway fixtures removed in finally (twice-green, zero residue).
 *
 * Exits non-zero on any FAIL. Prints "IDENTITY SMOKE PASSED n/n" only if all pass.
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
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN // STRICT: session env only
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF // STRICT: session env only

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('[smoke-identity] Missing SUPABASE_URL or SUPABASE_ANON_KEY (env or .env VITE_*)')
  process.exit(1)
}
if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF (session env only — ' +
      'map the owner token into the session env, never into any file)',
  )
  process.exit(1)
}

const PIN = '1234'
const CLASS = 'smoke_idn_cls'
const KEY_STATS = ['hp', 'sp', 'patk', 'pdef', 'matk', 'mdef']
const RUN_ID = `smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const H = {
  owner: 'smoke-idn-owner',
  officer: 'smoke-idn-officer',
  a: 'smoke-idn-a',
  b: 'smoke-idn-b',
  c: 'smoke-idn-c',
  ident: 'smoke-idn-ident',
  inactive: 'smoke-idn-inactive',
  add: 'smoke-idn-add',
  reset: 'smoke-idn-reset',
  claim: 'smoke-idn-claim',
  claim2: 'smoke-idn-claim2',
  claimInactive: 'smoke-idn-claim-off',
  prospect: 'smoke-idn-prospect',
  memberreq: 'smoke-idn-memberreq',
  reject: 'smoke-idn-reject',
  super: 'smoke-idn-super',
}

const DISPLAY = {
  [H.owner]: 'SMOKE IDN Owner',
  [H.officer]: 'SMOKE IDN Officer',
  [H.a]: 'SMOKE IDN A',
  [H.b]: 'SMOKE IDN B',
  [H.c]: 'SMOKE IDN C',
  [H.ident]: 'SMOKE IDN Ident',
  [H.inactive]: 'SMOKE IDN Inactive',
}

// owner/officer suporte; a/b/c/ident dps — the dps cohort reaches n>=3 for
// OVR/points in staff_requests and read payloads.
const ROLES = {
  [H.owner]: ['owner', 'suporte'],
  [H.officer]: ['officer', 'suporte'],
  [H.a]: ['member', 'dps'],
  [H.b]: ['member', 'dps'],
  [H.c]: ['member', 'dps'],
  [H.ident]: ['member', 'dps'],
  [H.inactive]: ['member', 'dps'],
}

const CHAR_IDS = {
  claim: '12345678',
  inactive: '5555555',
  identFirst: '7777777',
  identCorrected: '7777778',
  aIdentity: '8888888',
  prospect: '6600001',
  memberreq: '6600002',
  reject: '6600003',
  super: '6600004',
  // 08-02 edge probes
  edgeClaim: '6600005',
  edgeMemberOld: '6600006',
  edgeMemberNew: '6600007',
  edgeProspect: '6600008',
}
const FIXTURE_CHAR_IDS = Object.values(CHAR_IDS)

// Minimal valid JPEG (1x1) used for the storage RLS probes.
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==',
  'base64',
)
const JPEG_DATA_URL = `data:image/jpeg;base64,${JPEG_1PX.toString('base64')}`
const PNG_DATA_URL = `data:image/png;base64,${JPEG_1PX.toString('base64')}`
// Oversized-but-deliverable proof: 2.3 MB of JPEG-prefixed bytes (base64 body
// stays under the platform request cap) decodes to more than the 2 MB limit.
const BIG_PROOF = (() => {
  const buf = Buffer.alloc(2_300_000)
  buf[0] = 0xff
  buf[1] = 0xd8
  buf[2] = 0xff
  return `data:image/jpeg;base64,${buf.toString('base64')}`
})()

// ---------------------------------------------------------------------------
// Helpers
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

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`

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
    return { status: res.status, ok: res.ok, text: await res.text() }
  } catch (err) {
    return { status: 0, ok: false, text: String(err) }
  }
}

// 08-02: HTTP surface for the three auth Edge Functions. Sends the anon key as
// both apikey and bearer (the functions' verify_jwt gate accepts the anon JWT).
async function edge(name, body, { method = 'POST' } = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  return { status: res.status, ok: res.ok, body: parsed, text }
}

// base64url JWT payload decode — assertions only, the token is never printed.
const jwtClaims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))

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

const rpc = (name, token, body = {}) => rest(`/rpc/${name}`, { method: 'POST', token, body })

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
const firstRow = (rows) => (Array.isArray(rows) ? rows[0] : null)
async function one(sql) {
  return firstRow(await mgmtQuery(sql))
}

let cachedServiceKey = null
async function serviceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  if (cachedServiceKey) return cachedServiceKey
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${MGMT_TOKEN}` } },
  )
  if (!res.ok) throw new Error(`api-keys fetch failed: HTTP ${res.status} ${await res.text()}`)
  const keys = await res.json()
  const key =
    (Array.isArray(keys) ? keys.find((k) => k.name === 'service_role') : null) ||
    (Array.isArray(keys) ? keys.find((k) => k.type === 'secret') : null)
  const value = key?.api_key || key?.value || null
  if (!value) throw new Error('service_role key not returned by the Management API')
  cachedServiceKey = value // in-memory only — never logged or written
  return value
}

const storageUrl = (path) =>
  `${SUPABASE_URL}/storage/v1/object/identity-proofs/${path.split('/').map(encodeURIComponent).join('/')}`

async function storageUpload(path, token, bytes = JPEG_1PX) {
  const res = await fetch(storageUrl(path), {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  return { status: res.status, ok: res.ok, text: await res.text() }
}

async function storageGet(path, token) {
  const res = await fetch(storageUrl(path), {
    headers: { apikey: ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  return { status: res.status, ok: res.ok }
}

async function storageDelete(path, token) {
  const res = await fetch(storageUrl(path), {
    method: 'DELETE',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  })
  return { status: res.status, ok: res.ok, text: await res.text() }
}

async function memberIds(handles) {
  const list = handles.map(sqlStr).join(',')
  const rows = await mgmtQuery(`select id, discord_handle from members where discord_handle in (${list});`)
  const map = {}
  for (const r of Array.isArray(rows) ? rows : []) map[r.discord_handle] = r.id
  return map
}

const statArray = (statKeys, base) => statKeys.map((stat_key, i) => ({ stat_key, value: base + i }))

// ---------------------------------------------------------------------------
// Cleanup + zero-residue census (idempotent; pre-run + finally always).
// FK order: history/proofs/requests before members; submissions before members.
// ---------------------------------------------------------------------------

const uploadedPaths = new Set()
// 08-02 edge probes: every proof object the Edge Functions create or supersede.
// Kept separate from uploadedPaths so the census can prove they are gone after
// cleanup even though uploadedPaths is cleared.
const edgeStoragePaths = new Set()
function trackProof(path) {
  if (typeof path !== 'string' || path.length === 0) return
  uploadedPaths.add(path)
  edgeStoragePaths.add(path)
}

async function fixtureIds() {
  const rows = await mgmtQuery(`select id from members where discord_handle like 'smoke-idn-%';`)
  return (Array.isArray(rows) ? rows : []).map((r) => r.id)
}

async function cleanup() {
  const ids = await fixtureIds()
  const idList = ids.length ? ids.map((i) => sqlStr(i)).join(',') : 'null'
  const charList = FIXTURE_CHAR_IDS.map(sqlStr).join(',')

  // 08-02: the Edge Functions generate their own storage paths, so harvest them
  // from the DB before the rows are deleted. Every proof object must go through
  // the Storage API (SQL deletes on storage.objects are blocked by a trigger).
  const proofPaths = await mgmtQuery(
    `select storage_path as path from identity_proofs where member_id in (${idList});`,
  )
  const requestPaths = await mgmtQuery(
    `select proof_path as path from membership_requests
      where lower(discord_handle) like 'smoke-idn-%' and proof_path is not null;`,
  )
  for (const row of [...(Array.isArray(proofPaths) ? proofPaths : []), ...(Array.isArray(requestPaths) ? requestPaths : [])]) {
    trackProof(row?.path)
  }

  await mgmtQuery(
    `delete from member_identity_history where member_id in (${idList}) or created_by in (${idList});`,
  )
  await mgmtQuery(
    `delete from identity_proofs where member_id in (${idList}) or reviewed_by in (${idList});`,
  )
  await mgmtQuery(
    `delete from membership_requests where lower(discord_handle) like 'smoke-idn-%' or member_id in (${idList}) or decided_by in (${idList});`,
  )
  await mgmtQuery(`delete from submissions where member_id in (${idList}) or char_id in (${charList});`)
  await mgmtQuery(`delete from members where discord_handle like 'smoke-idn-%';`)
  await mgmtQuery(`delete from pin_login_attempts where discord_handle like 'smoke-idn-%';`)
  await mgmtQuery(`delete from class_key_stats where class_name = ${sqlStr(CLASS)};`)
  await mgmtQuery(`delete from class_relevant_stats where class_name = ${sqlStr(CLASS)};`)
  await mgmtQuery(`delete from classes where class_name = ${sqlStr(CLASS)};`)

  try {
    const svc = await serviceRoleKey()
    for (const path of uploadedPaths) await storageDelete(path, svc)
    uploadedPaths.clear()
  } catch (err) {
    console.error(`[smoke-identity] storage cleanup skipped: ${err?.message || err}`)
  }
}

async function zeroResidueCensus() {
  const ids = await fixtureIds()
  const idList = ids.length ? ids.map((i) => sqlStr(i)).join(',') : 'null'
  const charList = FIXTURE_CHAR_IDS.map(sqlStr).join(',')
  const edgePathList = edgeStoragePaths.size
    ? [...edgeStoragePaths].map(sqlStr).join(',')
    : 'null'
  const row = await one(
    `select
       (select count(*) from members where discord_handle like 'smoke-idn-%') as members,
       (select count(*) from submissions where member_id in (${idList}) or char_id in (${charList})) as submissions,
       (select count(*) from membership_requests where lower(discord_handle) like 'smoke-idn-%') as requests,
       (select count(*) from membership_request_stats s
          join membership_requests r on r.id = s.request_id
         where lower(r.discord_handle) like 'smoke-idn-%') as request_stats,
       (select count(*) from member_identity_history where member_id in (${idList}) or char_id in (${charList})) as history,
       (select count(*) from identity_proofs where member_id in (${idList})) as proofs,
       (select count(*) from pin_login_attempts where discord_handle like 'smoke-idn-%') as attempts,
       (select count(*) from classes where class_name = ${sqlStr(CLASS)}) as classes,
       (select count(*) from class_key_stats where class_name = ${sqlStr(CLASS)}) as key_rows,
       (select count(*) from storage.objects
         where bucket_id = 'identity-proofs' and name like '%' || ${sqlStr(RUN_ID)} || '%') as storage_objects,
       (select count(*) from storage.objects
         where bucket_id = 'identity-proofs'
           and name like 'claims/%' and split_part(name, '/', 2) in (${idList})) as edge_claim_objects,
       (select count(*) from storage.objects
         where bucket_id = 'identity-proofs' and name in (${edgePathList})) as edge_proof_objects;`,
  )
  if (!row) throw new Error('zero-residue census returned no row')
  for (const [label, key] of [
    ['members', 'members'],
    ['submissions', 'submissions'],
    ['requests', 'requests'],
    ['request stats', 'request_stats'],
    ['identity history', 'history'],
    ['identity proofs', 'proofs'],
    ['pin attempts', 'attempts'],
    ['classes', 'classes'],
    ['key rows', 'key_rows'],
    ['storage objects', 'storage_objects'],
    ['edge claim objects', 'edge_claim_objects'],
    ['edge proof objects', 'edge_proof_objects'],
  ]) {
    check(`census: zero fixture ${label}`, Number(row[key]) === 0, `${label}=${row[key]}`)
  }
  if (Number(row.storage_objects) !== 0) {
    try {
      const svc = await serviceRoleKey()
      await storageDelete(`claims/${RUN_ID}/storage-probe.jpg`, svc)
    } catch {
      /* already logged above */
    }
  }
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

async function main() {
  console.log('[smoke-identity] Pre-run cleanup (residue safety)')
  await cleanup()

  try {
    const svc = await serviceRoleKey()
    const pinHash = bcrypt.hashSync(PIN, 10)

    // ---- Setup: fixture class + 6 keys + members + validated cohort -------
    await mgmtQuery(`insert into classes (class_name) values (${sqlStr(CLASS)});`)
    await mgmtQuery(
      `insert into class_key_stats (class_name, stat_key) values ` +
        KEY_STATS.map((k) => `(${sqlStr(CLASS)}, ${sqlStr(k)})`).join(', ') +
        `;`,
    )
    for (const [h, [role, fn]] of Object.entries(ROLES)) {
      await mgmtQuery(
        `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function) ` +
          `values (${sqlStr(h)}, ${sqlStr(DISPLAY[h])}, ${sqlStr(pinHash)}, ${sqlStr(role)}, true, ${sqlStr(CLASS)}, ${sqlStr(fn)});`,
      )
    }
    // The inactive re-request fixture starts with an identity pointer so the
    // approve path must EXCLUDE its own member row from the uniqueness guard.
    await mgmtQuery(
      `update members set char_id = ${sqlStr(CHAR_IDS.inactive)} where discord_handle = ${sqlStr(H.inactive)};`,
    )
    // Preserved submission for the inactive re-request assertion.
    const inactiveId0 = (await memberIds([H.inactive]))[H.inactive]
    await mgmtQuery(
      `insert into submissions (member_id, status) values (${sqlStr(inactiveId0)}, 'validated');`,
    )

    const sessions = {}
    for (const h of [H.owner, H.officer, H.a, H.b, H.c, H.ident]) {
      sessions[h] = await login(h)
    }
    const ownerToken = sessions[H.owner].access_token
    const officerToken = sessions[H.officer].access_token
    const memberToken = sessions[H.a].access_token
    console.log('[smoke-identity] owner/officer/cohort members logged in via verify-pin')

    const catalogRes = await rest('/stat_catalog?select=stat_key&order=stat_key.asc', { token: memberToken })
    const statKeys = Array.isArray(catalogRes.json) ? catalogRes.json.map((r) => r.stat_key) : []
    if (statKeys.length !== 57) throw new Error(`live stat_catalog returned ${statKeys.length} rows, expected 57`)

    // Validated cohort submissions (real RPC + officer validation).
    let base = 100
    for (const h of [H.a, H.b, H.c, H.ident]) {
      const sub = await rest('/rpc/create_submission', {
        method: 'POST',
        token: sessions[h].access_token,
        body: { p_stats: statArray(statKeys, base) },
      })
      if (!sub.ok) throw new Error(`cohort create_submission failed for ${h}: ${sub.status} ${sub.text}`)
      const val = await rpc('set_submission_status', officerToken, {
        p_submission: sub.json,
        p_status: 'validated',
      })
      if (!val.ok) throw new Error(`cohort validation failed for ${h}: ${val.status} ${val.text}`)
      base += 100
    }
    console.log('[smoke-identity] validated cohort created via the real RPCs')

    // =====================================================================
    // 1. Migration shape
    // =====================================================================
    const col = await one(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'members' and column_name = 'pin_hash';`,
    )
    check('1a. members.pin_hash is nullable', col?.is_nullable === 'YES', `is_nullable=${col?.is_nullable}`)

    const tables = await one(
      `select count(*) as n from information_schema.tables
        where table_schema = 'public'
          and table_name in ('member_identity_history','membership_requests','membership_request_stats','identity_proofs');`,
    )
    check('1b. the four Phase 8 tables exist', Number(tables?.n) === 4, `n=${tables?.n}`)

    const rls = await one(
      `select count(*) as n from pg_tables
        where schemaname = 'public'
          and tablename in ('membership_requests','membership_request_stats','identity_proofs')
          and rowsecurity;`,
    )
    check('1c. RLS enabled on requests + request stats + proofs', Number(rls?.n) === 3, `n=${rls?.n}`)

    const policies = await one(
      `select count(*) as n from pg_policies
        where schemaname = 'public'
          and tablename in ('membership_requests','membership_request_stats','identity_proofs');`,
    )
    check('1d. ZERO policies on requests/request stats/proofs (RPC-only)', Number(policies?.n) === 0, `n=${policies?.n}`)

    // =====================================================================
    // 2. add_member
    // =====================================================================
    const addRes = await rpc('add_member', officerToken, {
      p_handle: H.add,
      p_display_name: 'SMOKE IDN Add',
    })
    check('2a. officer add_member -> 2xx uuid', addRes.ok && typeof addRes.json === 'string', `HTTP ${addRes.status}`)
    const addId = addRes.json
    const addRow = await one(
      `select pin_hash, role, active, char_id from members where discord_handle = ${sqlStr(H.add)};`,
    )
    check(
      '2b. added member is handle-only: pin_hash null, role member, active',
      addRow && addRow.pin_hash === null && addRow.role === 'member' && addRow.active === true && addRow.char_id === null,
      `pin_hash=${addRow?.pin_hash} role=${addRow?.role} active=${addRow?.active}`,
    )

    const dummyRes = await rpc('add_member', officerToken, {
      p_handle: 'dummy-smoke',
      p_display_name: 'Dummy Smoke',
    })
    check('2c. add_member(dummy-%%) -> dummy_handle', !dummyRes.ok && dummyRes.text.includes('dummy_handle'), `HTTP ${dummyRes.status}`)

    const dupeAdd = await rpc('add_member', officerToken, { p_handle: H.add, p_display_name: 'Again' })
    check('2d. add_member on an active handle -> already_member', !dupeAdd.ok && dupeAdd.text.includes('already_member'), `HTTP ${dupeAdd.status}`)

    await mgmtQuery(
      `insert into submissions (member_id, status) values (${sqlStr(addId)}, 'validated');`,
    )
    await rpc('set_member_active', officerToken, { p_member: addId, p_active: false })
    const readd = await rpc('add_member', officerToken, { p_handle: H.add, p_display_name: 'SMOKE IDN Add Again' })
    const addAfter = await one(
      `select active, display_name, (select count(*) from submissions s where s.member_id = m.id) as subs
         from members m where discord_handle = ${sqlStr(H.add)};`,
    )
    check(
      '2e. re-add of an inactive handle reuses the SAME id and keeps submissions',
      readd.ok && readd.json === addId && addAfter?.active === true && Number(addAfter?.subs) === 1,
      `same=${readd.json === addId} active=${addAfter?.active} subs=${addAfter?.subs}`,
    )

    // =====================================================================
    // 3. reset_member_pin
    // =====================================================================
    await mgmtQuery(
      `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
       values (${sqlStr(H.reset)}, 'SMOKE IDN Reset', ${sqlStr(pinHash)}, 'member', true, ${sqlStr(CLASS)}, 'dps');`,
    )
    await mgmtQuery(`insert into pin_login_attempts (discord_handle, failed_count) values (${sqlStr(H.reset)}, 3);`)
    const resetId = (await memberIds([H.reset]))[H.reset]

    const officerReset = await rpc('reset_member_pin', officerToken, { p_member: resetId })
    check(
      '3a. officer reset_member_pin -> forbidden (owner-only)',
      !officerReset.ok && officerReset.text.includes('forbidden'),
      `HTTP ${officerReset.status}`,
    )
    const ownerReset = await rpc('reset_member_pin', ownerToken, { p_member: resetId })
    const resetRow = await one(
      `select pin_hash, claimed_at from members where id = ${sqlStr(resetId)};`,
    )
    const resetAttempt = await one(
      `select count(*) as n from pin_login_attempts where discord_handle = ${sqlStr(H.reset)};`,
    )
    check(
      '3b. owner reset clears pin_hash/claimed_at AND the handle lockout rows',
      ownerReset.ok && resetRow?.pin_hash === null && resetRow?.claimed_at === null && Number(resetAttempt?.n) === 0,
      `HTTP ${ownerReset.status} hash=${resetRow?.pin_hash} attempts=${resetAttempt?.n}`,
    )
    const ownerId = (await memberIds([H.owner]))[H.owner]
    const ownerTarget = await rpc('reset_member_pin', ownerToken, { p_member: ownerId })
    check(
      '3c. owner target is refused -> forbidden',
      !ownerTarget.ok && ownerTarget.text.includes('forbidden'),
      `HTTP ${ownerTarget.status}`,
    )

    // =====================================================================
    // 4. claim_pin (service role only)
    // =====================================================================
    await rpc('add_member', officerToken, { p_handle: H.claim2, p_display_name: 'SMOKE IDN Claim 2' })
    await rpc('add_member', officerToken, { p_handle: H.claim, p_display_name: 'SMOKE IDN Claim' })
    await mgmtQuery(
      `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function)
       values (${sqlStr(H.claimInactive)}, 'SMOKE IDN Claim Off', null, 'member', false, ${sqlStr(CLASS)}, 'dps');`,
    )
    const claimProof = `claims/${RUN_ID}/${H.claim}.jpg`
    uploadedPaths.add(claimProof)
    const claimRes = await rpc('claim_pin', svc, {
      p_handle: H.claim,
      p_pin_hash: pinHash,
      p_char_id: CHAR_IDS.claim,
      p_nickname: 'Claimed Nick',
      p_char_class: CLASS,
      p_proof_path: claimProof,
    })
    const claimId = claimRes.json?.member_id
    check(
      '4a. service-role claim_pin returns member_id/display_name',
      claimRes.ok && typeof claimId === 'string' && claimRes.json?.display_name === 'Claimed Nick',
      `HTTP ${claimRes.status}`,
    )
    const claimRow = await one(
      `select pin_hash, claimed_at, char_id, display_name, char_class from members where id = ${sqlStr(claimId)};`,
    )
    check(
      '4b. member row updated: bcrypt hash, claimed_at, identity pointer',
      claimRow &&
        claimRow.pin_hash !== null &&
        claimRow.pin_hash !== PIN &&
        claimRow.claimed_at !== null &&
        claimRow.char_id === CHAR_IDS.claim &&
        claimRow.display_name === 'Claimed Nick' &&
        claimRow.char_class === CLASS,
      `hash_prefix=${String(claimRow?.pin_hash).slice(0, 4)} char_id=${claimRow?.char_id}`,
    )
    const claimHist = await one(
      `select source, char_id, nickname from member_identity_history where member_id = ${sqlStr(claimId)};`,
    )
    check(
      '4c. identity history row appended with source claim',
      claimHist?.source === 'claim' && claimHist?.char_id === CHAR_IDS.claim && claimHist?.nickname === 'Claimed Nick',
      `source=${claimHist?.source}`,
    )
    const claimProofRow = await one(
      `select status, storage_path from identity_proofs where member_id = ${sqlStr(claimId)};`,
    )
    check(
      '4d. pending identity proof queued with the storage path',
      claimProofRow?.status === 'pending' && claimProofRow?.storage_path === claimProof,
      `status=${claimProofRow?.status}`,
    )
    const secondClaim = await rpc('claim_pin', svc, {
      p_handle: H.claim,
      p_pin_hash: pinHash,
      p_char_id: '12345679',
      p_nickname: 'Second',
      p_char_class: CLASS,
      p_proof_path: claimProof,
    })
    check(
      '4e. second claim -> already_set (no last-writer-wins)',
      !secondClaim.ok && secondClaim.text.includes('already_set'),
      `HTTP ${secondClaim.status}`,
    )
    const inactiveClaim = await rpc('claim_pin', svc, {
      p_handle: H.claimInactive,
      p_pin_hash: pinHash,
      p_char_id: '12345670',
      p_nickname: 'Inactive',
      p_char_class: CLASS,
      p_proof_path: claimProof,
    })
    check(
      '4f. claim on an inactive handle -> invalid',
      !inactiveClaim.ok && inactiveClaim.text.includes('invalid'),
      `HTTP ${inactiveClaim.status}`,
    )
    const dupClaim = await rpc('claim_pin', svc, {
      p_handle: H.claim2,
      p_pin_hash: pinHash,
      p_char_id: CHAR_IDS.claim,
      p_nickname: 'Dup',
      p_char_class: CLASS,
      p_proof_path: claimProof,
    })
    check(
      '4g. claim with a char_id owned by another member -> duplicate_char_id',
      !dupClaim.ok && dupClaim.text.includes('duplicate_char_id'),
      `HTTP ${dupClaim.status}`,
    )

    // =====================================================================
    // 5. Request tables + anon status (WHIT-10)
    // =====================================================================
    const prospectProof = `requests/${RUN_ID}/${H.prospect}.jpg`
    uploadedPaths.add(prospectProof)
    const prospectReq = await rpc('create_membership_request', svc, {
      p_handle: H.prospect,
      p_pin_hash: pinHash,
      p_request_type: 'prospect',
      p_char_id: CHAR_IDS.prospect,
      p_nickname: 'Prospect Nick',
      p_char_class: CLASS,
      p_char_function: 'dps',
      p_proof_path: prospectProof,
      p_stats: statArray(statKeys, 400),
    })
    const prospectRequestId = prospectReq.json?.request_id
    check('5a. service-role create_membership_request (prospect) -> request id', prospectReq.ok && !!prospectRequestId, `HTTP ${prospectReq.status}`)

    const anonStatus = await rpc('request_status', null, { p_handle: H.prospect })
    const anonKeys = anonStatus.ok && anonStatus.json ? Object.keys(anonStatus.json).sort() : []
    check(
      '5b. anon request_status returns EXACTLY {status,request_type,created_at,decided_at}',
      anonStatus.ok &&
        JSON.stringify(anonKeys) ===
          JSON.stringify(['created_at', 'decided_at', 'request_type', 'status'].sort()) &&
        anonStatus.json.status === 'pending',
      `keys=${JSON.stringify(anonKeys)}`,
    )
    const rawStatus = anonStatus.text || ''
    check(
      '5c. anon status payload leaks no pin/char_id/nickname/class/stats',
      !/pin_hash|char_id|nickname|char_class|stats|discord_handle/.test(rawStatus),
      `len=${rawStatus.length}`,
    )
    const anonReqRows = await rest('/membership_requests?select=status&limit=5', { token: null })
    check(
      '5d. anon direct SELECT membership_requests -> no rows (or 401)',
      (anonReqRows.ok && Array.isArray(anonReqRows.json) && anonReqRows.json.length === 0) ||
        [401, 403].includes(anonReqRows.status),
      `HTTP ${anonReqRows.status}`,
    )
    const anonStatRows = await rest('/membership_request_stats?select=value&limit=5', { token: null })
    check(
      '5e. anon direct SELECT membership_request_stats -> no rows (or 401)',
      (anonStatRows.ok && Array.isArray(anonStatRows.json) && anonStatRows.json.length === 0) ||
        [401, 403].includes(anonStatRows.status),
      `HTTP ${anonStatRows.status}`,
    )

    // =====================================================================
    // 6. staff_requests + approve_request (prospect)
    // =====================================================================
    const board = await rpc('staff_requests', officerToken, {})
    const boardRows = Array.isArray(board.json) ? board.json : []
    const boardRow = boardRows.find((r) => r.discord_handle === H.prospect)
    check(
      '6a. staff_requests board carries the applicant with a numeric OVR',
      board.ok && !!boardRow && typeof boardRow.ovr === 'number' && boardRow.data_sufficient === true,
      `ovr=${boardRow?.ovr} rows=${boardRows.length}`,
    )
    check(
      '6b. staff_requests row carries identity + proof + full stats',
      !!boardRow &&
        boardRow.char_id === CHAR_IDS.prospect &&
        boardRow.nickname === 'Prospect Nick' &&
        boardRow.proof_path === prospectProof &&
        Array.isArray(boardRow.stats) &&
        boardRow.stats.length === 57,
      `stats=${boardRow?.stats?.length}`,
    )

    const approve = await rpc('approve_request', ownerToken, {
      p_request: prospectRequestId,
      p_function: 'dps',
    })
    const prospectMemberId = approve.json
    check('6c. staff approve_request(prospect) -> member id', approve.ok && typeof prospectMemberId === 'string', `HTTP ${approve.status}`)
    const prospectRow = await one(
      `select role, active, pin_hash, claimed_at, char_function, char_class, char_id, display_name
         from members where id = ${sqlStr(prospectMemberId)};`,
    )
    check(
      '6d. approved prospect: role member, request PIN active, identity applied',
      prospectRow &&
        prospectRow.role === 'member' &&
        prospectRow.active === true &&
        prospectRow.pin_hash === pinHash &&
        prospectRow.claimed_at !== null &&
        prospectRow.char_function === 'dps' &&
        prospectRow.char_class === CLASS &&
        prospectRow.char_id === CHAR_IDS.prospect &&
        prospectRow.display_name === 'Prospect Nick',
      `role=${prospectRow?.role} fn=${prospectRow?.char_function}`,
    )
    const prospectSub = await one(
      `select s.id, count(ss.id) as n
         from submissions s
         left join submission_stats ss on ss.submission_id = s.id
        where s.member_id = ${sqlStr(prospectMemberId)} and s.status = 'validated'
        group by s.id;`,
    )
    check(
      '6e. approved prospect stats became a VALIDATED 57-stat submission',
      !!prospectSub && Number(prospectSub.n) === 57,
      `stats=${prospectSub?.n}`,
    )
    const prospectHist = await one(
      `select source from member_identity_history where member_id = ${sqlStr(prospectMemberId)};`,
    )
    check('6f. approval appends identity history source request', prospectHist?.source === 'request', `source=${prospectHist?.source}`)
    const prospectReqRow = await one(
      `select status, proof_path, member_id from membership_requests where id = ${sqlStr(prospectRequestId)};`,
    )
    check(
      '6g. request approved, member linked, proof_path cleared',
      prospectReqRow?.status === 'approved' &&
        prospectReqRow?.proof_path === null &&
        prospectReqRow?.member_id === prospectMemberId,
      `status=${prospectReqRow?.status}`,
    )
    const approveAgain = await rpc('approve_request', ownerToken, {
      p_request: prospectRequestId,
      p_function: 'dps',
    })
    check(
      '6h. second approve -> not_pending',
      !approveAgain.ok && approveAgain.text.includes('not_pending'),
      `HTTP ${approveAgain.status}`,
    )
    const prospectLogin = await loginProbe(H.prospect)
    check('6i. approved prospect can log in with the request PIN', prospectLogin.ok, `HTTP ${prospectLogin.status}`)

    // =====================================================================
    // 7. Member-type approval (no stats, no submission) -- UAT test 7 contract
    // =====================================================================
    const memberReq = await rpc('create_membership_request', svc, {
      p_handle: H.memberreq,
      p_pin_hash: pinHash,
      p_request_type: 'member',
      p_char_id: CHAR_IDS.memberreq,
      p_nickname: 'MemberReq Nick',
      p_char_class: CLASS,
      p_char_function: 'suporte',
      p_proof_path: `requests/${RUN_ID}/${H.memberreq}.jpg`,
    })
    check('7a. member-type request for a handle with NO members row -> not_member at intake',
      !memberReq.ok && String(memberReq.text || '').includes('not_member'),
      `HTTP ${memberReq.status}`)
    const memberReqCount = await one(
      `select count(*) as n from membership_requests where discord_handle = '${H.memberreq}';`,
    )
    check('7b. nothing committed for the unknown handle', Number(memberReqCount?.n) === 0, `n=${memberReqCount?.n}`)

    // defense-in-depth: simulate a pre-guard slip-through via direct insert
    const slipped = await mgmtQuery(
      `insert into membership_requests (discord_handle, pin_hash, request_type, char_id, nickname, char_class, char_function, proof_path) values ('${H.memberreq}', '${pinHash}', 'member', '${CHAR_IDS.memberreq}', 'MemberReq Nick', '${CLASS}', 'suporte', 'requests/${RUN_ID}/slipped.jpg') returning id;`,
    )
    const slippedId = Array.isArray(slipped) ? slipped[0]?.id : slipped?.id
    const slippedApprove = await rpc('approve_request', officerToken, {
      p_request: slippedId,
      p_function: 'suporte',
    })
    const slippedMemberCount = await one(
      `select count(*) as n from members where discord_handle = '${H.memberreq}';`,
    )
    const slippedStatus = await one(
      `select status from membership_requests where id = '${slippedId}';`,
    )
    check('7c. defense-in-depth raises not_member and keeps the request pending',
      !slippedApprove.ok && String(slippedApprove.text || '').includes('not_member')
        && Number(slippedMemberCount?.n) === 0
        && slippedStatus?.status === 'pending',
      `HTTP ${slippedApprove.status} members=${slippedMemberCount?.n} status=${slippedStatus?.status}`)

    const memberReqStatus = await rpc('request_status', null, { p_handle: H.memberreq })
    check('7d. request_status reports pending with four keys',
      memberReqStatus.ok && memberReqStatus.json?.status === 'pending'
        && Object.keys(memberReqStatus.json || {}).sort().join(',') === 'created_at,decided_at,request_type,status',
      `status=${memberReqStatus.json?.status}`)

    // =====================================================================
    // 8. Inactive re-request (same member id, history preserved)
    // =====================================================================
    await rpc('set_member_active', officerToken, { p_member: inactiveId0, p_active: false })
    const inactiveReq = await rpc('create_membership_request', svc, {
      p_handle: H.inactive,
      p_pin_hash: pinHash,
      p_request_type: 'member',
      p_char_id: CHAR_IDS.inactive,
      p_nickname: 'Inactive Again',
      p_char_class: CLASS,
      p_char_function: 'dps',
      p_proof_path: `requests/${RUN_ID}/${H.inactive}.jpg`,
    })
    check(
      '8a. inactive handle can re-request with its OWN char_id (own row excluded)',
      inactiveReq.ok,
      `HTTP ${inactiveReq.status}`,
    )
    const inactiveApprove = await rpc('approve_request', ownerToken, {
      p_request: inactiveReq.json?.request_id,
      p_function: 'dps',
    })
    const inactiveAfter = await one(
      `select active, role, char_id,
              (select count(*) from submissions s where s.member_id = m.id) as subs,
              (select count(*) from members m2 where m2.discord_handle = ${sqlStr(H.inactive)}) as dupes
         from members m where id = ${sqlStr(inactiveId0)};`,
    )
    check(
      '8b. inactive approval reactivates the SAME member id with submissions preserved',
      inactiveApprove.ok &&
        inactiveApprove.json === inactiveId0 &&
        inactiveAfter?.active === true &&
        inactiveAfter?.role === 'member' &&
        Number(inactiveAfter?.subs) === 1 &&
        Number(inactiveAfter?.dupes) === 1 &&
        inactiveAfter?.char_id === CHAR_IDS.inactive,
      `same=${inactiveApprove.json === inactiveId0} subs=${inactiveAfter?.subs} dupes=${inactiveAfter?.dupes}`,
    )
    const inactiveLogin = await loginProbe(H.inactive)
    check('8c. reactivated handle logs in with the request PIN', inactiveLogin.ok, `HTTP ${inactiveLogin.status}`)

    // =====================================================================
    // 9. reject_request
    // =====================================================================
    const rejectReq = await rpc('create_membership_request', svc, {
      p_handle: H.reject,
      p_pin_hash: pinHash,
      p_request_type: 'prospect',
      p_char_id: CHAR_IDS.reject,
      p_nickname: 'Reject Nick',
      p_char_class: CLASS,
      p_char_function: 'dps',
      p_proof_path: `requests/${RUN_ID}/${H.reject}.jpg`,
      p_stats: statArray(statKeys, 500),
    })
    const rejectRes = await rpc('reject_request', officerToken, { p_request: rejectReq.json?.request_id })
    const rejectRow = await one(
      `select status, proof_path from membership_requests where id = ${sqlStr(rejectReq.json?.request_id)};`,
    )
    const rejectMember = await one(
      `select count(*) as n from members where discord_handle = ${sqlStr(H.reject)};`,
    )
    check(
      '9a. reject_request marks rejected, clears proof_path, creates NO member',
      rejectRes.ok &&
        rejectRow?.status === 'rejected' &&
        rejectRow?.proof_path === null &&
        Number(rejectMember?.n) === 0,
      `status=${rejectRow?.status}`,
    )
    const rejectStatus = await rpc('request_status', null, { p_handle: H.reject })
    check(
      '9b. request_status reports rejected (status only)',
      rejectStatus.ok && rejectStatus.json?.status === 'rejected',
      `status=${rejectStatus.json?.status}`,
    )
    const rejectTwice = await rpc('reject_request', officerToken, { p_request: rejectReq.json?.request_id })
    check(
      '9c. second reject -> not_pending',
      !rejectTwice.ok && rejectTwice.text.includes('not_pending'),
      `HTTP ${rejectTwice.status}`,
    )

    // =====================================================================
    // 10. Supersede only with the pending request id (D-11)
    // =====================================================================
    const superProof = `requests/${RUN_ID}/${H.super}.jpg`
    uploadedPaths.add(superProof)
    const superFirst = await rpc('create_membership_request', svc, {
      p_handle: H.super,
      p_pin_hash: pinHash,
      p_request_type: 'prospect',
      p_char_id: CHAR_IDS.super,
      p_nickname: 'Super One',
      p_char_class: CLASS,
      p_char_function: 'dps',
      p_proof_path: superProof,
      p_stats: statArray(statKeys, 600),
    })
    check('10a. first request pending', superFirst.ok && !!superFirst.json?.request_id, `HTTP ${superFirst.status}`)

    const superNoId = await rpc('create_membership_request', svc, {
      p_handle: H.super,
      p_pin_hash: pinHash,
      p_request_type: 'prospect',
      p_char_id: '6600777',
      p_nickname: 'Super Two',
      p_char_class: CLASS,
      p_char_function: 'dps',
      p_proof_path: superProof,
      p_stats: statArray(statKeys, 601),
    })
    check(
      '10b. second request without p_supersede_request -> request_pending',
      !superNoId.ok && superNoId.text.includes('request_pending'),
      `HTTP ${superNoId.status}`,
    )
    const superWrongId = await rpc('create_membership_request', svc, {
      p_handle: H.super,
      p_pin_hash: pinHash,
      p_request_type: 'prospect',
      p_char_id: '6600777',
      p_nickname: 'Super Two',
      p_char_class: CLASS,
      p_char_function: 'dps',
      p_proof_path: superProof,
      p_stats: statArray(statKeys, 601),
      p_supersede_request: '00000000-0000-0000-0000-000000000000',
    })
    check(
      '10c. second request with the WRONG request id -> request_pending',
      !superWrongId.ok && superWrongId.text.includes('request_pending'),
      `HTTP ${superWrongId.status}`,
    )
    const superSecond = await rpc('create_membership_request', svc, {
      p_handle: H.super,
      p_pin_hash: pinHash,
      p_request_type: 'prospect',
      p_char_id: CHAR_IDS.super,
      p_nickname: 'Super Two',
      p_char_class: CLASS,
      p_char_function: 'dps',
      p_proof_path: superProof,
      p_stats: statArray(statKeys, 601),
      p_supersede_request: superFirst.json?.request_id,
    })
    check(
      '10d. supersede with the correct id -> new pending + returns the old proof path',
      superSecond.ok &&
        superSecond.json?.request_id &&
        superSecond.json.request_id !== superFirst.json?.request_id &&
        superSecond.json?.superseded_proof_path === superProof,
      `old=${superFirst.json?.request_id} new=${superSecond.json?.request_id}`,
    )
    const oldRow = await one(
      `select status, proof_path, (select count(*) from membership_request_stats s where s.request_id = r.id) as stats
         from membership_requests r where id = ${sqlStr(superFirst.json?.request_id)};`,
    )
    check(
      '10e. superseded row retained with proof_path cleared and stats retained',
      oldRow?.status === 'superseded' && oldRow?.proof_path === null && Number(oldRow?.stats) === 57,
      `status=${oldRow?.status} stats=${oldRow?.stats}`,
    )
    check(
      '10f. the superseded char_id is reusable (new pending accepted it)',
      superSecond.ok,
      `reused=${CHAR_IDS.super}`,
    )

    // =====================================================================
    // 11. Identity promotion + correction (IDENT)
    // =====================================================================
    const identToken = sessions[H.ident].access_token
    const identSub = await rpc('create_submission', identToken, {
      p_stats: statArray(statKeys, 155),
      p_identity: {
        char_id: CHAR_IDS.identFirst,
        nickname: 'Ident Nick',
        char_class: CLASS,
        char_function: 'mdps',
      },
    })
    check('11a. member submission with p_identity accepted', identSub.ok && typeof identSub.json === 'string', `HTTP ${identSub.status}`)
    const identValidate = await rpc('set_submission_status', officerToken, {
      p_submission: identSub.json,
      p_status: 'validated',
    })
    const identId = (await memberIds([H.ident]))[H.ident]
    const identHist = await one(
      `select source, char_function, char_id, nickname from member_identity_history where member_id = ${sqlStr(identId)};`,
    )
    const identRow = await one(
      `select char_id, display_name, char_class, char_function from members where id = ${sqlStr(identId)};`,
    )
    check(
      '11b. validation promotes identity (history source submission) and updates the member pointers',
      identValidate.ok &&
        identHist?.source === 'submission' &&
        identHist?.char_id === CHAR_IDS.identFirst &&
        identRow?.char_id === CHAR_IDS.identFirst &&
        identRow?.display_name === 'Ident Nick',
      `hist=${identHist?.source} char_id=${identRow?.char_id}`,
    )
    check(
      '11c. D-20 REVISED: validated char_function IS auto-applied (member dps -> mdps; history records mdps)',
      identRow?.char_function === 'mdps' && identHist?.char_function === 'mdps',
      `member=${identRow?.char_function} history=${identHist?.char_function}`,
    )
    const correct = await rpc('correct_identity', officerToken, {
      p_member: identId,
      p_char_id: CHAR_IDS.identCorrected,
      p_nickname: 'Ident Corrected',
      p_char_class: CLASS,
      p_char_function: 'mdps',
    })
    const corrected = await one(
      `select char_id, display_name, char_function from members where id = ${sqlStr(identId)};`,
    )
    check(
      '11d. correct_identity updates pointers incl. staff-only char_function',
      correct.ok &&
        corrected?.char_id === CHAR_IDS.identCorrected &&
        corrected?.display_name === 'Ident Corrected' &&
        corrected?.char_function === 'mdps',
      `fn=${corrected?.char_function}`,
    )
    const identHistory = await rpc('staff_identity_history', officerToken, { p_member: identId })
    const histRows = Array.isArray(identHistory.json) ? identHistory.json : []
    check(
      '11e. staff_identity_history is newest-first with a correction row',
      identHistory.ok && histRows.length === 2 && histRows[0].source === 'correction' && histRows[1].source === 'submission',
      `sources=${JSON.stringify(histRows.map((r) => r.source))}`,
    )
    const memberStaffCall = await rpc('staff_members', memberToken, {})
    check(
      '11f. member JWT calling staff_members -> forbidden (server-side, not tab hiding)',
      !memberStaffCall.ok && memberStaffCall.text.includes('forbidden'),
      `HTTP ${memberStaffCall.status}`,
    )
    const memberApproveCall = await rpc('approve_request', memberToken, {
      p_request: '00000000-0000-0000-0000-000000000000',
      p_function: 'dps',
    })
    check(
      '11g. member JWT calling approve_request -> forbidden',
      !memberApproveCall.ok && memberApproveCall.text.includes('forbidden'),
      `HTTP ${memberApproveCall.status}`,
    )

    // =====================================================================
    // 17. my_identity coalesced self-read (UAT test 4)
    // =====================================================================
    const myId = await rpc('my_identity', identToken, {})
    check('17a. my_identity returns closed 4-key payload', myId.ok && Object.keys(myId.json || {}).sort().join(',') === 'char_class,char_function,char_id,display_name', `keys=${Object.keys(myId.json || {}).join(',')}`)
    const newestHist = await one(
      `select nickname, char_id, char_class, char_function from member_identity_history where member_id = ${sqlStr(identId)} order by created_at desc, id desc limit 1;`,
    )
    check('17a2. my_identity coalesces newest history (display/char_id/class)', myId.ok && myId.json?.display_name === newestHist?.nickname && myId.json?.char_id === newestHist?.char_id && myId.json?.char_class === newestHist?.char_class, `got=${JSON.stringify(myId.json)} hist=${JSON.stringify(newestHist)}`)

    // 17b: history-less member -> registry row. Use H.a (no identity history? verify count)
    const aHistCount = await one(`select count(*) as n from member_identity_history where member_id = (select id from members where discord_handle = '${H.a}');`)
    const aReg = await one(`select display_name, char_id, char_class, char_function from members where discord_handle = '${H.a}';`)
    const aToken = sessions[H.a].access_token
    const aIdentityRead = await rpc('my_identity', aToken, {})
    check('17b. history-less member gets the registry row', Number(aHistCount?.n) === 0 && aIdentityRead.ok && aIdentityRead.json?.display_name === aReg?.display_name && aIdentityRead.json?.char_class === aReg?.char_class && aIdentityRead.json?.char_function === aReg?.char_function, `hist=${aHistCount?.n}`)

    // 17c: anon refused
    const anonId = await rpc('my_identity', null, {})
    check('17c. anon EXECUTE refused', !anonId.ok, `HTTP ${anonId.status}`)

    // =====================================================================
    // 12. Duplicate char_id across PENDING submissions + officer_queue identity
    // =====================================================================
    const aIdentitySub = await rpc('create_submission', memberToken, {
      p_stats: statArray(statKeys, 110),
      p_identity: {
        char_id: CHAR_IDS.aIdentity,
        nickname: 'A Ident',
        char_class: CLASS,
        char_function: 'dps',
      },
    })
    check('12a. member A pending submission with identity accepted', aIdentitySub.ok, `HTTP ${aIdentitySub.status}`)

    const queue = await rpc('officer_queue', officerToken, {})
    const queueRows = Array.isArray(queue.json) ? queue.json : []
    const queueA = queueRows.find((r) => r.discord_handle === H.a)
    check(
      '12b. officer_queue carries the submission identity (char_id/nickname)',
      queue.ok && !!queueA && queueA.char_id === CHAR_IDS.aIdentity && queueA.nickname === 'A Ident',
      `char_id=${queueA?.char_id}`,
    )

    const bDup = await rpc('create_submission', sessions[H.b].access_token, {
      p_stats: statArray(statKeys, 210),
      p_identity: {
        char_id: CHAR_IDS.aIdentity,
        nickname: 'B Dup',
        char_class: CLASS,
        char_function: 'dps',
      },
    })
    check(
      "12c. another member's pending submission with the same char_id -> duplicate_char_id",
      !bDup.ok && bDup.text.includes('duplicate_char_id'),
      `HTTP ${bDup.status}`,
    )

    const aValidate = await rpc('set_submission_status', officerToken, {
      p_submission: aIdentitySub.json,
      p_status: 'validated',
    })
    check('12d. officer validates A identity submission', aValidate.ok && Number(aValidate.json) === 1, `HTTP ${aValidate.status}`)

    // =====================================================================
    // 13. Read payloads (identity display sourcing)
    // =====================================================================
    const dpsRank = await rpc('role_rank', officerToken, { p_function: 'dps', p_class: CLASS })
    const dpsRows = Array.isArray(dpsRank.json) ? dpsRank.json : []
    const rankA = dpsRows.find((r) => r.char_id === CHAR_IDS.aIdentity)
    check(
      '13a. role_rank row carries the validated char_id and nickname',
      dpsRank.ok && !!rankA && rankA.display_name === 'A Ident',
      `name=${rankA?.display_name}`,
    )

    const mdpsRank = await rpc('role_rank', officerToken, { p_function: 'mdps', p_class: CLASS })
    const mdpsRows = Array.isArray(mdpsRank.json) ? mdpsRank.json : []
    const rankIdent = mdpsRows.find((r) => r.char_id === CHAR_IDS.identCorrected)
    check(
      '13b. role_rank uses the NEWEST identity correction (char_id + nickname)',
      mdpsRank.ok && !!rankIdent && rankIdent.display_name === 'Ident Corrected',
      `name=${rankIdent?.display_name}`,
    )

    // Destaques sources the card name from the NEWEST identity history row, not
    // from the denormalized members column. Probe with an OVR-eligible member:
    // the ident fixture's staff-only correction moved it to mdps, whose cohort
    // is too small for OVR (n<3), so that member can never reach the top-5.
    const aId = (await memberIds([H.a]))[H.a]
    const aCorrected = await rpc('correct_identity', officerToken, {
      p_member: aId,
      p_char_id: CHAR_IDS.aIdentity,
      p_nickname: 'A Ident Corrected',
      p_char_class: CLASS,
      p_char_function: 'dps',
    })
    const promo = await rpc('get_promotion', memberToken, {})
    const promoSection = (Array.isArray(promo.json) ? promo.json : []).find((s) => s.class_name === CLASS)
    const promoCards = promoSection && Array.isArray(promoSection.cards) ? promoSection.cards : []
    const promoA = promoCards.find((c) => c.display_name === 'A Ident Corrected')
    check(
      '13c. get_promotion card display_name comes from the latest identity history',
      aCorrected.ok &&
        promo.ok &&
        !!promoA &&
        !promoCards.some((c) => c.display_name === 'A Ident' || c.display_name === 'Ident Corrected'),
      `cards=${JSON.stringify(promoCards.map((c) => c.display_name))}`,
    )
    check(
      '13d. get_promotion keeps photo_path (07.2 round-7 contract preserved)',
      promoCards.length > 0 &&
        promoCards.every((c) => typeof c.photo_path === 'string' && c.photo_path.startsWith('card-photos/')),
      `sample=${promoCards[0]?.photo_path}`,
    )

    const pendingSub = await rpc('create_submission', identToken, {
      p_stats: statArray(statKeys, 156),
      p_identity: {
        char_id: CHAR_IDS.identFirst,
        nickname: 'Ident Nick 2',
        char_class: CLASS,
        char_function: 'suporte',
      },
    })
    const pendingMemberBefore = await one(`select char_function from members where id = ${sqlStr(identId)};`)
    check('11c2. pending submission does NOT promote char_function', pendingSub.ok && pendingMemberBefore?.char_function === 'mdps', `before=${pendingMemberBefore?.char_function}`)

    const validatePending = await rpc('set_submission_status', officerToken, {
      p_submission: pendingSub.json,
      p_status: 'validated',
    })
    const pendingMemberAfter = await one(`select char_function from members where id = ${sqlStr(identId)};`)
    check('11c3. next validated choice changes char_function', validatePending.ok && pendingMemberAfter?.char_function === 'suporte', `after=${pendingMemberAfter?.char_function}`)


    // =====================================================================
    // 14. Storage RLS (identity-proofs bucket)
    // =====================================================================
    const storagePath = `claims/${RUN_ID}/storage-probe.jpg`
    uploadedPaths.add(storagePath)
    const svcUpload = await storageUpload(storagePath, svc)
    check('14a. service-role upload to identity-proofs -> 2xx', svcUpload.ok, `HTTP ${svcUpload.status}`)

    const anonUpload = await storageUpload(`claims/${RUN_ID}/anon.jpg`, ANON_KEY)
    check(
      '14b. anon INSERT into identity-proofs -> denied (no client write policy)',
      !anonUpload.ok,
      `HTTP ${anonUpload.status}`,
    )

    const memberRead = await storageGet(storagePath, memberToken)
    check(
      '14c. member JWT read of an identity proof -> denied (staff-only bucket policy)',
      !memberRead.ok,
      `HTTP ${memberRead.status}`,
    )

    const staffRead = await storageGet(storagePath, officerToken)
    check('14d. staff JWT read of an identity proof -> 200', staffRead.ok, `HTTP ${staffRead.status}`)

    const staffDelete = await storageDelete(storagePath, officerToken)
    uploadedPaths.delete(storagePath)
    check(
      '14e. staff JWT delete of an identity proof -> 2xx (client purge path, D-15)',
      staffDelete.ok,
      `HTTP ${staffDelete.status}`,
    )

    // =====================================================================
    // 15. Public catalog projection (session-less prospect wizard)
    // =====================================================================
    const anonCatalog = await rest(
      '/stat_catalog?select=stat_key,label,label_short,group_name,value_type&limit=100',
      { token: null },
    )
    check(
      '15a. anon can read the five catalog label columns (>=56 rows)',
      anonCatalog.ok && Array.isArray(anonCatalog.json) && anonCatalog.json.length >= 56,
      `HTTP ${anonCatalog.status} rows=${Array.isArray(anonCatalog.json) ? anonCatalog.json.length : 'n/a'}`,
    )
    const anonKeyStats = await rest('/class_key_stats?select=class_name,stat_key&limit=5', {
      token: null,
    })
    check(
      '15b. anon class_key_stats -> [] (RLS) or 401 — key config never exposed',
      (anonKeyStats.ok && Array.isArray(anonKeyStats.json) && anonKeyStats.json.length === 0) ||
        [401, 403].includes(anonKeyStats.status),
      `HTTP ${anonKeyStats.status} body=${anonKeyStats.text.slice(0, 80)}`,
    )

    // =====================================================================
    // 16. Edge Functions (08-02): unclaimed 409, setup-pin claim, request-access
    // =====================================================================
    const E = {
      unclaimed: 'smoke-idn-edge-unclaimed',
      claim: 'smoke-idn-edge-claim',
      inactive: 'smoke-idn-edge-inactive',
      member: 'smoke-idn-edge-member',
      prospect: 'smoke-idn-edge-prospect',
    }
    const EDGE_PIN = '4321'

    await mgmtQuery(
      `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function) values
         (${sqlStr(E.unclaimed)}, 'SMOKE IDN Edge Unclaimed', null, 'member', true, ${sqlStr(CLASS)}, 'dps'),
         (${sqlStr(E.claim)}, 'SMOKE IDN Edge Claim', null, 'member', true, ${sqlStr(CLASS)}, 'dps'),
         (${sqlStr(E.inactive)}, 'SMOKE IDN Edge Inactive', null, 'member', false, ${sqlStr(CLASS)}, 'dps'),
         (${sqlStr(E.member)}, 'SMOKE IDN Edge Member', ${sqlStr(pinHash)}, 'member', false, ${sqlStr(CLASS)}, 'dps');`,
    )
    await mgmtQuery(
      `update members set char_id = ${sqlStr(CHAR_IDS.edgeMemberOld)} where discord_handle = ${sqlStr(E.member)};`,
    )

    // ---- 16a-c. verify-pin unclaimed -------------------------------------
    const unclaimedAttempt = await edge('verify-pin', { discord_handle: E.unclaimed, pin: EDGE_PIN })
    // Second call: pin_login_attempts starts absent, and record_pin_failure's
    // INSERT branch returns the column default (0) on the very first failure —
    // the second 409 proves the counter row is created and then incremented.
    const unclaimedAttempt2 = await edge('verify-pin', { discord_handle: E.unclaimed, pin: EDGE_PIN })
    const unclaimedKeys = unclaimedAttempt.body && typeof unclaimedAttempt.body === 'object'
      ? Object.keys(unclaimedAttempt.body)
      : []
    check(
      '16a. verify-pin-unclaimed: active + pin_hash null -> 409 EXACTLY {error:pin_setup_required}',
      unclaimedAttempt.status === 409 &&
        unclaimedKeys.length === 1 &&
        unclaimedAttempt.body?.error === 'pin_setup_required' &&
        unclaimedAttempt2.status === 409,
      `HTTP ${unclaimedAttempt.status}/${unclaimedAttempt2.status} keys=${unclaimedKeys.join('|')}`,
    )
    check(
      '16b. verify-pin-unclaimed: no session minted and no identity echo',
      !unclaimedAttempt.text.includes('access_token') &&
        !unclaimedAttempt.text.includes('session') &&
        !unclaimedAttempt.text.includes(E.unclaimed),
      `len=${unclaimedAttempt.text.length}`,
    )
    const unclaimedState = await one(
      `select failed_count from pin_login_attempts where discord_handle = ${sqlStr(E.unclaimed)};`,
    )
    check(
      '16c. verify-pin-unclaimed: each 409 is recorded (counter row + failed_count 1 after two)',
      !!unclaimedState && Number(unclaimedState.failed_count) === 1,
      `failed=${unclaimedState?.failed_count}`,
    )

    // ---- 16d-i. setup-pin validation -------------------------------------
    const setupBase = {
      discord_handle: E.claim,
      pin: EDGE_PIN,
      confirm_pin: EDGE_PIN,
      char_id: CHAR_IDS.edgeClaim,
      nickname: 'SMOKE IDN Edge Claimed',
      char_class: CLASS,
    }
    const noProof = await edge('setup-pin', setupBase)
    check(
      '16d. setup-pin validation: missing proof -> 400 invalid_proof',
      noProof.status === 400 && noProof.body?.error === 'invalid_proof',
      `HTTP ${noProof.status} err=${noProof.body?.error}`,
    )
    const pngProof = await edge('setup-pin', { ...setupBase, proof_data_url: PNG_DATA_URL })
    check(
      '16e. setup-pin validation: PNG data URL -> 400 invalid_proof (JPEG only)',
      pngProof.status === 400 && pngProof.body?.error === 'invalid_proof',
      `HTTP ${pngProof.status} err=${pngProof.body?.error}`,
    )
    const bigProof = await edge('setup-pin', { ...setupBase, proof_data_url: BIG_PROOF })
    check(
      '16f. setup-pin validation: >2 MB JPEG proof (3 MB base64 body) -> 413',
      bigProof.status === 413,
      `HTTP ${bigProof.status} err=${bigProof.body?.error}`,
    )
    const mismatchPins = await edge('setup-pin', {
      ...setupBase,
      confirm_pin: '0000',
      proof_data_url: JPEG_DATA_URL,
    })
    check(
      '16g. setup-pin validation: mismatched pins -> 400 invalid_request',
      mismatchPins.status === 400 && mismatchPins.body?.error === 'invalid_request',
      `HTTP ${mismatchPins.status} err=${mismatchPins.body?.error}`,
    )
    const unknownClass = await edge('setup-pin', {
      ...setupBase,
      char_class: 'smoke_idn_nope',
      proof_data_url: JPEG_DATA_URL,
    })
    check(
      '16h. setup-pin validation: unknown class -> 400 unknown_class',
      unknownClass.status === 400 && unknownClass.body?.error === 'unknown_class',
      `HTTP ${unknownClass.status} err=${unknownClass.body?.error}`,
    )
    const inactiveSetup = await edge('setup-pin', {
      ...setupBase,
      discord_handle: E.inactive,
      proof_data_url: JPEG_DATA_URL,
    })
    check(
      '16i. setup-pin validation: inactive handle -> 401 invalid_credentials (uniform shape)',
      inactiveSetup.status === 401 &&
        inactiveSetup.body?.error === 'invalid_credentials' &&
        typeof inactiveSetup.body?.attempts_remaining === 'number',
      `HTTP ${inactiveSetup.status} remaining=${inactiveSetup.body?.attempts_remaining}`,
    )

    // ---- 16j-n. setup-pin happy path + orphan cleanup ---------------------
    const setupRes = await edge('setup-pin', { ...setupBase, proof_data_url: JPEG_DATA_URL })
    const setupSession = setupRes.body?.session
    const setupClaims = setupSession?.access_token ? jwtClaims(setupSession.access_token) : null
    check(
      '16j. setup-pin-happy: 200 session, JWT member_role=member, member_id matches',
      setupRes.status === 200 &&
        !!setupSession?.access_token &&
        setupClaims?.member_role === 'member' &&
        setupClaims?.member_id === setupSession?.member_id &&
        setupSession?.member_role === 'member',
      `HTTP ${setupRes.status} role=${setupClaims?.member_role}`,
    )
    const edgeClaimId = setupSession?.member_id
    const edgeClaimRow = await one(
      `select id, pin_hash, claimed_at, char_id, display_name
         from members where discord_handle = ${sqlStr(E.claim)};`,
    )
    check(
      '16k. setup-pin-happy: DB pin_hash bcrypt ($2), claimed_at, char_id + nickname applied',
      !!edgeClaimRow &&
        String(edgeClaimRow.pin_hash).startsWith('$2') &&
        edgeClaimRow.pin_hash !== EDGE_PIN &&
        edgeClaimRow.claimed_at !== null &&
        edgeClaimRow.char_id === CHAR_IDS.edgeClaim &&
        edgeClaimRow.display_name === 'SMOKE IDN Edge Claimed' &&
        edgeClaimRow.id === edgeClaimId,
      `hash_prefix=${String(edgeClaimRow?.pin_hash).slice(0, 4)} char_id=${edgeClaimRow?.char_id}`,
    )
    const edgeClaimProof = await one(
      `select status, storage_path from identity_proofs where member_id = ${sqlStr(edgeClaimId)};`,
    )
    trackProof(edgeClaimProof?.storage_path)
    const edgeClaimObject = await one(
      `select count(*) as n from storage.objects
        where bucket_id = 'identity-proofs' and name = ${sqlStr(edgeClaimProof?.storage_path)};`,
    )
    check(
      '16l. setup-pin-happy: pending proof row + the uploaded object exist',
      edgeClaimProof?.status === 'pending' &&
        Number(edgeClaimObject?.n) === 1 &&
        String(edgeClaimProof?.storage_path).startsWith(`claims/${edgeClaimId}/`),
      `status=${edgeClaimProof?.status} objects=${edgeClaimObject?.n}`,
    )
    const claimStorageBefore = Number(
      (await one(
        `select count(*) as n from storage.objects
          where bucket_id = 'identity-proofs' and name like ${sqlStr(`claims/${edgeClaimId}/%`)};`,
      ))?.n,
    )
    const replaySetup = await edge('setup-pin', {
      ...setupBase,
      pin: '9999',
      confirm_pin: '9999',
      char_id: '6600099',
      proof_data_url: JPEG_DATA_URL,
    })
    check(
      '16m. setup-pin-orphan-cleanup: replay -> 409 pin_already_set',
      replaySetup.status === 409 && replaySetup.body?.error === 'pin_already_set',
      `HTTP ${replaySetup.status} err=${replaySetup.body?.error}`,
    )
    const claimStorageAfter = Number(
      (await one(
        `select count(*) as n from storage.objects
          where bucket_id = 'identity-proofs' and name like ${sqlStr(`claims/${edgeClaimId}/%`)};`,
      ))?.n,
    )
    const claimProofRows = await one(
      `select count(*) as n from identity_proofs where member_id = ${sqlStr(edgeClaimId)};`,
    )
    check(
      '16n. setup-pin-orphan-cleanup: second upload object absent (storage unchanged)',
      claimStorageAfter === claimStorageBefore && Number(claimProofRows?.n) === 1,
      `before=${claimStorageBefore} after=${claimStorageAfter} proofs=${claimProofRows?.n}`,
    )

    // ---- 16o-r. verify-pin after claim + lockout --------------------------
    const edgeLogin = await edge('verify-pin', { discord_handle: E.claim, pin: EDGE_PIN })
    check(
      '16o. verify-pin after claim: correct PIN -> 200 session',
      edgeLogin.status === 200 && !!edgeLogin.body?.session?.access_token,
      `HTTP ${edgeLogin.status}`,
    )
    const remaining = []
    let firstWrong = null
    for (let i = 0; i < 5; i += 1) {
      const bad = await edge('verify-pin', { discord_handle: E.claim, pin: '0000' })
      if (i === 0) firstWrong = bad
      remaining.push(bad.status === 401 ? bad.body?.attempts_remaining : `HTTP ${bad.status}`)
    }
    check(
      '16p. verify-pin-lockout: wrong PIN -> 401 invalid_credentials with attempts_remaining',
      firstWrong?.status === 401 &&
        firstWrong.body?.error === 'invalid_credentials' &&
        firstWrong.body?.attempts_remaining === 4,
      `remaining=${firstWrong?.body?.attempts_remaining}`,
    )
    const lockedAttempt = await edge('verify-pin', { discord_handle: E.claim, pin: EDGE_PIN })
    const lockRow = await one(
      `select failed_count, locked_until from pin_login_attempts where discord_handle = ${sqlStr(E.claim)};`,
    )
    check(
      '16q. verify-pin-lockout: 5 wrong PINs count down 4->0 then 429 locked',
      remaining.every((value, i) => value === 4 - i) &&
        lockedAttempt.status === 429 &&
        lockedAttempt.body?.error === 'locked' &&
        typeof lockedAttempt.body?.retry_after_seconds === 'number' &&
        lockRow?.locked_until !== null,
      `remaining=${remaining.join(',')} HTTP ${lockedAttempt.status}`,
    )
    const ownerResetEdge = await rpc('reset_member_pin', ownerToken, { p_member: edgeClaimId })
    const resetEdgeAttempts = await one(
      `select count(*) as n from pin_login_attempts where discord_handle = ${sqlStr(E.claim)};`,
    )
    check(
      '16r. verify-pin-lockout: owner reset clears the handle lockout rows (fixture cleanup)',
      ownerResetEdge.ok && Number(resetEdgeAttempts?.n) === 0,
      `HTTP ${ownerResetEdge.status} attempts=${resetEdgeAttempts?.n}`,
    )

    // ---- 16s-aa. request-access member (identity re-link) -----------------
    const memberReqBody = {
      discord_handle: E.member,
      pin: EDGE_PIN,
      confirm_pin: EDGE_PIN,
      request_type: 'member',
      char_id: CHAR_IDS.edgeMemberNew,
      nickname: 'SMOKE IDN Edge Member',
      char_class: CLASS,
      char_function: 'dps',
      proof_data_url: JPEG_DATA_URL,
    }
    const edgeMemberReq1 = await edge('request-access', memberReqBody)
    check(
      '16s. request-access-member: 200 {request_id,status:pending}, NEVER a session',
      edgeMemberReq1.status === 200 &&
        typeof edgeMemberReq1.body?.request_id === 'string' &&
        edgeMemberReq1.body?.status === 'pending' &&
        !edgeMemberReq1.text.includes('access_token') &&
        !edgeMemberReq1.text.includes('session'),
      `HTTP ${edgeMemberReq1.status} status=${edgeMemberReq1.body?.status}`,
    )
    const edgeMemberReq1Row = await one(
      `select id, status, proof_path, member_id from membership_requests
        where id = ${sqlStr(edgeMemberReq1.body?.request_id)};`,
    )
    trackProof(edgeMemberReq1Row?.proof_path)
    const edgeMemberCount = await one(
      `select count(*) as n, min(active::text) as active
         from members where discord_handle = ${sqlStr(E.member)};`,
    )
    check(
      '16t. request-access-member: no member row created or reactivated by the request',
      Number(edgeMemberCount?.n) === 1 &&
        edgeMemberCount?.active === 'false' &&
        edgeMemberReq1Row?.member_id === null,
      `members=${edgeMemberCount?.n} active=${edgeMemberCount?.active}`,
    )
    const edgeStatus = await rpc('request_status', null, { p_handle: E.member })
    const edgeStatusKeys = edgeStatus.ok && edgeStatus.json ? Object.keys(edgeStatus.json).sort() : []
    check(
      '16u. request-access-member: anon request_status -> pending with only the four keys',
      edgeStatus.ok &&
        edgeStatus.json?.status === 'pending' &&
        JSON.stringify(edgeStatusKeys) ===
          JSON.stringify(['created_at', 'decided_at', 'request_type', 'status'].sort()),
      `keys=${JSON.stringify(edgeStatusKeys)}`,
    )
    const anonEdgeReqRows = await rest('/membership_requests?select=status&limit=5', { token: null })
    check(
      '16v. request-access-member: anon direct SELECT on requests -> 0 rows (or 401)',
      (anonEdgeReqRows.ok && Array.isArray(anonEdgeReqRows.json) && anonEdgeReqRows.json.length === 0) ||
        [401, 403].includes(anonEdgeReqRows.status),
      `HTTP ${anonEdgeReqRows.status}`,
    )
    const edgeMemberReq2 = await edge('request-access', memberReqBody)
    check(
      '16w. request-access-member: second call without previous_pin -> 409 request_pending',
      edgeMemberReq2.status === 409 && edgeMemberReq2.body?.error === 'request_pending',
      `HTTP ${edgeMemberReq2.status} err=${edgeMemberReq2.body?.error}`,
    )
    const edgeMemberReqWrong = await edge('request-access', {
      ...memberReqBody,
      previous_pin: '0000',
    })
    const edgeMemberReqWrong2 = await edge('request-access', {
      ...memberReqBody,
      previous_pin: '0000',
    })
    check(
      '16x. request-access-member: wrong previous_pin -> 401 invalid_previous_pin (attempts decrease)',
      edgeMemberReqWrong.status === 401 &&
        edgeMemberReqWrong.body?.error === 'invalid_previous_pin' &&
        typeof edgeMemberReqWrong.body?.attempts_remaining === 'number' &&
        edgeMemberReqWrong2.status === 401 &&
        edgeMemberReqWrong2.body?.attempts_remaining < edgeMemberReqWrong.body?.attempts_remaining,
      `HTTP ${edgeMemberReqWrong.status} remaining=${edgeMemberReqWrong.body?.attempts_remaining}->${edgeMemberReqWrong2.body?.attempts_remaining}`,
    )
    const edgeMemberReq3 = await edge('request-access', {
      ...memberReqBody,
      previous_pin: EDGE_PIN,
    })
    const edgeMemberReq3Row = await one(
      `select id, status, proof_path, char_id from membership_requests
        where id = ${sqlStr(edgeMemberReq3.body?.request_id)};`,
    )
    trackProof(edgeMemberReq3Row?.proof_path)
    const edgeMemberReq1After = await one(
      `select status, proof_path from membership_requests
        where id = ${sqlStr(edgeMemberReq1Row?.id)};`,
    )
    check(
      '16y. request-access-member: correct previous_pin -> 200 and the old request is superseded',
      edgeMemberReq3.status === 200 &&
        edgeMemberReq3Row?.status === 'pending' &&
        edgeMemberReq3Row?.id !== edgeMemberReq1Row?.id &&
        edgeMemberReq3Row?.char_id === CHAR_IDS.edgeMemberNew &&
        edgeMemberReq1After?.status === 'superseded' &&
        edgeMemberReq1After?.proof_path === null,
      `HTTP ${edgeMemberReq3.status} old=${edgeMemberReq1After?.status}`,
    )
    const edgeOldObject = await storageGet(edgeMemberReq1Row?.proof_path, svc)
    check(
      '16z. request-access-member: the superseded proof object is purged from storage',
      !edgeOldObject.ok,
      `HTTP ${edgeOldObject.status}`,
    )

    // ---- 16ab-ac. request-access prospect (full application) --------------
    const prospectStats = statArray(statKeys.slice(0, 56), 700)
    const prospectBody = {
      discord_handle: E.prospect,
      pin: EDGE_PIN,
      confirm_pin: EDGE_PIN,
      request_type: 'prospect',
      char_id: CHAR_IDS.edgeProspect,
      nickname: 'SMOKE IDN Edge Prospect',
      char_class: CLASS,
      char_function: 'dps',
      proof_data_url: JPEG_DATA_URL,
      stats: prospectStats,
    }
    const edgeProspectReq = await edge('request-access', prospectBody)
    const edgeProspectRow = await one(
      `select id, status, request_type, proof_path from membership_requests
        where id = ${sqlStr(edgeProspectReq.body?.request_id)};`,
    )
    trackProof(edgeProspectRow?.proof_path)
    const edgeProspectStats = await one(
      `select count(*) as n from membership_request_stats
        where request_id = ${sqlStr(edgeProspectReq.body?.request_id)};`,
    )
    const edgeProspectMemberBefore = await one(
      `select count(*) as n from members where discord_handle = ${sqlStr(E.prospect)};`,
    )
    check(
      '16ab. request-access-prospect: 200 pending, 56 stats stored, ZERO member rows',
      edgeProspectReq.status === 200 &&
        edgeProspectRow?.status === 'pending' &&
        edgeProspectRow?.request_type === 'prospect' &&
        Number(edgeProspectStats?.n) === 56 &&
        Number(edgeProspectMemberBefore?.n) === 0,
      `HTTP ${edgeProspectReq.status} stats=${edgeProspectStats?.n} members=${edgeProspectMemberBefore?.n}`,
    )
    const edgeProspectStatus = await rpc('request_status', null, { p_handle: E.prospect })
    check(
      '16ac. request-access-prospect: request_status pending (no stats leaked)',
      edgeProspectStatus.ok &&
        edgeProspectStatus.json?.status === 'pending' &&
        !/stat_key|char_id|nickname|pin_hash|discord_handle|"stats"/.test(edgeProspectStatus.text),
      `status=${edgeProspectStatus.json?.status}`,
    )

    // ---- 16ad-ae. approval-path isolation --------------------------------
    const edgeProspectApprove = await rpc('approve_request', officerToken, {
      p_request: edgeProspectReq.body?.request_id,
      p_function: 'dps',
    })
    const edgeProspectMemberId = edgeProspectApprove.json
    const edgeProspectMember = await one(
      `select role, active, char_id,
              (select count(*) from submissions s where s.member_id = m.id) as total,
              (select count(*) from submissions s where s.member_id = m.id and s.status = 'validated') as validated
         from members m where id = ${sqlStr(edgeProspectMemberId)};`,
    )
    check(
      '16ad. approval-path: approved prospect -> member with role member and only validated submissions',
      edgeProspectApprove.ok &&
        edgeProspectMember?.role === 'member' &&
        edgeProspectMember?.active === true &&
        edgeProspectMember?.char_id === CHAR_IDS.edgeProspect &&
        Number(edgeProspectMember?.total) >= 1 &&
        Number(edgeProspectMember?.validated) === Number(edgeProspectMember?.total),
      `HTTP ${edgeProspectApprove.status} validated=${edgeProspectMember?.validated}/${edgeProspectMember?.total}`,
    )
    const edgeMemberBefore = await one(
      `select id, (select count(*) from submissions s where s.member_id = m.id) as subs
         from members m where discord_handle = ${sqlStr(E.member)};`,
    )
    const edgeMemberApprove = await rpc('approve_request', officerToken, {
      p_request: edgeMemberReq3Row?.id,
      p_function: 'dps',
    })
    const edgeMemberAfter = await one(
      `select id, role, active, char_id,
              (select count(*) from submissions s where s.member_id = m.id) as subs
         from members m where discord_handle = ${sqlStr(E.member)};`,
    )
    check(
      '16ae. approval-path: member-type approval creates NO submission',
      edgeMemberApprove.ok &&
        Number(edgeMemberAfter?.subs) === Number(edgeMemberBefore?.subs) &&
        Number(edgeMemberAfter?.subs) === 0 &&
        edgeMemberAfter?.active === true &&
        edgeMemberAfter?.role === 'member' &&
        edgeMemberAfter?.char_id === CHAR_IDS.edgeMemberNew,
      `subs=${edgeMemberAfter?.subs} active=${edgeMemberAfter?.active}`,
    )

    // ---- 16af-ai. method surface + intake guards -------------------------
    const getSetup = await edge('setup-pin', undefined, { method: 'GET' })
    check('16af. GET setup-pin -> 405', getSetup.status === 405, `HTTP ${getSetup.status}`)
    const optionsSetup = await edge('setup-pin', undefined, { method: 'OPTIONS' })
    check('16ag. OPTIONS setup-pin -> 200', optionsSetup.status === 200, `HTTP ${optionsSetup.status}`)
    const activeMemberRequest = await edge('request-access', {
      ...memberReqBody,
      discord_handle: H.a,
      char_id: '6600098',
    })
    check(
      '16ah. request-access on an ACTIVE member -> 409 already_member',
      activeMemberRequest.status === 409 && activeMemberRequest.body?.error === 'already_member',
      `HTTP ${activeMemberRequest.status} err=${activeMemberRequest.body?.error}`,
    )
    const dummyRequest = await edge('request-access', {
      ...memberReqBody,
      discord_handle: 'dummy-edge',
      char_id: '6600097',
    })
    check(
      '16ai. request-access dummy- handle -> 400 dummy_handle',
      dummyRequest.status === 400 && dummyRequest.body?.error === 'dummy_handle',
      `HTTP ${dummyRequest.status} err=${dummyRequest.body?.error}`,
    )
    const unknownMemberRequest = await edge('request-access', {
      ...memberReqBody,
      discord_handle: H.memberreq,
      char_id: CHAR_IDS.memberreq,
    })
    check(
      '16aj. request-access unknown handle (member-type) -> 400 not_member',
      unknownMemberRequest.status === 400 && unknownMemberRequest.body?.error === 'not_member',
      `HTTP ${unknownMemberRequest.status} err=${unknownMemberRequest.body?.error}`,
    )
    const unknownMemberReqCount = await one(
      `select count(*) as n from membership_requests where discord_handle = '${H.memberreq}';`,
    )
    check(
      '16aj2. no request row committed for the unknown handle',
      Number(unknownMemberReqCount?.n) === 0,
      `n=${unknownMemberReqCount?.n}`,
    )
  } finally {
    try {
      await cleanup()
      console.log('PASS: cleanup removed fixture rows, requests, proofs and storage objects')
      await zeroResidueCensus()
    } catch (err) {
      console.error(`CLEANUP FAILED (manual residue removal needed): ${err?.message || err}`)
      process.exitCode = 1
    }
  }

  if (failures.length === 0) {
    console.log(`IDENTITY SMOKE PASSED ${total.expected}/${total.expected}`)
  } else {
    console.error(`IDENTITY SMOKE FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[smoke-identity] FAILED: ${err?.message || err}`)
  process.exit(1)
})
