#!/usr/bin/env node
/**
 * One-off prep for migration 0028: dump the FULL live prosrc of the four rank
 * RPCs to .planning/tmp/ (byte-faithful source for the rewrite) and inspect
 * the migrations bookkeeping table. Read-only.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

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
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || envFile.SUPABASE_ACESS_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF || (SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : null)

if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error('[dump] missing token/project ref')
  process.exit(1)
}

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`mgmt query failed: HTTP ${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

mkdirSync('.planning/tmp', { recursive: true })

const rows = await mgmtQuery(
  `select proname, prosrc from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('my_report','my_card','class_top5','get_promotion')
    order by proname;`,
)
for (const row of rows ?? []) {
  writeFileSync(`.planning/tmp/live-${row.proname}.sql`, String(row.prosrc ?? ''), 'utf8')
  console.log(`dumped .planning/tmp/live-${row.proname}.sql (${String(row.prosrc ?? '').length} chars)`)
}

for (const table of ['schema_migrations', 'supabase_migrations']) {
  try {
    const rows2 = await mgmtQuery(
      `select * from ${table} order by 1 desc limit 8;`,
    )
    console.log(`\n=== ${table} (latest 8) ===`)
    console.log(JSON.stringify(rows2, null, 1))
  } catch (err) {
    console.log(`\n=== ${table} === unavailable: ${String(err.message).slice(0, 120)}`)
  }
}
