#!/usr/bin/env node
/**
 * verify-schema — repo <-> live drift guard.
 *
 * Offline (always): the manifest must match the files on disk, the order must
 * be numeric, and no retired migration may appear in the apply order.
 *
 * Live (unless --offline): every active migration must have a bookkeeping row,
 * no retired version may be applied, every SECURITY DEFINER function must pin
 * search_path, and the two critical gates must be present in the LIVE bodies
 * (0063 public stat gate, 0064 staff device guard). It also probes the anon
 * showcase payload: zero raw stat values may cross the public boundary.
 *
 * Usage:
 *   node scripts/verify-schema.mjs            # offline + live
 *   node scripts/verify-schema.mjs --offline  # repo only (CI without secrets)
 *   node scripts/verify-schema.mjs --require-live  # fail when live is skipped
 *
 * Env (or .env): VITE_SUPABASE_URL, SUPABASE_ACCESS_TOKEN,
 *                VITE_SUPABASE_ANON_KEY (anon probe only).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const MANIFEST = 'supabase/migrations/manifest.json'
const MIGRATION_DIR = 'supabase/migrations'
const args = new Set(process.argv.slice(2))

let failures = 0
let warnings = 0
function pass(msg) {
  console.log(`PASS  ${msg}`)
}
function fail(msg) {
  failures += 1
  console.log(`FAIL  ${msg}`)
}
function warn(msg) {
  warnings += 1
  console.log(`WARN  ${msg}`)
}

function loadEnvFile(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}
const fileEnv = loadEnvFile('.env')
const env = (key) => process.env[key] ?? fileEnv[key] ?? ''

// ---------------------------------------------------------------------------
// 1. Manifest vs disk (offline)
// ---------------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const diskFiles = readdirSync(MIGRATION_DIR).filter((name) => name.endsWith('.sql'))
const active = manifest.apply_order ?? []
const retired = Object.keys(manifest.retired ?? {})

const listed = new Set([...active, ...retired])
const unlisted = diskFiles.filter((name) => !listed.has(name))
const missing = [...listed].filter((name) => !diskFiles.includes(name))
if (unlisted.length === 0 && missing.length === 0) {
  pass(`manifest covers all ${diskFiles.length} migration files`)
} else {
  if (unlisted.length > 0) fail(`files not in manifest: ${unlisted.join(', ')}`)
  if (missing.length > 0) fail(`manifest entries with no file: ${missing.join(', ')}`)
}

const overlap = active.filter((name) => retired.includes(name))
if (overlap.length === 0) pass('no retired file appears in apply_order')
else fail(`retired files in apply_order: ${overlap.join(', ')}`)

let previous = 0
let orderOk = true
for (const name of active) {
  const version = Number.parseInt(name.slice(0, 4), 10)
  if (!Number.isFinite(version) || version < previous) {
    orderOk = false
    fail(`apply_order is not monotonic at ${name}`)
    break
  }
  previous = version
}
if (orderOk) pass(`apply_order is numeric and monotonic (${active.length} active)`)

const versionOf = (name) => name.slice(0, 4)
const activeVersions = new Set(active.map(versionOf))
const retiredVersions = new Set(
  retired.map(versionOf).filter((version) => !activeVersions.has(version)),
)
const duplicates = [...new Set(active.map(versionOf))].filter(
  (version) => active.filter((name) => versionOf(name) === version).length > 1,
)
if (duplicates.length === 0) pass('no duplicate active versions')
else warn(`duplicate active versions (order pinned by the manifest): ${duplicates.join(', ')}`)

// ---------------------------------------------------------------------------
// 2. Live checks
// ---------------------------------------------------------------------------
const url = env('VITE_SUPABASE_URL')
const token = env('SUPABASE_ACCESS_TOKEN')
const anonKey = env('VITE_SUPABASE_ANON_KEY')
const projectRef = env('SUPABASE_PROJECT_REF') || (url ? new URL(url).hostname.split('.')[0] : '')

if (args.has('--offline')) {
  warn('live checks skipped (--offline)')
} else if (!token || !projectRef) {
  const msg = 'live checks skipped (missing SUPABASE_ACCESS_TOKEN or project ref)'
  if (args.has('--require-live')) fail(msg)
  else warn(msg)
} else {
  const mgmt = async (query) => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error(`management API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return res.json()
  }

  try {
    const rows = await mgmt(
      'select version from supabase_migrations.schema_migrations order by version;',
    )
    const applied = new Set(rows.map((row) => row.version))
    const notApplied = [...activeVersions].filter((version) => !applied.has(version)).sort()
    const unknown = [...applied].filter((version) => !activeVersions.has(version)).sort()
    if (notApplied.length === 0) pass(`every active version is applied (${applied.size} rows)`)
    else fail(`active versions with no bookkeeping row: ${notApplied.join(', ')}`)
    if (unknown.length === 0) pass('no applied version outside the manifest')
    else warn(`applied versions outside the manifest: ${unknown.join(', ')}`)

    const replayed = [...retiredVersions].filter((version) => applied.has(version))
    if (replayed.length === 0) pass('no retired migration was applied')
    else fail(`retired versions applied: ${replayed.join(', ')}`)

    const definers = await mgmt(`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args,
             coalesce(array_to_string(p.proconfig, ','), '') as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef;`)
    const unsafe = definers.filter((row) => !/search_path/i.test(row.config))
    if (unsafe.length === 0) pass(`all ${definers.length} SECURITY DEFINER functions pin search_path`)
    else fail(`SECURITY DEFINER without search_path: ${unsafe.map((r) => r.proname).join(', ')}`)

    const gates = await mgmt(`
      select
        (select position('v_show_values' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'get_promotion_public' limit 1) as public_gate,
        (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('set_member_role','set_member_active','reset_member_pin','add_member')
            and pg_get_functiondef(p.oid) like '%assert_device_bound%'
            and pg_get_functiondef(p.oid) like '%SET search_path TO ''public''%'
            and pg_get_functiondef(p.oid) not like '%live body preserved verbatim%') as guarded_staff_rpcs;`)
    const gate = gates[0] ?? {}
    if (gate.public_gate === true) pass('live get_promotion_public carries the 0063 stat gate')
    else fail('live get_promotion_public is MISSING the 0063 stat gate')
    if (Number(gate.guarded_staff_rpcs) === 4) pass('live staff RPCs carry the 0064 device guard + search_path')
    else fail(`live staff RPCs guarded: ${gate.guarded_staff_rpcs}/4`)

    if (!url || !anonKey) {
      warn('anon showcase probe skipped (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)')
    } else {
      const res = await fetch(`${url}/rest/v1/rpc/get_promotion_public`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        fail(`anon showcase probe failed: HTTP ${res.status}`)
      } else {
        const sections = await res.json()
        let values = 0
        let leaked = 0
        for (const section of sections ?? []) {
          for (const card of section.cards ?? []) {
            for (const highlight of card.highlights ?? []) {
              values += 1
              if (highlight.value !== null && highlight.value !== undefined) leaked += 1
            }
          }
        }
        if (values === 0) warn('anon showcase probe returned no highlights')
        else if (leaked === 0) pass(`anon showcase withholds raw values (0/${values} non-null)`)
        else fail(`anon showcase LEAKS raw values (${leaked}/${values} non-null)`)
      }
    }
  } catch (error) {
    fail(`live checks crashed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s), ${warnings} warning(s)`)
process.exit(failures === 0 ? 0 : 1)
