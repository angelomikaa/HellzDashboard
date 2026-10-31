// Phase 10.6 corrective contract (migration 0048): the anti-cheat baselines
// and the cross-cohort inspector must scope by cohort_group() exactly like the
// 0038 rank RPCs, or Menestrel/Cigana (Artista) comparisons and the OVR-swing
// projection silently break.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/0048_anticheat_merged_cohort_alignment.sql',
  'utf8',
)

describe('migration 0048 — merged cohort alignment', () => {
  it('scopes every anti-cheat baseline by cohort_group', () => {
    expect(sql).toContain(
      'public.cohort_group(m.char_class) = public.cohort_group(v_class)',
    )
    expect(sql).toContain(
      'public.cohort_group(m2.char_class) = public.cohort_group(v_class)',
    )
  })

  it('projects OVR on the merged key config', () => {
    expect(sql).toContain(
      'public.cohort_group(m.char_class) = public.cohort_group(p_class)',
    )
    expect(sql).toContain('where ks.class_name = public.cohort_group(p_class)')
  })

  it('uses the merged cohort for the inspector class average', () => {
    expect(sql).toContain(
      'public.cohort_group(l2.char_class) = public.cohort_group(r.char_class)',
    )
  })

  it('keeps the locked thresholds and the literal class-change rule', () => {
    expect(sql).toContain('ss.value >= 1.5 * ba.avg_v')
    expect(sql).toContain('l.value >= 1.5 * a.avg_v')
    expect(sql).toContain('v_class_changed := v_class is distinct from v_member_class')
  })

  it('re-creates all four functions and keeps the internal/leaf grants', () => {
    for (const fn of [
      'public.defense_cohort_baselines()',
      'public.ovr_projection(',
      'public.submission_anti_cheat(',
      'public.stat_overview(',
    ]) {
      expect(sql).toContain(fn)
    }
    expect(sql).toContain(
      'revoke execute on function public.ovr_projection(uuid, text, text, jsonb, uuid) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.stat_overview(text) to authenticated',
    )
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0048', 'anticheat_merged_cohort_alignment', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
