import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PromotionCardRow } from '../../lib/api'
import { HighlightsCarousel } from './HighlightsCarousel'

function card(
  name: string,
  fn: 'dps' | 'mdps' | 'suporte',
  charClass?: string,
): PromotionCardRow {
  return {
    display_name: name,
    char_function: fn,
    ...(charClass === undefined ? {} : { char_class: charClass }),
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

describe('HighlightsCarousel — merged group crest follows the spotlight card', () => {
  it('shows the Cigana icon for Artista when the centered card is a Gypsy', () => {
    const html = renderToStaticMarkup(
      <HighlightsCarousel
        cards={[card('Cigana Um', 'suporte', 'Gypsy'), card('Menestrel Um', 'suporte', 'Bard')]}
        charClass="Artista"
        label="Artista — Suporte — cartazes impecáveis"
        builds={[{ fn: 'suporte', label: 'Suporte' }]}
        selectedFn="suporte"
        onSelectBuild={() => {}}
      />,
    )
    expect(html).toContain('class-icon-gypsy.webp')
    expect(html).not.toContain('class-icon-bard.webp')
  })

  it('shows the Menestrel icon when the centered card is a Bard', () => {
    const html = renderToStaticMarkup(
      <HighlightsCarousel
        cards={[card('Menestrel Um', 'suporte', 'Bard'), card('Cigana Um', 'suporte', 'Gypsy')]}
        charClass="Artista"
        label="Artista — Suporte — cartazes impecáveis"
        builds={[{ fn: 'suporte', label: 'Suporte' }]}
        selectedFn="suporte"
        onSelectBuild={() => {}}
      />,
    )
    expect(html).toContain('class-icon-bard.webp')
    expect(html).not.toContain('class-icon-gypsy.webp')
  })

  it('keeps a real class crest even when a card names a merged class', () => {
    const html = renderToStaticMarkup(
      <HighlightsCarousel
        cards={[card('Criador Um', 'suporte', 'Gypsy')]}
        charClass="Biochemist"
        label="Criador — Suporte — cartazes impecáveis"
        builds={[{ fn: 'suporte', label: 'Suporte' }]}
        selectedFn="suporte"
        onSelectBuild={() => {}}
      />,
    )
    expect(html).toContain('class-icon-biochemist.webp')
    expect(html).not.toContain('class-icon-gypsy.webp')
  })
})
