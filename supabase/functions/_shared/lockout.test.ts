import { describe, expect, it } from 'vitest'
import {
  isLocked,
  retryAfterSeconds,
  nextFailureState,
  resetState,
  MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
  type LockoutState,
} from './lockout'

// D-07: 5 wrong attempts -> 15-minute lockout, counter resets only on success
const NOW = new Date('2026-10-08T12:00:00.000Z')

function failNTimes(n: number, from: LockoutState = resetState()): LockoutState {
  let state = from
  for (let i = 0; i < n; i++) state = nextFailureState(state, NOW)
  return state
}

describe('lockout pure functions (D-07)', () => {
  it('pins the D-07 constants: 5 attempts, 15 minutes', () => {
    expect(MAX_ATTEMPTS).toBe(5)
    expect(LOCKOUT_MINUTES).toBe(15)
  })

  it('test 1: 4 consecutive failures with no lock window -> NOT locked, next failure attempt allowed', () => {
    const state = failNTimes(4)
    expect(state.failedCount).toBe(4)
    expect(state.lockedUntil).toBeNull()
    expect(isLocked(state, NOW)).toBe(false)
  })

  it('test 2: 5th failure -> locked_until = now + 15 minutes', () => {
    const state = failNTimes(5)
    expect(state.failedCount).toBe(5)
    expect(state.lockedUntil).not.toBeNull()
    expect(state.lockedUntil!.getTime()).toBe(NOW.getTime() + 15 * 60_000)
    expect(isLocked(state, NOW)).toBe(true)
    expect(retryAfterSeconds(state, NOW)).toBe(15 * 60)
  })

  it('test 3: failed_count resets to 0 on success', () => {
    const afterFailures = failNTimes(3)
    expect(afterFailures.failedCount).toBe(3)
    const afterSuccess = resetState()
    expect(afterSuccess.failedCount).toBe(0)
    expect(afterSuccess.lockedUntil).toBeNull()
    expect(isLocked(afterSuccess, NOW)).toBe(false)
  })

  it('test 4: locked_until in the future -> reject; in the past -> attempt allowed and lock state cleared', () => {
    const state = failNTimes(5)
    // future lock rejects
    expect(isLocked(state, NOW)).toBe(true)
    expect(retryAfterSeconds(state, NOW)).toBeGreaterThan(0)
    // past lock: attempt allowed
    const afterExpiry = new Date(NOW.getTime() + 15 * 60_000 + 1_000)
    expect(isLocked(state, afterExpiry)).toBe(false)
    // cleared: the expired lock contributes nothing to callers
    expect(retryAfterSeconds(state, afterExpiry)).toBe(0)
  })

  it('test 5: window math is stable across repeated calls (pure, no clock side effects)', () => {
    const input: LockoutState = { failedCount: 4, lockedUntil: null }
    const a = nextFailureState(input, NOW)
    const b = nextFailureState(input, NOW)
    expect(a).toEqual(b)
    // input state is never mutated
    expect(input.failedCount).toBe(4)
    expect(input.lockedUntil).toBeNull()
    // same state + same clock -> same lock window, repeatedly
    const lockedA = nextFailureState(failNTimes(4), NOW)
    const lockedB = nextFailureState(failNTimes(4), NOW)
    expect(lockedA).toEqual(lockedB)
    expect(lockedA.lockedUntil!.getTime()).toBe(NOW.getTime() + 15 * 60_000)
  })
})
