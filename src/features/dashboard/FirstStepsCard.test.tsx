import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FirstStepsCard } from './FirstStepsCard'

const noop = () => {}

describe('FirstStepsCard', () => {
  it('shows the first-visit copy and the three-step flow', () => {
    const html = renderToStaticMarkup(
      <FirstStepsCard hasPending={false} hasRejected={false} onNavigate={noop} />,
    )
    expect(html).toContain('Comece por aqui')
    expect(html).toContain('Enviar Status')
    expect(html.match(/<li>/g)?.length).toBe(3)
    expect(html).toContain('Um oficial valida os valores')
  })

  it('names the pending state and points at the existing submission', () => {
    const html = renderToStaticMarkup(
      <FirstStepsCard hasPending hasRejected={false} onNavigate={noop} />,
    )
    expect(html).toContain('Envio em análise')
    expect(html).toContain('Ver meu envio')
    expect(html).toContain('Um oficial vai revisar suas capturas')
  })

  it('names the rejected state and asks for a new submission', () => {
    const html = renderToStaticMarkup(
      <FirstStepsCard hasPending={false} hasRejected onNavigate={noop} />,
    )
    expect(html).toContain('Vamos tentar de novo')
    expect(html).toContain('foi rejeitado')
    expect(html).toContain('Enviar Status')
  })

  it('lets pending win over a rejected history row', () => {
    const html = renderToStaticMarkup(
      <FirstStepsCard hasPending hasRejected onNavigate={noop} />,
    )
    expect(html).toContain('Envio em análise')
    expect(html).not.toContain('Vamos tentar de novo')
  })
})
