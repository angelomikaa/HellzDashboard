// Catalog seed classification pins (D-05-UAT-10, TDD RED).
// Behavior source: 05-UAT.md round-4, owner-authoritative 2026-10-12 —
// "Some attributes exist in both forms, as a flat and as a percentual, so
// there's no ambiguity": the 6 flat damage stats (owner's pt-BR labels ->
// catalog keys below) are FLAT values in the game and must never be
// classified percentual. Genuinely percentual siblings (the _r/_pct/dmg_vs
// families) keep their % handling.
//
// The seed (supabase/seeds/stat_catalog.sql) is the classification's SINGLE
// definition site: the client consumes entry.value_type from the DB catalog
// (fetchCatalog), so the typed-value validation display, the review-step
// formatting, and the dashboard FLAT/PERCENTUAL badges all inherit from
// these rows. The OCR read path is parse-flag based (trailing %) and never
// consults the catalog, so typed and read validation agree once this source
// is right.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SEED_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/seeds/stat_catalog.sql',
)
const SEED = readFileSync(SEED_PATH, 'utf8')

/** Extract the value_type of one stat_key row from the seed SQL. */
function valueTypeOf(statKey: string): string | null {
  const match = SEED.match(new RegExp(`\\('${statKey}','[^']*','[^']*','(flat|percentual)'\\)`))
  return match ? match[1] : null
}

/** Extract the label of one stat_key row (the owner's pt-BR name). */
function labelOf(statKey: string): string | null {
  const match = SEED.match(new RegExp(`\\('${statKey}','([^']*)','[^']*','(?:flat|percentual)'\\)`))
  return match ? match[1] : null
}

describe('D-05-UAT-10 — the 6 flat damage stats are FLAT in the catalog (owner-authoritative)', () => {
  // The owner's pt-BR labels mapped to the catalog keys they named.
  const FLAT_DAMAGE_STATS: Array<[string, string]> = [
    ['pve_dmg_bonus', 'Bônus Dano PvE'],
    ['pvp_dmg_bonus', 'Bônus Dano PvP'],
    ['mdmg_bonus', 'Bônus MDMG'],
    ['pdmg_bonus', 'Bônus PDMG'],
    ['pve_dmg_reduction', 'Redução Dano PvE'],
    ['pvp_dmg_reduction', 'Redução Dano PvP'],
  ]

  for (const [key, label] of FLAT_DAMAGE_STATS) {
    it(`${key} (${label}) is 'flat'`, () => {
      expect(labelOf(key), `label mapping for ${key} matches the owner's pt-BR name`).toBe(label)
      expect(valueTypeOf(key)).toBe('flat')
    })
  }

  it('the seed ships 59 catalog rows (57 + RPDEF/RMDEF, Phase 9.1)', () => {
    const rows = SEED.match(/^\s*\('[^']+',/gm) ?? []
    expect(rows).toHaveLength(59)
  })

  it('every row still carries a valid value_type', () => {
    const types = [...SEED.matchAll(/'(?:flat|percentual)'\)/g)].length
    const rows = SEED.match(/^\s*\('[^']+',/gm) ?? []
    expect(types).toBe(rows.length)
  })
})

describe('genuinely percentual siblings keep their % handling (D-05-UAT-10 pin)', () => {
  const PERCENTUAL_SIBLINGS = [
    'pdmg_r', // PDMG.R — the percentual form of PDMG (a DISTINCT stat)
    'mdmg_r', // MDMG.R
    'crit_dmg',
    'crit_dmg_res',
    'variable_ct_pct',
    'fixed_ct_pct',
    'ignore_pdef_pct',
    'ignore_mdef_pct',
    'global_cd_pct',
    'equip_patk_pct',
    'dmg_vs_small',
    'dmg_vs_demi_human',
    'dmg_reduction_vs_small',
    'dmg_reduction_vs_demi_human',
  ]

  for (const key of PERCENTUAL_SIBLINGS) {
    it(`${key} remains 'percentual'`, () => {
      expect(valueTypeOf(key)).toBe('percentual')
    })
  }
})
