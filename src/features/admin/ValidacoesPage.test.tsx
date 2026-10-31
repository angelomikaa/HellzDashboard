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
        median: 3900,
        mad: 100,
        z: 4.1,
        reason: 'sigma' as const,
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
    expect(html).toContain('4,1σ')
    expect(html).toContain('Equip. PDEF (valor)')
  })

  it('renders a history deviation with the buff pattern', () => {
    const html = renderToStaticMarkup(
      <AntiCheatPanel
        flags={{
          ...flags,
          history_deviations: [
            {
              stat_key: 'equip_matk_pct',
              label: 'Equip. MATK %',
              value_type: 'percentual',
              previous: 67.3,
              value: 102.46,
              delta: 35.16,
              delta_pct: 52.24,
              history_median: 79.34,
              history_mad: 2.88,
              history_sample_size: 6,
              z: 5.41,
              pattern: 'impositio',
              flagged: true,
            },
          ],
        }}
      />,
    )
    expect(html).toContain('Desvio vs. histórico validado')
    expect(html).toContain('Padrão Impositio')
    expect(html).toContain('35,16 p.p.')
    expect(html).toContain('Variação de OVR')
    expect(html).toContain('+11,9')
  })

  it('renders the Impositio curve evidence (0049)', () => {
    const html = renderToStaticMarkup(
      <AntiCheatPanel
        flags={{
          ...flags,
          curve_deviations: [
            {
              available: true,
              flagged: true,
              reason: 'impositio',
              flat_stat: 'patk',
              pct_stat: 'equip_patk_pct',
              flat_label: 'PATK',
              pct_label: 'Equip. PATK %',
              flat_value_type: 'flat',
              pct_value_type: 'percentual',
              flat_value: 6114,
              pct_value: 70.04,
              base_value: 3595,
              median_base: 3354,
              median_pct: 31.56,
              mad_base: 92,
              mad_pct: 3.48,
              z_base: 1.44,
              z_pct: 7.46,
              expected_flat: 5703,
              curve_deviation_pct: 7.2,
              base_debuff: 3354,
              z_debuff: 0,
              sample_size: 7,
            },
          ],
        }}
      />,
    )
    expect(html).toContain('Possível Impositio Manus')
    expect(html).toContain('sem o buff')
    expect(html).toContain('Curva de atributos')
  })

  it('renders an unavailable curve without a verdict', () => {
    const html = renderToStaticMarkup(
      <AntiCheatPanel
        flags={{
          ...flags,
          curve_deviations: [
            {
              available: false,
              flagged: false,
              reason: null,
              flat_stat: 'patk',
              pct_stat: 'equip_patk_pct',
              flat_label: 'PATK',
              pct_label: 'Equip. PATK %',
              flat_value_type: 'flat',
              pct_value_type: 'percentual',
              flat_value: 4000,
              pct_value: 30,
              sample_size: 3,
            },
          ],
        }}
      />,
    )
    expect(html).toContain('curva indisponível (n=3)')
    expect(html).not.toContain('Possível Impositio Manus')
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
    expect(html).toContain('Nenhum valor fora da curva')
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
