// Plan 10-03 rework (UAT round 1, test 8): unit SPEC for the carousel's
// spotlight/geometry rules. Node-env vitest — no DOM library.
import { describe, expect, it } from 'vitest'
import { clampIndex, nearestCardIndex } from './carousel'

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
