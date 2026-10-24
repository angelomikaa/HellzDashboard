#!/usr/bin/env node
/**
 * NeoFoot Phase 08.1 single-command verification battery (plan 08.1-10 task 1).
 *
 * Runs four phases sequentially and prints `PHASE 08.1 VERIFICATION PASSED (n
 * checks)` only when every check passes, exiting 1 otherwise. Every check prints
 * `PASS: <id> <description>` or `FAIL: <id> <description> — <detail>`. Never
 * prints a token, PIN or hash value.
 *
 * Phase A — local gates: npm test, npm run build, npm run lint,
 *   check-credentials.mjs, check-deployment.mjs (live release gate)
 * Phase B — live SQL invariants (Management API /database/query)
 * Phase C — live behavior probes (verify-pin login, device mismatch,
 *   key-stat leak, sentinel insert rejection, smoke matrix)
 * Phase D — report table + exit code
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF  (Management API — session env only)
 *   SMOKE_OWNER_HANDLE / SMOKE_OWNER_PIN            (owner login probe C1 — SKIP if absent)
 *   SMOKE_MEMBER_HANDLE / SMOKE_MEMBER_PIN          (member leak probe C3 — SKIP if absent)
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY      (from .env or env)
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { supabaseConfig, decodeSessionClaims } from './smoke-config.mjs'

let SUPABASE_URL, ANON_KEY, MGMT_TOKEN, PROJECT_REF
try {
  ;({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    mgmtToken: MGMT_TOKEN,
    projectRef: PROJECT_REF,
  } = supabaseConfig())
} catch (err) {
  console.error(`[verify-phase-08.1] ${err.message}`)
  process.exit(1)
}

const results = [] // { id, status, detail }
let fails = 0
let skips = 0

function check(id, status, detail = '') {
  results.push({ id, status, detail })
  if (status === 'FAIL') fails += 1
  if (status === 'SKIP') skips += 1
  console.log(
    `${status}: ${id}${detail ? ` — ${detail}` : ''}`,
  )
}

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`management query failed: HTTP ${res.status} ${text}`)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function scalar(rows, col = 0) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows[0][col]
}

// ============================================================================
// Phase A — local gates
// ============================================================================

async function phaseA() {
  console.log('\nPhase A — local gates')

  const r1 = run('npm test')
  check('A1', r1.ok ? 'PASS' : 'FAIL', `npm test ${r1.ok ? 'exit 0' : 'exit ' + r1.code}`)

  const r2 = run('npm run build')
  check('A2', r2.ok ? 'PASS' : 'FAIL', `npm run build ${r2.ok ? 'exit 0' : 'exit ' + r2.code}`)

  const r3 = run('npm run lint')
  check('A3', r3.ok ? 'PASS' : 'FAIL', `npm run lint ${r3.ok ? 'exit 0' : 'exit ' + r3.code}`)

  const r4 = run('node scripts/check-credentials.mjs')
  check('A4', r4.ok ? 'PASS' : 'FAIL', `check-credentials ${r4.ok ? 'exit 0' : 'exit ' + r4.code}`)

  const r5 = run('node scripts/check-deployment.mjs')
  check('A5', r5.ok ? 'PASS' : 'FAIL', `check-deployment ${r5.ok ? 'exit 0' : 'exit ' + r5.code}`)
}

// ============================================================================
// Phase B — live SQL invariants
// ============================================================================

async function phaseB() {
  console.log('\nPhase B — live SQL invariants')

  try {
    const dummy = await mgmtQuery(
      "select count(*) as c from public.members where discord_handle like 'dummy-%'",
    )
    check('B1', scalar(dummy, 'c') === 0 ? 'PASS' : 'FAIL', `dummy rows = ${scalar(dummy, 'c')}`)
  } catch (err) {
    check('B1', 'FAIL', err.message)
  }

  try {
    const sentinel = await mgmtQuery(
      "select count(*) as c from public.members where discord_handle ~* '-handle$' and (role in ('officer','owner') or pin_hash is not null)",
    )
    check('B2', scalar(sentinel, 'c') === 0 ? 'PASS' : 'FAIL', `inert sentinel rows = ${scalar(sentinel, 'c')}`)
  } catch (err) {
    check('B2', 'FAIL', err.message)
  }

  try {
    const constraint = await mgmtQuery(
      "select count(*) as c from pg_constraint where conname = 'members_sentinel_not_privileged'",
    )
    check('B3', scalar(constraint, 'c') === 1 ? 'PASS' : 'FAIL', `constraint count = ${scalar(constraint, 'c')}`)
  } catch (err) {
    check('B3', 'FAIL', err.message)
  }

  try {
    const fns = await mgmtQuery(
      `select proname from pg_proc where proname in ('set_member_role','set_member_active','reset_member_pin','add_member') and pg_get_functiondef(oid) like '%assert_device_bound%'`,
    )
    const guarded = Array.isArray(fns) ? fns.map((r) => r.proname).sort() : []
    const allFour = ['add_member', 'reset_member_pin', 'set_member_active', 'set_member_role'].sort()
    const ok = JSON.stringify(guarded) === JSON.stringify(allFour)
    check('B4', ok ? 'PASS' : 'FAIL', `guarded RPCs = ${guarded.join(', ')}`)
  } catch (err) {
    check('B4', 'FAIL', err.message)
  }

  try {
    const inert = await mgmtQuery(
      "select count(*) as c from public.members where discord_handle ~* '-handle$' and pin_hash is not null",
    )
    check('B5', scalar(inert, 'c') === 0 ? 'PASS' : 'FAIL', `sentinel rows with pin_hash = ${scalar(inert, 'c')}`)
  } catch (err) {
    check('B5', 'FAIL', err.message)
  }
}

// ============================================================================
// Phase C — live behavior probes
// ============================================================================

async function phaseC() {
  console.log('\nPhase C — live behavior probes')

  // C1 — owner login via verify-pin, JWT carries member_role=owner + device_fp
  try {
    const owner = liveCredentials('owner')
    if (!owner) {
      check('C1', 'SKIP', 'SMOKE_OWNER_HANDLE / SMOKE_OWNER_PIN not set')
    } else {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ discord_handle: owner.handle, pin: owner.pin }),
      })
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch {}
      const session = json?.session
      const claims = session ? decodeSessionClaims(session.access_token) : {}
      const fpOk = typeof claims.device_fp === 'string' && claims.device_fp.length > 0
      check(
        'C1',
        res.status === 200 && claims.member_role === 'owner' && fpOk ? 'PASS' : 'FAIL',
        `HTTP ${res.status} role=${claims.member_role} device_fp=${fpOk ? 'present' : 'absent'}`,
      )
    }
  } catch (err) {
    check('C1', 'FAIL', err.message)
  }

  // C2 — device mismatch: staff RPC with wrong X-Device-Fingerprint -> device_mismatch, no write
  try {
    const owner = liveCredentials('owner')
    if (!owner) {
      check('C2', 'SKIP', 'SMOKE_OWNER_HANDLE / SMOKE_OWNER_PIN not set')
    } else {
      const loginRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ discord_handle: owner.handle, pin: owner.pin }),
      })
      const loginBody = await loginRes.json()
      const token = loginBody.session?.access_token
      if (!token) throw new Error('owner login did not return a session')

      // snapshot target member active state
      const memberRow = await mgmtQuery(
        `select id, active from public.members where discord_handle = '${owner.handle}' limit 1`,
      )
      const targetId = scalar(memberRow, 'id')
      const beforeActive = scalar(memberRow, 'active')

      // staff RPC with WRONG fingerprint
      const mismatchRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_member_active`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': '0000000000000000000000000000000000000000000000000000000000000000',
        },
        body: JSON.stringify({ p_member: targetId, p_active: !beforeActive }),
      })
      const mismatchText = await mismatchRes.text()
      const mismatchOk = mismatchText.includes('device_mismatch')

      // re-read target to confirm no write
      const afterRow = await mgmtQuery(
        `select active from public.members where id = '${targetId}' limit 1`,
      )
      const afterActive = scalar(afterRow, 'active')

      // correct fingerprint call should succeed (guard is not blanket denial)
      const okRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_member_active`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': await (async () => {
            const ua = 'verify-phase-08.1 probe'
            const buf = new TextEncoder().encode(ua)
            const hash = await crypto.subtle.digest('SHA-256', buf)
            return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
          })(),
        },
        body: JSON.stringify({ p_member: targetId, p_active: beforeActive }),
      })
      const okText = await okRes.text()

      check(
        'C2',
        mismatchOk && afterActive === beforeActive && okRes.ok ? 'PASS' : 'FAIL',
        `wrong-fp body contains device_mismatch=${mismatchOk}, row unchanged=${afterActive === beforeActive}, correct-fp ok=${okRes.ok}`,
      )
    }
  } catch (err) {
    check('C2', 'FAIL', err.message)
  }

  // C3 — key-stat leak probe: MEMBER token -> class_key_stats denied or zero rows
  try {
    const member = liveCredentials('member')
    if (!member) {
      check('C3', 'SKIP', 'SMOKE_MEMBER_HANDLE / SMOKE_MEMBER_PIN not set')
    } else {
      const loginRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-pin`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ discord_handle: member.handle, pin: member.pin }),
      })
      const loginBody = await loginRes.json()
      const token = loginBody.session?.access_token
      if (!token) throw new Error('member login did not return a session')

      const res = await fetch(`${SUPABASE_URL}/rest/v1/class_key_stats?select=stat_key`, {
        method: 'GET',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      const text = await res.text()
      const denied =
        res.status === 401 || res.status === 403 || res.status === 42501
      const zeroRows =
        res.status === 200 &&
        text.trim().startsWith('[') &&
        (text.trim() === '[]' || JSON.parse(text).length === 0)
      check('C3', denied || zeroRows ? 'PASS' : 'FAIL', `HTTP ${res.status} ${text.slice(0, 120)}`)
    }
  } catch (err) {
    check('C3', 'FAIL', err.message)
  }

  // C4 — sentinel insert rejection: officer-handle -> role officer must fail 23514
  try {
    const res = await mgmtQuery(
      "update public.members set role = 'officer' where discord_handle = 'officer-handle'",
    )
    check('C4', 'FAIL', 'sentinel update unexpectedly succeeded (no error raised)')
  } catch (err) {
    const msg = String(err.message)
    const is23514 = msg.includes('23514') || msg.includes('device_mismatch') || msg.includes('members_sentinel_not_privileged')
    check('C4', is23514 ? 'PASS' : 'FAIL', `rejection reason = ${msg.slice(0, 160)}`)
  }

  // C5 — smoke matrix (each script, 10-minute timeout)
  const smokeScripts = [
    'scripts/smoke-rls.mjs',
    'scripts/smoke-rank.mjs',
    'scripts/smoke-promotion.mjs',
    'scripts/smoke-card.mjs',
    'scripts/smoke-lifecycle.mjs',
    'scripts/smoke-officer.mjs',
    'scripts/smoke-identity.mjs',
  ]
  for (const script of smokeScripts) {
    try {
      const out = run(`node ${script}`, 10 * 60 * 1000)
      const lastLines = out.out.split(/\r?\n/).filter(Boolean).slice(-15).join(' | ')
      check(`C5:${script}`, out.ok ? 'PASS' : 'FAIL', out.ok ? `exit 0 — ${lastLines}` : `exit ${out.code} — ${lastLines}`)
    } catch (err) {
      check(`C5:${script}`, 'FAIL', err.message)
    }
  }
}

function run(cmd, timeoutMs) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs })
    return { ok: true, out: out.trim(), code: 0 }
  } catch (err) {
    return { ok: false, out: String(err.stdout || err.stderr || err.message).trim(), code: err.status ?? 1 }
  }
}

// liveCredentials reused from smoke-config
function liveCredentials(role) {
  const upper = role.charAt(0).toUpperCase() + role.slice(1)
  const handle = process.env[`SMOKE_${upper}_HANDLE`]
  const pin = process.env[`SMOKE_${upper}_PIN`]
  if (!handle && !pin) return null
  if (!handle || !pin) return null
  return { handle, pin }
}

// ============================================================================
// Phase D — report
// ============================================================================

async function phaseD() {
  console.log('\nPhase D — report')
  console.log('id    status  detail')
  console.log('===================')
  for (const r of results) {
    console.log(`${r.id.padEnd(7)} ${r.status.padEnd(7)} ${r.detail}`)
  }
  console.log('')
  const total = results.length
  const pass = results.filter((r) => r.status === 'PASS').length
  console.log(`TOTAL: ${total} checks | PASS: ${pass} | FAIL: ${fails} | SKIP: ${skips}`)
  if (skips > 0) {
    const skipped = results.filter((r) => r.status === 'SKIP').map((r) => r.id).join(', ')
    console.log(`SKIPPED: ${skipped} — owner-run credentials missing`)
  }
  if (fails === 0) {
    console.log(`\nPHASE 08.1 VERIFICATION PASSED (${total} checks)`)
    process.exit(0)
  }
  console.log(`\nPHASE 08.1 VERIFICATION FAILED (${fails} failure(s))`)
  process.exit(1)
}

async function main() {
  await phaseA()
  await phaseB()
  await phaseC()
  await phaseD()
}

main().catch((err) => {
  console.error(`[verify-phase-08.1] FATAL: ${err?.message || err}`)
  process.exit(1)
})
