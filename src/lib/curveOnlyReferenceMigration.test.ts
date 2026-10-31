// Phase 10.7 plan 02 contract locks for migration 0050: the fixed-threshold
// reference is discarded; only the robust curve flags a submission.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0050_curve_only_reference.sql', 'utf8')

describe('migration 0050 — curve-only reference', () => {
  it('requires the n >= 5 robust curve gate', () => {
    expect(sql).toContain('having count(*) >= 5')
    expect(sql).toContain('percentile_cont(0.5) within group (order by value) as med_v')
    expect(sql).toContain(
      'percentile_cont(0.5) within group (order by abs(l.value - m.med_v)) as mad_v',
    )
  })

  it('flags defense values on the sigma only — never the 1.5x ratio', () => {
    expect(sql).toContain('where c.z >= 3.5')
    expect(sql).not.toContain('c.value >= 1.5 * c.avg_v')
    expect(sql).toContain("'reason', 'sigma'")
  })

  it('keeps the average/ratio in the payload only for cached clients', () => {
    expect(sql).toContain("'baseline', round(c.avg_v, 2)")
    expect(sql).toContain("'ratio', round(c.value / c.avg_v, 2)")
    expect(sql).toContain("'median', case when c.med_v is not null")
    expect(sql).toContain("'mad', case when c.mad_v is not null")
    expect(sql).toContain("'z', case when c.z is not null")
  })

  it('keeps the ATK/MATK curve deviations and the OVR swing', () => {
    expect(sql).toContain(
      "public.curve_deviation(p_submission, v_class, v_function, 'patk', 'equip_patk_pct')",
    )
    expect(sql).toContain(
      "public.curve_deviation(p_submission, v_class, v_function, 'matk', 'equip_matk_pct')",
    )
    expect(sql).toContain("'curve_deviations', v_curves")
    expect(sql).toContain('abs(v_projected - v_previous) >= 8')
  })

  it('keeps the internal/leaf grants and records its bookkeeping row', () => {
    expect(sql).toContain(
      'revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.defense_cohort_baselines() to authenticated',
    )
    expect(sql).toContain("values ('0050', 'curve_only_reference', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
