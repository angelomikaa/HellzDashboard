// Phase 10.13 contract locks for migration 0074 (static, no DB in tests).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0074_stat_progress_trackers.sql', 'utf8')
const sql0075 = readFileSync('supabase/migrations/0075_progress_real_references.sql', 'utf8')
const sql0076 = readFileSync('supabase/migrations/0076_real_guild_averages.sql', 'utf8')
const sql0077 = readFileSync('supabase/migrations/0077_ranking_real_rows.sql', 'utf8')
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
    expect(manifest.apply_order).toContain('0075_progress_real_references.sql')
    expect(manifest.apply_order).toContain('0076_real_guild_averages.sql')
    expect(manifest.apply_order).toContain('0077_ranking_real_rows.sql')
  })
})

describe('migration 0076 — real-guild displayed averages', () => {
  it('adds a fixture-free display aggregate to my_report and role_rank', () => {
    expect(sql0076).toContain('cohort_real as')
    expect(sql0076).toContain('agg_real as')
    expect(sql0076).toContain('left join agg_real ar on ar.stat_key = c.stat_key')
    expect(sql0076).toContain('left join agg_real agr')
    expect(sql0076).toContain("coalesce(m.discord_handle, '') not like 'smoke%'")
    expect(sql0076).toContain("coalesce(m.discord_handle, '') not like 'dummy-%'")
  })

  it('keeps the rating basis on the all-active agg (no OVR change)', () => {
    // The points/OVR subqueries still join the unfiltered agg.
    expect(sql0076).toContain('left join agg a on a.stat_key = ks.stat_key')
    expect(sql0076).toContain('left join agg ag on ag.stat_key = ks.stat_key and ag.char_class = rm.char_class')
  })
})

describe('migration 0077 — fixture-free ranking lists', () => {
  it('outputs real rows while keeping the all-active rating basis', () => {
    expect(sql0077).toContain('role_members_real as')
    expect(sql0077).toContain('class_members_real as')
    expect(sql0077).toContain('from role_members_real rm')
    expect(sql0077).toContain('from class_members_real cm')
    // The OVR lateral still reads the unfiltered agg.
    expect(sql0077).toContain('left join agg ag on ag.stat_key = ks.stat_key and ag.char_class = rm.char_class')
  })
})

describe('migration 0075 — real-members-only progress references', () => {
  it('supersedes the 0074 body without changing the payload shape', () => {
    expect(sql0075).toContain('create or replace function public.my_stat_progress(p_stat_keys text[])')
    expect(sql0075).toContain("'class_average'")
    expect(sql0075).toContain("'function_average'")
    expect(sql0075).toContain("'cohort_average'")
    expect(sql0075).toContain('h.rn <= 3')
  })

  it('excludes smoke/dummy fixtures from the three aggregates', () => {
    expect(sql0075).toContain("coalesce(m.discord_handle, '') not like 'smoke%'")
    expect(sql0075).toContain("coalesce(m.discord_handle, '') not like 'dummy-%'")
    // The caller's own history still reads every non-rejected/discarded row.
    expect(sql0075).toContain('where sub.member_id = v_member')
  })

  it('keeps the member gate and the anon denial', () => {
    expect(sql0075).toContain('SECURITY DEFINER')
    expect(sql0075).toContain('no_member_claim')
    expect(sql0075).toContain('revoke execute on function public.my_stat_progress(text[]) from anon')
    expect(sql0075).toContain('grant execute on function public.my_stat_progress(text[]) to authenticated')
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql0075).toContain("values ('0075', 'progress_real_references', null)")
    expect(sql0075).toContain("notify pgrst, 'reload schema'")
  })
})
