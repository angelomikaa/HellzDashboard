// Phase 10.13 chart locks: equal reference values (class + cohort often share
// the same members) must not overprint their labels.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatTrendChart } from './StatTrendChart'

const history = [
  { value: 30, submitted_at: '2026-11-05T10:00:00Z' },
  { value: 28, submitted_at: '2026-11-01T10:00:00Z' },
]

function render(): string {
  return renderToStaticMarkup(
    <StatTrendChart
      history={history}
      valueType="percentual"
      references={[
        { key: 'class', label: 'Classe', value: 40.69, sampleSize: 4 },
        { key: 'function', label: 'Função', value: 36.8, sampleSize: 10 },
        { key: 'cohort', label: 'Coorte', value: 40.69, sampleSize: 4 },
      ]}
    />,
  )
}

function labelTop(html: string, color: string, value: string): number {
  const match = new RegExp(`style="top:([\\d.]+)%;color:${color}"[^>]*>${value}`).exec(html)
  if (match === null) throw new Error(`label ${color} ${value} not found`)
  return Number(match[1])
}

describe('StatTrendChart — reference labels', () => {
  it('nudges identical references apart instead of overprinting', () => {
    const html = render()
    const classTop = labelTop(html, '#B8C0CC', '40,69%')
    const cohortTop = labelTop(html, '#A78BFA', '40,69%')
    expect(classTop).not.toBe(cohortTop)
    expect(Math.abs(classTop - cohortTop)).toBeGreaterThanOrEqual(6)
  })

  it('draws the own series plus one dashed line per visible reference', () => {
    const html = render()
    expect(html.match(/stroke-dasharray="5 4"/g)).toHaveLength(3)
    expect(html).toContain('stroke="#DC3538"')
  })
})
