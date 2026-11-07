// Contract locks for the public showcase stat gate (0045 restored by 0063).
//
// Why this file exists: 0045 shipped the server-side gate, but it was never
// applied live and 0055 re-created get_promotion_public() from the pre-0045
// body. Nothing caught it because the gate had no static lock and the parity
// smoke only checks OVR. These tests fail the day a future supersession drops
// the gate again — the "latest definition wins" test is the permanent guard.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0063_public_promotion_stat_gate.sql', 'utf8')

const MIGRATIONS = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => {
    const na = Number.parseInt(a.slice(0, 4), 10)
    const nb = Number.parseInt(b.slice(0, 4), 10)
    return na === nb ? a.localeCompare(b) : na - nb
  })

/** The highest-numbered migration that re-creates get_promotion_public(). */
function latestPublicPromotionDefinition(): { file: string; body: string } | null {
  for (let i = MIGRATIONS.length - 1; i >= 0; i -= 1) {
    const file = MIGRATIONS[i]
    const body = readFileSync(`supabase/migrations/${file}`, 'utf8')
    if (body.includes('create or replace function public.get_promotion_public()')) {
      return { file, body }
    }
  }
  return null
}

describe('migration 0063 — public showcase stat gate', () => {
  it('withholds the raw value unless the caller is an ACTIVE member', () => {
    expect(sql).toContain('v_show_values boolean;')
    expect(sql).toContain('v_show_values := exists (')
    expect(sql).toContain("where m.id = (auth.jwt() ->> 'member_id')::uuid")
    expect(sql).toContain('and m.active')
    expect(sql).toContain("'value', case when v_show_values then lt.value else null end")
  })

  it('keeps points, value_type and identity public (tier banding must work)', () => {
    expect(sql).toContain("'value_type', sc.value_type")
    expect(sql).toContain("'points', case")
    expect(sql).toContain("'char_class', t.own_class")
    expect(sql).toContain("'photo_path'")
  })

  it('keeps the 0055 placeholder flag and the 0037 meta top-3 rules', () => {
    expect(sql).toContain('coalesce(m.discord_handle like \'smoke%\', false) as is_placeholder')
    expect(sql).toContain("'placeholder', t.is_placeholder")
    expect(sql).toContain('and cc.meta')
    expect(sql).toContain('where t.rn <= 3')
  })

  it('stays anon-callable but records its bookkeeping row and reloads PostgREST', () => {
    expect(sql).toContain('grant execute on function public.get_promotion_public() to anon, authenticated')
    expect(sql).toContain("values ('0063', 'public_promotion_stat_gate', null)")
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })

  it('keeps the gate in the LATEST repo definition of get_promotion_public()', () => {
    const latest = latestPublicPromotionDefinition()
    expect(latest).not.toBeNull()
    // Later migrations (0073 OVR/relevant, 0078 card date) may re-create the
    // function; the 0063 gate must survive every supersession.
    expect(latest?.body).toContain('v_show_values')
    expect(latest?.body).toContain(
      "'value', case when v_show_values then lt.value else null end",
    )
  })
})
