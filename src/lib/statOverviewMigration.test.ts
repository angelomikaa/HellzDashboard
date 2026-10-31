// Phase 10.6 contract locks for migration 0047 (static, no DB in tests).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0047_cross_cohort_stat_overview.sql', 'utf8')

describe('migration 0047 — cross-cohort stat overview', () => {
  it('is staff-only and client-invocable', () => {
    expect(sql).toContain("not in ('officer', 'owner')")
    expect(sql).toContain(
      'revoke execute on function public.stat_overview(text) from public, anon',
    )
    expect(sql).toContain('grant execute on function public.stat_overview(text) to authenticated')
  })

  it('reads only the latest VALIDATED value per member and excludes fixtures', () => {
    expect(sql).toContain("s.status = 'validated'")
    expect(sql).toContain("m.discord_handle not like 'smoke%'")
    expect(sql).toContain("m.discord_handle not like 'dummy-%'")
    expect(sql).toContain('distinct on (m.id)')
  })

  it('keeps the class+role baseline self-excluded, matching 0046', () => {
    expect(sql).toContain('and l2.member_id <> r.member_id')
    expect(sql).toContain('case when a.n >= 3 then round(a.avg_v, 2) end')
  })

  it('keeps the direction-aware 1.5x / 0.5x review hints', () => {
    expect(sql).toContain("when v_dir = 'lower' then l.value <= 0.5 * a.avg_v")
    expect(sql).toContain('else l.value >= 1.5 * a.avg_v')
    expect(sql).toContain('when v_dir = \'lower\' then l.value <= 0.5 * g.avg_v')
  })

  it('returns every active real member, no-value rows last', () => {
    expect(sql).toContain('from roster r')
    expect(sql).toContain('left join latest l on l.member_id = r.member_id')
    expect(sql).toContain('order by l.value desc nulls last, r.display_name')
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0047', 'cross_cohort_stat_overview', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
