// Phase 10.13 tile anatomy: the sparkline only appears with a real trend
// (2+ points), the hover popover carries the three values + dates, and the
// tile is a progression button when `onOpen` is supplied.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MiniStatTile } from './MiniStatTile'

const history = [
  { value: 120, submitted_at: '2026-11-05T10:00:00Z' },
  { value: 110, submitted_at: '2026-11-03T10:00:00Z' },
  { value: 100, submitted_at: '2026-11-01T10:00:00Z' },
]

describe('MiniStatTile — progression tracker', () => {
  it('renders the sparkline and the hover read-out with 2+ history points', () => {
    const html = renderToStaticMarkup(
      <MiniStatTile label="MATK" value={120} valueType="flat" points={70} history={history} />,
    )
    expect(html).toContain('<svg')
    expect(html).toContain('Últimas submissões')
    expect(html).toContain('05/11')
    expect(html).toContain('01/11')
  })

  it('renders no sparkline with a single point (a dot is not a trend)', () => {
    const html = renderToStaticMarkup(
      <MiniStatTile
        label="MATK"
        value={120}
        valueType="flat"
        points={70}
        history={history.slice(0, 1)}
      />,
    )
    expect(html).not.toContain('<svg')
  })

  it('becomes a progression button carrying the stat label', () => {
    const html = renderToStaticMarkup(
      <MiniStatTile
        id="key-matk"
        label="MATK"
        value={120}
        valueType="flat"
        points={70}
        history={history}
        onOpen={() => {}}
      />,
    )
    expect(html).toContain('<button')
    expect(html).toContain('id="key-matk"')
    expect(html).toContain('aria-label="MATK: 120. Ver progressão."')
  })

  it('keeps the missing-value state and the insufficient-data chip', () => {
    const html = renderToStaticMarkup(
      <MiniStatTile label="MATK" value={null} valueType="flat" points={null} />,
    )
    expect(html).toContain('Sem registro')
    expect(html).toContain('Dados insuficientes')
    expect(html).not.toContain('<svg')
  })
})
