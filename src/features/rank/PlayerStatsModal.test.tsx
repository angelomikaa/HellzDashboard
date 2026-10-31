import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RoleRankRow } from '../../lib/api'
import { PlayerStatsModal } from './PlayerStatsModal'

const row: RoleRankRow = {
  member_id: 'm1',
  display_name: 'Ahrya',
  char_id: '32980',
  char_class: 'High Priest',
  char_function: 'suporte',
  ovr: 95.38,
  stats: [
    {
      stat_key: 'matk',
      label: 'MATK',
      label_short: 'MATK',
      value_type: 'flat',
      value: 5932,
      points: 88,
      class_average: 5000,
    },
    {
      stat_key: 'crit',
      label: 'CRIT',
      label_short: 'CRIT',
      value_type: 'flat',
      value: 20,
      points: 51,
      class_average: 18,
    },
  ],
}

describe('PlayerStatsModal', () => {
  it('renders the player header and the grouped stats inside a dialog', () => {
    const html = renderToStaticMarkup(
      <PlayerStatsModal
        row={row}
        statGroups={new Map([
          ['matk', 'general'],
          ['crit', 'quasi'],
        ])}
        onClose={() => {}}
      />,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('Ahrya')
    expect(html).toContain('32980')
    expect(html).toContain('95')
    expect(html).toContain('MATK')
    expect(html).toContain('CRIT')
    expect(html).toContain('Fechar')
  })
})
