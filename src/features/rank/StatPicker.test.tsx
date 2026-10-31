import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StatCatalogEntry } from '../../lib/api'
import { StatPicker } from './StatPicker'

const entries: StatCatalogEntry[] = [
  {
    stat_key: 'rpdef',
    label: 'Defesa Física Bruta',
    label_short: 'RPDEF',
    group_name: 'special',
    value_type: 'flat',
  },
  {
    stat_key: 'matk',
    label: 'MATK',
    label_short: 'MATK',
    group_name: 'general',
    value_type: 'flat',
  },
]

describe('StatPicker', () => {
  it('shows the selected stat on the closed trigger', () => {
    const html = renderToStaticMarkup(
      <StatPicker entries={entries} value="rpdef" onChange={() => {}} />,
    )
    expect(html).toContain('Defesa Física Bruta')
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('shows the degraded label when the catalog is empty', () => {
    const html = renderToStaticMarkup(
      <StatPicker entries={[]} value="" onChange={() => {}} />,
    )
    expect(html).toContain('Catálogo indisponível')
  })
})
