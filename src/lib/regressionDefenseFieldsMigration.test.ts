// Phase 10.8 extension contract locks for migration 0052 (defense fields).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/0052_regression_defense_fields.sql',
  'utf8',
)

describe('migration 0052 — defense fields for Angelus/Assumptio', () => {
  it('extends the dataset with the defense fields', () => {
    for (const key of ['rpdef', 'rmdef', 'equip_pdef_pct', 'equip_mdef_pct', 'pdef', 'mdef']) {
      expect(sql).toContain(`'${key}'`)
    }
    expect(sql).toContain("'complete_rpdef_pairs'")
    expect(sql).toContain("'complete_rmdef_pairs'")
  })

  it('still marks the flat equipment defense values as unavailable', () => {
    expect(sql).toContain("'equip_pdef'")
    expect(sql).toContain("'equip_mdef'")
    expect(sql).toContain("'available', false")
  })

  it('stays staff-only and read-only', () => {
    expect(sql).toContain("not in ('officer', 'owner')")
    expect(sql).not.toMatch(/insert into public\.(submission|member|stat)/i)
    expect(sql).not.toMatch(/update public\.(submission|member|stat)/i)
    expect(sql).not.toMatch(/delete from public\.(submission|member|stat)/i)
  })

  it('records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain("values ('0052', 'regression_defense_fields', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
