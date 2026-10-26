import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NeoFootSession } from '../auth/session'
import { validacoesTabLabel } from './ValidacoesPage'
import { formatRequestOvr, requestEmptyMessage, requestTypeBadge } from './RequestReview'
import { IdentityReview } from './IdentityReview'
import { RequestReview } from './RequestReview'
import { ValidacoesPage } from './ValidacoesPage'

const session: NeoFootSession = {
  access_token: 't',
  member_id: '1',
  display_name: 'Owner',
  member_role: 'owner',
  expires_at: 0,
}

describe('ValidacoesPage helpers', () => {
  it('tab labels', () => {
    expect(validacoesTabLabel('envios')).toBe('Envios')
    expect(validacoesTabLabel('solicitacoes')).toBe('Solicitações')
    expect(validacoesTabLabel('identidades')).toBe('Identidades')
  })

  it('request type badge', () => {
    expect(requestTypeBadge('member')).toContain('membro')
    expect(requestTypeBadge('prospect')).toContain('clã')
    expect(requestTypeBadge('registration')).toContain('Cadastro')
    expect(requestTypeBadge('claim')).toContain('Primeiro acesso')
  })

  it('request ovr formatting', () => {
    expect(formatRequestOvr(91.4, true)).toBe('91.4')
    expect(formatRequestOvr(null, false)).toBe('—')
  })

  it('empty message', () => {
    expect(requestEmptyMessage()).toContain('solicitação')
  })
})

describe('ValidacoesPage render', () => {
  it('renders tabs default envios', () => {
    const html = renderToStaticMarkup(<ValidacoesPage session={session} />)
    expect(html).toContain('Envios')
    expect(html).toContain('Solicitações')
    expect(html).toContain('Identidades')
  })
})

describe('RequestReview render', () => {
  it('renders loading state (fetch on mount)', () => {
    const html = renderToStaticMarkup(<RequestReview session={session} />)
    expect(html).toContain('Carregando…')
  })
})

describe('IdentityReview render', () => {
  it('renders loading state (fetch on mount)', () => {
    const html = renderToStaticMarkup(<IdentityReview session={session} />)
    expect(html).toContain('Carregando…')
  })
})
