#!/usr/bin/env node
/**
 * NeoFoot production release gate (plan 08.1-07 task 2).
 *
 * Runs against `process.env.DEPLOY_URL || 'https://hellz-dashboard.vercel.app'` and
 * prints `DEPLOY GATE PASSED` (exit 0) only when every check passes; exits non-zero
 * otherwise. One `PASS:` / `FAIL:` line per check, then a summary.
 *
 * Checks:
 *   1. HTML fetch — GET / returns 200, body contains <div id="root">
 *   2. Header assertions — nosniff, DENY, referrer-policy, permissions-policy,
 *      content-security-policy-report-only (frame-ancestors 'none'), strict-transport-security
 *   3. Bundle env — index-*.js bundle contains thdxyxsjafimxgxpmpqs, no
 *      Missing VITE_SUPABASE_URL / service_role / sbp_ / NEFOOT_JWT_SECRET /
 *      SUPABASE_SERVICE_ROLE_KEY
 *   4. Auth function reachability — verify-pin probe (401 invalid_credentials /
 *      pin_setup_required), step-up probe (401/403, 404 = never deployed)
 *   5. Repo secret scan — no tracked .env, no sbp_ under non-md files
 *
 * Never prints token/anon-key values (only `anon key present (len=NNN)`).
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

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

const DEPLOY_URL = process.env.DEPLOY_URL || 'https://hellz-dashboard.vercel.app'
const PROJECT_REF = 'thdxyxsjafimxgxpmpqs'
const envFile = loadEnvFile()
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || envFile.VITE_SUPABASE_URL
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  envFile.VITE_SUPABASE_ANON_KEY ||
  envFile.SUPABASE_ANON_KEY
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || envFile.SUPABASE_ACCESS_TOKEN

const failures = []
let passed = 0
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`PASS: ${name}${detail ? ` (${detail})` : ''}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` (${detail})` : ''}`)
    failures.push(name)
  }
}

async function fetchText(url, { method = 'GET', headers = {}, body } = {}) {
  const init = { method, headers }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await fetch(url, init)
  const text = await res.text()
  return { status: res.status, ok: res.ok, headers: res.headers, text }
}

function headerCaseInsensitive(headers, key) {
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() === key.toLowerCase()) return v
  }
  return undefined
}

async function main() {
  console.log(`[check-deployment] Target: ${DEPLOY_URL}`)

  // ---- 1. HTML fetch ------------------------------------------------------
  const html = await fetchText(`${DEPLOY_URL}/`)
  check(
    'GET / -> 200 with <div id="root">',
    html.status === 200 && html.text.includes('<div id="root">'),
    `HTTP ${html.status}`,
  )
  const bundleMatch = html.text.match(/src="\/assets\/index-[^"]+\.js"/)
  const bundleUrl = bundleMatch ? new URL(bundleMatch[0].slice(5, -1), DEPLOY_URL).href : null
  check('HTML references an /assets/index-*.js bundle', bundleUrl !== null)

  // ---- 2. Header assertions -----------------------------------------------
  const h = html.headers
  const cto = headerCaseInsensitive(h, 'x-content-type-options')
  const xfo = headerCaseInsensitive(h, 'x-frame-options')
  const rp = headerCaseInsensitive(h, 'referrer-policy')
  const pp = headerCaseInsensitive(h, 'permissions-policy')
  const csp = headerCaseInsensitive(h, 'content-security-policy-report-only')
  const hsts = headerCaseInsensitive(h, 'strict-transport-security')
  check('x-content-type-options: nosniff', cto === 'nosniff', cto || 'missing')
  check('x-frame-options: DENY', xfo === 'DENY', xfo || 'missing')
  check('referrer-policy present', rp !== undefined, rp || 'missing')
  check('permissions-policy present', pp !== undefined, pp || 'missing')
  check(
    'content-security-policy-report-only contains frame-ancestors \'none\'',
    csp !== undefined && csp.includes("frame-ancestors 'none'"),
    csp || 'missing',
  )
  check('strict-transport-security present', hsts !== undefined, hsts || 'missing')

  // ---- 3. Bundle env ------------------------------------------------------
  if (bundleUrl) {
    const bundle = await fetchText(bundleUrl)
    check(
      'bundle contains Supabase project ref',
      bundle.text.includes(PROJECT_REF),
      `HTTP ${bundle.status}`,
    )
    check(
      'bundle has no Missing VITE_SUPABASE_URL (env regression)',
      !bundle.text.includes('Missing VITE_SUPABASE_URL'),
    )
    check(
      'bundle leaks no service_role',
      !bundle.text.includes('service_role'),
    )
    check(
      'bundle leaks no sbp_ management token',
      !bundle.text.includes('sbp_'),
    )
    check(
      'bundle leaks no NEFOOT_JWT_SECRET',
      !bundle.text.includes('NEFOOT_JWT_SECRET'),
    )
    check(
      'bundle leaks no SUPABASE_SERVICE_ROLE_KEY',
      !bundle.text.includes('SUPABASE_SERVICE_ROLE_KEY'),
    )
  }

  // ---- 4. Auth function reachability --------------------------------------
  if (SUPABASE_URL && ANON_KEY) {
    const vp = await fetchText(`${SUPABASE_URL}/functions/v1/verify-pin`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: { discord_handle: '__deploy_gate_probe__', pin: '0000' },
    })
    const vpBody = (() => {
      try { return JSON.parse(vp.text) } catch { return {} }
    })()
    check(
      'verify-pin probe -> 401 invalid_credentials / pin_setup_required',
      vp.status === 401 && (vpBody.error === 'invalid_credentials' || vpBody.error === 'pin_setup_required'),
      `HTTP ${vp.status} body=${vp.text.slice(0, 120)}`,
    )
    const su = await fetchText(`${SUPABASE_URL}/functions/v1/step-up`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    })
    check(
      'step-up reachable -> 401/403 (404 = never deployed, the 10-22 failure class)',
      su.status === 401 || su.status === 403,
      `HTTP ${su.status}`,
    )
    console.log(`anon key present (len=${ANON_KEY.length})`)
  } else {
    check('anon key present for function probes', false, 'VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY not set')
  }

  // ---- 5. Repo secret scan ------------------------------------------------
  const lsFiles = execSync('git ls-files', { encoding: 'utf8' }).split(/\r?\n/)
  const dotenvTracked = lsFiles.includes('.env')
  check('no tracked .env in repo', !dotenvTracked)

  // sbp_ scan: detect actual committed management-token values (sbp_ + long
  // base64), not doc mentions of the token name. The real token lives only in
  // gitignored .env.
  const sbpToken = /sbp_[A-Za-z0-9\-_]{20,}/
  let sbpRaw = ''
  try {
    sbpRaw = execSync('git grep -n "sbp_"', { encoding: 'utf8' })
  } catch {
    sbpRaw = '' // non-zero exit = no matches (clean)
  }
  const sbpOffenders = sbpRaw
    .split(/\r?\n/)
    .filter((line) => /\.md:/.test(line) || sbpToken.test(line))
  // keep only non-md lines that contain a real token value
  const realTokenHits = sbpRaw
    .split(/\r?\n/)
    .filter((line) => !/\.md:/.test(line) && sbpToken.test(line))
  check('no sbp_ management-token value committed to tracked files', realTokenHits.length === 0)

  // ---- Summary ------------------------------------------------------------
  console.log('')
  if (failures.length === 0) {
    console.log('DEPLOY GATE PASSED')
    process.exit(0)
  }
  console.log(`DEPLOY GATE FAILED (${failures.length}): ${failures.join('; ')}`)
  process.exit(1)
}

main().catch((err) => {
  console.error(`[check-deployment] FAILED: ${err?.message || err}`)
  process.exit(1)
})
