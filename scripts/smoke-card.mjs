#!/usr/bin/env node
/**
 * NeoFoot live card-foundation smoke matrix (plan 07.2-01 task 2) — proves
 * migration 0013's new/changed RPC surfaces against the LIVE project:
 *
 *   CARD-01  my_card(): member + staff invocable, anon denied; LEAK CENSUS —
 *            key_stats length 6 with the EXACT closed field set
 *            {stat_key,label,label_short,value_type,own_value,points} (no
 *            class_average/best/data_sufficient), top-level payload carries
 *            NO key matching /weight|toggle|config|priority/ (D-03: config is
 *            never serialised), relevant_stat_keys present
 *   D-11     live catalog: label_short populated for all 57 rows, zero empty
 *   RELV-01  class_relevant_stats RLS: staff read OK, member read []
 *   D-05     server-side gating through set_key_stat_v2 (the 0018 ordered-set
 *            contract — the old 3-arg set_key_stat + set_relevant_stat were
 *            dropped by 0018, superseded by v2): member forbidden,
 *            unknown_class, 7th selection lands as a RELEVANT (no
 *            key_stat_limit), re-selecting a selected stat is idempotent,
 *            deselecting a key promotes the oldest relevant into the slot,
 *            deselecting with no relevant drops the count, and the my_card
 *            strip + OVR stay canonical through the whole churn (0028 owner
 *            rule: relevants never appear on the Painel strip)
 *   RANK-02  role_rank(): member forbidden, invalid_function whitelist,
 *            staff 200 — role-primary rows, server order ovr desc nulls
 *            last, 57-stat rows with label_short + class_average, class
 *            filter narrows to the fixture class (D-18/D-20)
 *   D-13     get_promotion(): fixture section cards' highlights are EXACTLY
 *            the class's 6 key stat keys (order-insensitive set equality),
 *            each with label_short, closed field list
 *   UNIFY    (07.2-05 round 8) my_card points + OVR === get_promotion
 *            points + OVR for the same member, ALL 6 key stats (exact
 *            equality — the class+function cohort is the single source of
 *            truth on both paths)
 *            10d/10e (10.1-02 UNIF-04) extend the parity contract to the
 *            remaining surfaces: role_rank OVR ≡ my_card OVR (Ranking tab
 *            ≡ Painel card) and my_report OVR ≡ my_card OVR (Painel OVR hero
 *            ≡ card) — the 0036 unification locked in a runnable gate; a
 *            future partial rewrite (the 0018 failure mode) turns 10a-10e
 *            red the day it ships
 *   Cleanup  fixture members/submissions/class/key/relevant/pin_login_
 *            attempts removed in finally; zero-residue census asserted
 *
 * Modeled on scripts/smoke-officer.mjs / smoke-promotion.mjs: same env gate,
 * check() counter, login() via verify-pin (throwaway fixtures, bcrypt PIN
 * 1234), same rest()/mgmtQuery() helpers, same cleanup discipline (every
 * fixture row is new and removed in finally — a second consecutive run
 * passes with no residue; WR-06 lesson).
 *
 * Env:
 *   SUPABASE_URL / SUPABASE_ANON_KEY       (fallback: local .env VITE_* values)
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF  (Management API — STRICT
 *   process.env gate: session env var ONLY, never written to any file, never
 *   committed, never echoed)
 *
 * Exits non-zero on any FAIL. Prints "CARD SMOKE PASSED n/n" only if all pass.
 */
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { supabaseConfig, FIXTURE_PIN } from './smoke-config.mjs'

// ---------------------------------------------------------------------------
// Config (credentials from smoke-config.mjs: env or .env, never hardcoded)
// ---------------------------------------------------------------------------

let SUPABASE_URL, ANON_KEY, MGMT_TOKEN, PROJECT_REF
try {
  ;({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    mgmtToken: MGMT_TOKEN,
    projectRef: PROJECT_REF,
  } = supabaseConfig())
} catch (err) {
  console.error(`[smoke-card] ${err.message}`)
  process.exit(1)
}

const CLASS = 'smoke_card_cls'
const KEY_STATS = ['hp', 'sp', 'patk', 'pdef', 'matk', 'mdef']
const RELEVANT_STATS = ['crit', 'healing_done'] // non-key stats for D-05 probes
const HANDLES = {
  owner: 'smoke-card-owner',
  officer: 'smoke-card-officer',
  a: 'smoke-card-a',
  b: 'smoke-card-b',
  c: 'smoke-card-c',
}
const ALL_HANDLES = Object.values(HANDLES)
const DISPLAY = {
  [HANDLES.owner]: 'SMOKE CARD Owner',
  [HANDLES.officer]: 'SMOKE CARD Officer',
  [HANDLES.a]: 'SMOKE CARD A',
  [HANDLES.b]: 'SMOKE CARD B',
  [HANDLES.c]: 'SMOKE CARD C',
}
// Staff rows suporte, ordinary members dps — the dps trio a/b/c forms an
// n>=3 cohort for points/OVR while staff rows never join the dps cohort.
const ROLES = {
  [HANDLES.owner]: ['owner', 'suporte'],
  [HANDLES.officer]: ['officer', 'suporte'],
  [HANDLES.a]: ['member', 'dps'],
  [HANDLES.b]: ['member', 'dps'],
  [HANDLES.c]: ['member', 'dps'],
}

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

async function callRpc(name, token, body) {
  return rest(`/rpc/${name}`, { method: 'POST', token, body })
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Cleanup + zero-residue census (idempotent; runs pre-run for residue safety
// and in finally always; the census doubles as the second-run green proof).
// Order matters (FKs): submissions cascade stats; relevant/key rows die with
// the class; then the members; then pin_login_attempts rows (03-03 finding:
// verify-pin upserts attempt rows even on success).
// ---------------------------------------------------------------------------

async function cleanup() {
  await mgmtQuery(
    `delete from submissions where member_id in ` +
      `(select id from members where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')}));`,
  )
  await mgmtQuery(
    `delete from members where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')});`,
  )
  // class_key_stats.class_name is a plain text column (0001:34-38, no FK to
  // classes) — deleting the class does NOT cascade the key rows (smoke-rank
  // deletes them explicitly for the same reason). Explicit deletes first,
  // belt-and-braces for class_relevant_stats too (0013 cascades it).
  await mgmtQuery(`delete from class_key_stats where class_name = '${CLASS}';`)
  await mgmtQuery(`delete from class_relevant_stats where class_name = '${CLASS}';`)
  await mgmtQuery(`delete from classes where class_name = '${CLASS}';`)
  await mgmtQuery(
    `delete from pin_login_attempts where discord_handle in (${ALL_HANDLES.map((h) => `'${h}'`).join(',')});`,
  )
}

async function zeroResidueCensus() {
  const handleList = ALL_HANDLES.map((h) => `'${h}'`).join(',')
  const census = await mgmtQuery(
    `select
       (select count(*) from members where discord_handle in (${handleList})) as members,
       (select count(*) from submissions where member_id in
          (select id from members where discord_handle in (${handleList}))) as submissions,
       (select count(*) from classes where class_name = '${CLASS}') as classes,
       (select count(*) from class_key_stats where class_name = '${CLASS}') as key_rows,
       (select count(*) from class_relevant_stats where class_name = '${CLASS}') as relevant_rows,
       (select count(*) from pin_login_attempts where discord_handle in (${handleList})) as attempts;`,
  )
  const row = Array.isArray(census) ? census[0] : null
  if (!row) throw new Error('zero-residue census query returned no row')
  check('census: zero fixture members', Number(row.members) === 0, `members=${row.members}`)
  check('census: zero fixture submissions', Number(row.submissions) === 0, `submissions=${row.submissions}`)
  check('census: zero fixture classes', Number(row.classes) === 0, `classes=${row.classes}`)
  check('census: zero fixture class_key_stats rows', Number(row.key_rows) === 0, `key=${row.key_rows}`)
  check(
    'census: zero fixture class_relevant_stats rows',
    Number(row.relevant_rows) === 0,
    `relevant=${row.relevant_rows}`,
  )
  check('census: zero fixture pin_login_attempts rows', Number(row.attempts) === 0, `attempts=${row.attempts}`)
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

async function main() {
  console.log('[smoke-card] Pre-run cleanup (residue safety)')
  await cleanup()

  try {
    // ---- Setup: fixture class + 6-key config + 5 members + 3 submissions -
    // Keys inserted with explicit char_function + selection_order 1..6: the
    // set_key_stat_v2 ordered-set probes (4/5) need real orders (the 0018
    // default-0 fixture rows predate v2 and would collide with its
    // max(selection_order)+1 append).
    await mgmtQuery(`insert into classes (class_name) values ('${CLASS}');`)
    await mgmtQuery(
      `insert into class_key_stats (class_name, char_function, stat_key, selection_order) values ` +
        KEY_STATS.map((k, i) => `('${CLASS}', 'dps', '${k}', ${i + 1})`).join(', ') +
        `;`,
    )
    const pinHash = bcrypt.hashSync(FIXTURE_PIN, 10)
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
    console.log('[smoke-card] owner/officer/3 members logged in via verify-pin')

    const memberToken = sessions[HANDLES.a].access_token
    const officerToken = sessions[HANDLES.officer].access_token
    const ownerToken = sessions[HANDLES.owner].access_token

    // Full 57-stat catalog for submission payloads.
    const catalog = await rest('/stat_catalog?select=stat_key&order=stat_key.asc', { token: memberToken })
    const statKeys = Array.isArray(catalog.json) ? catalog.json.map((r) => r.stat_key) : []
    if (statKeys.length !== 59) {
      throw new Error(`live stat_catalog returned ${statKeys.length} rows, expected 59`)
    }

    // Validated submissions for a/b/c — full 57 values each (staggered).
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
    console.log('[smoke-card] 3 pending 57-stat submissions created via the real RPC')

    // ---- Probe 0 (D-11): live catalog label_short census ------------------
    const labelCensus = await mgmtQuery(
      `select count(*) as total, count(*) filter (where label_short = '') as empty, ` +
        `count(distinct label_short) as distinct_short from stat_catalog;`,
    )
    const lc = Array.isArray(labelCensus) ? labelCensus[0] : null
    check('0a. live catalog has 59 rows', !!lc && Number(lc.total) === 59, `total=${lc?.total}`)
    check('0b. label_short populated for ALL 59 rows (no empty strings)', !!lc && Number(lc.empty) === 0, `empty=${lc?.empty}`)
    check('0c. label_short values unique across all 59 (D-11 no collisions)', !!lc && Number(lc.distinct_short) === 59, `distinct=${lc?.distinct_short}`)

    // ---- Probe 1 (CARD-01): my_card boundary ------------------------------
    const anonCard = await callRpc('my_card', null, {})
    check('1a. anon POST /rpc/my_card -> non-2xx', !anonCard.ok, `HTTP ${anonCard.status}`)
    const memberCard = await callRpc('my_card', memberToken, {})
    check(
      '1b. member POST /rpc/my_card -> 2xx payload with char_class/char_function',
      memberCard.ok && memberCard.json && memberCard.json.char_class === CLASS && memberCard.json.char_function === 'dps',
      `HTTP ${memberCard.status}`,
    )
    const staffCard = await callRpc('my_card', officerToken, {})
    check('1c. staff POST /rpc/my_card -> 2xx (member-invocable surface, staff allowed)', staffCard.ok, `HTTP ${staffCard.status}`)

    // ---- Probe 2 (CARD-01/D-03): my_card leak census ----------------------
    const card = memberCard.json || {}
    const keyStats = Array.isArray(card.key_stats) ? card.key_stats : []
    check('2a. my_card key_stats length == 6 (fixture class has exactly 6 keys)', keyStats.length === 6, `len=${keyStats.length}`)
    const EXPECTED_KS_FIELDS = ['stat_key', 'label', 'label_short', 'value_type', 'own_value', 'points'].sort()
    const ksFieldsOk = keyStats.every(
      (s) => JSON.stringify(Object.keys(s).sort()) === JSON.stringify(EXPECTED_KS_FIELDS),
    )
    check(
      '2b. every key_stats entry field set EXACTLY {stat_key,label,label_short,value_type,own_value,points}',
      ksFieldsOk,
      ksFieldsOk ? 'closed list' : `got=${keyStats[0] ? JSON.stringify(Object.keys(keyStats[0]).sort()) : 'n/a'}`,
    )
    check(
      '2c. key_stats entries carry no class_average/best/data_sufficient keys',
      keyStats.every((s) => !('class_average' in s) && !('best' in s) && !('data_sufficient' in s)),
      'no aggregates on the card (D-02)',
    )
    const cardKeys = Object.keys(card)
    const configLeak = cardKeys.filter((k) => /weight|toggle|config|priority/.test(k))
    check(
      '2d. top-level payload has NO keys matching /weight|toggle|config|priority/',
      configLeak.length === 0,
      `keys=${JSON.stringify(cardKeys)}, leaks=${JSON.stringify(configLeak)}`,
    )
    const rawCard = memberCard.text || ''
    check(
      '2e. raw payload carries no is_key/weight/priority marker anywhere (config never serialised)',
      !rawCard.includes('is_key') && !rawCard.includes('weight') && !rawCard.includes('priority'),
      `len=${rawCard.length}`,
    )
    check(
      '2f. relevant_stat_keys present (may be [])',
      Array.isArray(card.relevant_stat_keys),
      `relevant=${JSON.stringify(card.relevant_stat_keys)}`,
    )
    check(
      '2g. key_stats points non-null and ovr non-null (n=3 dps cohort, 6 keys held)',
      keyStats.every((s) => s.points !== null) && card.ovr && card.ovr.value !== null && card.ovr.data_sufficient === true,
      `ovr=${card.ovr ? card.ovr.value : 'n/a'}`,
    )
    check(
      '2h. ovr shape is {value,data_sufficient} (0009 semantics)',
      card.ovr && 'value' in card.ovr && 'data_sufficient' in card.ovr && Object.keys(card.ovr).length === 2,
      `ovr keys=${card.ovr ? JSON.stringify(Object.keys(card.ovr).sort()) : 'n/a'}`,
    )

    // ---- Probe 3 (RELV-01): class_relevant_stats RLS ----------------------
    const memberRelevant = await rest(`/class_relevant_stats?class_name=eq.${CLASS}&select=stat_key`, {
      token: memberToken,
    })
    check(
      '3a. member GET /class_relevant_stats -> 200 with [] (RLS deny-all for members)',
      memberRelevant.ok && Array.isArray(memberRelevant.json) && memberRelevant.json.length === 0,
      `HTTP ${memberRelevant.status}, rows=${JSON.stringify(memberRelevant.json)}`,
    )
    const staffRelevant = await rest(`/class_relevant_stats?class_name=eq.${CLASS}&select=stat_key`, {
      token: officerToken,
    })
    check(
      '3b. staff GET /class_relevant_stats -> 200 (staff select policy works)',
      staffRelevant.ok && Array.isArray(staffRelevant.json),
      `HTTP ${staffRelevant.status}, rows=${JSON.stringify(staffRelevant.json)}`,
    )

    // ---- Probe 4 (D-05): set_key_stat_v2 boundaries (0018 contract) -------
    const memberKeyAdd = await callRpc('set_key_stat_v2', memberToken, {
      p_class: CLASS,
      p_function: 'dps',
      p_stat_key: RELEVANT_STATS[0],
      p_enabled: true,
    })
    check(
      '4a. member POST /rpc/set_key_stat_v2 -> non-2xx forbidden',
      !memberKeyAdd.ok && memberKeyAdd.text.includes('forbidden'),
      `HTTP ${memberKeyAdd.status}`,
    )
    const unknownClassKey = await callRpc('set_key_stat_v2', ownerToken, {
      p_class: 'zz-no-such-class',
      p_function: 'dps',
      p_stat_key: RELEVANT_STATS[0],
      p_enabled: true,
    })
    check(
      '4b. staff set_key_stat_v2 on a nonexistent class -> non-2xx unknown_class',
      !unknownClassKey.ok && unknownClassKey.text.includes('unknown_class'),
      `HTTP ${unknownClassKey.status}`,
    )

    // ---- Probe 5 (KEYU ordered-set rules via set_key_stat_v2) -------------
    // 0018 D-11..D-14: p_enabled=true appends at the end (7+ = relevant, no
    // block at 7); p_enabled=false removes and, for a removed key, promotes
    // the oldest relevant into the vacated slot. Returns count(<=6).
    const seventhSel = await callRpc('set_key_stat_v2', ownerToken, {
      p_class: CLASS,
      p_function: 'dps',
      p_stat_key: RELEVANT_STATS[0],
      p_enabled: true,
    })
    check(
      '5a. KEYU: 7th selection succeeds as a RELEVANT (no key_stat_limit) -> returns 6',
      seventhSel.ok && Number(seventhSel.json) === 6,
      `HTTP ${seventhSel.status} body=${seventhSel.text}`,
    )
    const reselectKey = await callRpc('set_key_stat_v2', ownerToken, {
      p_class: CLASS,
      p_function: 'dps',
      p_stat_key: 'hp',
      p_enabled: true,
    })
    const reselectRows = await rest(`/class_key_stats?class_name=eq.${CLASS}&select=stat_key`, {
      token: ownerToken,
    })
    const reselectKeys = Array.isArray(reselectRows.json) ? reselectRows.json.map((r) => r.stat_key) : []
    check(
      '5b. KEYU: re-selecting an already-selected stat is idempotent (no duplicate row) -> returns 6',
      reselectKey.ok &&
        Number(reselectKey.json) === 6 &&
        reselectKeys.length === 7 &&
        reselectKeys.filter((k) => k === 'hp').length === 1,
      `HTTP ${reselectKey.status} rows=${JSON.stringify(reselectKeys)}`,
    )
    const deselectKey = await callRpc('set_key_stat_v2', ownerToken, {
      p_class: CLASS,
      p_function: 'dps',
      p_stat_key: 'sp',
      p_enabled: false,
    })
    check(
      '5c. KEYU: deselecting a key promotes the oldest relevant into the slot -> returns 6',
      deselectKey.ok && Number(deselectKey.json) === 6,
      `HTTP ${deselectKey.status} body=${deselectKey.text}`,
    )
    const promotedRows = await rest(`/class_key_stats?class_name=eq.${CLASS}&select=stat_key`, {
      token: ownerToken,
    })
    const promotedKeys = Array.isArray(promotedRows.json) ? promotedRows.json.map((r) => r.stat_key).sort() : []
    const EXPECTED_AFTER_PROMOTION = [...KEY_STATS.filter((k) => k !== 'sp'), RELEVANT_STATS[0]].sort()
    check(
      '5d. KEYU: promoted relevant is in the key set, deselected key is gone (ordered set read)',
      promotedRows.ok &&
        JSON.stringify(promotedKeys) === JSON.stringify(EXPECTED_AFTER_PROMOTION),
      `rows=${JSON.stringify(promotedKeys)}`,
    )
    const deselectPromoted = await callRpc('set_key_stat_v2', ownerToken, {
      p_class: CLASS,
      p_function: 'dps',
      p_stat_key: RELEVANT_STATS[0],
      p_enabled: false,
    })
    check(
      '5e. KEYU: deselecting a key with NO relevant left drops the count -> returns 5',
      deselectPromoted.ok && Number(deselectPromoted.json) === 5,
      `HTTP ${deselectPromoted.status} body=${deselectPromoted.text}`,
    )
    const restoreSp = await callRpc('set_key_stat_v2', ownerToken, {
      p_class: CLASS,
      p_function: 'dps',
      p_stat_key: 'sp',
      p_enabled: true,
    })
    check(
      '5f. setup: re-select sp -> returns 6 (canonical key set restored)',
      restoreSp.ok && Number(restoreSp.json) === 6,
      `HTTP ${restoreSp.status}`,
    )
    // The 0028 owner rule end-to-end: through the whole ordered-set churn the
    // member card strip stays exactly the 6 canonical keys (relevants NEVER
    // appear on it) and the OVR is unchanged (compute-on-read stability).
    const cardAfterChurn = await callRpc('my_card', memberToken, {})
    const churnKeys = Array.isArray(cardAfterChurn.json?.key_stats)
      ? cardAfterChurn.json.key_stats.map((s) => s.stat_key).sort()
      : []
    check(
      '5g. 0028 owner rule: my_card key_stats stays the canonical 6 through the churn (relevants never on the strip) and ovr is unchanged',
      cardAfterChurn.ok &&
        JSON.stringify(churnKeys) === JSON.stringify([...KEY_STATS].sort()) &&
        Number(cardAfterChurn.json?.ovr?.value) === Number(card.ovr.value),
      `keys=${JSON.stringify(churnKeys)} ovr=${cardAfterChurn.json?.ovr?.value} (was ${card.ovr?.value})`,
    )

    // ---- Probe 6 (RANK-02/D-20): role_rank boundary ------------------------
    const memberRank = await callRpc('role_rank', memberToken, { p_function: 'dps' })
    check(
      '6a. member POST /rpc/role_rank -> non-2xx forbidden (server-side, not tab-hiding)',
      !memberRank.ok && memberRank.text.includes('forbidden'),
      `HTTP ${memberRank.status}`,
    )
    const bogusRank = await callRpc('role_rank', ownerToken, { p_function: 'bogus' })
    check(
      "6b. staff role_rank('bogus') -> non-2xx invalid_function (whitelist before other checks)",
      !bogusRank.ok && bogusRank.text.includes('invalid_function'),
      `HTTP ${bogusRank.status}`,
    )
    const staffRank = await callRpc('role_rank', ownerToken, { p_function: 'dps' })
    const rankRows = Array.isArray(staffRank.json) ? staffRank.json : []
    check(
      "6c. staff role_rank('dps') -> 2xx jsonb array with rows",
      staffRank.ok && rankRows.length > 0,
      `HTTP ${staffRank.status}, rows=${rankRows.length}`,
    )
    check(
      "6d. every row has char_function='dps' (role-primary board, D-18)",
      rankRows.every((r) => r.char_function === 'dps'),
      `fns=${JSON.stringify([...new Set(rankRows.map((r) => r.char_function))])}`,
    )
    // Server order: ovr desc nulls last, display_name — non-increasing ovrs,
    // nulls only at the tail (the client never re-sorts, D-18/D-20).
    let orderOk = true
    let seenNull = false
    for (const r of rankRows) {
      if (r.ovr === null || r.ovr === undefined) {
        seenNull = true
      } else if (seenNull) {
        orderOk = false
      }
    }
    for (let i = 1; i < rankRows.length; i++) {
      const prev = rankRows[i - 1].ovr
      const cur = rankRows[i].ovr
      if (prev !== null && prev !== undefined && cur !== null && cur !== undefined && Number(cur) > Number(prev)) {
        orderOk = false
      }
    }
    check('6e. server order ovr desc nulls last (non-increasing, nulls only at tail)', orderOk, `rows=${rankRows.length}`)
    const statsShapeOk = rankRows.every(
      (r) =>
        Array.isArray(r.stats) &&
        r.stats.length === 59 &&
        r.stats.every((s) => 'label_short' in s && 'class_average' in s && 'points' in s && 'value' in s),
    )
    check(
      '6f. every row stats length 59 incl label_short + class_average (D-20 value+points+avg)',
      statsShapeOk,
      rankRows[0] ? `stats0=${rankRows[0].stats.length}` : 'no rows',
    )
    const fixtureRank = await callRpc('role_rank', ownerToken, { p_function: 'dps', p_class: CLASS })
    const fixtureRows = Array.isArray(fixtureRank.json) ? fixtureRank.json : []
    const fixtureNames = fixtureRows.map((r) => r.display_name)
    check(
      "6g. role_rank('dps', fixtureClass) filters to the fixture class (3 rows, D-18 class filter)",
      fixtureRank.ok &&
        fixtureRows.length === 3 &&
        fixtureRows.every((r) => r.char_class === CLASS),
      `rows=${JSON.stringify(fixtureNames)}`,
    )
    check(
      '6h. fixture board ordered by OVR desc: c(300s) > b(200s) > a(100s)',
      fixtureRows.length === 3 &&
        fixtureNames[0] === DISPLAY[HANDLES.c] &&
        fixtureNames[1] === DISPLAY[HANDLES.b] &&
        fixtureNames[2] === DISPLAY[HANDLES.a],
      `order=${JSON.stringify(fixtureNames)}`,
    )
    check(
      '6i. fixture rows carry member_id (composite React keys, 07.2 research pitfall 11)',
      fixtureRows.every((r) => typeof r.member_id === 'string' && r.member_id.length > 0),
      'member_id present',
    )

    // ---- Probe 7 (D-13): get_promotion highlights = class key stats -------
    const memberPromo = await callRpc('get_promotion', memberToken, {})
    check('7a. member POST /rpc/get_promotion -> 2xx jsonb array', memberPromo.ok && Array.isArray(memberPromo.json), `HTTP ${memberPromo.status}`)
    const sections = Array.isArray(memberPromo.json) ? memberPromo.json : []
    const promoSection = sections.find((s) => s.class_name === CLASS)
    const promoCards = promoSection && Array.isArray(promoSection.cards) ? promoSection.cards : []
    check(
      '7b. fixture class section present with 3 cards',
      !!promoSection && promoCards.length === 3,
      `cards=${promoCards.length}`,
    )
    const hlSetOk =
      promoCards.length > 0 &&
      promoCards.every((c) => {
        const keys = (c.highlights || []).map((h) => h.stat_key).sort()
        return JSON.stringify(keys) === JSON.stringify([...KEY_STATS].sort())
      })
    check(
      '7c. D-13: every card highlights stat_keys == the class 6 key stats (order-insensitive set equality)',
      hlSetOk,
      promoCards[0] ? `card0=${JSON.stringify((promoCards[0].highlights || []).map((h) => h.stat_key).sort())}` : 'no cards',
    )
    const HL_FIELDS = ['stat_key', 'label', 'label_short', 'value_type', 'value', 'points'].sort()
    const hlClosed =
      promoCards.length > 0 &&
      promoCards.every((c) =>
        (c.highlights || []).every((h) => JSON.stringify(Object.keys(h).sort()) === JSON.stringify(HL_FIELDS)),
      )
    check(
      '7d. highlight field list closed {stat_key,label,label_short,value_type,value,points}',
      hlClosed,
      promoCards[0] && promoCards[0].highlights[0]
        ? JSON.stringify(Object.keys(promoCards[0].highlights[0]).sort())
        : 'n/a',
    )
    check(
      '7e. every highlight carries a non-empty label_short',
      promoCards.length > 0 &&
        promoCards.every((c) => (c.highlights || []).every((h) => typeof h.label_short === 'string' && h.label_short.length > 0)),
      'label_short present',
    )
    // 7f. 07.2-05 round 7 (owner decision 3, photo consistency): every card
    // row carries the member's card-photos STORAGE PATH (server-composed
    // `<uuid>/card.jpg` inside the private bucket) — Destaques shows the
    // submitted photo, the client fetches it as a blob under the bucket's
    // active-members read RLS.
    const PHOTO_PATH_RE = /^card-photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/card\.jpg$/
    check(
      '7f. every card carries photo_path (card-photos/<member-uuid>/card.jpg)',
      promoCards.length > 0 && promoCards.every((c) => typeof c.photo_path === 'string' && PHOTO_PATH_RE.test(c.photo_path)),
      promoCards[0] ? String(promoCards[0].photo_path) : 'n/a',
    )

    // ---- Probe 8: my_card relevant_stat_keys read path ----------------------
    // 0018 kept class_relevant_stats as a vestigial table (no RPC writes it
    // anymore — set_relevant_stat was dropped), and the my_card body still
    // reads it for relevant_stat_keys (0028/0036 byte-preserved read). Seed
    // one row service-level (mgmtQuery, cleaned by cleanup()) and prove the
    // card mirrors the live tier — then that removal reflects too.
    await mgmtQuery(
      `insert into class_relevant_stats (class_name, stat_key) values ('${CLASS}', '${RELEVANT_STATS[0]}');`,
    )
    const seededRead = await rest(`/class_relevant_stats?class_name=eq.${CLASS}&select=stat_key`, {
      token: ownerToken,
    })
    const seededKeys = Array.isArray(seededRead.json) ? seededRead.json.map((r) => r.stat_key) : []
    check(
      '8a. setup: class_relevant_stats row seeded service-level and staff-visible',
      seededRead.ok && JSON.stringify(seededKeys) === JSON.stringify([RELEVANT_STATS[0]]),
      `rows=${JSON.stringify(seededKeys)}`,
    )
    const cardWithRelevant = await callRpc('my_card', memberToken, {})
    check(
      '8b. my_card relevant_stat_keys mirrors the live relevant tier',
      cardWithRelevant.ok &&
        JSON.stringify(cardWithRelevant.json.relevant_stat_keys) === JSON.stringify([RELEVANT_STATS[0]].sort()),
      `relevant=${JSON.stringify(cardWithRelevant.json?.relevant_stat_keys)}`,
    )
    await mgmtQuery(
      `delete from class_relevant_stats where class_name = '${CLASS}' and stat_key = '${RELEVANT_STATS[0]}';`,
    )
    const cardWithoutRelevant = await callRpc('my_card', memberToken, {})
    check(
      '8c. my_card relevant_stat_keys back to [] after the row is removed',
      cardWithoutRelevant.ok &&
        JSON.stringify(cardWithoutRelevant.json.relevant_stat_keys) === JSON.stringify([]),
      `relevant=${JSON.stringify(cardWithoutRelevant.json?.relevant_stat_keys)}`,
    )

    // ---- Probe 10 (07.2-05 round 8 UNIFICATION): my_card ≡ get_promotion --
    // Ratings are universal (owner round 8: "Ratings are an universal
    // measurement, once calculated they must be displayed equally. the card
    // the player sees in the panel must be the same one available in
    // destaques"). For the SAME member + latest submission, every key-stat
    // points value and the OVR my_card returns must EXACTLY equal the
    // values get_promotion returns — the server-side single source of truth
    // (get_promotion delegates to the my_card cohort basis: class+function,
    // points rounded 2dp). Catches the round-7 defect where get_promotion's
    // cmp ranked on the function-only pool (86 vs 78 for the same value).
    const parityCard = await callRpc('my_card', memberToken, {})
    const parityPromo = await callRpc('get_promotion', memberToken, {})
    const pCard = parityCard.json || {}
    const pSections = Array.isArray(parityPromo.json) ? parityPromo.json : []
    const pSection = pSections.find((s) => s.class_name === CLASS)
    const pCards = pSection && Array.isArray(pSection.cards) ? pSection.cards : []
    const pCardRow = pCards.find((c) => c.display_name === DISPLAY[HANDLES.a])
    check(
      '10a. parity precondition: member a is OVR-ranked in its class top-5 (pristine-rank card exists)',
      !!pCardRow && typeof pCardRow.ovr === 'number',
      pCardRow ? `ovr=${pCardRow.ovr}` : 'member a missing from get_promotion',
    )
    const myPoints = Object.fromEntries((pCard.key_stats || []).map((k) => [k.stat_key, k]))
    const promoPoints = Object.fromEntries((pCardRow?.highlights || []).map((h) => [h.stat_key, h]))
    let pointsParity = true
    let valueParity = true
    let detail = []
    for (const stat_key of KEY_STATS) {
      const mine = myPoints[stat_key]
      const promo = promoPoints[stat_key]
      if (!mine || !promo || mine.points !== promo.points || mine.own_value !== promo.value) {
        pointsParity = false
        detail.push(`${stat_key}: mine=${mine?.points}/${mine?.own_value} promo=${promo?.points}/${promo?.value}`)
      } else if (mine.own_value !== promo.value) {
        valueParity = false
        detail.push(`${stat_key}: value ${mine.own_value} ≠ ${promo.value}`)
      }
    }
    check(
      '10b. my_card points + own_value === get_promotion points + value for ALL 6 key stats (exact)',
      pointsParity && valueParity,
      detail.length ? detail.join(' | ') : '6/6 stats identical',
    )
    const ovrParity =
      pCardRow && pCard.ovr && pCard.ovr.value !== null && Number(pCardRow.ovr) === Number(pCard.ovr.value)
    check(
      '10c. my_card ovr.value === get_promotion ovr (same member, same cohort math — exact equality)',
      ovrParity,
      `mine=${pCard.ovr?.value} promo=${pCardRow?.ovr}`,
    )

    // ---- Probes 10d/10e (10.1-02 UNIF-04): the rest of the parity contract --
    // 0036 unified ALL six OVR surfaces onto the Phase 9 value-proportional
    // formula; 10a-10c lock my_card ≡ get_promotion. 10d locks the Ranking
    // tab basis (role_rank — the 0024 fork surface), 10e locks the Painel
    // OVR hero basis (my_report). Exact number equality, same fixture member.
    const unifyRank = await callRpc('role_rank', ownerToken, {
      p_function: ROLES[HANDLES.a][1],
      p_class: CLASS,
    })
    const unifyRows = Array.isArray(unifyRank.json) ? unifyRank.json : []
    const unifyRowA = unifyRows.find((r) => r.display_name === DISPLAY[HANDLES.a])
    check(
      '10d. role_rank ovr === my_card ovr.value for member a (Ranking tab ≡ Painel card — exact equality)',
      unifyRank.ok &&
        !!unifyRowA &&
        unifyRowA.ovr !== null &&
        unifyRowA.ovr !== undefined &&
        Number(unifyRowA.ovr) === Number(pCard.ovr?.value),
      unifyRowA
        ? `rank=${unifyRowA.ovr} card=${pCard.ovr?.value}`
        : `HTTP ${unifyRank.status}, member a row missing from the fixture board`,
    )
    const unifyReport = await callRpc('my_report', memberToken, {})
    const unifyReportOvr = unifyReport.json?.ovr?.value
    check(
      '10e. my_report ovr.value === my_card ovr.value for member a (Painel OVR hero ≡ card — exact equality)',
      unifyReport.ok &&
        unifyReportOvr !== null &&
        unifyReportOvr !== undefined &&
        Number(unifyReportOvr) === Number(pCard.ovr?.value),
      `report=${unifyReportOvr} card=${pCard.ovr?.value}`,
    )

    // ---- Probe 9: rank engine regression (set_key_stat supersession) ------
    const { spawnSync } = await import('node:child_process')
    const rankRun = spawnSync('node', ['scripts/smoke-rank.mjs'], { stdio: 'inherit', env: process.env })
    check(
      '9. regression: node scripts/smoke-rank.mjs exits 0 (set_key_stat supersession did not regress the rank engine)',
      rankRun.status === 0,
      `exit=${rankRun.status}`,
    )
  } finally {
    // Guaranteed cleanup — runs even when an assertion/setup threw mid-run.
    try {
      await cleanup()
      console.log('PASS: cleanup removed submissions, members, class, login-attempt rows')
      await zeroResidueCensus()
    } catch (err) {
      console.error(`CLEANUP FAILED (manual residue removal needed): ${err?.message || err}`)
      process.exitCode = 1
    }
  }

  if (failures.length === 0) {
    console.log(`CARD SMOKE PASSED ${total.expected}/${total.expected}`)
  } else {
    console.error(`CARD SMOKE FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[smoke-card] FAILED: ${err?.message || err}`)
  process.exit(1)
})
