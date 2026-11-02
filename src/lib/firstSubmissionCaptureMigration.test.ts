// Contract locks for 0070 (pct-only inflation) and 0071 (cohort-level defense
// signature). Together they make a first submission reviewable even without a
// personal history: +20 p.p. pct-only becomes an anomaly, and the known
// Angelus/Assumptio shape becomes 'buffed'.
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

describe('migration 0070 — isolated percentage inflation', () => {
  const sql = readFileSync('supabase/migrations/0070_curve_pct_inflation.sql', 'utf8')

  it('flags a pct at least 20 p.p. above the median with a low base', () => {
    expect(sql).toContain('v_pct_inflation boolean := false;')
    expect(sql).toContain('(v_pct - v_median_pct) >= 20')
    expect(sql).toContain('v_z_pct >= 2.0')
    expect(sql).toContain('v_z_base <= -1.5')
    expect(sql).toContain('or v_pct_inflation;')
  })

  it('stays an anomaly (curve), never a known buff label', () => {
    expect(sql).toContain("when v_impositio then 'impositio'")
    expect(sql).toContain("when v_curve then 'curve'")
    expect(sql).toContain('reason')
  })

  it('is the latest definition and is in the manifest', () => {
    const latest = latestDefinition('curve_deviation')
    expect(latest?.file).toBe('0070_curve_pct_inflation.sql')
    const manifest = JSON.parse(
      readFileSync('supabase/migrations/manifest.json', 'utf8'),
    ) as { apply_order: string[] }
    expect(manifest.apply_order).toContain('0070_curve_pct_inflation.sql')
  })
})

describe('migration 0071 — cohort-level defense signature', () => {
  const sql = readFileSync('supabase/migrations/0071_defense_cohort_signature.sql', 'utf8')

  it('adds the Angelus/Assumptio windows measured against the cohort median', () => {
    expect(sql).toContain('end as signature')
    expect(sql).toContain('between 80 and 110 then \'defense\'')
    expect(sql).toContain('between 1.6 and 2.3 then \'defense\'')
    expect(sql).toContain("'signature', c.signature")
  })

  it('includes signature rows and treats them as a known buff', () => {
    expect(sql).toContain('where c.z >= 3.5 or c.signature is not null')
    expect(sql).toContain("e->>'signature' = 'defense'")
    expect(sql).toContain("'Angelus/Assumptio em '")
  })

  it('is the latest definition and is in the manifest', () => {
    const latest = latestDefinition('submission_anti_cheat')
    const version = Number.parseInt(latest?.file.slice(0, 4) ?? '0', 10)
    // 0072 supersedes the body; the cohort defense signature must survive.
    expect(version).toBeGreaterThanOrEqual(71)
    expect(latest?.body).toContain("e->>'signature' = 'defense'")
    const manifest = JSON.parse(
      readFileSync('supabase/migrations/manifest.json', 'utf8'),
    ) as { apply_order: string[] }
    expect(manifest.apply_order).toContain('0071_defense_cohort_signature.sql')
  })
})
