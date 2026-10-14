#!/usr/bin/env node
/**
 * NeoFoot dummy-value report (plan 07-03, task 1): READ-ONLY sibling of
 * apply-seed.mjs. Queries the LIVE project's validated submissions via the
 * legacy Management API query endpoint and prints per-stat distribution rows
 * plus per-(class, char_function) cohort sizes. Output also lands in
 * supabase/seeds/dummy/value-bases.json as the machine-readable base-value
 * input for seed-dummies.sql (D-11: seed values derive from live data).
 *
 * READ-ONLY BY CONSTRUCTION: exactly ONE fetch call, method POST to the
 * query endpoint, body SQL is a SELECT/WITH-only statement — zero data-
 * modifying SQL of any kind anywhere in this file. No token is ever
 * echoed or persisted.
 *
 * Must run from Node: PowerShell 5.1 ConvertTo-Json corrupts long JSON
 * strings (01-01 proven failure) — same transport contract as apply-seed.mjs.
 *
 * Usage:
 *   node scripts/dummy-value-report.mjs
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  owner access token (session env var only — never
 *                          written to any file, never committed, never echoed)
 *   SUPABASE_PROJECT_REF   target project ref
 *
 * Low-confidence fallback (07-03 plan): stats with n < 3 real validated
 * values must be flagged in SEED-NOTES.md and sourced from the
 * owner-supplied-sample rule (SEED-01) instead of the live distribution.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// Legacy Management API ONLY (01-01/apply-seed precedent):
// https://api.supabase.com/v1/projects/{ref}/database/query
const MGMT_BASE = 'https://api.supabase.com/v1/projects/'

// One statement, one fetch: both result sets serialized into a single jsonb
// row (the legacy endpoint returns the rows of the last statement only).
const REPORT_SQL = `
select jsonb_build_object(
  'stats', (
    select coalesce(jsonb_agg(t order by t.group_name, t.stat_key), '[]'::jsonb)
    from (
      select ss.stat_key,
             sc.value_type,
             sc.group_name,
             count(*)::int as n,
             min(ss.value) as min_v,
             percentile_cont(0.25) within group (order by ss.value) as p25,
             percentile_cont(0.50) within group (order by ss.value) as median,
             percentile_cont(0.75) within group (order by ss.value) as p75,
             max(ss.value) as max_v
      from submission_stats ss
      join submissions s on s.id = ss.submission_id and s.status = 'validated'
      join stat_catalog sc on sc.stat_key = ss.stat_key
      group by ss.stat_key, sc.value_type, sc.group_name
    ) t
  ),
  'cohorts', (
    select coalesce(jsonb_agg(c order by c.char_class, c.char_function), '[]'::jsonb)
    from (
      select m.char_class, m.char_function, count(distinct m.id)::int as n
      from members m
      join submissions s on s.member_id = m.id and s.status = 'validated'
      group by m.char_class, m.char_function
    ) c
  )
) as report;
`

function pad(str, width) {
  const s = String(str)
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}

function fmtNum(v) {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const projectRef = process.env.SUPABASE_PROJECT_REF
  if (!token || !projectRef) {
    console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF')
    console.error('Set both env vars (same pair apply-seed.mjs uses), then re-run.')
    process.exit(1)
  }

  const url = `${MGMT_BASE}${projectRef}/database/query`
  // THE single fetch of this script (read-only: SELECT-only SQL above).
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: REPORT_SQL }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[dummy-value-report] query FAILED (${res.status}): ${body}`)
    process.exit(1)
  }
  const rows = await res.json()
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.report) {
    console.error('[dummy-value-report] unexpected response shape')
    process.exit(1)
  }
  const report = rows[0].report
  const stats = report.stats || []
  const cohorts = report.cohorts || []

  // --- aligned stdout: per-stat distribution ---
  console.log('PER-STAT LIVE DISTRIBUTION (validated submissions only)')
  console.log(
    pad('stat_key', 30) + pad('vtype', 12) + pad('group', 9) +
    pad('n', 6) + pad('min', 12) + pad('p25', 12) + pad('median', 12) +
    pad('p75', 12) + pad('max', 12)
  )
  for (const s of stats) {
    console.log(
      pad(s.stat_key, 30) + pad(s.value_type, 12) + pad(s.group_name, 9) +
      pad(`n=${s.n}`, 6) + pad(fmtNum(s.min_v), 12) + pad(fmtNum(s.p25), 12) +
      pad(fmtNum(s.median), 12) + pad(fmtNum(s.p75), 12) + pad(fmtNum(s.max_v), 12)
    )
  }

  // --- aligned stdout: cohort sizes ---
  console.log('')
  console.log('COHORT SIZES (class, char_function) over real validated submitters')
  console.log(pad('char_class', 20) + pad('char_function', 12) + pad('n', 6))
  for (const c of cohorts) {
    console.log(pad(c.char_class ?? '-', 20) + pad(c.char_function ?? '-', 12) + pad(`n=${c.n}`, 6))
  }

  // --- machine-readable output for seed-dummies.sql base table ---
  const out = {
    generated_at: new Date().toISOString(),
    source: 'live validated submissions (legacy Management API query endpoint)',
    low_confidence_rule: 'stats with n < 3 fall back to the owner-supplied-sample rule (SEED-01) and must be flagged in SEED-NOTES.md',
    stats: stats.map((s) => ({
      stat_key: s.stat_key,
      value_type: s.value_type,
      group_name: s.group_name,
      n: s.n,
      min: s.min_v === null ? null : Number(s.min_v),
      p25: s.p25 === null ? null : Number(s.p25),
      median: s.median === null ? null : Number(s.median),
      p75: s.p75 === null ? null : Number(s.p75),
      max: s.max_v === null ? null : Number(s.max_v),
    })),
    cohorts: cohorts.map((c) => ({
      char_class: c.char_class,
      char_function: c.char_function,
      n: c.n,
    })),
  }
  const outDir = path.resolve('supabase/seeds/dummy')
  mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'value-bases.json')
  writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n')
  console.log('')
  console.log(`WROTE ${outFile} (${stats.length} stats, ${cohorts.length} cohorts, generated_at ${out.generated_at})`)
  const lowConf = stats.filter((s) => s.n < 3).map((s) => s.stat_key)
  if (lowConf.length > 0) {
    console.log(`LOW-CONFIDENCE (n<3, owner-supplied-sample fallback required): ${lowConf.join(', ')}`)
  }
}

main().catch((err) => {
  console.error(`[dummy-value-report] FAILED: ${err?.message || err}`)
  process.exit(1)
})
