#!/usr/bin/env node
/**
 * NeoFoot live promotion smoke matrix (plan 06-02 task 2) — proves migration
 * 0011's get_promotion() against the LIVE project:
 *
 *   T-06-06  anon get_promotion denied
 *   SHWC-02  member-invocable: jsonb array of class sections, ≤5 cards per
 *            section, card shape {display_name, char_function, ovr, highlights}
 *   RNK-02   KEY-STAT LEAK PROOF: the staff-only /class_key_stats key set has
 *            ZERO intersection with every stat_key a member can see in the
 *            promotion payload, and the payload carries no is_key/key_stat/
 *            contributes_to_ovr marker anywhere (identical points formula for
 *            all stats => top-6-by-points selection cannot leak the key set)
 *   D-13     insufficient-data class (no OVR-capable member) => section
 *            ABSENT server-side
 *   D-14     staff-only boundary unchanged: class_top5 stays member-denied
 *   D-07     cohort filter: a deactivated member's card leaves the section
 *            instantly and returns on reactivation (compute-on-read)
 *
 * Fixture design (deterministic leak-diff): the 6 key stats get an identical
 * tiny value for EVERY fixture member (all-tied-at-bottom points <= 49.5),
 * while 20 non-key "booster" stats get 1e9-scale values rotated across the 3
 * promo members so each card owns >= 14 boosters with points strictly above
 * 49.5 (99 / 74.25) — the top-6 highlight slots can only ever be boosters,
 * independent of live cohort interference.
 *
 * Modeled on scripts/smoke-officer.mjs: same env gate, check() counter,
 * login() via verify-pin (throwaway fixtures, bcrypt PIN 1234), same
 * rest()/mgmtQuery() helpers, same cleanup discipline (every fixture row is
 * new and removed in finally — a second consecutive run passes with no
 * residue; WR-06 lesson).
 *
 * Env:
 *   SUPABASE_URL / SUPABASE_ANON_KEY       (fallback: local .env VITE_* values)
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF  (Management API — session env
 *   var ONLY: never written to any file, never committed, never echoed)
 *
 * Exits non-zero on any FAIL. Prints "PROMOTION SMOKE PASSED n/n" only if all pass.
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
  console.error('[smoke-promotion] Missing SUPABASE_URL or SUPABASE_ANON_KEY (env or .env VITE_*)')
  process.exit(1)
}
if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF')
  process.exit(1)
}

const PIN = '1234'
const OFFICER_HANDLE = 'officer-handle' // placeholder staff row (whitelist seed, PIN 1234)
const PROMO_CLASS = 'smoke_promo_cls'
const SPARE_CLASS = 'smoke_spare_cls'
const KEY_STATS = ['hp', 'sp', 'patk', 'pdef', 'matk', 'mdef']
const HANDLES = {
  a: 'zz-promo-a',
  b: 'zz-promo-b',
  c: 'zz-promo-c',
  d: 'zz-promo-d',
  e: 'zz-promo-e',
}
const ALL_HANDLES = Object.values(HANDLES)
const DISPLAY = {
  [HANDLES.a]: 'ZZ Promo A',
  [HANDLES.b]: 'ZZ Promo B',
  [HANDLES.c]: 'ZZ Promo C',
  [HANDLES.d]: 'ZZ Promo D',
  [HANDLES.e]: 'ZZ Promo E',
}
// All fixture members are dps of their class: the promo trio shares one
// function cohort (n>=3 for OVR), the spare pair feeds the same function
// cohort but its class has NO key stats => OVR null => section hidden (D-13).
const MEMBERS = [
  { handle: HANDLES.a, cls: PROMO_CLASS, idx: 0 },
  { handle: HANDLES.b, cls: PROMO_CLASS, idx: 1 },
  { handle: HANDLES.c, cls: PROMO_CLASS, idx: 2 },
  { handle: HANDLES.d, cls: SPARE_CLASS, idx: 3 },
  { handle: HANDLES.e, cls: SPARE_CLASS, idx: 4 },
]

// ---------------------------------------------------------------------------
// Helpers (same shape as scripts/smoke-officer.mjs)
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Cleanup (idempotent; runs pre-run for residue safety and in finally always).
// Order matters (FKs): submissions cascade stats; then the members; then the
// key-stat config rows and the classes; pin_login_attempts rows are written
// by verify-pin on every login (03-03 finding).
// ---------------------------------------------------------------------------

async function cleanup() {
  await mgmtQuery(
    `delete from submissions where member_id in ` +
      `(select id from members where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')}));`,
  )
  await mgmtQuery(
    `delete from members where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')});`,
  )
  await mgmtQuery(
    `delete from class_key_stats where class_name in ('${PROMO_CLASS}', '${SPARE_CLASS}');`,
  )
  await mgmtQuery(
    `delete from classes where class_name in ('${PROMO_CLASS}', '${SPARE_CLASS}');`,
  )
  await mgmtQuery(
    `delete from pin_login_attempts where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')});`,
  )
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

async function main() {
  console.log('[smoke-promotion] Pre-run cleanup (residue safety)')
  await cleanup()

  try {
    // ---- Setup: two throwaway classes, 5 members, 6-key config, 5 ---------
    // validated submissions through the real RPCs.
    await mgmtQuery(
      `insert into classes (class_name) values ('${PROMO_CLASS}'), ('${SPARE_CLASS}');`,
    )
    await mgmtQuery(
      `insert into class_key_stats (class_name, stat_key) values ` +
        KEY_STATS.map((k) => `('${PROMO_CLASS}', '${k}')`).join(', ') +
        `;`,
    )
    const pinHash = bcrypt.hashSync(PIN, 10)
    for (const m of MEMBERS) {
      await mgmtQuery(
        `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function) ` +
          `values ('${m.handle}', '${DISPLAY[m.handle]}', '${pinHash}', 'member', true, '${m.cls}', 'dps');`,
      )
    }

    const sessions = {}
    for (const m of MEMBERS) {
      sessions[m.handle] = await login(m.handle)
    }
    const officer = await login(OFFICER_HANDLE)
    console.log('[smoke-promotion] 5 fixture members + placeholder officer logged in')

    // Booster set: 20 non-key catalog keys, deterministic order.
    const catalog = await rest('/stat_catalog?select=stat_key&order=stat_key.asc', {
      token: sessions[HANDLES.a].access_token,
    })
    const statKeys = Array.isArray(catalog.json) ? catalog.json.map((r) => r.stat_key) : []
    if (statKeys.length !== 57) {
      throw new Error(`live stat_catalog returned ${statKeys.length} rows, expected 57`)
    }
    const boosters = statKeys.filter((k) => !KEY_STATS.includes(k)).slice(0, 20)

    // Payload per member: 6 all-tied tiny key values + 20 booster values.
    // Promo member idx i: rank rotation ((j+i)%3)+1 -> per member 7 boosters
    // at 99 points, 7 at 74.25, 6 at 49.5 — always >= 14 boosters strictly
    // above the all-tied key points (49.5) => top-6 highlights are boosters
    // only, for every card, regardless of live cohort interference.
    for (const m of MEMBERS) {
      const pStats = []
      for (const k of KEY_STATS) pStats.push({ stat_key: k, value: 1 })
      boosters.forEach((k, j) => {
        const value =
          m.idx <= 2
            ? 1_000_000_000 + (4 - (((j + m.idx) % 3) + 1)) * 1_000_000 + j
            : j * 1000 + (m.idx - 2) // spare pair: tiny, below every promo value
        pStats.push({ stat_key: k, value })
      })
      await createSubmission(sessions[m.handle].access_token, pStats)
      await sleep(25)
    }
    console.log('[smoke-promotion] 5 submissions created via the real RPC')

    // Validate every fixture submission through the REAL officer flow:
    // officer_queue -> set_submission_status (plan: validated submissions).
    const queue = await rest('/rpc/officer_queue', {
      method: 'POST',
      token: officer.access_token,
      body: {},
    })
    if (!queue.ok || !Array.isArray(queue.json)) {
      throw new Error(`officer_queue failed: HTTP ${queue.status} ${queue.text}`)
    }
    let validated = 0
    for (const m of MEMBERS) {
      const row = queue.json.find((r) => r.discord_handle === m.handle)
      if (!row) throw new Error(`fixture pending row missing from officer_queue for ${m.handle}`)
      const v = await rest('/rpc/set_submission_status', {
        method: 'POST',
        token: officer.access_token,
        body: { p_submission: row.submission_id, p_status: 'validated' },
      })
      check(
        `setup: officer validated ${DISPLAY[m.handle]}'s submission -> 2xx returns 1`,
        v.ok && Number(v.json) === 1,
        `HTTP ${v.status}`,
      )
      if (v.ok) validated += 1
    }

    // Member ids for the cohort-filter probe.
    const memberIds = {}
    for (const m of MEMBERS) {
      const row = await rest(`/members?select=id,discord_handle&discord_handle=eq.${m.handle}`, {
        token: sessions[m.handle].access_token,
      })
      if (!row.ok || !Array.isArray(row.json) || row.json.length !== 1) {
        throw new Error(`own-row select failed for ${m.handle}: HTTP ${row.status} ${row.text}`)
      }
      memberIds[m.handle] = row.json[0].id
    }

    // ---- Probe 1 (T-06-06): anon get_promotion denied ---------------------
    const anonPromo = await rest('/rpc/get_promotion', { method: 'POST', body: {} })
    check('1. anon POST /rpc/get_promotion -> non-2xx', !anonPromo.ok, `HTTP ${anonPromo.status}`)

    // ---- Probe 2 (SHWC-02): member-invocable, section + <=5 cards ---------
    const memberPromo = await rest('/rpc/get_promotion', {
      method: 'POST',
      token: sessions[HANDLES.a].access_token,
      body: {},
    })
    check(
      '2a. member POST /rpc/get_promotion -> 2xx jsonb ARRAY',
      memberPromo.ok && Array.isArray(memberPromo.json),
      `HTTP ${memberPromo.status}`,
    )
    const sections = Array.isArray(memberPromo.json) ? memberPromo.json : []
    const promoSection = sections.find((s) => s.class_name === PROMO_CLASS)
    const promoCards = promoSection && Array.isArray(promoSection.cards) ? promoSection.cards : []
    check(
      '2b. smoke_promo_cls section present with <=5 cards (3 fixture cards)',
      !!promoSection && promoCards.length === 3,
      `cards=${promoCards.length}`,
    )

    // ---- Probe 3 (SHWC-02): closed card/highlight shape -------------------
    const shapeOk = promoCards.every(
      (c) =>
        typeof c.display_name === 'string' &&
        (c.char_function === 'tank' || c.char_function === 'dps') &&
        typeof c.ovr === 'number' &&
        c.ovr >= 51,
    )
    check(
      "3a. every card: display_name, char_function in (tank,dps), numeric ovr >= 51",
      shapeOk,
      `ovrs=${JSON.stringify(promoCards.map((c) => c.ovr))}`,
    )
    const hlLenOk = promoCards.every((c) => Array.isArray(c.highlights) && c.highlights.length === 6)
    check(
      '3b. every card: highlights array of length exactly 6',
      hlLenOk,
      promoCards[0] ? `card0=${promoCards[0].highlights.length}` : 'no cards',
    )
    const HL_KEYS = ['stat_key', 'label', 'value_type', 'value', 'points'].sort()
    const hlKeysOk = promoCards.every(
      (c) =>
        Array.isArray(c.highlights) &&
        c.highlights.every(
          (h) => JSON.stringify(Object.keys(h).sort()) === JSON.stringify(HL_KEYS),
        ),
    )
    check(
      '3c. every highlight object has EXACTLY {stat_key,label,value_type,value,points} (no extra fields)',
      hlKeysOk,
    )

    // ---- Probe 4 (RNK-02/T-06-05): key-stat leak diff ---------------------
    // STAFF read of the fixture class's key set (the admin's source of truth).
    const staffKeys = await rest(`/class_key_stats?class_name=eq.${PROMO_CLASS}&select=stat_key`, {
      token: officer.access_token,
    })
    const keySet = Array.isArray(staffKeys.json) ? staffKeys.json.map((r) => r.stat_key).sort() : []
    check(
      '4a. STAFF /class_key_stats read -> exactly the 6 configured key stats',
      staffKeys.ok && JSON.stringify(keySet) === JSON.stringify([...KEY_STATS].sort()),
      `keys=${JSON.stringify(keySet)}`,
    )
    // MEMBER-visible stat keys: every stat_key in the promo section's highlights.
    const memberKeys = new Set()
    for (const c of promoCards) {
      for (const h of c.highlights || []) memberKeys.add(h.stat_key)
    }
    const overlap = keySet.filter((k) => memberKeys.has(k))
    check(
      '4b. LEAK-DIFF: ZERO intersection between staff key set and member-visible stat_keys',
      memberKeys.size > 0 && overlap.length === 0,
      `member sees ${memberKeys.size} distinct stats, overlap=${JSON.stringify(overlap)}`,
    )
    const raw = memberPromo.text || ''
    check(
      '4c. payload carries no is_key / key_stat / contributes_to_ovr marker anywhere',
      !raw.includes('is_key') && !raw.includes('key_stat') && !raw.includes('contributes_to_ovr'),
      `len=${raw.length}`,
    )

    // ---- Probe 5 (D-13): insufficient-data class hidden -------------------
    check(
      '5. smoke_spare_cls section ABSENT (2 members with data, no OVR-capable member)',
      Array.isArray(memberPromo.json) && !sections.some((s) => s.class_name === SPARE_CLASS),
      `sections=${JSON.stringify(sections.map((s) => s.class_name))}`,
    )

    // ---- Probe 6 (D-14): staff-only boundary unchanged --------------------
    const memberTop5 = await rest('/rpc/class_top5', {
      method: 'POST',
      token: sessions[HANDLES.a].access_token,
      body: { p_class: PROMO_CLASS },
    })
    check(
      '6a. member POST /rpc/class_top5 -> non-2xx forbidden',
      !memberTop5.ok && memberTop5.text.includes('forbidden'),
      `HTTP ${memberTop5.status}`,
    )
    const staffTop5 = await rest('/rpc/class_top5', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: PROMO_CLASS },
    })
    check(
      '6b. staff POST /rpc/class_top5 -> 2xx (boundary intact)',
      staffTop5.ok && Array.isArray(staffTop5.json),
      `HTTP ${staffTop5.status}`,
    )

    // ---- Probe 7 (D-07): cohort filter on the promotion payload -----------
    const deactivate = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: officer.access_token,
      body: { p_member: memberIds[HANDLES.c], p_active: false },
    })
    check(
      '7a. officer deactivates one smoke_promo_cls member -> 2xx',
      deactivate.ok,
      `HTTP ${deactivate.status}`,
    )
    const promoDuring = await rest('/rpc/get_promotion', {
      method: 'POST',
      token: sessions[HANDLES.a].access_token,
      body: {},
    })
    const sectionDuring = (Array.isArray(promoDuring.json) ? promoDuring.json : []).find(
      (s) => s.class_name === PROMO_CLASS,
    )
    const cardsDuring = sectionDuring && Array.isArray(sectionDuring.cards) ? sectionDuring.cards : []
    check(
      "7b. deactivated member's card DROPS from the section instantly (2 cards remain)",
      promoDuring.ok &&
        !!sectionDuring &&
        cardsDuring.length === 2 &&
        !cardsDuring.some((c) => c.display_name === DISPLAY[HANDLES.c]),
      `cards=${JSON.stringify(cardsDuring.map((c) => c.display_name))}`,
    )
    const reactivate = await rest('/rpc/set_member_active', {
      method: 'POST',
      token: officer.access_token,
      body: { p_member: memberIds[HANDLES.c], p_active: true },
    })
    check(
      '7c. officer reactivates the member -> 2xx',
      reactivate.ok,
      `HTTP ${reactivate.status}`,
    )
    const promoAfter = await rest('/rpc/get_promotion', {
      method: 'POST',
      token: sessions[HANDLES.a].access_token,
      body: {},
    })
    const sectionAfter = (Array.isArray(promoAfter.json) ? promoAfter.json : []).find(
      (s) => s.class_name === PROMO_CLASS,
    )
    const cardsAfter = sectionAfter && Array.isArray(sectionAfter.cards) ? sectionAfter.cards : []
    check(
      "7d. reactivated member's card RETURNS (compute-on-read, no data migration)",
      promoAfter.ok &&
        !!sectionAfter &&
        cardsAfter.length === 3 &&
        cardsAfter.some((c) => c.display_name === DISPLAY[HANDLES.c]),
      `cards=${JSON.stringify(cardsAfter.map((c) => c.display_name))}`,
    )
  } finally {
    // Guaranteed cleanup — runs even when an assertion/setup threw mid-run.
    try {
      await cleanup()
      console.log('PASS: cleanup removed submissions, members, key stats, classes, login-attempt rows')
    } catch (err) {
      console.error(`CLEANUP FAILED (manual residue removal needed): ${err?.message || err}`)
      process.exitCode = 1
    }
  }

  if (failures.length === 0) {
    console.log(`PROMOTION SMOKE PASSED ${total.expected}/${total.expected}`)
  } else {
    console.error(`PROMOTION SMOKE FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[smoke-promotion] FAILED: ${err?.message || err}`)
  process.exit(1)
})
