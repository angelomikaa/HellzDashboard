// Phase 10.8 follow-up contract locks for migration 0053.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/0053_member_history_buff_detection.sql',
  'utf8',
)

describe('migration 0053 — member-history buff detection', () => {
  it('compares the pending values with the member validated history', () => {
    expect(sql).toContain("s.status = 'validated'")
    expect(sql).toContain('s.member_id = p_member')
    expect(sql).toContain('row_number() over')
    expect(sql).toContain('rn <= 10')
  })

  it('locks the known buff signatures', () => {
    expect(sql).toContain("stat_key in ('equip_matk_pct', 'equip_patk_pct')")
    expect(sql).toContain('delta between 25 and 45')
    expect(sql).toContain("stat_key in ('equip_pdef_pct', 'equip_mdef_pct')")
    expect(sql).toContain('delta between 80 and 110')
    expect(sql).toContain('value / prev_value between 1.6 and 2.3')
    expect(sql).toContain("'history_jump'")
  })

  it('adds the evidence to submission_anti_cheat and the flag', () => {
    expect(sql).toContain('public.member_history_deviations(p_submission, v_member)')
    expect(sql).toContain("'history_deviations', v_history")
    expect(sql).toContain('or v_history_flagged')
    expect(sql).toContain('revoke execute on function public.member_history_deviations(uuid, uuid)')
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0053', 'member_history_buff_detection', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
