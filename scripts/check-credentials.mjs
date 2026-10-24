#!/usr/bin/env node
/**
 * NeoFoot repo credential-hygiene gate (plan 08.1-09 task 3B).
 *
 * Scans every tracked file under `scripts/` plus `supabase/seeds/whitelist.sql`
 * and fails when a committed credential literal is found:
 *
 *   R1 bcrypt hash literal        $2a$/2b$/2y$ cost 22 chars + 53 chars
 *   R2 PIN assignment literal     OWNER_PIN/MEMBER_PIN/OFFICER_PIN/PIN/FIXTURE_PIN = 'dddd'
 *   R3 live owner handle          the production owner handle ('satt' + 'urne')
 *   R4 placeholder staff handles  officer-handle / member-handle in whitelist.sql
 *
 * Prints one `OFFENDER: <path>:<line>: <rule>` line per match and exits 1.
 * Prints `CREDENTIAL GATE PASSED (<n> files scanned)` and exits 0 when clean.
 *
 * The patterns are built from string fragments so this file does not
 * self-trigger on R3/R4 (the literal owner handle is built from string fragments).
 *
 * Note: `supabase/seeds/whitelist.sql` still contains the owner hash/handle
 * until plan 08.1-06 lands, and this gate is expected to report that single
 * offender until then. Record it in the plan summary; the gate must be fully
 * green after 08.1-06.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Patterns assembled from fragments so this file never matches itself.
const OWNER_HANDLE_FRAG = 'satt' + 'urne'
const OFFICER_HANDLE = 'officer-handle'
const MEMBER_HANDLE = 'member-handle'

const R1 = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/
const R2 = /\b(OWNER_PIN|MEMBER_PIN|OFFICER_PIN|PIN|FIXTURE_PIN)\s*[:=]\s*['"]\d{4}['"]/
const R3 = new RegExp(OWNER_HANDLE_FRAG)
const R4 = new RegExp(OFFICER_HANDLE + '|' + MEMBER_HANDLE)

const WHITELIST_SEED = 'supabase/seeds/whitelist.sql'

function trackedFiles() {
  let out
  try {
    out = execSync('git ls-files', { encoding: 'utf8', cwd: process.cwd() })
  } catch (err) {
    console.error(`OFFENDER: (git ls-files failed): ${err.message}`)
    process.exit(1)
  }
  return out.split(/\r?\n/).filter(Boolean)
}

function scan() {
  const files = trackedFiles()
  let targets = []
  for (const f of files) {
    if (f.startsWith('scripts/') || f === WHITELIST_SEED) {
      targets.push(f)
    }
  }
  targets = targets.sort()

  const offenders = []
  for (const path of targets) {
    let text
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (R1.test(line)) offenders.push(`${path}:${i + 1}: R1 bcrypt hash literal`)
      if (R2.test(line)) offenders.push(`${path}:${i + 1}: R2 PIN assignment literal`)
      if (R3.test(line)) offenders.push(`${path}:${i + 1}: R3 live owner handle`)
      // R4 only applies inside the whitelist seed.
      if (path === WHITELIST_SEED && R4.test(line))
        offenders.push(`${path}:${i + 1}: R4 placeholder staff handle`)
    }
  }

  console.log(`CREDENTIAL GATE SCANNED ${targets.length} files`)
  if (offenders.length === 0) {
    console.log('CREDENTIAL GATE PASSED')
    process.exit(0)
  }
  for (const o of offenders) {
    console.log(`OFFENDER: ${o}`)
  }
  process.exit(1)
}

scan()
