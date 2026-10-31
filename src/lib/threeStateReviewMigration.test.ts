// Phase 10.8-04 contract locks for migration 0054.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/0054_three_state_review_category.sql',
  'utf8',
)

describe('migration 0054 — three-state review category', () => {
  it('defines the three server-side categories', () => {
    expect(sql).toContain("v_category := 'buffed'")
    expect(sql).toContain("v_category := 'inconclusive'")
    expect(sql).toContain("v_category := 'consistent'")
  })

  it('classifies known buff patterns as buffed and other anomalies as inconclusive', () => {
    expect(sql).toContain("e->>'pattern' in ('impositio', 'defense')")
    expect(sql).toContain("e->>'reason' = 'impositio'")
    expect(sql).toContain("e->>'pattern' = 'history_jump'")
    expect(sql).toContain('v_swing_flagged')
  })

  it('is inconclusive when no reliable reference exists', () => {
    expect(sql).toContain('not v_cohort_available')
    expect(sql).toContain('Sem baseline de coorte (n<5) nem histórico validado.')
  })

  it('exposes the review object and makes flagged mean non-consistent', () => {
    expect(sql).toContain("'review', jsonb_build_object(")
    expect(sql).toContain("'category', v_category")
    expect(sql).toContain("'reasons', v_reasons")
    expect(sql).toContain("'flagged', v_category <> 'consistent'")
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0054', 'three_state_review_category', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
