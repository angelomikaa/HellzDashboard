// Contract locks for 0067 (material history delta) and 0068 (consistent may
// rely on self-history). These two rules decide whether an officer sees a
// false "Salto no histórico" on an unchanged resubmission, and whether a clean
// row in a small cohort can ever be "Consistente".
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MIGRATIONS = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => {
    const na = Number.parseInt(a.slice(0, 4), 10)
    const nb = Number.parseInt(b.slice(0, 4), 10)
    return na === nb ? a.localeCompare(b) : na - nb
  })

function latestDefinition(name: string): { file: string; body: string } | null {
  const needle = `create or replace function public.${name}(`
  for (let i = MIGRATIONS.length - 1; i >= 0; i -= 1) {
    const file = MIGRATIONS[i]
    const body = readFileSync(`supabase/migrations/${file}`, 'utf8')
    if (body.toLowerCase().includes(needle)) return { file, body }
  }
  return null
}

describe('migration 0067 — history_jump needs a material change', () => {
  const sql = readFileSync('supabase/migrations/0067_history_jump_material_delta.sql', 'utf8')

  it('gates the robust z on a real delta', () => {
    expect(sql).toContain("when z is not null and z >= 3.5")
    expect(sql).toContain("(value_type = 'percentual' and abs(delta) >= 5)")
    expect(sql).toContain('abs(delta) / abs(prev_value) >= 0.03')
  })

  it('keeps the explicit large-change branches', () => {
    expect(sql).toContain("when value_type = 'percentual' and abs(delta) >= 20 then 'history_jump'")
    expect(sql).toContain('>= 0.25 then')
  })

  it('is the latest definition and is in the manifest', () => {
    const latest = latestDefinition('member_history_deviations')
    expect(latest?.file).toBe('0067_history_jump_material_delta.sql')
    expect(latest?.body).toContain('abs(delta) / abs(prev_value) >= 0.03')
    const manifest = JSON.parse(
      readFileSync('supabase/migrations/manifest.json', 'utf8'),
    ) as { apply_order: string[] }
    expect(manifest.apply_order).toContain('0067_history_jump_material_delta.sql')
  })
})

describe('migration 0068 — consistent may rely on self-history', () => {
  const sql = readFileSync('supabase/migrations/0068_consistent_with_history.sql', 'utf8')

  it('requires BOTH references to be missing for the forced inconclusive', () => {
    expect(sql).toContain(
      'elsif v_anomaly or not (v_cohort_available or v_history_available) then',
    )
    // The old 0054 condition must not be the one in force.
    expect(sql).not.toContain('elsif v_anomaly or not v_cohort_available then')
  })

  it('is the latest definition and is in the manifest', () => {
    const latest = latestDefinition('submission_anti_cheat')
    const version = Number.parseInt(latest?.file.slice(0, 4) ?? '0', 10)
    // 0071 supersedes the body; the 0068 category rule must survive.
    expect(version).toBeGreaterThanOrEqual(68)
    expect(latest?.body).toContain(
      'not (v_cohort_available or v_history_available)',
    )
    const manifest = JSON.parse(
      readFileSync('supabase/migrations/manifest.json', 'utf8'),
    ) as { apply_order: string[] }
    expect(manifest.apply_order).toContain('0068_consistent_with_history.sql')
  })
})
