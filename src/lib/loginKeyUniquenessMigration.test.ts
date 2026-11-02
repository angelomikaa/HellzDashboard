// Contract locks for migration 0066 — the login key must be generated, unique
// among active rows, and guarded by a clean duplicate_nickname error.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILE = 'supabase/migrations/0066_login_key_uniqueness.sql'
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

describe('migration 0066 — login key uniqueness', () => {
  it('converges login_key to a generated column', () => {
    expect(sql).toContain("and is_generated <> 'ALWAYS'")
    expect(sql).toContain(
      'add column login_key text generated always as (lower(btrim(display_name))) stored',
    )
  })

  it('enforces one ACTIVE row per nickname', () => {
    expect(sql).toContain('create unique index if not exists members_active_login_key_key')
    expect(sql).toContain('on public.members (login_key)')
    expect(sql).toContain('where active')
  })

  it('guards add_member and correct_identity with duplicate_nickname', () => {
    expect(sql.match(/raise exception 'duplicate_nickname';/g)?.length).toBe(2)
    expect(sql).toContain('where m.login_key = lower(btrim(v_name))')
    expect(sql).toContain('where m.login_key = lower(btrim(v_nickname))')
    expect(sql).toContain('and m.id <> p_member')
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0066', 'login_key_uniqueness', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })

  it('the LATEST definitions keep both guards', () => {
    for (const name of ['add_member', 'correct_identity']) {
      const latest = latestDefinition(name)
      expect(latest, name).not.toBeNull()
      expect(latest?.file, name).toBe('0066_login_key_uniqueness.sql')
      expect(latest?.body, name).toContain("raise exception 'duplicate_nickname';")
    }
  })

  it('is present in the canonical manifest', () => {
    const manifest = JSON.parse(
      readFileSync('supabase/migrations/manifest.json', 'utf8'),
    ) as { apply_order: string[]; retired: Record<string, string> }
    expect(manifest.apply_order).toContain('0066_login_key_uniqueness.sql')
    expect(Object.keys(manifest.retired)).not.toContain('0066_login_key_uniqueness.sql')
  })
})
