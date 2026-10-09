#!/usr/bin/env node
/**
 * NeoFoot seed applier (plan 02-01): reads one or more .sql seed files and
 * applies each to the LIVE Supabase project via the Management API Run Query
 * endpoint (the legacy /v1 one — the /api/v1/* paths serve an HTML
 * API-reference page and silently "succeed", proven in plan 01-01).
 *
 * Must run from Node: PowerShell 5.1 ConvertTo-Json serializes long strings as
 * {"value": ...} objects, which the endpoint rejects (01-01 proven failure).
 *
 * Usage:
 *   node scripts/apply-seed.mjs <file.sql> [more.sql ...]
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  owner access token (session env var only — NEVER
 *                          written to any file, never committed, never echoed)
 *   SUPABASE_PROJECT_REF   target project ref
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Legacy Management API ONLY (01-01): https://api.supabase.com/v1/projects/{ref}/database/query
const MGMT_BASE = 'https://api.supabase.com/v1/projects/'

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('[apply-seed] Usage: node scripts/apply-seed.mjs <file.sql> [more.sql ...]')
    process.exit(1)
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN
  const projectRef = process.env.SUPABASE_PROJECT_REF
  if (!token || !projectRef) {
    console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF')
    process.exit(1)
  }

  const url = `${MGMT_BASE}${projectRef}/database/query`
  for (const file of files) {
    const sql = readFileSync(path.resolve(file), 'utf8')
    // Node fetch + JSON.stringify only — PowerShell ConvertTo-Json corrupts
    // long strings, which is why this script is Node (01-01 precedent).
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[apply-seed] FAILED (${res.status}) applying ${file}: ${body}`)
      process.exit(1)
    }
    console.log(`APPLIED ${file}`)
  }
}

main().catch((err) => {
  console.error(`[apply-seed] FAILED: ${err?.message || err}`)
  process.exit(1)
})
