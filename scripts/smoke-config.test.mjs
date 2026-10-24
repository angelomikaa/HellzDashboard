/**
 * Unit tests for scripts/smoke-config.mjs (plan 08.1-09 task 1).
 * Runs without a .env so no secret can leak into the test run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as cfg from './smoke-config.mjs'
import { renameSync, existsSync } from 'node:fs'

const origEnv = { ...process.env }
const ENV_PATH = '.env'
const ENV_BAK = '.env.smoke-config-test-bak'

beforeEach(() => {
  // Start each test with a clean env (SMOKE_* removed) and restore after.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('SMOKE_') || k.startsWith('VITE_SUPABASE') || k.startsWith('SUPABASE_')) {
      delete process.env[k]
    }
  }
  // Temporarily move .env aside so supabaseConfig cannot read VITE_* from disk.
  if (existsSync(ENV_PATH) && !existsSync(ENV_BAK)) {
    renameSync(ENV_PATH, ENV_BAK)
  }
})

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in origEnv)) delete process.env[k]
  }
  for (const [k, v] of Object.entries(origEnv)) {
    process.env[k] = v
  }
  // Restore .env.
  if (existsSync(ENV_BAK) && !existsSync(ENV_PATH)) {
    renameSync(ENV_BAK, ENV_PATH)
  }
})

describe('assertPinShape', () => {
  it('accepts a 4-digit PIN', () => {
    expect(cfg.assertPinShape('1234')).toBe('1234')
    expect(cfg.assertPinShape('0000')).toBe('0000')
    expect(cfg.assertPinShape('9999')).toBe('9999')
  })

  it('rejects short / long / non-digit / empty / null PINs', () => {
    for (const bad of ['123', '12345', 'abcd', '', null, undefined, '12 34', '0x1234']) {
      expect(() => cfg.assertPinShape(bad)).toThrow()
    }
  })
})

describe('FIXTURE_PIN', () => {
  it('matches the 4-digit rule', () => {
    expect(cfg.FIXTURE_PIN).toMatch(/^\d{4}$/)
  })
})

describe('decodeSessionClaims', () => {
  const payload = Buffer.from(JSON.stringify({ member_role: 'officer', sub: 'abc' })).toString('base64url')
  const goodToken = `header.${payload}.sig`

  it('decodes member_role from a hand-built token', () => {
    expect(cfg.decodeSessionClaims(goodToken).member_role).toBe('officer')
  })

  it('returns {} for a malformed token', () => {
    expect(cfg.decodeSessionClaims('not-a-token')).toEqual({})
  })

  it('returns {} for undefined', () => {
    expect(cfg.decodeSessionClaims(undefined)).toEqual({})
  })
})

describe('assertFixtureRole', () => {
  const memberToken = `header.${Buffer.from(JSON.stringify({ member_role: 'member' })).toString('base64url')}.sig`
  const officerToken = `header.${Buffer.from(JSON.stringify({ member_role: 'officer' })).toString('base64url')}.sig`

  it('passes when the session role matches', () => {
    expect(cfg.assertFixtureRole({ access_token: memberToken }, 'member')).toEqual({ member_role: 'member' })
  })

  it('throws when the session role does not match', () => {
    expect(() => cfg.assertFixtureRole({ access_token: officerToken }, 'member')).toThrow(
      /fixture role mismatch/,
    )
  })
})

describe('requireLiveCredential', () => {
  it('throws naming SMOKE_OWNER_HANDLE when owner env is absent', () => {
    expect(() => cfg.requireLiveCredential('owner')).toThrow(/SMOKE_OWNER_HANDLE/)
  })

  it('returns creds when both env vars are set', () => {
    process.env.SMOKE_OWNER_HANDLE = 'smoke-owner'
    process.env.SMOKE_OWNER_PIN = '4321'
    const creds = cfg.requireLiveCredential('owner')
    expect(creds).toEqual({ handle: 'smoke-owner', pin: '4321' })
  })
})

describe('supabaseConfig', () => {
  it('throws naming VITE_SUPABASE_URL when nothing provides it (other vars present)', () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    process.env.SUPABASE_ACCESS_TOKEN = 'dummy-token'
    process.env.SUPABASE_PROJECT_REF = 'dummy-ref'
    expect(() => cfg.supabaseConfig()).toThrow(/VITE_SUPABASE_URL/)
  })
})

describe('SMOKE_ENV_HINT', () => {
  it('is a non-empty string listing env vars', () => {
    expect(typeof cfg.SMOKE_ENV_HINT).toBe('string')
    expect(cfg.SMOKE_ENV_HINT.length).toBeGreaterThan(0)
    expect(cfg.SMOKE_ENV_HINT).toContain('SUPABASE_URL')
    expect(cfg.SMOKE_ENV_HINT).toContain('SUPABASE_ACCESS_TOKEN')
  })
})
