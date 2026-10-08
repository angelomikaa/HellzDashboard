export interface LockoutState {
  failedCount: number
  lockedUntil: Date | null
}

export const MAX_ATTEMPTS = 5
export const LOCKOUT_MINUTES = 15

export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime()
}

export function retryAfterSeconds(state: LockoutState, now: Date): number {
  if (!isLocked(state, now)) return 0
  return Math.ceil((state.lockedUntil!.getTime() - now.getTime()) / 1000)
}

export function nextFailureState(state: LockoutState, now: Date): LockoutState {
  const failedCount = state.failedCount + 1
  const lockedUntil =
    failedCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null
  return { failedCount, lockedUntil }
}

export function resetState(): LockoutState {
  return { failedCount: 0, lockedUntil: null }
}
