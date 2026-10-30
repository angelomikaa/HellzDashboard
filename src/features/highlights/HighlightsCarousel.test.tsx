import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PromotionCardRow } from '../../lib/api'
import { HighlightsCarousel } from './HighlightsCarousel'

function card(name: string, fn: 'dps' | 'mdps' | 'suporte'): PromotionCardRow {
  return {
    display_name: name,
    char_function: fn,
    ovr: 90,
    highlights: [],
    photo_path: '',
  }
}

describe('HighlightsCarousel — build tokens', () => {
  it('renders one token per meta build and presses the selected one', () => {
    const html = renderToStaticMarkup(
      <HighlightsCarousel
        cards={[card('Criador A', 'mdps')]}
        charClass="Biochemist"
        label="Criador — Dano Mágico — cartazes impecáveis"
        builds={[
          { fn: 'dps', label: 'Dano Físico' },
          { fn: 'mdps', label: 'Dano Mágico' },
          { fn: 'suporte', label: 'Suporte' },
        ]}
        selectedFn="mdps"
        onSelectBuild={() => {}}
      />,
    )

    expect(html).toContain('role="group"')
    expect(html).toContain('Dano Físico')
    expect(html).toContain('Dano Mágico')
    expect(html).toContain('Suporte')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Dano Mágico</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Dano Físico</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Suporte</)
  })

  it('names the pressed build on the carousel it shows', () => {
    const html = renderToStaticMarkup(
      <HighlightsCarousel
        cards={[card('Suporte Um', 'suporte')]}
        charClass="Biochemist"
        label="Criador — Suporte — cartazes impecáveis"
        builds={[
          { fn: 'dps', label: 'Dano Físico' },
          { fn: 'suporte', label: 'Suporte' },
        ]}
        selectedFn="suporte"
        onSelectBuild={() => {}}
      />,
    )

    expect(html).toContain('Suporte Um')
    expect(html).toContain('aria-label="Criador — Suporte — cartazes impecáveis"')
  })
})
