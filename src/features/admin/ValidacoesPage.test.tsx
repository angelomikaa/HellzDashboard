import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NeoFootSession } from '../auth/session'
import { validacoesTabLabel } from './ValidacoesPage'
import { AntiCheatPanel } from './AntiCheatPanel'
import { ovrSwingFlagged } from '../submit/antiCheat'
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

describe('AntiCheatPanel', () => {
  const flags = {
    flagged: true,
    defense_spikes: [
      {
        stat_key: 'rpdef',
        label: 'RPDEF',
        value_type: 'flat' as const,
        value: 9120,
        baseline: 4100,
        ratio: 2.22,
        sample_size: 5,
      },
    ],
    ocr_overrides: [
      {
        input_key: 'equip_pdef_raw',
        label: 'Equip. PDEF (valor)',
        value_type: 'flat' as const,
        source: 'ocr_edited' as const,
        ocr_value: 4100,
        final_value: 6200,
        delta_pct: 51.22,
      },
    ],
    ocr_filled_count: 3,
    ocr_edited_count: 1,
    ovr_swing: {
      previous: 84.2,
      projected: 96.1,
      delta: 11.9,
      class_changed: false,
      function_changed: false,
    },
  }

  it('renders the spike, the OCR edit and the OVR swing', () => {
    const html = renderToStaticMarkup(<AntiCheatPanel flags={flags} />)
    expect(html).toContain('Alertas anti-cheat')
    expect(html).toContain('Revisar antes de validar')
    expect(html).toContain('RPDEF')
    expect(html).toContain('Equip. PDEF (valor)')
    expect(html).toContain('Variação de OVR')
    expect(html).toContain('+11,9')
  })

  it('does not flag an OVR swing when class or function changed', () => {
    expect(
      ovrSwingFlagged({
        ...flags,
        ovr_swing: { ...flags.ovr_swing, class_changed: true },
      }),
    ).toBe(false)
    expect(ovrSwingFlagged(flags)).toBe(true)
  })

  it('renders a clean line when there is nothing to report', () => {
    const html = renderToStaticMarkup(
      <AntiCheatPanel
        flags={{
          flagged: false,
          defense_spikes: [],
          ocr_overrides: [],
          ocr_filled_count: 0,
          ocr_edited_count: 0,
          ovr_swing: {
            previous: null,
            projected: null,
            delta: null,
            class_changed: false,
            function_changed: false,
          },
        }}
      />,
    )
    expect(html).toContain('Nenhum valor acima do limite')
  })

  it('renders nothing without flags (old server during deploy)', () => {
    expect(renderToStaticMarkup(<AntiCheatPanel flags={undefined} />)).toBe('')
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
