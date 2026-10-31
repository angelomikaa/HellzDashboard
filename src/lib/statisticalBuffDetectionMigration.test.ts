// Phase 10.7 contract locks for migration 0049 (static, no DB in tests).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/0049_statistical_buff_detection.sql',
  'utf8',
)

describe('migration 0049 — statistical buff detection', () => {
  it('builds the proportional curve from the normalized flat stat', () => {
    expect(sql).toContain('v_base := v_flat / (1 + v_pct / 100)')
    expect(sql).toContain('percentile_cont(0.5) within group (order by base) as median_base')
    expect(sql).toContain(
      'percentile_cont(0.5) within group (order by abs(p.base - med.median_base)) as mad_base',
    )
    expect(sql).toContain('v_expected_flat := v_median_base * (1 + v_pct / 100)')
  })

  it('keeps the Impositio Manus undo test (+35% flat, +35 p.p. ATK%)', () => {
    expect(sql).toContain('v_base_debuff := v_flat / 1.35 / (1 + (v_pct - 35) / 100)')
    expect(sql).toContain('v_z_pct >= 2.0')
    expect(sql).toContain('abs(v_z_debuff) <= 1.5')
    expect(sql).toContain('v_z_debuff < v_z_base - 0.5')
  })

  it('keeps the general curve and sigma thresholds', () => {
    expect(sql).toContain('abs(v_z_base) >= 3.5 or abs(coalesce(v_curve_dev, 0)) >= 0.30')
    expect(sql).toContain('c.z >= 3.5')
    expect(sql).toContain('having count(*) >= 5')
  })

  it('adds curve deviations to the officer payload and the flag', () => {
    expect(sql).toContain(
      "public.curve_deviation(p_submission, v_class, v_function, 'patk', 'equip_patk_pct')",
    )
    expect(sql).toContain(
      "public.curve_deviation(p_submission, v_class, v_function, 'matk', 'equip_matk_pct')",
    )
    expect(sql).toContain("'curve_deviations', v_curves")
    expect(sql).toContain('or v_curve_flagged')
  })

  it('adds the cohort median/MAD/sigma to the inspector', () => {
    expect(sql).toContain("'class_median'")
    expect(sql).toContain("'class_mad'")
    expect(sql).toContain("'class_z'")
    expect(sql).toContain("'class_sigma_outlier'")
    expect(sql).toContain('<= -3.5')
  })

  it('keeps the internal curve helper off the client surface', () => {
    expect(sql).toContain(
      'revoke execute on function public.curve_deviation(uuid, text, text, text, text) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated',
    )
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0049', 'statistical_buff_detection', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
