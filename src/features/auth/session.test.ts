import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  isExpired,
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
