import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  isExpired,
  isValidSession,
  loadSession,
  saveSession,
  type NeoFootSession,
} from './session'

// Plan 01-03 task 1: Vitest runs in the node environment (no DOM), so localStorage
// is polyfilled with a tiny in-memory shim before each test.
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

const futureSession: NeoFootSession = {
  access_token: 'header.payload.signature',
  member_id: '11111111-1111-1111-1111-111111111111',
  display_name: 'TestMember',
  member_role: 'member',
  expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // D-06: 7 days out
}

describe('session helpers (D-06: 7-day localStorage session)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('test 1: saveSession then loadSession returns the same session object', () => {
    saveSession(futureSession)
    expect(loadSession()).toEqual(futureSession)
  })

  it('test 2: isExpired is false when expires_at is in the future, true when in the past', () => {
    expect(isExpired(futureSession)).toBe(false)
    const expiredSession: NeoFootSession = {
      ...futureSession,
      expires_at: Math.floor(Date.now() / 1000) - 1,
    }
    expect(isExpired(expiredSession)).toBe(true)
  })

  it('test 3: clearSession removes the stored session (loadSession returns null)', () => {
    saveSession(futureSession)
    clearSession()
    expect(loadSession()).toBeNull()
  })

  it('test 4: loadSession returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull()
  })
})

// CR-02: malformed storage / invalid sessions must never crash the app and must
// self-heal by clearing the poisoned key (loadSession runs during render).
describe('session hardening against malformed input (CR-02)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('test 5: loadSession returns null and clears storage on corrupted JSON ("undefined")', () => {
    localStorage.setItem('nefoot_session', 'undefined')
    expect(loadSession()).toBeNull()
    expect(localStorage.getItem('nefoot_session')).toBeNull()
  })

  it('test 6: loadSession returns null and clears storage on any unparseable JSON', () => {
    localStorage.setItem('nefoot_session', '{not json')
    expect(loadSession()).toBeNull()
    expect(localStorage.getItem('nefoot_session')).toBeNull()
  })

  it('test 7: loadSession returns null and clears storage on a JSON object missing fields', () => {
    localStorage.setItem('nefoot_session', JSON.stringify({ access_token: 'abc' }))
    expect(loadSession()).toBeNull()
    expect(localStorage.getItem('nefoot_session')).toBeNull()
  })

  it('test 8: loadSession rejects wrong member_role, empty access_token, and non-number expires_at', () => {
    const badSessions: Record<string, unknown>[] = [
      { ...futureSession, member_role: 'admin' },
      { ...futureSession, access_token: '' },
      { ...futureSession, expires_at: 'soon' },
      { ...futureSession, member_id: 42 },
      'just a string',
      null,
    ]
    for (const s of badSessions) {
      expect(isValidSession(s)).toBe(false)
      localStorage.setItem('nefoot_session', JSON.stringify(s))
      expect(loadSession()).toBeNull()
      expect(localStorage.getItem('nefoot_session')).toBeNull()
    }
  })

  it('test 9: saveSession ignores an invalid session (never poisons the key)', () => {
    saveSession({ ...futureSession, member_role: 'admin' } as unknown as NeoFootSession)
    saveSession(null as unknown as NeoFootSession)
    expect(localStorage.getItem('nefoot_session')).toBeNull()
    expect(loadSession()).toBeNull()
  })

  it('test 10: a valid session still loads after a poisoned key was self-healed', () => {
    localStorage.setItem('nefoot_session', 'undefined')
    expect(loadSession()).toBeNull()
    saveSession(futureSession)
    expect(loadSession()).toEqual(futureSession)
  })
})
