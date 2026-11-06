// Phase 10.13 progression modal: every evidenced stat renders the own history
// chart plus the three DISTINCT references (class / function / cohort) with
// their sample sizes and the "Ver no painel" jump.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProgressDetailModal } from './ProgressDetailModal'
import type { ProgressEvidenceItem } from './statProgress'

function item(stat_key: string, overrides?: Partial<ProgressEvidenceItem>): ProgressEvidenceItem {
  return {
    stat_key,
    label: `${stat_key} label`,
    label_short: stat_key.toUpperCase(),
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
    ...overrides,
  }
}

function render(items: ProgressEvidenceItem[]): string {
  return renderToStaticMarkup(
    <ProgressDetailModal
      items={items}
      initialStatKey={items[0]?.stat_key ?? null}
      displayName="Aryah"
      charClass="High Priest"
      charFunction="suporte"
      onClose={() => {}}
      onJump={() => {}}
    />,
  )
}

describe('ProgressDetailModal', () => {
  it('renders one section per evidenced stat with the three references', () => {
    const html = render([item('matk'), item('patk')])
    expect(html).toContain('matk label')
    expect(html).toContain('patk label')
    expect(html).toContain('Classe')
    expect(html).toContain('Função')
    expect(html).toContain('Coorte')
    expect(html).toContain('n=12')
    expect(html).toContain('n=30')
    expect(html).toContain('n=4')
    expect(html).toContain('Ver no painel')
    expect(html.match(/<svg/g)).toHaveLength(2)
  })

  it('shows the signed gap against each reference', () => {
    const html = render([item('matk')])
    // 120 vs class 90 = +30, vs function 95 = +25, vs cohort 99 = +21.
    expect(html).toContain('+30')
    expect(html).toContain('+25')
    expect(html).toContain('+21')
  })

  it('flags a missing reference instead of inventing a line', () => {
    const html = render([item('matk', { class_average: null, class_sample_size: 2 })])
    expect(html).toContain('n=2')
    expect(html).toContain('—')
  })

  it('explains the empty history state', () => {
    const html = render([item('matk', { history: [] })])
    expect(html).toContain('Sem histórico ainda')
  })

  it('renders the empty state when no stat is in evidence', () => {
    const html = render([])
    expect(html).toContain('Nenhum stat em evidência ainda')
  })
})
