#!/usr/bin/env node
/**
 * NeoFoot live rank smoke matrix (plan 09-03 task 2).
 *
 * Runs against the LIVE project: creates a throwaway class ZZRankSquad with 3
 * throwaway members (bcrypt PIN 1234), drives real submissions through the
 * deployed create_submission RPC, configures key stats through the REAL
 * set_key_stat_v2 RPC (with p_function param), then asserts the full rank
 * contract with EXACT-VALUE assertions against the value-proportional spec
 * (src/lib/rankMath.test.ts):
 *
 *   value-proportional points: round(own/best*99,2) clamped [0,99]
 *   higher-is-better: best = max; lower-is-better: best = min (most negative)
 *   OVR = 51 + mean(6 key-stat points) * 48/99: recomputed per new formula
 *   MIN_COHORT_SIZE = 3 (n=2 -> points null + data_sufficient false)
 *   KEYU ordered set: 7th+ selection = relevant (no key_stat_limit); deselect
 *   key promotes oldest relevant
 *   last_validated_at present in my_report output
 *   OVR parity: zero change where cohort unchanged, null where n<3 / no role
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
import { supabaseConfig, FIXTURE_PIN, assertFixtureRole } from './smoke-config.mjs'

// ---------------------------------------------------------------------------
// Config (credentials from smoke-config.mjs: env or .env, never hardcoded)
// ---------------------------------------------------------------------------

let SUPABASE_URL, ANON_KEY, MGMT_TOKEN, PROJECT_REF
try {
  ;({ url: SUPABASE_URL, anonKey: ANON_KEY, mgmtToken: MGMT_TOKEN, projectRef: PROJECT_REF } = supabaseConfig())
} catch (err) {
  console.error(`[smoke-rank] ${err.message}`)
  process.exit(1)
}

const CLASS = 'ZZRankSquad'
// Throwaway officer fixture — unique handle per run so a crashed prior run
// cannot 409 the insert (discord_handle is UNIQUE).
const OFFICER_HANDLE = `smoke-rank-officer-${Date.now()}`
const HANDLES = ['zz-rank-a', 'zz-rank-b', 'zz-rank-c']
const KEY_STATS = ['hp', 'sp', 'patk', 'pdef', 'matk', 'mdef']

// One submission per member via the real create_submission RPC. Values chosen
// so value-proportional points come out clean (own/best*99):
//   hp:  a=100/300→33, b=200/300→66, c=300/300→99
//   sp:  a=40/80→49.5, b=80/80→99, c=80/80→99
//   patk: a=10/30→33, b=20/30→66, c=30/30→99
//   pdef: all 7→99 (tied at top)
//   matk: a=100/300→33, b=200/300→66, c=300/300→99
//   mdef: a=35/70→49.5, b=70/70→99, c=70/70→99
// c has NO hit row → n=2 insufficiency.
// OVRs: a=75 (mean 49.5), b=91 (mean 82.5), c=99 (mean 99)
const FIXTURES = {
  'zz-rank-a': { hp: 100, sp: 40, patk: 10, pdef: 7, matk: 100, mdef: 35, hit: 10 },
  'zz-rank-b': { hp: 200, sp: 80, patk: 20, pdef: 7, matk: 200, mdef: 70, hit: 20 },
  'zz-rank-c': { hp: 300, sp: 80, patk: 30, pdef: 7, matk: 300, mdef: 70 }, // hit absent (n=2)
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
async function login(handle, pin = FIXTURE_PIN) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ discord_handle: handle, pin }),
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
    `delete from submissions where member_id in (select id from members where discord_handle in ('zz-rank-a','zz-rank-b','zz-rank-c','${OFFICER_HANDLE}'));`,
  )
  await mgmtQuery(
    `delete from members where discord_handle in ('zz-rank-a','zz-rank-b','zz-rank-c','${OFFICER_HANDLE}');`,
  )
  await mgmtQuery(`delete from class_key_stats where class_name = '${CLASS}';`)
  await mgmtQuery(`delete from classes where class_name = '${CLASS}';`)
  await mgmtQuery(
    `delete from pin_login_attempts where discord_handle in ('zz-rank-a','zz-rank-b','zz-rank-c','${OFFICER_HANDLE}');`,
  )
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

async function main() {
  // Defensive pre-clean: a previously crashed run must not break this one
  // (unique handles / class PK) — also proves the second consecutive run works.
  await cleanup()

  try {
    // ---- Setup ------------------------------------------------------------
    await mgmtQuery(`insert into classes (class_name) values ('${CLASS}');`)

    // Provision a throwaway officer fixture (role officer). This script no
    // longer logs in as the placeholder staff row (inactive since 08.1-01/02);
    // every fixture is created and removed in this run.
    const officerPinHash = bcrypt.hashSync(FIXTURE_PIN, 10)
    await mgmtQuery(
      `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function) ` +
        `values ('${OFFICER_HANDLE}', 'SMOKE Rank Officer', '${officerPinHash}', 'officer', true, '${CLASS}', 'suporte');`,
    )
    const officerSession = await login(OFFICER_HANDLE)
    assertFixtureRole(officerSession, 'officer')
    const officer = officerSession

    const pinHash = bcrypt.hashSync(FIXTURE_PIN, 10)
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
    console.log('[smoke-rank] Throwaway officer + 3 zz-rank members logged in via verify-pin')

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
    // Phase 9 KEYU: p_function param, no block at 7 (7th+ = relevant).
    let n = 0
    for (const k of KEY_STATS) {
      n += 1
      const res = await rest('/rpc/set_key_stat_v2', {
        method: 'POST',
        token: officer.access_token,
        body: { p_class: CLASS, p_function: 'dps', p_stat_key: k, p_enabled: true },
      })
      check(
        `officer set_key_stat_v2(${k}) -> count ${n}`,
        res.ok && numEq(res.json, n),
        `HTTP ${res.status} body=${res.text}`,
      )
    }

    // ---- Assertions -------------------------------------------------------

    // 1. Member-denied write (D-03): members can never configure key stats.
    const memberSet = await rest('/rpc/set_key_stat_v2', {
      method: 'POST',
      token: sessions['zz-rank-a'].access_token,
      body: { p_class: CLASS, p_function: 'dps', p_stat_key: 'hit', p_enabled: true },
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

    // 6. Officer top-5 preview: exact OVR values, sorted desc. The officer
    //    fixture (suporte, no submission, no suporte key config) rides the
    //    board tail with OVR null — server order is ovr desc nulls last.
    const top5 = await rest('/rpc/class_top5', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS },
    })
    const top5rows = Array.isArray(top5.json) ? top5.json : []
    const top5ovrs = top5rows.map((r) => Number(r.ovr))
    check(
      'officer class_top5 -> 4 rows [c 99, b 91, a 75, officer null last] desc',
      top5.ok &&
        top5rows.length === 4 &&
        JSON.stringify(top5ovrs.slice(0, 3)) === JSON.stringify([99, 91, 75]) &&
        top5rows[0].display_name === 'ZZ Rank C' &&
        top5rows[1].display_name === 'ZZ Rank B' &&
        top5rows[2].display_name === 'ZZ Rank A' &&
        top5rows[3].display_name === 'SMOKE Rank Officer' &&
        top5rows[3].ovr === null,
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
    check('my_report(b): stats array has 59 entries (full catalog)', statsB.length === 59, `len=${statsB.length}`)

    const groupRank = { general: 0, quasi: 1, special: 2 }
    let groupOrdered = statsB.length > 0
    for (let i = 1; i < statsB.length; i += 1) {
      if (groupRank[statsB[i].group_name] < groupRank[statsB[i - 1].group_name]) groupOrdered = false
    }
    check('my_report(b): stats ordered general -> quasi -> special', groupOrdered)

    const byKeyB = {}
    for (const s of statsB) byKeyB[s.stat_key] = s

    check(
      'my_report(b) hp: own 200 avg 200 best 300 points 66 ds true (66/100*99)',
      numEq(byKeyB.hp.own_value, 200) &&
        numEq(byKeyB.hp.class_average, 200) &&
        numEq(byKeyB.hp.best, 300) &&
        numEq(byKeyB.hp.points, 66) &&
        byKeyB.hp.data_sufficient === true,
      JSON.stringify(byKeyB.hp),
    )
    check(
      'my_report(b) sp: own 80 avg 66.67 best 80 points 99 ds true (tied at top)',
      numEq(byKeyB.sp.own_value, 80) &&
        numEq(byKeyB.sp.class_average, 200 / 3) &&
        numEq(byKeyB.sp.best, 80) &&
        numEq(byKeyB.sp.points, 99) &&
        byKeyB.sp.data_sufficient === true,
      JSON.stringify(byKeyB.sp),
    )
    check(
      'my_report(b) pdef: own 7 avg 7 best 7 points 99 ds true (all tied)',
      numEq(byKeyB.pdef.own_value, 7) &&
        numEq(byKeyB.pdef.class_average, 7) &&
        numEq(byKeyB.pdef.best, 7) &&
        numEq(byKeyB.pdef.points, 99) &&
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
      'my_report(b) ovr: value 91 data_sufficient true (mean 82.5 -> 51+40)',
      reportB.json &&
        numEq(reportB.json.ovr.value, 91) &&
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
      'my_report(c) sp: points 99 (tied at top gets 99)',
      reportC.ok && numEq(byKeyC.sp.points, 99),
      JSON.stringify(byKeyC.sp),
    )
    check(
      'my_report(c) ovr: value 99 (mean 99 -> 51+48)',
      reportC.ok && numEq(reportC.json.ovr.value, 99) && reportC.json.ovr.data_sufficient === true,
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
      'my_report(a) hp: points 33 (100/300*99)',
      reportA.ok && numEq(byKeyA.hp.points, 33),
      JSON.stringify(byKeyA.hp),
    )
    check(
      'my_report(a) ovr: value 75 (mean 49.5 -> 51+24)',
      reportA.ok && numEq(reportA.json.ovr.value, 75) && reportA.json.ovr.data_sufficient === true,
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
    // Canonical key set: hp, sp, patk, pdef, matk, mdef (the KEYU block
    // runs AFTER these probes — it mutates the ordered set). Disable mdef
    // → 5 keys → OVR null; re-enable → compute-on-read returns instantly.
    const disableMdef = await rest('/rpc/set_key_stat_v2', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS, p_function: 'dps', p_stat_key: 'mdef', p_enabled: false },
    })
    check('officer disables mdef -> count 5', disableMdef.ok && numEq(disableMdef.json, 5), `HTTP ${disableMdef.status}`)

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
      reportA2.ok && numEq(hpA2.points, 33) && numEq(spA2.points, 49.5),
      `hp=${JSON.stringify(hpA2)} sp=${JSON.stringify(spA2)}`,
    )

    const reenable = await rest('/rpc/set_key_stat_v2', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS, p_function: 'dps', p_stat_key: 'mdef', p_enabled: true },
    })
    check('officer re-enables mdef -> count 6', reenable.ok && numEq(reenable.json, 6), `HTTP ${reenable.status}`)

    const reportA3 = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions['zz-rank-a'].access_token,
      body: {},
    })
    check(
      'compute-on-read: ovr 75 returns instantly after re-toggle (no backfill)',
      reportA3.ok && numEq(reportA3.json.ovr.value, 75) && reportA3.json.ovr.data_sufficient === true,
      JSON.stringify(reportA3.json && reportA3.json.ovr),
    )

    // 14. last_validated_at present in my_report output (HOME-03). The
    // fixture submissions are never validated in this suite, so the value
    // is null — the contract is the FIELD's presence.
    check(
      'my_report(b) has last_validated_at field',
      reportB.json && 'last_validated_at' in reportB.json,
      `last_validated_at=${JSON.stringify(reportB.json && reportB.json.last_validated_at)}`,
    )

    // 15. KEYU ordered-set test — runs LAST because it mutates the key set:
    // 7th selection succeeds (no key_stat_limit), becomes a relevant at
    // selection_order 7; key set stays at 6.
    const seventh = await rest('/rpc/set_key_stat_v2', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS, p_function: 'dps', p_stat_key: 'hit', p_enabled: true },
    })
    check(
      'KEYU: 7th selection succeeds as relevant (no key_stat_limit)',
      seventh.ok && numEq(seventh.json, 6),
      `HTTP ${seventh.status} body=${seventh.text}`,
    )

    // Deselect a key -> oldest relevant ('hit') promoted into the vacated slot.
    const disable = await rest('/rpc/set_key_stat_v2', {
      method: 'POST',
      token: officer.access_token,
      body: { p_class: CLASS, p_function: 'dps', p_stat_key: 'hp', p_enabled: false },
    })
    check(
      'KEYU: deselect key hp -> count 6 (hp removed, hit promoted)',
      disable.ok && numEq(disable.json, 6),
      `HTTP ${disable.status} body=${disable.text}`,
    )
    // Promotion consequence, visible on the ordered set: hit is now a key
    // (n=2 cohort -> OVR goes null for every member), hp is gone entirely.
    const reportB2 = await rest('/rpc/my_report', {
      method: 'POST',
      token: sessions['zz-rank-b'].access_token,
      body: {},
    })
    check(
      'KEYU: promoted hit (n=2) in the key set -> ovr null (all-6-or-nothing gate)',
      reportB2.ok && reportB2.json.ovr.value === null && reportB2.json.ovr.data_sufficient === false,
      JSON.stringify(reportB2.json && reportB2.json.ovr),
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
