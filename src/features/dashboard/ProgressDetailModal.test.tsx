// Phase 10.13 progression modal (owner revision 2026-11-06): it opens ONLY the
// clicked stat — one chart with all lines, a comparison table and one back
// button, no scrolling list.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProgressDetailModal } from './ProgressDetailModal'
import type { ProgressEvidenceItem } from './statProgress'

function item(overrides?: Partial<ProgressEvidenceItem>): ProgressEvidenceItem {
  return {
    stat_key: 'matk',
    label: 'Ataque Mágico',
    label_short: 'MATK',
    group_name: 'general',
    value_type: 'flat',
    stat_direction: 'higher',
    points: 70,
    own_value: 120,
    history: [
      { value: 120, submitted_at: '2026-11-05T10:00:00Z' },
      { value: 110, submitted_at: '2026-11-03T10:00:00Z' },
      { value: 100, submitted_at: '2026-11-01T10:00:00Z' },
    ],
    class_average: 90,
    class_sample_size: 12,
    function_average: 95,
    function_sample_size: 30,
    cohort_average: 99,
    cohort_sample_size: 4,
    best: 130,
    ...overrides,
  }
}

function render(overrides?: Partial<ProgressEvidenceItem>): string {
  return renderToStaticMarkup(
    <ProgressDetailModal
      item={item(overrides)}
      displayName="Aryah"
      charClass="High Priest"
      charFunction="suporte"
      onClose={() => {}}
    />,
  )
}

describe('ProgressDetailModal — single clicked stat', () => {
  it('renders only the clicked stat, with one chart and the four references', () => {
    const html = render()
    expect(html).toContain('Ataque Mágico')
    expect(html).toContain('MATK')
    expect(html).toContain('Classe')
    expect(html).toContain('Função')
    expect(html).toContain('Coorte')
    expect(html).toContain('Melhor da coorte')
    expect(html).toContain('n=12')
    expect(html).toContain('n=30')
    expect(html).toContain('n=4')
    expect(html.match(/<svg/g)).toHaveLength(1)
    expect(html).toContain('Voltar')
  })

  it('names the exact class/function each reference compares against', () => {
    const html = render()
    expect(html).toContain('vs. Sumo Sacerdote')
    expect(html).toContain('vs. Suporte')
    expect(html).toContain('vs. Sumo Sacerdote · Suporte')
  })

  it('shows the signed gap against each reference', () => {
    const html = render()
    // 120 vs class 90 = +30, vs function 95 = +25, vs cohort 99 = +21,
    // vs best 130 = −10.
    expect(html).toContain('+30')
    expect(html).toContain('+25')
    expect(html).toContain('+21')
    expect(html).toContain('−10')
  })

  it('states the value-proportional points formula next to the badge', () => {
    const html = render()
    expect(html).toContain('seu valor ÷ melhor × 99')
  })

  it('flags a missing reference instead of inventing a line', () => {
    const html = render({ class_average: null, class_sample_size: 2 })
    expect(html).toContain('n=2')
    expect(html).toContain('—')
  })

  it('explains the empty history state', () => {
    const html = render({ history: [] })
    expect(html).toContain('Sem histórico ainda')
  })

  it('renders the lower-is-better hint', () => {
    const html = render({ stat_direction: 'lower' })
    expect(html).toContain('Menor é melhor')
  })
})
