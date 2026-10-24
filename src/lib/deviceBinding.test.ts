/**
 * Device binding fingerprint test (plan 08.1-08 task 1F).
 *
 * Asserts the client fingerprint algorithm produces known, stable SHA-256
 * vectors and memoizes per page load. The server counterpart is
 * supabase/functions/_shared/device.ts (computeDeviceFingerprint): both must
 * hash exactly `navigator.userAgent` (the raw User-Agent header) with no IP,
 * no trim, no lowercase.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

const HEX_RE = /^[0-9a-f]{64}$/
const UA_A = 'NeoFoot-Test-UA/1.0'
const UA_B = 'NeoFoot-Test-UA/2.0'
const EXPECTED_A =
  'c558d7b7bae6101ff8c1d5decbf10b2c57e74ec4ddb4702d79507fba51b671df'
const EXPECTED_EMPTY =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function stubUA(ua: string) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: ua },
    configurable: true,
  })
}

function clearUA() {
  delete (globalThis as any).navigator
}

describe('device binding fingerprint', () => {
  afterEach(() => {
    vi.resetModules()
    clearUA()
  })

  it('returns the known SHA-256 vector for a fixed UA', async () => {
    stubUA(UA_A)
    const { computeDeviceFingerprintClient } = await import(
      '../features/auth/session'
    )
    const fp = await computeDeviceFingerprintClient()
    expect(fp).toBe(EXPECTED_A)
    expect(HEX_RE.test(fp)).toBe(true)
  })

  it('produces different hashes for different UAs', async () => {
    stubUA(UA_A)
    const modA = await import('../features/auth/session')
    const fa = await modA.computeDeviceFingerprintClient()
    vi.resetModules()
    stubUA(UA_B)
    const modB = await import('../features/auth/session')
    const fb = await modB.computeDeviceFingerprintClient()
    expect(fb).not.toBe(fa)
    expect(HEX_RE.test(fb)).toBe(true)
  })

  it('empty UA yields the SHA-256 of the empty string', async () => {
    stubUA('')
    const { computeDeviceFingerprintClient } = await import(
      '../features/auth/session'
    )
    const fp = await computeDeviceFingerprintClient()
    expect(fp).toBe(EXPECTED_EMPTY)
  })

  it('memoizes: consecutive calls return the same value even if navigator changes', async () => {
    stubUA(UA_A)
    const modA = await import('../features/auth/session')
    const fa = await modA.computeDeviceFingerprintClient()
    // navigator changes mid-load but the cache holds
    stubUA(UA_B)
    const fb = await modA.computeDeviceFingerprintClient()
    expect(fb).toBe(fa)
    expect(fb).toBe(EXPECTED_A)
  })
})
