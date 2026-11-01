import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ApiError, type LineupParty, type LineupsPayload, type WarMode } from '../../lib/api'
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

function emptyParties(count = 8): LineupParty[] {
  return Array.from({ length: count }, (_, i) => ({
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

// The Emperium example is 3 raids with 6/6/4 parties = 16 total.
const emperiumViewerParties = emptyParties(4)
emperiumViewerParties[0].slots[0] = slot(1, 'm1', 'Lanaya', 'Bard')
emperiumViewerParties[0].slots[1] = slot(2, 'm2', 'Tifa', 'Gypsy')
emperiumViewerParties[0].filled = 2

const payload: LineupsPayload = {
  war_mode: 'vigrid',
  raid_count: 2,
  min_raids: 2,
  max_raids: 8,
  battlefields: [
    { battlefield: 'vigrid_field', raid_index: 1, parties },
    { battlefield: 'ruinscape', raid_index: 2, parties: emptyParties() },
  ],
  roster: [
    { member_id: 'm1', display_name: 'Lanaya', char_class: 'Bard', char_function: 'dps' },
    { member_id: 'm2', display_name: 'Tifa', char_class: 'Gypsy', char_function: 'dps' },
    { member_id: 'm3', display_name: 'Kiom', char_class: null, char_function: 'dps' },
  ],
}

const emperiumPayload: LineupsPayload = {
  ...payload,
  war_mode: 'emperium',
  raid_count: 3,
  battlefields: [
    { battlefield: 'emperium_raid_1', raid_index: 1, parties: emptyParties(6) },
    { battlefield: 'emperium_raid_2', raid_index: 2, parties: emptyParties(6) },
    { battlefield: 'emperium_raid_3', raid_index: 3, parties: emperiumViewerParties },
  ],
}

const noop = () => {}

function grid(session: NeoFootSession, warMode: WarMode = 'vigrid') {
  const data = warMode === 'emperium' ? emperiumPayload : payload
  const raid = data.battlefields[warMode === 'emperium' ? 2 : 0]
  return renderToStaticMarkup(
    <BattlefieldGrid
      raid={raid}
      warMode={warMode}
      payload={data}
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

  it('marks the viewer current Emperium raid and keeps the own highlights', () => {
    const html = grid(memberSession, 'emperium')
    expect(html).toContain('Raid 3')
    expect(html).toContain('Sua Raid')
    expect(html).toContain('Sua PT')
    expect(html).toContain('Você')
    // Raid 3 has 4 parties (4 x 5 = 20 slots), unlike the fixed 8-party Vigrid fields.
    expect(html).toContain('2/20 escalados')
    expect(html).toContain('Party G4')
    expect(html).not.toContain('Party G5')
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
    expect(lineupErrorCopy(new Error('HTTP 500: invalid_lineup_raid_count'))).toContain('entre 2 e 8 raids')
    expect(lineupErrorCopy(new Error('HTTP 500: invalid_lineup_party_counts'))).toContain('16 parties')
    expect(lineupErrorCopy(new Error('HTTP 500: lineup_raid_not_empty'))).toContain('Esvazie a raid')
    expect(lineupErrorCopy(new ApiError(0, 'network', 'offline'))).toContain('conectar')
    expect(lineupErrorCopy(new Error('boom'))).toContain('Tente novamente')
  })
})
