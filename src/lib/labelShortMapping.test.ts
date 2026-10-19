// labelShortMapping.test.ts — locks the COMMITTED seed artifact
// supabase/seeds/live/card-labels-4-6char.sql (07.2-05 checkpoint round 7,
// owner decision 2: the card's stat labels move from 3 letters to 4–6 chars
// — "players are more used to MATK than MTK, seamless association" — with
// the owner's APPROVED mapping applied live via apply-seed.mjs).
//
// The card renders label_short verbatim from my_card/get_promotion, so a bad
// mapping would ship a broken card. These locks parse the seed file (the
// single source of truth for the live apply) and assert the owner's rules:
//
//  - every one of the 57 catalog stats is remapped (no stat left on its old
//    3-letter D-11 value by accident);
//  - no label is empty and none exceeds 7 chars (the approved table's own
//    maximum — IG.PDEF/IG.MDEF run 7; HIT stays 3 as the owner's flagged
//    exception);
//  - the 0013 label_short UNIQUE constraint still holds (all distinct);
//  - every statement targets the right stat_key with the 0013 UPDATE shape.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SEED = readFileSync(
  path.resolve(__dirname, '../../supabase/seeds/live/card-labels-4-6char.sql'),
  'utf8',
)

// The 57 live catalog stat_keys (0013:46-102's set — the mapping must cover
// every one of them).
const STAT_KEYS = [
  'hp', 'sp', 'patk', 'pdef', 'matk', 'mdef',
  'refine_patk', 'refine_pdef', 'refine_matk', 'refine_mdef',
  'hp_recover', 'sp_recover', 'hit', 'flee', 'combat_power', 'aspd', 'mspd',
  'variable_ct', 'variable_ct_pct', 'fixed_ct', 'fixed_ct_pct',
  'healing_done', 'healing_taken', 'crit', 'crit_res', 'crit_dmg', 'crit_dmg_res',
  'pdmg', 'pdmg_r', 'mdmg', 'mdmg_r',
  'ignore_pdef', 'ignore_pdef_pct', 'ignore_mdef', 'ignore_mdef_pct',
  'pdmg_bonus', 'mdmg_bonus',
  'pve_dmg_reduction', 'pve_dmg_bonus', 'pvp_dmg_reduction', 'pvp_dmg_bonus',
  'max_sp_pct', 'equip_patk_pct', 'equip_matk_pct', 'equip_pdef_pct', 'equip_mdef_pct',
  'global_cd_pct',
  'dmg_vs_small', 'dmg_vs_medium', 'dmg_vs_large', 'dmg_vs_brute', 'dmg_vs_demi_human',
  'dmg_reduction_vs_small', 'dmg_reduction_vs_medium', 'dmg_reduction_vs_large',
  'dmg_reduction_vs_brute', 'dmg_reduction_vs_demi_human',
]

// The owner-approved spot-check anchors (verbatim expectations from the
// approval — the seamless-association examples).
const APPROVED_ANCHORS: Record<string, string> = {
  matk: 'MATK',
  pdmg_r: 'PDMG.R',
  mdmg_r: 'MDMG.R',
  pvp_dmg_reduction: 'PVP.R',
  hp: 'HP',
  hit: 'HIT', // the flagged 3-char exception
  combat_power: 'POWER',
}

function parseMapping(): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of SEED.matchAll(
    /update stat_catalog set label_short = '([^']*)'\s+where stat_key = '([a-z_]+)';/g,
  )) {
    expect(map.has(m[2])).toBe(false) // no duplicate UPDATE for one stat
    map.set(m[2], m[1])
  }
  return map
}

describe('card-labels-4-6char.sql — the approved 4–6 char mapping (07.2-05 round 7)', () => {
  it('remaps EVERY catalog stat with the 0013 UPDATE shape', () => {
    const map = parseMapping()
    expect(map.size).toBe(STAT_KEYS.length)
    for (const key of STAT_KEYS) {
      expect(map.has(key)).toBe(true)
    }
  })

  it('carries the owner-approved anchors verbatim (MATK / PDMG.R / PVP.R / POWER …)', () => {
    const map = parseMapping()
    for (const [key, label] of Object.entries(APPROVED_ANCHORS)) {
      expect(map.get(key)).toBe(label)
    }
  })

  it('keeps every label non-empty and ≤ 7 chars (the approved table max; HIT=3 and HP/SP=2 are approved exceptions)', () => {
    const map = parseMapping()
    for (const [key, label] of map) {
      expect(label.length).toBeGreaterThan(0)
      expect(label.length).toBeLessThanOrEqual(7)
      // 4–6 char rule for the stat abbreviations (7 = the approved
      // IG.PDEF/IG.MDEF outliers); the owner's approved exceptions: HIT
      // (3-char, flagged) and HP/SP (2-char, universally-known resources).
      if (key === 'hit') {
        expect(label).toBe('HIT')
      } else if (key === 'hp' || key === 'sp') {
        expect(['HP', 'SP']).toContain(label)
      } else {
        expect(label.length).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('keeps labels UNIQUE (0013:104 label_short UNIQUE constraint still satisfiable)', () => {
    const labels = [...parseMapping().values()]
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('never leaves a stat on its old 3-letter D-11 value (complete supersession)', () => {
    const oldLabels = new Set([
      'PAT', 'PDE', 'MAT', 'MDE', 'RPA', 'RPD', 'RMA', 'RMD', 'RHP', 'RSP',
      'FLE', 'PCB', 'ASP', 'MSP', 'CTV', 'CVP', 'CTF', 'CFP', 'CUR', 'CRE',
      'CRT', 'RCR', 'DCR', 'RDC', 'PDM', 'PDR', 'MDM', 'MDR', 'IGP', 'IPD',
      'IGM', 'IMD', 'BPD', 'BMD', 'RPE', 'BPE', 'RPP', 'BPV', 'SPM', 'EPA',
      'EMA', 'EPD', 'EMD', 'CDG', 'DVP', 'DVM', 'DVG', 'DVB', 'DVH', 'RVP',
      'RVM', 'RVG', 'RVB', 'RVH',
    ])
    const map = parseMapping()
    for (const [key, label] of map) {
      if (key === 'hit') continue // the owner's flagged 3-char exception
      expect(oldLabels.has(label)).toBe(false)
    }
  })
})
