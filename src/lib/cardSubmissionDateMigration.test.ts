// Phase 10.13 follow-up contract locks for migration 0078 (static, no DB).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0078_card_submission_date.sql', 'utf8')
const manifest = JSON.parse(
  readFileSync('supabase/migrations/manifest.json', 'utf8'),
) as { apply_order: string[] }

describe('migration 0078 — submission date on the showcase cards', () => {
  it('adds last_submitted_at to both promotion RPCs', () => {
    expect(sql).toContain('create or replace function public.get_promotion()')
    expect(sql).toContain('create or replace function public.get_promotion_public()')
    expect(sql.match(/last_submitted as \(/g)).toHaveLength(2)
    expect(sql.match(/'last_submitted_at', ls\.last_submitted_at/g)).toHaveLength(2)
    expect(sql.match(/left join last_submitted ls on ls\.member_id = t\.id/g)).toHaveLength(2)
  })

  it('uses the same value basis: non-rejected/discarded submissions', () => {
    expect(sql.match(/where sub\.status not in \('rejected','discarded'\)/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql).toContain('max(sub.submitted_at) as last_submitted_at')
  })

  it('keeps the public raw-value gate and the member gate', () => {
    expect(sql).toContain('v_show_values')
    expect(sql).toContain("'value', case when v_show_values then lt.value else null end")
    expect(sql).toContain('no_member_claim')
    expect(sql).toContain('grant execute on function public.get_promotion_public() to anon, authenticated')
  })

  it('records its bookkeeping row, reloads PostgREST and is in the manifest', () => {
    expect(sql).toContain("values ('0078', 'card_submission_date', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
    expect(manifest.apply_order).toContain('0078_card_submission_date.sql')
  })
})
