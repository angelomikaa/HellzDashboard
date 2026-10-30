import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ApiError, type LineupParty, type LineupsPayload } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'
import { BattlefieldGrid, LineupPage } from './LineupPage'
import { lineupErrorCopy } from './lineupModel'

const memberSession: NeoFootSession = {
  access_token: 't',
  member_id: 'm1',
  display_name: 'Lanaya',
  member_role: 'member',
  expires_at: 0,
}

const officerSession: NeoFootSession = { ...memberSession, member_role: 'officer' }

function slot(index: number, memberId: string | null, name: string | null, charClass: string | null = null) {
  return {
    slot_index: index,
    member_id: memberId,
    display_name: name,
    char_class: charClass,
    char_function: memberId ? ('dps' as const) : null,
  }
}

function emptyParties(): LineupParty[] {
  return Array.from({ length: 8 }, (_, i) => ({
    party_index: i + 1,
    role_label: null,
    filled: 0,
    slots: [1, 2, 3, 4, 5].map((s) => slot(s, null, null)),
  }))
}

const parties = emptyParties()
// G1 holds the viewer (m1) in slot 1 (leader); G1 slot 2 holds another player.
parties[0].slots[0] = slot(1, 'm1', 'Lanaya', 'Bard')
parties[0].slots[1] = slot(2, 'm2', 'Tifa', 'Gypsy')
parties[0].filled = 2
// G5 carries a role label.
parties[4].role_label = 'MOBS CIMA/BAIXO'

const payload: LineupsPayload = {
  battlefields: [
    { battlefield: 'vigrid_field', parties },
    { battlefield: 'ruinscape', parties: emptyParties() },
  ],
  roster: [
    { member_id: 'm1', display_name: 'Lanaya', char_class: 'Bard', char_function: 'dps' },
    { member_id: 'm2', display_name: 'Tifa', char_class: 'Gypsy', char_function: 'dps' },
    { member_id: 'm3', display_name: 'Kiom', char_class: null, char_function: 'dps' },
  ],
}

const noop = () => {}

function grid(session: NeoFootSession) {
  return renderToStaticMarkup(
    <BattlefieldGrid
      battlefield="vigrid_field"
      payload={payload}
      memberId={session.member_id}
      isStaff={session.member_role !== 'member'}
      saving={false}
      onAssign={noop}
      onLabel={noop}
    />,
  )
}

describe('LineupPage member read-only view', () => {
  it('renders all 8 parties (G1..G8) and the battlefield header counts', () => {
    const html = grid(memberSession)
    for (let i = 1; i <= 8; i++) {
      expect(html).toContain(`Party G${i}`)
    }
    expect(html).toContain('Vigrid Field')
    expect(html).toContain('Raid 1')
    expect(html).toContain('2/40 escalados')
  })

  it('highlights the member own party and slot with Sua PT and Você', () => {
    const html = grid(memberSession)
    expect(html).toContain('Sua PT')
    expect(html).toContain('Você')
    expect(html).toContain('aria-current="true"')
  })

  it('marks slot 1 as the party leader and shows the N/5 footer', () => {
    const html = grid(memberSession)
    expect(html).toContain('Líder')
    expect(html).toContain('2/5')
    expect(html).toContain('0/5')
  })

  it('shows the pt-BR class label and the party role pill', () => {
    const html = grid(memberSession)
    expect(html).toContain('Menestrel')
    expect(html).toContain('Cigana')
    expect(html).toContain('MOBS CIMA/BAIXO')
  })

  it('exposes no edit controls to a member', () => {
    const html = grid(memberSession)
    expect(html).not.toContain('Editar slot')
    expect(html).not.toContain('Função da PT')
    expect(html).not.toContain('Editar função')
  })
})

describe('LineupPage officer editing controls', () => {
  it('makes every slot editable and offers the role-label editor on unlabelled parties', () => {
    const html = grid(officerSession)
    expect(html).toContain('Editar slot 1 da G1')
    expect(html).toContain('Editar slot 5 da G8')
    expect(html).toContain('+ Função da PT')
    expect(html).toContain('Editar função')
  })

  it('still renders the read-only own highlight for an officer', () => {
    const html = grid(officerSession)
    expect(html).toContain('Sua PT')
  })
})

describe('LineupPage initial render', () => {
  it('shows the loading state before the lineup arrives', () => {
    const html = renderToStaticMarkup(<LineupPage session={memberSession} />)
    expect(html).toContain('Carregando')
    expect(html).not.toContain('Você está em:')
  })
})

describe('lineupErrorCopy', () => {
  it('maps server tokens to enumeration-safe pt-BR copy', () => {
    expect(lineupErrorCopy(new ApiError(401, 'unauthorized', 'device_mismatch'))).toContain('sessão expirou')
    expect(lineupErrorCopy(new Error('HTTP 500: forbidden'))).toContain('permissão')
    expect(lineupErrorCopy(new Error('HTTP 500: invalid_lineup_member'))).toContain('não pode ser escalado')
    expect(lineupErrorCopy(new ApiError(0, 'network', 'offline'))).toContain('conectar')
    expect(lineupErrorCopy(new Error('boom'))).toContain('Tente novamente')
  })
})
