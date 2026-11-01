#!/usr/bin/env node
/**
 * NeoFoot Escalação smoke (plan 10.4-01 task 2 + 0056, LNUP-01..04).
 *
 * Live probes against migrations 0040/0044/0056. Throwaway fixtures
 * (smoke_lineup_officer, smoke_lineup_member) are created per run and removed
 * in finally. The live escalação is mutated only through the real RPCs and is
 * restored from a snapshot taken before the run; the final state is compared
 * against that snapshot.
 *
 * Probes:
 *   A. seed shape: 16 Vigrid parties / 80 filled slots / 40 per raid; the 3
 *      seeded Emperium raids (24 parties / 120 empty slots); role labels;
 *      zero smoke/dummy members in any lineup.
 *   B. member read: get_lineups() + get_lineups_mode('emperium') 200 with a
 *      closed field list (no ovr, points, stats, key-stat config, pin_hash);
 *      roster count equals the live assignable roster; fixture members absent.
 *   C. member writes denied: slot/label/raid-count -> forbidden; direct table
 *      PATCH denied; direct table SELECT allowed.
 *   D. officer writes (Vigrid): smoke member rejected (invalid_lineup_member);
 *      swap two slots; clear a slot (N/5 -> 4/5); cross-raid move; label edit +
 *      clear; over-long label rejected (invalid_lineup_label). Emperium: grow to
 *      4 raids, seat a member, refuse removing a non-empty raid, clear + shrink
 *      to 3, refuse below the two-raid minimum.
 *   E. restore: live lineup identical to the pre-run snapshot (zero residue).
 *
 * Credentials come from smoke-config.mjs (env or .env). Never prints token,
 * handle or PIN values.
 */
import bcrypt from 'bcryptjs'
import { supabaseConfig, FIXTURE_PIN } from './smoke-config.mjs'

let SUPABASE_URL, ANON_KEY, MGMT_TOKEN, PROJECT_REF
try {
  ;({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    mgmtToken: MGMT_TOKEN,
    projectRef: PROJECT_REF,
  } = supabaseConfig())
} catch (err) {
  console.error(`[smoke-lineup] ${err.message}`)
  process.exit(1)
}

const HANDLES = { officer: 'smoke_lineup_officer', member: 'smoke_lineup_member' }
const ALL_HANDLES = Object.values(HANDLES)
const IN_FIXTURES = `(${ALL_HANDLES.map((h) => `'${h}'`).join(',')})`
const FORBIDDEN_KEYS = ['ovr', 'points', 'stats', 'pin_hash', 'key_stat', 'class_average', 'own_value', 'value']
const EXPECTED_LABELS = {
  'vigrid_field:5': 'MOBS CIMA/BAIXO',
  'vigrid_field:6': 'MOBS DIREITA/ESQUERDA',
  'ruinscape:3': 'MOBS CIMA/BAIXO',
  'ruinscape:4': 'MOBS DIREITA/ESQUERDA',
}

const failures = []
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS: ${name}${detail ? ` (${detail})` : ''}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` (${detail})` : ''}`)
    failures.push(name)
  }
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
}

/** Login through the deployed verify-pin function; keeps the device_fp claim. */
async function login(handle) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ discord_handle: handle, pin: FIXTURE_PIN }),
  })
  const body = await res.json().catch(() => null)
  const token = body?.session?.access_token
  if (!res.ok || !token) throw new Error(`login failed for fixture: HTTP ${res.status}`)
  const claims = jwtPayload(token)
  if (!claims.device_fp) throw new Error('fixture session carries no device_fp claim')
  return { token, fp: claims.device_fp, role: claims.member_role, memberId: claims.member_id }
}

/** PostgREST call as a session; sends the device fingerprint the claim carries. */
async function rest(path, { method = 'GET', session, body = null, extra = {} } = {}) {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${session.token}`, 'X-Device-Fingerprint': session.fp, ...extra }
  if (body !== null) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, ok: res.ok, json, text }
}

/** Service-level Management API query (legacy /v1 endpoint). */
async function mgmt(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`mgmt query failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : []
}

async function snapshot() {
  const slots = await mgmt(
    `select war_mode, battlefield, raid_index, party_index, slot_index, member_id ` +
      `from lineup_slots order by war_mode, battlefield, party_index, slot_index;`,
  )
  const parties = await mgmt(
    `select war_mode, battlefield, raid_index, party_index, role_label ` +
      `from lineup_parties order by war_mode, battlefield, party_index;`,
  )
  const config = await mgmt(`select war_mode, raid_count from lineup_war_config order by war_mode;`)
  return { slots, parties, config }
}

function slotMember(snap, bf, party, slot, warMode = 'vigrid') {
  return (
    snap.slots.find(
      (s) =>
        s.war_mode === warMode &&
        s.battlefield === bf &&
        s.party_index === party &&
        s.slot_index === slot,
    )?.member_id ?? null
  )
}

async function restore(snap) {
  const stmts = ['update lineup_slots set member_id = null where true;']
  const emperium = snap.config.find((c) => c.war_mode === 'emperium')
  const maxRaid = emperium?.raid_count ?? 3
  stmts.push(`delete from lineup_parties where war_mode='emperium' and raid_index > ${maxRaid};`)

  for (const p of snap.parties) {
    const label = p.role_label === null ? 'null' : `'${p.role_label.replace(/'/g, "''")}'`
    stmts.push(
      `insert into lineup_parties (war_mode, battlefield, raid_index, party_index, role_label) ` +
        `values ('${p.war_mode}', '${p.battlefield}', ${p.raid_index}, ${p.party_index}, ${label}) ` +
        `on conflict (war_mode, battlefield, party_index) do update ` +
        `set raid_index = excluded.raid_index, role_label = excluded.role_label;`,
    )
  }
  for (const s of snap.slots) {
    const member = s.member_id ? `'${s.member_id}'` : 'null'
    stmts.push(
      `insert into lineup_slots (war_mode, battlefield, raid_index, party_index, slot_index, member_id) ` +
        `values ('${s.war_mode}', '${s.battlefield}', ${s.raid_index}, ${s.party_index}, ${s.slot_index}, ${member}) ` +
        `on conflict (war_mode, battlefield, party_index, slot_index) do update ` +
        `set raid_index = excluded.raid_index, member_id = excluded.member_id;`,
    )
  }
  for (const c of snap.config) {
    stmts.push(
      `insert into lineup_war_config (war_mode, raid_count) values ('${c.war_mode}', ${c.raid_count}) ` +
        `on conflict (war_mode) do update set raid_count = excluded.raid_count;`,
    )
  }
  await mgmt(stmts.join('\n'))
}

async function cleanupFixtures() {
  await mgmt(`delete from members where discord_handle in ${IN_FIXTURES};`)
  await mgmt(`delete from pin_login_attempts where discord_handle in ${IN_FIXTURES};`)
}

async function createFixtures() {
  const pinHash = bcrypt.hashSync(FIXTURE_PIN, 10)
  await mgmt(
    `insert into members (discord_handle, display_name, pin_hash, role, active, char_class, char_function) values ` +
      `('${HANDLES.officer}', 'SMOKE Lineup Officer', '${pinHash}', 'officer', true, null, 'dps'), ` +
      `('${HANDLES.member}', 'SMOKE Lineup Member', '${pinHash}', 'member', true, null, 'dps');`,
  )
  const rows = await mgmt(`select discord_handle, id from members where discord_handle in ${IN_FIXTURES};`)
  return Object.fromEntries(rows.map((r) => [r.discord_handle, r.id]))
}

function fieldsExact(obj, keys) {
  return obj && typeof obj === 'object' && JSON.stringify(Object.keys(obj).sort()) === JSON.stringify([...keys].sort())
}

async function main() {
  console.log('[smoke-lineup] pre-run cleanup (fixtures only)')
  await cleanupFixtures()
  const snap0 = await snapshot()
  let fixtureIds = {}

  try {
    // ---- A. seed shape ----------------------------------------------------
    const partyCount = (
      await mgmt(`select count(*)::int as n from lineup_parties where war_mode='vigrid';`)
    )[0].n
    const slotRows = await mgmt(
      `select count(*)::int as total, count(member_id)::int as filled, ` +
        `count(*) filter (where battlefield='vigrid_field' and member_id is not null)::int as vigrid, ` +
        `count(*) filter (where battlefield='ruinscape' and member_id is not null)::int as ruin ` +
        `from lineup_slots where war_mode='vigrid';`,
    )
    check('A1 16 Vigrid parties seeded', partyCount === 16, `parties=${partyCount}`)
    check(
      'A2 80 Vigrid slots, all filled, 40 per raid',
      slotRows[0].total === 80 && slotRows[0].filled === 80 && slotRows[0].vigrid === 40 && slotRows[0].ruin === 40,
      `total=${slotRows[0].total} filled=${slotRows[0].filled} vigrid=${slotRows[0].vigrid} ruin=${slotRows[0].ruin}`,
    )
    const emperiumShape = (
      await mgmt(
        `select ` +
          `(select count(*)::int from lineup_parties where war_mode='emperium') as parties, ` +
          `(select count(distinct raid_index)::int from lineup_parties where war_mode='emperium') as raids, ` +
          `(select count(*)::int from lineup_slots where war_mode='emperium') as slots, ` +
          `(select count(member_id)::int from lineup_slots where war_mode='emperium') as filled, ` +
          `(select raid_count::int from lineup_war_config where war_mode='emperium') as configured;`,
      )
    )[0]
    check(
      'A5 Emperium seeded with 3 empty raids x 8 parties (24 parties / 120 slots)',
      emperiumShape.parties === 24 &&
        emperiumShape.raids === 3 &&
        emperiumShape.slots === 120 &&
        emperiumShape.filled === 0 &&
        emperiumShape.configured === 3,
      `parties=${emperiumShape.parties} raids=${emperiumShape.raids} slots=${emperiumShape.slots} filled=${emperiumShape.filled} config=${emperiumShape.configured}`,
    )
    const labelMap = Object.fromEntries(
      snap0.parties
        .filter((p) => p.war_mode === 'vigrid' && p.role_label !== null)
        .map((p) => [`${p.battlefield}:${p.party_index}`, p.role_label]),
    )
    // The owner may add extra labels over time, so assert the seeded four are
    // still in place instead of pinning the whole label map.
    const seededLabelsOk = Object.entries(EXPECTED_LABELS).every(
      ([key, value]) => labelMap[key] === value,
    )
    check(
      'A3 default role labels still present on Raid 1 G5/G6 and Raid 2 G3/G4',
      seededLabelsOk,
      `labels=${Object.keys(labelMap).length}`,
    )
    const smokeInLineup = (
      await mgmt(
        `select count(*)::int as n from lineup_slots s join members m on m.id = s.member_id ` +
          `where m.discord_handle ilike 'smoke%' or m.discord_handle ilike 'dummy-%';`,
      )
    )[0].n
    check('A4 zero smoke/dummy members in the lineup', smokeInLineup === 0, `count=${smokeInLineup}`)

    // ---- fixtures + sessions ---------------------------------------------
    fixtureIds = await createFixtures()
    const member = await login(HANDLES.member)
    const officer = await login(HANDLES.officer)
    check('setup: fixture sessions minted', member.role === 'member' && officer.role === 'officer', `roles=${member.role}/${officer.role}`)

    // ---- B. member read ---------------------------------------------------
    const read = await rest('/rpc/get_lineups', { method: 'POST', session: member, body: {} })
    check('B1 member get_lineups HTTP 200', read.status === 200, `status=${read.status}`)
    const p = read.json || {}
    check(
      'B2 top-level fields closed to the mode payload + roster',
      fieldsExact(p, ['war_mode', 'raid_count', 'min_raids', 'max_raids', 'battlefields', 'roster']),
      `keys=${Object.keys(p).join(',')}`,
    )
    const bfs = p.battlefields || []
    check(
      'B3 two Vigrid raids x 8 parties with raid_index',
      p.war_mode === 'vigrid' &&
        p.raid_count === 2 &&
        bfs.length === 2 &&
        bfs.every((b) => b.parties.length === 8 && typeof b.raid_index === 'number') &&
        bfs.every((b) => fieldsExact(b, ['battlefield', 'raid_index', 'parties'])),
      `bfs=${bfs.length}`,
    )
    const partyKeysOk = bfs.every((b) => b.parties.every((pt) => fieldsExact(pt, ['party_index', 'role_label', 'filled', 'slots'])))
    const slotKeysOk = bfs.every((b) => b.parties.every((pt) => pt.slots.length === 5 && pt.slots.every((sl) => fieldsExact(sl, ['slot_index', 'member_id', 'display_name', 'char_class', 'char_function']))))
    check('B4 party and slot objects use the closed field list', partyKeysOk && slotKeysOk)
    const rosterKeysOk = (p.roster || []).every((r) => fieldsExact(r, ['member_id', 'display_name', 'char_class', 'char_function']))
    check('B5 roster rows use the closed field list', rosterKeysOk)
    const leaks = FORBIDDEN_KEYS.filter((k) => read.text.includes(`"${k}":`))
    check('B6 no stats, points, OVR, key-stat config or pin_hash in the payload', leaks.length === 0, leaks.length ? `leaked=${leaks.join(',')}` : '')
    const expectedRoster = (await mgmt(
      `select count(*)::int as n from members m where m.active and m.discord_handle not ilike 'smoke%' and m.discord_handle not ilike 'dummy-%';`,
    ))[0].n
    check('B7 roster equals the live assignable roster', (p.roster || []).length === expectedRoster, `roster=${(p.roster || []).length} expected=${expectedRoster}`)
    const fixtureIdSet = new Set(Object.values(fixtureIds))
    const fixtureLeak = (p.roster || []).some((r) => fixtureIdSet.has(r.member_id))
    check('B8 smoke fixture members absent from the roster', !fixtureLeak)
    const empRead = await rest('/rpc/get_lineups_mode', {
      method: 'POST', session: member, body: { p_war_mode: 'emperium' },
    })
    const ep = empRead.json || {}
    check(
      'B9 member reads the 3 Emperium raids via get_lineups_mode',
      empRead.status === 200 &&
        ep.war_mode === 'emperium' &&
        ep.raid_count === 3 &&
        ep.battlefields?.length === 3 &&
        ep.battlefields.every((b) => b.parties.length === 8 && typeof b.raid_index === 'number'),
      `status=${empRead.status} raids=${ep.battlefields?.length}`,
    )

    // ---- C. member writes denied, reads allowed ---------------------------
    const memberSlot = await rest('/rpc/set_lineup_slot', {
      method: 'POST', session: member, body: { p_battlefield: 'vigrid_field', p_party: 8, p_slot: 5, p_member: null },
    })
    check('C1 member set_lineup_slot forbidden', !memberSlot.ok && memberSlot.text.includes('forbidden'), `status=${memberSlot.status}`)
    const memberLabel = await rest('/rpc/set_lineup_party_label', {
      method: 'POST', session: member, body: { p_battlefield: 'vigrid_field', p_party: 2, p_label: 'X' },
    })
    check('C2 member set_lineup_party_label forbidden', !memberLabel.ok && memberLabel.text.includes('forbidden'), `status=${memberLabel.status}`)
    const directWrite = await rest('/lineup_slots?battlefield=eq.vigrid_field&party_index=eq.8&slot_index=eq.5', {
      method: 'PATCH', session: member, body: { member_id: null },
    })
    const stillSeated = (await mgmt(
      `select count(*)::int as n from lineup_slots where battlefield='vigrid_field' and party_index=8 and slot_index=5 and member_id is not null;`,
    ))[0].n === 1
    check('C3 member direct table write denied (slot unchanged)', !directWrite.ok && stillSeated, `status=${directWrite.status}`)
    const directRead = await rest('/lineup_slots?select=slot_index&limit=5', { session: member })
    check('C4 member direct table read allowed (active member)', directRead.status === 200 && Array.isArray(directRead.json) && directRead.json.length === 5, `status=${directRead.status}`)
    const memberRaids = await rest('/rpc/set_lineup_raid_count', {
      method: 'POST', session: member, body: { p_war_mode: 'emperium', p_raid_count: 4 },
    })
    check('C5 member set_lineup_raid_count forbidden', !memberRaids.ok && memberRaids.text.includes('forbidden'), `status=${memberRaids.status}`)

    // ---- D. officer writes ------------------------------------------------
    // Device guard (0041 / 0024 design): a wrong or missing X-Device-Fingerprint
    // must raise device_mismatch before any role check, and write nothing.
    const wrongFp = await rest('/rpc/set_lineup_slot', {
      method: 'POST', session: officer, extra: { 'X-Device-Fingerprint': '0'.repeat(64) },
      body: { p_battlefield: 'vigrid_field', p_party: 8, p_slot: 5, p_member: null },
    })
    const noFp = await rest('/rpc/set_lineup_slot', {
      method: 'POST', session: officer, extra: { 'X-Device-Fingerprint': '' },
      body: { p_battlefield: 'vigrid_field', p_party: 8, p_slot: 5, p_member: null },
    })
    const stillFilled = (await mgmt(
      `select count(*)::int as n from lineup_slots where battlefield='vigrid_field' and party_index=8 and slot_index=5 and member_id is not null;`,
    ))[0].n === 1
    check(
      'D0 device guard: wrong or missing fingerprint -> device_mismatch, no write',
      !wrongFp.ok && wrongFp.text.includes('device_mismatch') && !noFp.ok && noFp.text.includes('device_mismatch') && stillFilled,
      `wrong=${wrongFp.status} missing=${noFp.status}`,
    )

    const smokeReject = await rest('/rpc/set_lineup_slot', {
      method: 'POST', session: officer, body: { p_battlefield: 'vigrid_field', p_party: 1, p_slot: 1, p_member: fixtureIds[HANDLES.member] },
    })
    check('D1 smoke member rejected (invalid_lineup_member)', !smokeReject.ok && smokeReject.text.includes('invalid_lineup_member'), `status=${smokeReject.status}`)

    const txxx = slotMember(snap0, 'vigrid_field', 1, 2)
    const lanaya = slotMember(snap0, 'vigrid_field', 1, 3)
    const swap = await rest('/rpc/set_lineup_slot', {
      method: 'POST', session: officer, body: { p_battlefield: 'vigrid_field', p_party: 1, p_slot: 2, p_member: lanaya },
    })
    const afterSwap = await mgmt(
      `select party_index, slot_index, member_id from lineup_slots where battlefield='vigrid_field' and party_index=1 and slot_index in (2,3) order by slot_index;`,
    )
    check(
      'D2 officer swap moves both members (atomic)',
      swap.status === 200 && afterSwap[0].member_id === lanaya && afterSwap[1].member_id === txxx,
      `status=${swap.status}`,
    )

    const clear = await rest('/rpc/set_lineup_slot', {
      method: 'POST', session: officer, body: { p_battlefield: 'vigrid_field', p_party: 8, p_slot: 5, p_member: null },
    })
    const g8 = clear.json?.battlefields?.[0]?.parties?.[7]
    check('D3 clearing a slot shows N/5 -> 4/5', clear.status === 200 && g8?.filled === 4, `filled=${g8?.filled}`)

    const rn18 = slotMember(snap0, 'ruinscape', 8, 5)
    const cross = await rest('/rpc/set_lineup_slot', {
      method: 'POST', session: officer, body: { p_battlefield: 'vigrid_field', p_party: 8, p_slot: 5, p_member: rn18 },
    })
    const crossState = await mgmt(
      `select battlefield, member_id from lineup_slots where (battlefield='vigrid_field' and party_index=8 and slot_index=5) ` +
        `or (battlefield='ruinscape' and party_index=8 and slot_index=5);`,
    )
    const vigSlot = crossState.find((r) => r.battlefield === 'vigrid_field')
    const ruinSlot = crossState.find((r) => r.battlefield === 'ruinscape')
    check(
      'D4 cross-raid move vacates the source slot',
      cross.status === 200 && vigSlot?.member_id === rn18 && ruinSlot?.member_id === null,
    )

    const label = await rest('/rpc/set_lineup_party_label', {
      method: 'POST', session: officer, body: { p_battlefield: 'vigrid_field', p_party: 2, p_label: 'SMOKE LABEL' },
    })
    check('D5 officer label edit', label.status === 200 && label.json?.battlefields?.[0]?.parties?.[1]?.role_label === 'SMOKE LABEL')

    const longLabel = await rest('/rpc/set_lineup_party_label', {
      method: 'POST', session: officer, body: { p_battlefield: 'vigrid_field', p_party: 2, p_label: 'x'.repeat(41) },
    })
    check('D6 over-long label rejected (invalid_lineup_label)', !longLabel.ok && longLabel.text.includes('invalid_lineup_label'), `status=${longLabel.status}`)

    const unlabel = await rest('/rpc/set_lineup_party_label', {
      method: 'POST', session: officer, body: { p_battlefield: 'vigrid_field', p_party: 2, p_label: null },
    })
    check('D7 officer clears a label to null', unlabel.status === 200 && unlabel.json?.battlefields?.[0]?.parties?.[1]?.role_label === null)

    // ---- Emperium raid management (0056) ----------------------------------
    const grow = await rest('/rpc/set_lineup_raid_count', {
      method: 'POST', session: officer, body: { p_war_mode: 'emperium', p_raid_count: 4 },
    })
    check(
      'D8 officer grows Emperium to 4 raids (4 x 8 parties returned)',
      grow.status === 200 &&
        grow.json?.war_mode === 'emperium' &&
        grow.json?.raid_count === 4 &&
        grow.json?.battlefields?.length === 4 &&
        grow.json?.battlefields?.every((b) => b.parties.length === 8),
      `status=${grow.status} raids=${grow.json?.battlefields?.length}`,
    )

    const emperiumMember = grow.json?.roster?.[0]?.member_id
    const seat = await rest('/rpc/set_lineup_slot_mode', {
      method: 'POST', session: officer,
      body: {
        p_war_mode: 'emperium',
        p_battlefield: 'emperium_raid_4',
        p_party: 1,
        p_slot: 1,
        p_member: emperiumMember,
      },
    })
    check(
      'D9 officer seats a member in Emperium Raid 4',
      seat.status === 200 && seat.json?.battlefields?.[3]?.parties?.[0]?.filled === 1,
      `status=${seat.status}`,
    )

    const blockedShrink = await rest('/rpc/set_lineup_raid_count', {
      method: 'POST', session: officer, body: { p_war_mode: 'emperium', p_raid_count: 3 },
    })
    check(
      'D10 removing a non-empty raid is refused (lineup_raid_not_empty)',
      !blockedShrink.ok && blockedShrink.text.includes('lineup_raid_not_empty'),
      `status=${blockedShrink.status}`,
    )

    const clearEmp = await rest('/rpc/set_lineup_slot_mode', {
      method: 'POST', session: officer,
      body: {
        p_war_mode: 'emperium',
        p_battlefield: 'emperium_raid_4',
        p_party: 1,
        p_slot: 1,
        p_member: null,
      },
    })
    const shrink = await rest('/rpc/set_lineup_raid_count', {
      method: 'POST', session: officer, body: { p_war_mode: 'emperium', p_raid_count: 3 },
    })
    check(
      'D11 officer clears and shrinks Emperium back to 3 raids',
      clearEmp.status === 200 && shrink.status === 200 && shrink.json?.raid_count === 3 && shrink.json?.battlefields?.length === 3,
      `status=${shrink.status} raids=${shrink.json?.battlefields?.length}`,
    )

    const tooFew = await rest('/rpc/set_lineup_raid_count', {
      method: 'POST', session: officer, body: { p_war_mode: 'emperium', p_raid_count: 1 },
    })
    check(
      'D12 below the two-raid minimum is refused (invalid_lineup_raid_count)',
      !tooFew.ok && tooFew.text.includes('invalid_lineup_raid_count'),
      `status=${tooFew.status}`,
    )
  } catch (err) {
    check('unexpected error during probes', false, err.message)
  } finally {
    console.log('[smoke-lineup] restoring the live lineup from the pre-run snapshot')
    try {
      await restore(snap0)
      const snap1 = await snapshot()
      check('E1 restore: live lineup identical to pre-run state (zero residue)', JSON.stringify(snap1) === JSON.stringify(snap0))
    } catch (err) {
      check('E1 restore: live lineup identical to pre-run state (zero residue)', false, err.message)
    }
    try {
      await cleanupFixtures()
      const left = (await mgmt(`select count(*)::int as n from members where discord_handle in ${IN_FIXTURES};`))[0].n
      check('E2 fixture members removed', left === 0, `left=${left}`)
    } catch (err) {
      check('E2 fixture members removed', false, err.message)
    }
  }

  if (failures.length) {
    console.log(`\n[smoke-lineup] FAILED: ${failures.length} check(s): ${failures.join('; ')}`)
    process.exit(1)
  }
  console.log('\n[smoke-lineup] all lineup probes passed')
}

main().catch((err) => {
  console.error(`[smoke-lineup] FAILED: ${err?.message || err}`)
  process.exit(1)
})
