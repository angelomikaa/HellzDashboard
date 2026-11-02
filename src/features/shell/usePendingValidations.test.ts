// Unit locks for the round-9 rework (owner follow-up: "no notifications
// have appeared despite submissions being made"): the ping must fire ONLY on
// an increase from a known baseline, the total must cover all THREE queues
// (0031 added requests — the Solicitações queue the badge missed), and the
// title prefix must be idempotent across polls.
import { describe, expect, it } from 'vitest'
import {
  buffedCount,
  pingDelta,
  pendingTotal,
  type PendingValidationCount,
} from './usePendingValidations'

const counts = (partial: Partial<PendingValidationCount>): PendingValidationCount => ({
  submissions: 0,
  identity_proofs: 0,
  requests: 0,
  ...partial,
})

describe('pendingTotal — all three Validações queues sum (0031)', () => {
  it('sums submissions + identity proofs + requests', () => {
    expect(pendingTotal(counts({ submissions: 1, identity_proofs: 2, requests: 3 }))).toBe(6)
  })

  it('null (unknown state) renders as zero — never a red zero from an error', () => {
    expect(pendingTotal(null)).toBe(0)
  })

  it('a pending membership REQUEST alone lights the badge (the 0030 gap the owner hit)', () => {
    expect(pendingTotal(counts({ requests: 1 }))).toBe(1)
  })

  it('buffed is a subset of submissions, never an extra queue (0069)', () => {
    expect(pendingTotal(counts({ submissions: 3, buffed: 2 }))).toBe(3)
  })
})

describe('buffedCount — the 0069 orange pill', () => {
  it('reads the optional subset and treats an old payload as zero', () => {
    expect(buffedCount(counts({ submissions: 3, buffed: 2 }))).toBe(2)
    expect(buffedCount(counts({ submissions: 3 }))).toBe(0)
    expect(buffedCount(null)).toBe(0)
  })
})

describe('pingDelta — ping ONLY on an increase from a known baseline', () => {
  it('the first successful poll establishes the baseline silently (opening the app never toasts about old rows)', () => {
    expect(pingDelta(null, counts({ submissions: 5 }))).toBe(false)
  })

  it('an increase pings', () => {
    expect(pingDelta(counts({}), counts({ submissions: 1 }))).toBe(true)
    expect(pingDelta(counts({ requests: 1 }), counts({ requests: 2 }))).toBe(true)
  })

  it('the same count does not ping again', () => {
    expect(pingDelta(counts({ submissions: 2 }), counts({ submissions: 2 }))).toBe(false)
  })

  it('a DECREASE never pings (validations were handled — not news)', () => {
    expect(pingDelta(counts({ submissions: 3 }), counts({ submissions: 1 }))).toBe(false)
  })

  it('a queue switch at the same total does not ping (an officer moved a row between queues)', () => {
    expect(pingDelta(counts({ submissions: 1 }), counts({ requests: 1 }))).toBe(false)
  })
})
