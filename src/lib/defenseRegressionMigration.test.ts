// Contract locks for 0072: PDEF/MDEF regression with both Assumptio
// hypotheses (x-shift +95 p.p. on the %, y-scale x1.95 on the raw defense).
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILE = 'supabase/migrations/0072_defense_regression.sql'
const sql = readFileSync(FILE, 'utf8')

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

describe('migration 0072 — defense regression', () => {
  it('fits the cohort and tests BOTH Assumptio hypotheses', () => {
    expect(sql).toContain('create or replace function public.defense_curve(')
    expect(sql).toContain('regr_slope(flat, pct)')
    expect(sql).toContain('v_x_expected := v_intercept + v_slope * (v_pct - 95)')
    expect(sql).toContain('(v_flat / 1.95) - v_expected')
    expect(sql).toContain('x_shift_possible')
    expect(sql).toContain('y_scale_possible')
  })

  it('trusts the model only above R² 0.25 and returns the values otherwise', () => {
    expect(sql).toContain('coalesce(v_r2, 0) >= 0.25')
    expect(sql).toContain("'available', false")
  })

  it('wires the curves into the anti-cheat payload and anomaly reason', () => {
    expect(sql).toContain("'defense_curves', v_defense_curves")
    expect(sql).toContain('or v_defense_flagged')
    expect(sql).toContain('Defesa (PDEF/MDEF) fora da curva')
  })

  it('keeps the known signature as the only defense buff label', () => {
    expect(sql).toContain("between 80 and 110 then 'defense'")
    expect(sql).toContain('between 1.6 and 2.3 then \'defense\'')
  })

  it('records its bookkeeping row and is the latest defense_curve', () => {
    expect(sql).toContain("values ('0072', 'defense_regression', null)")
    const latest = latestDefinition('defense_curve')
    expect(latest?.file).toBe('0072_defense_regression.sql')
    const manifest = JSON.parse(
      readFileSync('supabase/migrations/manifest.json', 'utf8'),
    ) as { apply_order: string[] }
    expect(manifest.apply_order).toContain('0072_defense_regression.sql')
  })
})
