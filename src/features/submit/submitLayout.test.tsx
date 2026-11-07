// Layout lock for the desktop submit screens (owner request 2026-11-07): each
// capture step is a two-column screen — the example print + upload entry on a
// sticky LEFT rail, the fields on the RIGHT — while the prospect wizard keeps
// the original stacked strip. Node-env renderToStaticMarkup, same pattern as
// the sibling submit tests.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StatCatalogEntry } from '../../lib/api'
import { StatGroupStep } from './StatGroupStep'

const ENTRIES: StatCatalogEntry[] = [
  { stat_key: 'hp', label: 'HP', label_short: 'HP', group_name: 'general', value_type: 'flat' },
]

function render(layout?: 'compact' | 'wide'): string {
  return renderToStaticMarkup(
    <StatGroupStep
      group="general"
      entries={ENTRIES}
      inputs={{}}
      onChange={() => {}}
      ocrRunning={false}
      failedFields={new Set()}
      ocrFilledFields={new Set()}
      averages={{}}
      layout={layout}
      capture={<p>capture-entry</p>}
    />,
  )
}

describe('StatGroupStep — wide (member submit wizard)', () => {
  it('puts example + upload in a sticky rail BEFORE the fields', () => {
    const html = render('wide')
    const example = html.indexOf('/examples/general.png')
    const capture = html.indexOf('capture-entry')
    const firstField = html.indexOf('stat-general-hp')
    expect(example).toBeGreaterThan(-1)
    expect(capture).toBeGreaterThan(example)
    expect(firstField).toBeGreaterThan(capture)
    // The rail is the sticky desktop column, and the print is the enlarged
    // variant (the old fixed h-40 lock is gone).
    expect(html).toContain('lg:sticky')
    expect(html).toContain('Clique na imagem para ampliar')
    expect(html).not.toContain('lg:h-40')
  })

  it('lays the fields out in two columns (never the compact three)', () => {
    const html = render('wide')
    expect(html).toContain('sm:grid-cols-2')
    expect(html).not.toContain('xl:grid-cols-3')
  })
})

describe('StatGroupStep — compact (prospect wizard, unchanged)', () => {
  it('keeps the example + upload strip above the fields', () => {
    const html = render()
    expect(html.indexOf('/examples/general.png')).toBeGreaterThan(-1)
    expect(html.indexOf('capture-entry')).toBeLessThan(html.indexOf('stat-general-hp'))
    expect(html).toContain('xl:grid-cols-3')
    expect(html).not.toContain('Clique na imagem para ampliar')
  })
})
