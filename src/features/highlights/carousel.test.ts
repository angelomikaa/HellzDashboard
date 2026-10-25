// Plan 10-03 rework (UAT round 1, test 8): unit SPEC for the carousel's
// spotlight/geometry rules. Node-env vitest — no DOM library.
import { describe, expect, it } from 'vitest'
import {
  AUTO_ADVANCE_MS,
  clampClassIndex,
  clampIndex,
  loopIndex,
  nearestCardIndex,
  wrapClassIndex,
} from './carousel'

describe('nearestCardIndex (which card holds the spotlight)', () => {
  it('picks the card containing the viewport center', () => {
    // Three 300px cards at 0..300, 300..600, 600..900 → centers 150/450/750
    expect(nearestCardIndex([150, 450, 750], 450)).toBe(1)
    expect(nearestCardIndex([150, 450, 750], 149)).toBe(0)
    expect(nearestCardIndex([150, 450, 750], 749)).toBe(2)
  })

  it('picks the closest center, not the last one passed', () => {
    expect(nearestCardIndex([0, 100, 200], 160)).toBe(2)
    expect(nearestCardIndex([0, 100, 200], 140)).toBe(1)
  })

  it('breaks exact ties toward the lower index (server order wins)', () => {
    expect(nearestCardIndex([100, 300], 200)).toBe(0)
  })

  it('returns 0 for an empty list (never NaN into state)', () => {
    expect(nearestCardIndex([], 500)).toBe(0)
  })
})

describe('clampIndex (arrow-key targets stay in range)', () => {
  it('clamps below zero and above the last card', () => {
    expect(clampIndex(-1, 5)).toBe(0)
    expect(clampIndex(5, 5)).toBe(4)
    expect(clampIndex(2, 5)).toBe(2)
  })

  it('handles a single card and an empty list', () => {
    expect(clampIndex(3, 1)).toBe(0)
    expect(clampIndex(3, 0)).toBe(0)
  })
})

describe('loopIndex (3-copy loop maps back to the middle copy)', () => {
  it('leaves middle-copy slots untouched', () => {
    expect(loopIndex(3, 3)).toBe(3)
    expect(loopIndex(4, 3)).toBe(4)
    expect(loopIndex(5, 3)).toBe(5)
  })

  it('wraps the first copy forward into the middle copy', () => {
    expect(loopIndex(0, 3)).toBe(3)
    expect(loopIndex(2, 3)).toBe(5)
  })

  it('wraps the third copy back into the middle copy', () => {
    expect(loopIndex(6, 3)).toBe(3)
    expect(loopIndex(8, 3)).toBe(5)
  })

  it('handles negative indices (keyboard overshoot) and 2-card lists', () => {
    expect(loopIndex(-1, 3)).toBe(5)
    expect(loopIndex(-3, 3)).toBe(3)
    expect(loopIndex(0, 2)).toBe(2)
    expect(loopIndex(5, 2)).toBe(3)
  })

  it('returns 0 when there are no cards', () => {
    expect(loopIndex(4, 0)).toBe(0)
  })
})

// --- UAT round 6: class rotation (one Impecável class at a time) ---

describe('clampClassIndex (sections can shrink after a refetch)', () => {
  it('keeps a valid index and pulls out-of-range indices back in', () => {
    expect(clampClassIndex(1, 3)).toBe(1)
    expect(clampClassIndex(3, 3)).toBe(2)
    expect(clampClassIndex(7, 3)).toBe(2)
    expect(clampClassIndex(-1, 3)).toBe(0)
  })

  it('never yields an index into an empty list', () => {
    expect(clampClassIndex(0, 0)).toBe(0)
    expect(clampClassIndex(2, -1)).toBe(0)
  })
})

describe('wrapClassIndex (rotation loops at the ends)', () => {
  it('steps forward and wraps past the last class', () => {
    expect(wrapClassIndex(0, 1, 3)).toBe(1)
    expect(wrapClassIndex(2, 1, 3)).toBe(0)
  })

  it('steps backward and wraps before the first class', () => {
    expect(wrapClassIndex(1, -1, 3)).toBe(0)
    expect(wrapClassIndex(0, -1, 3)).toBe(2)
  })

  it('never moves a single-class showcase (no rotation possible)', () => {
    expect(wrapClassIndex(0, 1, 1)).toBe(0)
    expect(wrapClassIndex(0, -1, 1)).toBe(0)
  })

  it('returns 0 when there are no classes', () => {
    expect(wrapClassIndex(2, 1, 0)).toBe(0)
  })
})

describe('AUTO_ADVANCE_MS (rotation window)', () => {
  it('is the owner-requested 30 seconds', () => {
    expect(AUTO_ADVANCE_MS).toBe(30_000)
  })
})
