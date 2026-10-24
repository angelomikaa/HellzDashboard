#!/usr/bin/env node
/**
 * NeoFoot shared smoke credential config (plan 08.1-09 task 1).
 *
 * Single source of truth for every smoke script's credentials and per-run
 * fixture PIN. Replaces the committed credential literals that used to live
 * in each smoke script (MEMBER_HANDLE, OFFICER_HANDLE, OWNER_HANDLE, PIN,
 * OWNER_PIN, and the shared fixture PIN '1234').
 *
 * Design rules (see 08.1-09-PLAN.md):
 *   - Zero dependencies (pure ESM, Node built-ins only)
 *   - No bcryptjs import here — scripts that hash import it themselves
 *   - Does NOT read `.env` at module load (unit tests must run without a .env)
 *   - Never prints token/handle/pin values
 *   - FIXTURE_PIN generated ONCE at module load so every fixture in a run
 *     shares the random 4-digit PIN
 */

import { readFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Env-driven Supabase config
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

/**
 * Resolve { url, anonKey, mgmtToken, projectRef } from process.env first,
 * then from .env (VITE_* fallback). Throws naming the missing variable(s)
 * — never prints a value.
 */
function supabaseConfig() {
  const envFile = loadEnvFile()
  const url = process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || envFile.VITE_SUPABASE_ANON_KEY
  const mgmtToken = process.env.SUPABASE_ACCESS_TOKEN
  const projectRef = process.env.SUPABASE_PROJECT_REF
  const missing = []
  if (!url) missing.push('VITE_SUPABASE_URL / SUPABASE_URL')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY')
  if (!mgmtToken) missing.push('SUPABASE_ACCESS_TOKEN')
  if (!projectRef) missing.push('SUPABASE_PROJECT_REF')
  if (missing.length) {
    throw new Error(`Missing smoke credential env var(s): ${missing.join(', ')}`)
  }
  return { url, anonKey, mgmtToken, projectRef }
}

/**
 * Human-readable one-liner listing the env vars a live run needs.
 * Printed by each script's startup banner only when a live credential is
 * missing.
 */
const SMOKE_ENV_HINT =
  'Set SUPABASE_URL / SUPABASE_ANON_KEY (or VITE_* in .env) plus ' +
  'SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF for Management API cleanup. ' +
  'Owner-run probes need SMOKE_OWNER_HANDLE / SMOKE_OWNER_PIN. ' +
  'SMOKE_FIXTURE_PIN overrides the random per-run fixture PIN (4 digits).'

// ---------------------------------------------------------------------------
// Per-run fixture PIN (random 4 digits, generated once at module load)
// ---------------------------------------------------------------------------

function assertPinShape(pin) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error(`fixture PIN must be 4 digits, got: ${JSON.stringify(pin)}`)
  }
  return pin
}

const FIXTURE_PIN = assertPinShape(
  process.env.SMOKE_FIXTURE_PIN || String(Math.floor(1000 + Math.random() * 9000)),
)

// ---------------------------------------------------------------------------
// Live (owner-run) credentials — optional, env-supplied only
// ---------------------------------------------------------------------------

function liveCredentials() {
  const owner = envPair('SMOKE_OWNER')
  const officer = envPair('SMOKE_OFFICER')
  const member = envPair('SMOKE_MEMBER')
  return { owner, officer, member }
}

function envPair(prefix) {
  const handle = process.env[`${prefix}_HANDLE`]
  const pin = process.env[`${prefix}_PIN`]
  if (!handle && !pin) return null
  if (!handle || !pin) {
    throw new Error(
      `Incomplete ${prefix} credentials: set both ${prefix}_HANDLE and ${prefix}_PIN`,
    )
  }
  assertPinShape(pin)
  return { handle, pin }
}

/**
 * Returns { handle, pin } for the role or throws naming the missing env vars.
 * Owner-run probes (e.g. owner-only POST /classes) SKIP when env is absent
 * rather than silently passing or failing.
 */
function requireLiveCredential(role) {
  const upper = role.toUpperCase()
  const creds = liveCredentials()[role]
  if (!creds) {
    throw new Error(
      `missing SMOKE_${upper}_HANDLE / SMOKE_${upper}_PIN ` +
        `(owner-run credentials are never committed — see 08.1-06)`,
    )
  }
  assertPinShape(creds.pin)
  return creds
}

// ---------------------------------------------------------------------------
// JWT claim helpers (read-only, never throw on malformed input)
// ---------------------------------------------------------------------------

function decodeSessionClaims(token) {
  try {
    const part = String(token).split('.')[1]
    if (!part) return {}
    const payload = JSON.parse(Buffer.from(part, 'base64').toString('utf8'))
    return payload && typeof payload === 'object' ? payload : {}
  } catch {
    return {}
  }
}

function assertFixtureRole(session, expectedRole) {
  const claims = decodeSessionClaims(session && session.access_token)
  if (claims.member_role !== expectedRole) {
    throw new Error(
      `fixture role mismatch: expected '${expectedRole}', got '${claims.member_role}'`,
    )
  }
  return claims
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  loadEnvFile,
  supabaseConfig,
  FIXTURE_PIN,
  assertPinShape,
  liveCredentials,
  requireLiveCredential,
  decodeSessionClaims,
  assertFixtureRole,
  SMOKE_ENV_HINT,
}
