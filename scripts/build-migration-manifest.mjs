#!/usr/bin/env node
/**
 * Generate supabase/migrations/manifest.json — the canonical, ordered list of
 * migrations to apply on a fresh database, plus the files that must NEVER be
 * applied again.
 *
 * Why this exists: the repo carries two 0023 files and two 0024 files, and
 * 0032/0033/0045 were superseded without bookkeeping rows. A plain glob (or
 * `supabase db push`) would replay retired migrations. The manifest makes the
 * intended order explicit and machine-checkable.
 *
 * Usage:
 *   node scripts/build-migration-manifest.mjs          # write
 *   node scripts/build-migration-manifest.mjs --check  # exit 1 if stale
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const MANIFEST = 'supabase/migrations/manifest.json'

// Files that exist for history but must never be applied again. Keyed by file
// name (not version) because 0024 keeps an active sibling.
const RETIRED = {
  '0024_device_binding_enforcement.sql':
    'STUB bodies (would turn the four staff RPCs into no-ops); superseded by 0064_staff_rpc_bodies_and_device_guard.sql',
  '0032_claim_authorization.sql':
    'reverted by 0034 (manual first access); never replay the claim-authorization gate',
  '0033_one_go_registration.sql':
    'superseded by 0034 (manual first access); never replay the one-go registration contract',
  '0045_promotion_public_stat_gate.sql':
    'superseded by 0063_public_promotion_stat_gate.sql (the 0055 body carries the placeholder flag); never apply alone',
}

// Historical order for the duplicate prefixes (both remain active).
const TIE_BREAK = {
  '0023_my_card_role_filter.sql': 0,
  '0023_sentinel_identity_guard.sql': 1,
}

const files = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => {
    const na = Number.parseInt(a.slice(0, 4), 10)
    const nb = Number.parseInt(b.slice(0, 4), 10)
    if (na !== nb) return na - nb
    return (TIE_BREAK[a] ?? 0) - (TIE_BREAK[b] ?? 0) || a.localeCompare(b)
  })

const active = files.filter((name) => !(name in RETIRED))
const retired = Object.fromEntries(
  files.filter((name) => name in RETIRED).map((name) => [name, RETIRED[name]]),
)

const manifest = {
  manifest_version: 1,
  notes:
    'Canonical apply order for a fresh database. Files under "retired" exist for history only and MUST NOT be applied. Seeds (supabase/seeds/*.sql) are separate and are not covered here.',
  apply_order: active,
  retired,
}

const serialized = `${JSON.stringify(manifest, null, 2)}\n`

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(MANIFEST, 'utf8')
  } catch {
    console.error(`[manifest] missing ${MANIFEST} — run without --check`)
    process.exit(1)
  }
  if (current !== serialized) {
    console.error(`[manifest] ${MANIFEST} is stale — run: node scripts/build-migration-manifest.mjs`)
    process.exit(1)
  }
  console.log(`[manifest] OK — ${active.length} active, ${Object.keys(retired).length} retired`)
} else {
  writeFileSync(MANIFEST, serialized)
  console.log(
    `[manifest] wrote ${MANIFEST} — ${active.length} active, ${Object.keys(retired).length} retired`,
  )
}
