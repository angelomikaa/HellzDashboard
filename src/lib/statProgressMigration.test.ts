// Phase 10.13 contract locks for migration 0074 (static, no DB in tests).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0074_stat_progress_trackers.sql', 'utf8')
const manifest = JSON.parse(
  readFileSync('supabase/migrations/manifest.json', 'utf8'),
) as { apply_order: string[] }

describe('migration 0074 — stat progress trackers', () => {
  it('is member-invocable but gated internally and closed to anon', () => {
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain("SET search_path TO 'public'")
    expect(sql).toContain('no_member_claim')
    expect(sql).toContain('from members m where m.id = v_member and m.active')
    expect(sql).toContain('revoke execute on function public.my_stat_progress(text[]) from anon')
    expect(sql).toContain('grant execute on function public.my_stat_progress(text[]) to authenticated')
  })

  it('reads the same non-rejected/discarded basis as my_report', () => {
    expect(sql).toContain("sub.status not in ('rejected', 'discarded')")
    expect(sql).toContain('submitted_at desc, sub.id desc')
  })

  it('returns the last three own submissions only', () => {
    expect(sql).toContain('partition by ss.stat_key')
    expect(sql).toContain('h.rn <= 3')
  })

  it('computes three DISTINCT references: class, function and cohort', () => {
    expect(sql).toContain('agg_class as')
    expect(sql).toContain('agg_function as')
    expect(sql).toContain('agg_cohort as')
    // class = same merged class, ANY role; function = same role, ANY class.
    expect(sql).toContain('where cohort_class = v_group')
    expect(sql).toContain('where char_function = v_function')
    expect(sql).toContain('where cohort_class = v_group and char_function = v_function')
    expect(sql).toContain("'class_average'")
    expect(sql).toContain("'function_average'")
    expect(sql).toContain("'cohort_average'")
  })

  it('keeps the n >= 3 data-sufficiency gate on every average', () => {
    expect(sql).toContain('when ac.n >= 3 then round(ac.avg_v, 2)')
    expect(sql).toContain('when af.n >= 3 then round(af.avg_v, 2)')
    expect(sql).toContain('when ah.n >= 3 then round(ah.avg_v, 2)')
  })

  it('allow-lists requested keys against the catalog (no config exposure)', () => {
    expect(sql).toContain('from unnest(coalesce(p_stat_keys')
    expect(sql).toContain('where exists (select 1 from stat_catalog c where c.stat_key = k)')
    expect(sql).not.toContain('class_key_stats')
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0074', 'stat_progress_trackers', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })

  it('is registered in the migration manifest', () => {
    expect(manifest.apply_order).toContain('0074_stat_progress_trackers.sql')
  })
})
