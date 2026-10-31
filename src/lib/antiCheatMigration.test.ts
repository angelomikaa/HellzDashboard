// Phase 10.5 contract locks for migration 0046 (static, no DB in this repo's
// test environment). These assertions guard the parts a future edit must never
// silently regress: the owner thresholds, the server-only surfaces and the
// additive officer_queue wiring.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0046_anti_cheat_guardrails.sql', 'utf8')

describe('migration 0046 — anti-cheat guardrails', () => {
  it('ships the append-only provenance table with RLS deny-all', () => {
    expect(sql).toContain('create table if not exists public.submission_provenance')
    expect(sql).toContain('alter table public.submission_provenance enable row level security')
    expect(sql).toContain(
      'revoke all on public.submission_provenance from public, anon, authenticated',
    )
    // RLS on with no policies: there is no `create policy ... on submission_provenance`.
    expect(sql).not.toMatch(/create policy[\s\S]*?on public\.submission_provenance/i)
  })

  it('keeps the locked owner thresholds', () => {
    expect(sql).toContain('ss.value >= 1.5 * ba.avg_v')
    expect(sql).toContain('abs(v_projected - v_previous) >= 8')
  })

  it('watches exactly the four defense stats', () => {
    expect(sql).toContain(
      "ss2.stat_key in ('rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct')",
    )
  })

  it('keeps the review projection internal (no client EXECUTE)', () => {
    expect(sql).toContain(
      'revoke execute on function public.ovr_projection(uuid, text, text, jsonb, uuid) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'revoke execute on function public.submission_anti_cheat(uuid) from public, anon, authenticated',
    )
  })

  it('re-derives catalog final values from p_stats instead of trusting the client', () => {
    expect(sql).toContain("(e->>'input_key') in (select stat_key from stat_catalog)")
    expect(sql).toContain("select (st->>'value')::numeric")
  })

  it('drops the old 2-arg create_submission and keeps the defaults', () => {
    expect(sql).toContain('drop function if exists public.create_submission(jsonb, jsonb)')
    expect(sql).toContain('p_identity jsonb default null')
    expect(sql).toContain('p_provenance jsonb default null')
  })

  it('adds anti_cheat to officer_queue without removing the existing fields', () => {
    expect(sql).toContain("'anti_cheat', public.submission_anti_cheat(s.id)")
    for (const field of [
      "'submission_id', s.id",
      "'submitted_at', s.submitted_at",
      "'display_name', m.display_name",
      "'char_class', coalesce(s.char_class, m.char_class)",
      "'char_function', coalesce(s.char_function, m.char_function)",
    ]) {
      expect(sql).toContain(field)
    }
  })

  it('records its bookkeeping row and reloads the PostgREST schema', () => {
    expect(sql).toContain("values ('0046', 'anti_cheat_guardrails', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
