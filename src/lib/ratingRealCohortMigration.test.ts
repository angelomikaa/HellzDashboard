// Migration 0079 contract locks (static, no DB in tests): the rating cohort is
// the REAL cohort whenever a stat has n >= 3 real members; fixtures remain only
// to satisfy the unchanged n >= 3 gate in small cohorts.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0079_rating_real_cohort_fallback.sql', 'utf8')
const manifest = JSON.parse(
  readFileSync('supabase/migrations/manifest.json', 'utf8'),
) as { apply_order: string[] }

const RATING_FUNCTIONS = [
  'my_report',
  'my_card',
  'class_top5',
  'role_rank',
  'get_promotion',
  'get_promotion_public',
  'staff_requests',
  'ovr_projection',
]

describe('migration 0079 — conditional real-cohort rating basis', () => {
  it('redefines every OVR-producing RPC with one shared basis', () => {
    for (const fn of RATING_FUNCTIONS) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`)
    }
  })

  it('splits each cohort into all/real and only keeps fixtures under n < 3', () => {
    expect(sql.match(/cohort_all as \(/g)).toHaveLength(RATING_FUNCTIONS.length)
    expect(sql.match(/cohort_real_n as \(/g)).toHaveLength(RATING_FUNCTIONS.length)
    expect(sql.match(/where not c\.is_fixture or coalesce\(r\.n, 0\) < 3/g)).toHaveLength(
      RATING_FUNCTIONS.length,
    )
  })

  it('treats both fixture prefixes as non-real', () => {
    expect(sql.match(/like 'smoke%'/g)?.length).toBeGreaterThanOrEqual(RATING_FUNCTIONS.length)
    expect(sql.match(/like 'dummy-%'/g)?.length).toBeGreaterThanOrEqual(RATING_FUNCTIONS.length)
  })

  it('keeps the payload shapes and the direction-aware points formula', () => {
    expect(sql).toContain("'best'")
    expect(sql).toContain("'points'")
    expect(sql).toContain("'ovr'")
    expect(sql).toContain("'class_average'")
    expect(sql).toContain("'data_sufficient'")
    expect(sql).toContain('least(greatest(')
    expect(sql).toContain('else o.value / nullif(a.max_v, 0)')
    expect(sql).toContain('when \'lower\' then o.value / nullif(a.min_v, 0)')
  })

  it('never removes the n >= 3 gate', () => {
    expect(sql).not.toContain('>= 2 and')
    expect(sql).toContain('>= 3')
  })

  it('records its bookkeeping row, reloads PostgREST and is in the manifest', () => {
    expect(sql).toContain("values ('0079', 'rating_real_cohort_fallback', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
    expect(manifest.apply_order).toContain('0079_rating_real_cohort_fallback.sql')
  })
})
