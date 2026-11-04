// Render-level lock for the per-field example hints (owner request
// 2026-11-03). The repo is node-env Vitest only, so the component contract is
// asserted with renderToStaticMarkup (same pattern as SubmitPage tests).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StatCatalogEntry } from '../../lib/api'
import { DefenseStep } from './DefenseStep'
import { StatGroupStep } from './StatGroupStep'

const ENTRIES: StatCatalogEntry[] = [
  {
    stat_key: 'hp',
    label: 'HP',
    label_short: 'HP',
    group_name: 'general',
    value_type: 'flat',
  },
  {
    stat_key: 'crit_dmg',
    label: 'Dano CRIT',
    label_short: 'DCR',
    group_name: 'quasi',
    value_type: 'percentual',
  },
]

function renderStep(averages?: Record<string, number>): string {
  return renderToStaticMarkup(
    <StatGroupStep
      group="general"
      entries={ENTRIES}
      inputs={{}}
      onChange={() => {}}
      ocrRunning={false}
      failedFields={new Set()}
      ocrFilledFields={new Set()}
      averages={averages}
    />,
  )
}

describe('StatGroupStep — labels carry a real per-field example', () => {
  it('shows the class average for each field, formatted by its value_type', () => {
    const html = renderStep({ hp: 154781.4, crit_dmg: 0 })
    expect(html).toContain('(ex.: 154.781,4)')
    expect(html).toContain('(ex.: 0%)')
    expect(html).not.toContain('1.234.567')
    expect(html).not.toContain('12,5%')
  })

  it('renders no hint at all when that field has no cohort average', () => {
    const html = renderStep({ hp: 154781.4 })
    expect(html).toContain('(ex.: 154.781,4)')
    expect(html).toContain('Dano CRIT</label>')
    expect(html).not.toContain('(ex.: 12,5%)')
  })

  it('keeps the legacy generic hint only when no average source is supplied (prospect flow)', () => {
    const html = renderStep()
    expect(html).toContain('(ex.: 1.234.567)')
    expect(html).toContain('(ex.: 12,5%)')
  })
})

describe('DefenseStep — equipment placeholders are derived per defense', () => {
  it('shows the equipment value that produces the cohort raw-defense average', () => {
    const html = renderToStaticMarkup(
      <DefenseStep
        inputs={{}}
        onEquipmentChange={() => {}}
        disabled={false}
        averages={{
          rpdef: 4000,
          equip_pdef_pct: 25,
          rmdef: 1381.6,
          equip_mdef_pct: 18.116,
        }}
      />,
    )
    expect(html).toContain('placeholder="5.000"')
    expect(html).toContain('placeholder="1.632"')
    expect(html).not.toContain('placeholder="4913"')
  })
})
