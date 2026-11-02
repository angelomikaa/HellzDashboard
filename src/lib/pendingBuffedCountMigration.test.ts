// Contract locks for migration 0069: the Validações badge counts buffed rows
// as a SUBSET of pending submissions, using the same category as the row chip.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILE = 'supabase/migrations/0069_pending_validation_count_buffed.sql'
const sql = readFileSync(FILE, 'utf8')

const MIGRATIONS = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => {
    const na = Number.parseInt(a.slice(0, 4), 10)
    const nb = Number.parseInt(b.slice(0, 4), 10)
    return na === nb ? a.localeCompare(b) : na - nb
  })

function latestDefinition(name: string): { file: string; body: string } | null {
  const needle = `create or replace function public.${name}(`
  for (let i = MIGRATIONS.length - 1; i >= 0; i -= 1) {
    const file = MIGRATIONS[i]
    const body = readFileSync(`supabase/migrations/${file}`, 'utf8')
    if (body.toLowerCase().includes(needle)) return { file, body }
  }
  return null
}

describe('migration 0069 — pending buffed count', () => {
  it('keeps the three queue counts and adds buffed as a subset', () => {
    expect(sql).toContain("'submissions', (")
    expect(sql).toContain("'identity_proofs', (")
    expect(sql).toContain("'requests', (")
    expect(sql).toContain("'buffed', (")
  })

  it('derives buffed from the same server-side category as the row chip', () => {
    expect(sql).toContain("public.submission_anti_cheat(s.id)->'review'->>'category'")
    expect(sql).toContain("= 'buffed'")
  })

  it('keeps the staff gate and grants', () => {
    expect(sql).toContain("raise exception 'forbidden';")
    expect(sql).toContain(
      'revoke execute on function public.pending_validation_count() from public, anon',
    )
    expect(sql).toContain(
      'grant execute on function public.pending_validation_count() to authenticated',
    )
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0069', 'pending_validation_count_buffed', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })

  it('is the latest definition and is in the manifest', () => {
    const latest = latestDefinition('pending_validation_count')
    expect(latest?.file).toBe('0069_pending_validation_count_buffed.sql')
    expect(latest?.body).toContain("'buffed', (")
    const manifest = JSON.parse(
      readFileSync('supabase/migrations/manifest.json', 'utf8'),
    ) as { apply_order: string[] }
    expect(manifest.apply_order).toContain('0069_pending_validation_count_buffed.sql')
  })
})
