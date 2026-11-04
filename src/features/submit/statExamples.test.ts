import { describe, expect, it } from 'vitest'
import { averagesFromReport, equipmentExample, statExample } from './statExamples'

describe('averagesFromReport — the my_report average map', () => {
  it('returns an empty map for a failed/absent report (examples degrade, never block)', () => {
    expect(averagesFromReport(null)).toEqual({})
  })

  it('keeps every finite average, including zero and negative values', () => {
    const averages = averagesFromReport({
      stats: [
        { stat_key: 'hp', class_average: 154781.4 },
        { stat_key: 'crit_dmg', class_average: 0 },
        { stat_key: 'fixed_ct_pct', class_average: -40.064 },
        { stat_key: 'combat_power', class_average: null },
        { stat_key: 'bad', class_average: Number.NaN },
        { stat_key: 'worse', class_average: Number.POSITIVE_INFINITY },
      ],
    })
    expect(averages).toEqual({
      hp: 154781.4,
      crit_dmg: 0,
      fixed_ct_pct: -40.064,
    })
  })
})

describe('statExample — one real, formatted example per field', () => {
  const averages = { hp: 154781.4, pdmg_r: 154.664 }

  it('formats flat examples in pt-BR and percentual examples with a % suffix', () => {
    expect(statExample(averages, { stat_key: 'hp', value_type: 'flat' })).toBe('154.781,4')
    expect(statExample(averages, { stat_key: 'pdmg_r', value_type: 'percentual' })).toBe(
      '154,66%',
    )
  })

  it('returns null when the cohort has no average (no generic fallback)', () => {
    expect(statExample({}, { stat_key: 'hp', value_type: 'flat' })).toBe(null)
  })
})

describe('equipmentExample — inverse of the raw-defense formula', () => {
  it('derives the equipment value from the average raw defense and percentage', () => {
    const averages = {
      rpdef: 4000,
      equip_pdef_pct: 25,
      rmdef: 1381.6,
      equip_mdef_pct: 18.116,
    }
    // 4000 * (1 + 25/100) = 5000
    expect(equipmentExample(averages, 'rpdef', 'equip_pdef_pct')).toBe('5.000')
    // 1381.6 * 1.18116 = 1631.96... -> 1632
    expect(equipmentExample(averages, 'rmdef', 'equip_mdef_pct')).toBe('1.632')
  })

  it('returns null when either average is missing or the percentage is invalid', () => {
    expect(equipmentExample({}, 'rpdef', 'equip_pdef_pct')).toBe(null)
    expect(equipmentExample({ rpdef: 4000 }, 'rpdef', 'equip_pdef_pct')).toBe(null)
    expect(
      equipmentExample({ rpdef: 4000, equip_pdef_pct: -100 }, 'rpdef', 'equip_pdef_pct'),
    ).toBe(null)
    expect(
      equipmentExample({ rpdef: -4000, equip_pdef_pct: 25 }, 'rpdef', 'equip_pdef_pct'),
    ).toBe(null)
  })
})
