// Phase 10.8 contract locks for migration 0051 (read-only regression dataset).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0051_regression_dataset.sql', 'utf8')

describe('migration 0051 — regression dataset', () => {
  it('is staff-only and read-only', () => {
    expect(sql).toContain("not in ('officer', 'owner')")
    expect(sql).toContain(
      'revoke execute on function public.stat_regression_dataset() from public, anon',
    )
    // No table writes in the migration beyond the bookkeeping row.
    expect(sql).not.toMatch(/insert into public\.(submission|member|stat)/i)
    expect(sql).not.toMatch(/update public\.(submission|member|stat)/i)
    expect(sql).not.toMatch(/delete from public\.(submission|member|stat)/i)
  })

  it('returns the four real attack fields and marks the flat equipment fields absent', () => {
    for (const key of ['matk', 'matk_pct', 'patk', 'patk_pct']) {
      expect(sql).toContain(`'${key}'`)
    }
    expect(sql).toContain("'equip_matk'")
    expect(sql).toContain("'equip_patk'")
    expect(sql).toContain("'available', false")
  })

  it('uses the latest validated value per member and excludes fixtures', () => {
    expect(sql).toContain("s.status = 'validated'")
    expect(sql).toContain("m.discord_handle not like 'smoke%'")
    expect(sql).toContain("m.discord_handle not like 'dummy-%'")
    expect(sql).toContain('distinct on (m.id, ss.stat_key)')
  })

  it('reports coverage including repeated submitters and total submissions', () => {
    expect(sql).toContain("'complete_both_pairs'")
    expect(sql).toContain("'repeated_submitters'")
    expect(sql).toContain("'total_validated_submissions'")
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0051', 'regression_dataset', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
