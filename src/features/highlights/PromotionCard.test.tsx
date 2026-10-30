// PromotionCard credential gate (owner 2026-10-30): the card's third stat line
// is the raw own_value. It renders ONLY for a viewer holding a valid
// credential; an anonymous visitor sees '—'. The gate is deny-by-default so a
// new caller that forgets to opt in can never leak values, and it covers the
// PNG export too (the export is assembled from the same formatted value).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PromotionCardRow } from '../../lib/api'
import { PromotionCard } from './PromotionCard'

function card(value: number | null): PromotionCardRow {
  return {
    display_name: 'Aryah',
    char_function: 'suporte',
    char_class: 'Biochemist',
    ovr: 92,
    photo_path: '',
    highlights: [
      {
        stat_key: 'matk',
        label: 'Ataque Mágico',
        label_short: 'MATK',
        value_type: 'flat',
        value,
        points: 88,
      },
    ],
  }
}

describe('PromotionCard — credential-gated real stats', () => {
  it('shows only a dash on the stat line for a viewer without a credential', () => {
    const html = renderToStaticMarkup(
      <PromotionCard card={card(1234)} charClass="Biochemist" />,
    )
    expect(html).toContain('>—</text>')
    expect(html).not.toContain('1.234')
  })

  it('keeps the real stat line for an authenticated member', () => {
    const html = renderToStaticMarkup(
      <PromotionCard card={card(1234)} charClass="Biochemist" showRealStats />,
    )
    expect(html).toContain('>1.234</text>')
    expect(html).not.toContain('>—</text>')
  })

  it('renders a dash when the server withheld the value, even for an authenticated member', () => {
    const html = renderToStaticMarkup(
      <PromotionCard card={card(null)} charClass="Biochemist" showRealStats />,
    )
    expect(html).toContain('>—</text>')
  })
})
