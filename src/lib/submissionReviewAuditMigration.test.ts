// Contract locks for migration 0065 — the append-only validation audit trail.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILE = 'supabase/migrations/0065_submission_review_audit.sql'
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

describe('migration 0065 — submission review audit', () => {
  it('creates a deny-all append-only table', () => {
    expect(sql).toContain('create table if not exists public.submission_reviews')
    expect(sql).toContain(
      "decision text not null check (decision in ('validated', 'rejected', 'reopened'))",
    )
    expect(sql).toContain('alter table public.submission_reviews enable row level security')
    expect(sql).toContain('revoke all on public.submission_reviews from public, anon, authenticated')
  })

  it('records the decision AFTER the row_count check (never before)', () => {
    const diagnosticsAt = sql.indexOf('get diagnostics v_count = row_count;')
    const notPendingAt = sql.indexOf("raise exception 'not_pending';")
    const insertAt = sql.indexOf('insert into public.submission_reviews')
    expect(diagnosticsAt).toBeGreaterThan(-1)
    expect(notPendingAt).toBeGreaterThan(diagnosticsAt)
    expect(insertAt).toBeGreaterThan(notPendingAt)
    expect(sql).toContain("values (p_submission, (auth.jwt()->>'member_id')::uuid, p_status)")
  })

  it('exposes a staff-only read surface with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.recent_submission_reviews(p_limit int default 50)')
    expect(sql).toContain("raise exception 'forbidden';")
    expect(sql).toContain('revoke all on function public.recent_submission_reviews(int) from public, anon')
    expect(sql).toContain('grant execute on function public.recent_submission_reviews(int) to authenticated')
    expect(sql.toLowerCase()).toContain('set search_path = public')
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0065', 'submission_review_audit', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })

  it('the LATEST definition of set_submission_status keeps the audit insert', () => {
    const latest = latestDefinition('set_submission_status')
    expect(latest).not.toBeNull()
    expect(latest?.file).toBe('0065_submission_review_audit.sql')
    expect(latest?.body).toContain('insert into public.submission_reviews')
  })

  it('is present in the canonical manifest', () => {
    const manifest = JSON.parse(
      readFileSync('supabase/migrations/manifest.json', 'utf8'),
    ) as { apply_order: string[]; retired: Record<string, string> }
    expect(manifest.apply_order).toContain(
      '0065_submission_review_audit.sql',
    )
    expect(Object.keys(manifest.retired)).not.toContain(
      '0065_submission_review_audit.sql',
    )
  })
})
