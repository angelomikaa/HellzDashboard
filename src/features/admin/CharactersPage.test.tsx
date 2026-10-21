import { describe, expect, it } from 'vitest'
import type { NeoFootSession } from '../auth/session'
import {
  addMemberErrorFor,
  canResetPin,
  filterMembersByPin,
  identityErrorFor,
  pinBadgeLabel,
  sortIdentityHistory,
} from './CharactersPage'

const ownerSession: NeoFootSession = {
  access_token: 't',
  member_id: '1',
  display_name: 'Owner',
  member_role: 'owner',
  expires_at: 0,
}

const officerSession: NeoFootSession = {
  ...ownerSession,
  member_role: 'officer',
}

describe('CharactersPage helpers', () => {
  it('maps add member errors', () => {
    expect(addMemberErrorFor({ message: 'already_member' } as any)).toContain('ativo')
    expect(addMemberErrorFor({ message: 'dummy_handle' } as any)).toContain('teste')
  })

  it('owner sees reset, officer does not', () => {
    const member = { id: 'm', role: 'member' } as any
    expect(canResetPin(ownerSession, member)).toBe(true)
    expect(canResetPin(officerSession, member)).toBe(false)
  })

  it('badges', () => {
    expect(pinBadgeLabel(false)).toContain('pendente')
    expect(pinBadgeLabel(true)).toContain('ativo')
  })

  it('filters by pin', () => {
    const members = [
      { id: '1', pin_set: false } as any,
      { id: '2', pin_set: true } as any,
    ]
    expect(filterMembersByPin(members, 'pending')).toHaveLength(1)
    expect(filterMembersByPin(members, 'active')).toHaveLength(1)
    expect(filterMembersByPin(members, 'all')).toHaveLength(2)
  })

  it('history newest first', () => {
    const rows = [
      { id: 1, created_at: '2020-01-01' } as any,
      { id: 2, created_at: '2021-01-01' } as any,
    ]
    const sorted = sortIdentityHistory(rows)
    expect(sorted[0].id).toBe(2)
  })

  it('maps identity duplicate', () => {
    expect(identityErrorFor({ message: 'duplicate_char_id' } as any)).toContain('duplicate_char_id')
  })
})