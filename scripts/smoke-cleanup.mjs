// scripts/smoke-cleanup.mjs
// Purge throwaway smoke fixtures from the LIVE project.
//
// Why this exists: the smoke suites (smoke-*.mjs) create rows with the
// `smoke-` handle prefix and remove them in their own `finally`. A run that is
// killed (or that aborts before the finally) leaves those rows behind, and they
// are real members/requests/submissions as far as the panel is concerned —
// fake stats pollute the percentiles of the actual guild.
//
// Usage (session env only — never write the token into a file):
//   $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
//   $env:SUPABASE_PROJECT_REF  = 'thdxyxsjafimxgxpmpqs'
//   node scripts/smoke-cleanup.mjs            # report only (default)
//   node scripts/smoke-cleanup.mjs --apply    # delete
//
// The prefix is deliberately narrow: only handles starting with `smoke`
// (the fixture namespace used by every script in this folder). Real players
// never start with it.
import { readFileSync } from 'node:fs'

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
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF
const APPLY = process.argv.includes('--apply')

if (!MGMT_TOKEN || !PROJECT_REF) {
  console.error(
    '[smoke-cleanup] Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF (session env only)',
  )
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
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const SMOKE = `discord_handle ilike 'smoke%'`

async function census() {
  const rows = await mgmtQuery(
    `select
       (select count(*) from members where ${SMOKE}) as members,
       (select count(*) from submissions s where s.member_id in
          (select id from members where ${SMOKE})) as submissions,
       (select count(*) from membership_requests r where r.${SMOKE} or r.member_id in
          (select id from members where ${SMOKE})) as requests,
       (select count(*) from member_identity_history h where h.member_id in
          (select id from members where ${SMOKE})) as history,
       (select count(*) from members where active) as active_members;`,
  )
  return (Array.isArray(rows) ? rows[0] : null) ?? {}
}

async function main() {
  const before = await census()
  console.log('[smoke-cleanup] before:', before)
  if (!before.members && !before.requests) {
    console.log('[smoke-cleanup] nothing to purge')
    return
  }
  if (!APPLY) {
    console.log('[smoke-cleanup] report only — re-run with --apply to delete')
    return
  }

  // Storage objects must leave through the Storage API (SQL deletes on
  // storage.objects are blocked by a trigger).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null
  const proofRows = await mgmtQuery(
    `select storage_path as path from identity_proofs
       where member_id in (select id from members where ${SMOKE})
     union
     select proof_path as path from membership_requests
       where (${SMOKE} or member_id in (select id from members where ${SMOKE}))
         and proof_path is not null;`,
  )
  const paths = (Array.isArray(proofRows) ? proofRows : [])
    .map((row) => (typeof row?.path === 'string' ? row.path : null))
    .filter(Boolean)

  if (paths.length > 0) {
    if (!serviceKey) {
      console.warn(
        `[smoke-cleanup] ${paths.length} proof object(s) left in storage — ` +
          'set SUPABASE_SERVICE_ROLE_KEY to purge them too',
      )
    } else {
      const res = await fetch(
        `${process.env.SUPABASE_URL ?? `https://${PROJECT_REF}.supabase.co`}/storage/v1/object/identity-proofs`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: paths }),
        },
      )
      console.log(`[smoke-cleanup] storage purge -> HTTP ${res.status} (${paths.length} path(s))`)
    }
  }

  // Children first: several FKs are NO ACTION (identity_proofs, submissions,
  // membership_requests, member_identity_history).
  await mgmtQuery(`
    begin;
    create temp table _smoke on commit drop as select id from members where ${SMOKE};
    delete from pin_login_attempts
      where ${SMOKE} or discord_handle in (select id::text from _smoke);
    delete from step_up_tokens where member_id in (select id from _smoke);
    delete from member_identity_history
      where member_id in (select id from _smoke)
         or created_by in (select id from _smoke);
    delete from identity_proofs where member_id in (select id from _smoke);
    delete from submission_stats where submission_id in
      (select id from submissions where member_id in (select id from _smoke));
    delete from submissions where member_id in (select id from _smoke);
    delete from membership_request_stats where request_id in
      (select id from membership_requests
        where ${SMOKE} or member_id in (select id from _smoke));
    delete from membership_requests
      where ${SMOKE} or member_id in (select id from _smoke);
    delete from members where id in (select id from _smoke);
    commit;
  `)

  console.log('[smoke-cleanup] after:', await census())

}

await main()
