#!/usr/bin/env node
/**
 * NeoFoot out-of-band PIN rotation (plan 08.1-06 task 2B).
 *
 * Rotates the PIN for a single member handle without ever writing the PIN or
 * its bcrypt hash to disk, a chat log, or a plan file.
 *
 * Usage:
 *   node scripts/set-member-pin.mjs <handle>
 *
 * PIN source (in order):
 *   1. process.env.NEW_PIN        (set in the session env, never committed)
 *   2. interactive readline prompt (value is read once, never echoed to a file)
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF  (session env only — see scripts/smoke-config.mjs)
 *   NEW_PIN                                        (optional; 4 digits)
 *
 * Never prints the PIN or the hash; prints only handle, role and hash length.
 * Exit non-zero on any error.
 */

import { createInterface } from 'node:readline'
import { supabaseConfig } from './smoke-config.mjs'
import bcrypt from 'bcryptjs'

const PIN_RE = /^\d{4}$/
const HANDLE_RE = /^[A-Za-z0-9_.\-]{1,64}$/

const rl = createInterface({ input: process.stdin, output: process.stdout })
function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer.trim())))
}
function close() {
  rl.close()
}

async function main() {
  const handle = process.argv[2]
  if (!handle || !HANDLE_RE.test(handle)) {
    console.error('Usage: node scripts/set-member-pin.mjs <handle>')
    console.error('  handle must match /^[A-Za-z0-9_.\\-]{1,64}$/')
    process.exit(1)
  }

  let SUPABASE_URL, ANON_KEY, MGMT_TOKEN, PROJECT_REF
  try {
    ;({
      url: SUPABASE_URL,
      anonKey: ANON_KEY,
      mgmtToken: MGMT_TOKEN,
      projectRef: PROJECT_REF,
    } = supabaseConfig())
  } catch (err) {
    console.error(`[set-member-pin] ${err.message}`)
    process.exit(1)
  }

  // Resolve the PIN: env first, then an interactive prompt.
  let pin = process.env.NEW_PIN
  if (!pin) {
    process.stdout.write('Enter new 4-digit PIN for ' + handle + ': ')
    pin = (await question('')).trim()
  }
  close()

  if (!PIN_RE.test(pin)) {
    console.error('[set-member-pin] PIN must be exactly 4 digits (WHIT-02 — never widen to 6 digits)')
    process.exit(1)
  }

  const pinHash = bcrypt.hashSync(pin, 10)

  async function mgmtQuery(sql) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`management query failed: HTTP ${res.status} ${body}`)
    }
    const text = await res.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  // Pre-flight read: the row must exist and not be a neutralized sentinel.
  const rows = await mgmtQuery(
    `select id, role, active, (pin_hash is not null) as has_pin from public.members where discord_handle = '${handle}';`,
  )
  if (!Array.isArray(rows) || rows.length !== 1) {
    console.error(`[set-member-pin] no member row found for handle '${handle}'`)
    process.exit(1)
  }
  const row = rows[0]
  if (row.role === 'member' && row.active === false) {
    console.error(
      `[set-member-pin] '${handle}' is a neutralized sentinel (role=member, active=false). ` +
        'Re-add it through add_member before rotating its PIN.',
    )
    process.exit(1)
  }

  // Write: dollar-quote the hash (bcrypt contains $). Never log hash or PIN.
  await mgmtQuery(
    `update public.members set pin_hash = $nefoot$${pinHash}$nefoot$, claimed_at = now() where discord_handle = '${handle}';`,
  )

  // Clear lockout state keyed by handle and by member id.
  await mgmtQuery(
    `delete from public.pin_login_attempts where discord_handle in ('${handle}', '${row.id}');`,
  )

  console.log(`PIN updated for ${handle} (hash len=${pinHash.length}, role=${row.role})`)
  console.log('Verify with a login before closing the terminal; the old PIN no longer works.')
}

main().catch((err) => {
  console.error(`[set-member-pin] FAILED: ${err?.message || err}`)
  process.exit(1)
})
